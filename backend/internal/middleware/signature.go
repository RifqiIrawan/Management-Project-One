package middleware

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/response"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/sign"
)

// Mode verifikasi tanda tangan request.
const (
	SignatureOff      = "off"      // tidak diverifikasi
	SignatureOptional = "optional" // diverifikasi bila header ada (salah = ditolak); tanpa header tetap lolos
	SignatureEnforce  = "enforce"  // wajib; tanpa tanda tangan yang valid = 401
)

var (
	signatureRe = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)
	nonceRe     = regexp.MustCompile(`^[A-Za-z0-9_-]{16,64}$`)
)

// SignatureOptions mengatur middleware RequestSignature.
type SignatureOptions struct {
	Mode   string
	Secret string        // rahasia server (JWT_SECRET) untuk menurunkan kunci per token
	Skew   time.Duration // selisih waktu maksimum antara jam klien dan server
	Nonces *sign.NonceCache
	Now    func() time.Time // untuk tes; default time.Now
}

// RequestSignature memverifikasi header X-Signature, X-Timestamp, X-Nonce. Pasang SETELAH Auth (butuh jti token)
// dan SEBELUM pembatas laju per user, supaya request bertanda tangan salah (mis. dari pemegang token curian)
// tidak menghabiskan kuota pemilik token.
//
// Urutan pemeriksaan: format -> tanda tangan -> selisih waktu -> nonce. Selisih waktu dan nonce baru
// diperiksa setelah tanda tangan valid, sehingga pesan "kedaluwarsa"/"replay" hanya terlihat oleh
// pemegang kunci yang sah dan nonce hanya terpakai oleh request yang autentik.
func RequestSignature(o SignatureOptions) gin.HandlerFunc {
	if o.Mode == SignatureOff {
		return func(c *gin.Context) { c.Next() }
	}
	now := o.Now
	if now == nil {
		now = time.Now
	}
	return func(c *gin.Context) {
		sig, ts, nonce := c.GetHeader("X-Signature"), c.GetHeader("X-Timestamp"), c.GetHeader("X-Nonce")
		if sig == "" && ts == "" && nonce == "" {
			if o.Mode == SignatureEnforce {
				response.Err(c, apperror.ErrSignatureRequired)
				return
			}
			c.Next()
			return
		}

		jti := c.GetString(tokenJTIKey)
		tsUnix, tsErr := strconv.ParseInt(ts, 10, 64)
		if jti == "" || !signatureRe.MatchString(sig) || !nonceRe.MatchString(nonce) || tsErr != nil {
			response.Err(c, apperror.ErrSignatureInvalid)
			return
		}
		query, err := url.ParseQuery(c.Request.URL.RawQuery)
		if err != nil {
			response.Err(c, apperror.ErrSignatureInvalid)
			return
		}

		body, err := io.ReadAll(c.Request.Body) // sudah dibatasi 1 MB oleh middleware Security
		if err != nil {
			var tooBig *http.MaxBytesError
			if errors.As(err, &tooBig) {
				response.Err(c, apperror.ErrTooLarge)
			} else {
				response.Err(c, apperror.BadRequest("Gagal membaca body request"))
			}
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(body)) // handler tetap bisa membaca body

		canonical := sign.Canonical(c.Request.Method, c.Request.URL.EscapedPath(),
			sign.CanonicalQuery(query), sign.BodyHash(body), ts, nonce)
		expected := sign.Sign(sign.DeriveKey(o.Secret, jti), canonical)
		if !sign.Equal(expected, strings.ToLower(sig)) {
			response.Err(c, apperror.ErrSignatureInvalid)
			return
		}

		at := now()
		if d := at.Sub(time.Unix(tsUnix, 0)); d > o.Skew || d < -o.Skew {
			response.Err(c, apperror.ErrSignatureExpired)
			return
		}
		if !o.Nonces.Use(jti+":"+nonce, at) {
			response.Err(c, apperror.ErrSignatureReplay)
			return
		}
		c.Next()
	}
}
