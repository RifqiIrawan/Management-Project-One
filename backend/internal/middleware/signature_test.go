package middleware

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/sign"
)

const (
	testSecret = "rahasia-server-untuk-tes-tanda-tangan"
	testJTI    = "jti-abcdef0123456789"
)

var fixedNow = time.Unix(1_700_000_000, 0)

// engine memasang "Auth" palsu (jti dari header X-Test-JTI) lalu RequestSignature.
func engine(mode string, extra ...gin.HandlerFunc) (*gin.Engine, *sign.NonceCache) {
	nonces := sign.NewNonceCache(11*time.Minute, 1000)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(userKey, &model.User{ID: "user-1"})
		c.Set(tokenJTIKey, c.GetHeader("X-Test-JTI"))
		c.Next()
	})
	r.Use(RequestSignature(SignatureOptions{Mode: mode, Secret: testSecret, Skew: 5 * time.Minute, Nonces: nonces, Now: func() time.Time { return fixedNow }}))
	for _, h := range extra {
		r.Use(h)
	}
	r.Any("/api/v1/*path", func(c *gin.Context) {
		b, _ := io.ReadAll(c.Request.Body) // body harus tetap terbaca setelah diverifikasi
		c.String(200, "ok:"+string(b))
	})
	return r, nonces
}

type reqSpec struct {
	method, path, query, body string
	ts                        time.Time
	nonce                     string
	jtiForKey                 string // jti yang dipakai menurunkan kunci penanda tangan
}

func (s reqSpec) build(t *testing.T) *http.Request {
	t.Helper()
	if s.method == "" {
		s.method = "POST"
	}
	if s.path == "" {
		s.path = "/api/v1/projects"
	}
	if s.ts.IsZero() {
		s.ts = fixedNow
	}
	if s.nonce == "" {
		s.nonce = "nonce-" + strconv.FormatInt(time.Now().UnixNano(), 36) + "-abcdef"
	}
	if s.jtiForKey == "" {
		s.jtiForKey = testJTI
	}
	q, err := url.ParseQuery(s.query)
	if err != nil {
		t.Fatal(err)
	}
	tsStr := strconv.FormatInt(s.ts.Unix(), 10)
	canon := sign.Canonical(s.method, s.path, sign.CanonicalQuery(q), sign.BodyHash([]byte(s.body)), tsStr, s.nonce)
	sig := sign.Sign(sign.DeriveKey(testSecret, s.jtiForKey), canon)

	target := s.path
	if s.query != "" {
		target += "?" + s.query
	}
	req := httptest.NewRequest(s.method, target, strings.NewReader(s.body))
	req.Header.Set("X-Test-JTI", testJTI)
	req.Header.Set("X-Timestamp", tsStr)
	req.Header.Set("X-Nonce", s.nonce)
	req.Header.Set("X-Signature", sig)
	return req
}

func do(r *gin.Engine, req *http.Request) (int, string, string) {
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var body struct{ Error struct{ Code string } }
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	return w.Code, body.Error.Code, w.Body.String()
}

func TestSignatureValidRequestPassesAndBodyStillReadable(t *testing.T) {
	r, _ := engine(SignatureEnforce)
	code, _, body := do(r, reqSpec{body: `{"nama":"Rifqi 🚀"}`, query: "z=1&a=2"}.build(t))
	if code != 200 || body != `ok:{"nama":"Rifqi 🚀"}` {
		t.Fatalf("request valid harus lolos dan body tetap terbaca oleh handler: %d %s", code, body)
	}
}

func TestSignatureModes(t *testing.T) {
	unsigned := func() *http.Request {
		req := httptest.NewRequest("GET", "/api/v1/me", nil)
		req.Header.Set("X-Test-JTI", testJTI)
		return req
	}
	cases := []struct {
		mode     string
		unsigned int
		code     string
	}{
		{SignatureOff, 200, ""},
		{SignatureOptional, 200, ""},
		{SignatureEnforce, 401, "SIGNATURE_REQUIRED"},
	}
	for _, c := range cases {
		r, _ := engine(c.mode)
		got, errCode, _ := do(r, unsigned())
		if got != c.unsigned || errCode != c.code {
			t.Errorf("mode %s tanpa tanda tangan: %d %q, harapan %d %q", c.mode, got, errCode, c.unsigned, c.code)
		}
	}
	// mode off mengabaikan header sama sekali (bahkan yang salah)
	r, _ := engine(SignatureOff)
	req := unsigned()
	req.Header.Set("X-Signature", "bukan-tanda-tangan")
	if code, _, _ := do(r, req); code != 200 {
		t.Errorf("mode off harus mengabaikan header: %d", code)
	}
	// mode optional TETAP menolak tanda tangan yang salah (tidak bisa dipakai untuk melewati pemeriksaan)
	r, _ = engine(SignatureOptional)
	req = reqSpec{}.build(t)
	req.Header.Set("X-Signature", strings.Repeat("0", 64))
	if code, errCode, _ := do(r, req); code != 401 || errCode != "SIGNATURE_INVALID" {
		t.Errorf("optional + tanda tangan salah harus ditolak: %d %q", code, errCode)
	}
}

func TestSignatureTamperingIsRejected(t *testing.T) {
	r, _ := engine(SignatureEnforce)
	mutate := map[string]func(*http.Request){
		"body diubah":   func(q *http.Request) { q.Body = io.NopCloser(strings.NewReader(`{"title":"diubah"}`)) },
		"path diubah":   func(q *http.Request) { q.URL.Path = "/api/v1/projects/lain" },
		"query diubah":  func(q *http.Request) { q.URL.RawQuery = "a=2" },
		"method diubah": func(q *http.Request) { q.Method = "DELETE" },
		"nonce diubah":  func(q *http.Request) { q.Header.Set("X-Nonce", "nonce-berbeda-123456") },
		"waktu diubah":  func(q *http.Request) { q.Header.Set("X-Timestamp", strconv.FormatInt(fixedNow.Unix()+1, 10)) },
	}
	i := 0
	for name, f := range mutate {
		i++
		req := reqSpec{body: `{"title":"asli"}`, query: "a=1", nonce: "nonce-tamper-" + strconv.Itoa(i) + "-aaaaaa"}.build(t)
		f(req)
		if code, errCode, _ := do(r, req); code != 401 || errCode != "SIGNATURE_INVALID" {
			t.Errorf("%s: harus 401 SIGNATURE_INVALID, dapat %d %q", name, code, errCode)
		}
	}
}

func TestSignatureKeyIsBoundToToken(t *testing.T) {
	r, _ := engine(SignatureEnforce)
	// ditandatangani dengan kunci milik token lain
	if code, errCode, _ := do(r, reqSpec{jtiForKey: "jti-token-lain-0000"}.build(t)); code != 401 || errCode != "SIGNATURE_INVALID" {
		t.Errorf("kunci token lain harus ditolak: %d %q", code, errCode)
	}
}

func TestSignatureExpiredAndFuture(t *testing.T) {
	r, _ := engine(SignatureEnforce)
	for i, c := range []struct {
		name string
		ts   time.Time
	}{
		{"terlalu lama (6 menit lalu)", fixedNow.Add(-6 * time.Minute)},
		{"terlalu depan (6 menit lagi)", fixedNow.Add(6 * time.Minute)},
	} {
		name, ts := c.name, c.ts
		if code, errCode, _ := do(r, reqSpec{ts: ts, nonce: "nonce-exp-" + strconv.Itoa(i) + "-aaaaaaaa"}.build(t)); code != 401 || errCode != "SIGNATURE_EXPIRED" {
			t.Errorf("%s: harus SIGNATURE_EXPIRED, dapat %d %q", name, code, errCode)
		}
	}
	// tepat di dalam toleransi
	for i, c := range []struct {
		name string
		ts   time.Time
	}{{"4m59s lalu", fixedNow.Add(-299 * time.Second)}, {"4m59s lagi", fixedNow.Add(299 * time.Second)}} {
		name, ts := c.name, c.ts
		if code, _, _ := do(r, reqSpec{ts: ts, nonce: "nonce-ok-" + strconv.Itoa(i) + "-aaaaaaaaaa"}.build(t)); code != 200 {
			t.Errorf("%s: harus lolos, dapat %d", name, code)
		}
	}
}

func TestSignatureReplayIsRejected(t *testing.T) {
	r, _ := engine(SignatureEnforce)
	spec := reqSpec{body: "x", nonce: "nonce-replay-0001-aaaa"}
	if code, _, _ := do(r, spec.build(t)); code != 200 {
		t.Fatalf("pengiriman pertama harus lolos: %d", code)
	}
	if code, errCode, _ := do(r, spec.build(t)); code != 401 || errCode != "SIGNATURE_REPLAY" {
		t.Fatalf("pengiriman ulang identik harus SIGNATURE_REPLAY: %d %q", code, errCode)
	}
	if code, _, _ := do(r, reqSpec{body: "x", nonce: "nonce-replay-0002-aaaa"}.build(t)); code != 200 {
		t.Fatalf("nonce baru harus lolos: %d", code)
	}
}

func TestInvalidSignatureDoesNotBurnTheNonce(t *testing.T) {
	// penyerang tanpa kunci tidak boleh "membakar" nonce milik klien sah
	r, nonces := engine(SignatureEnforce)
	bad := reqSpec{nonce: "nonce-burn-0001-aaaa"}.build(t)
	bad.Header.Set("X-Signature", strings.Repeat("a", 64))
	if code, errCode, _ := do(r, bad); code != 401 || errCode != "SIGNATURE_INVALID" {
		t.Fatalf("harus ditolak: %d %q", code, errCode)
	}
	if nonces.Len() != 0 {
		t.Fatalf("tanda tangan salah tidak boleh memakai nonce (len=%d)", nonces.Len())
	}
	if code, _, _ := do(r, reqSpec{nonce: "nonce-burn-0001-aaaa"}.build(t)); code != 200 {
		t.Fatalf("klien sah dengan nonce yang sama harus lolos: %d", code)
	}
}

func TestNonceScopedPerToken(t *testing.T) {
	r, _ := engine(SignatureEnforce)
	a := reqSpec{nonce: "nonce-shared-0000-aa"}.build(t)
	if code, _, _ := do(r, a); code != 200 {
		t.Fatal("token A harus lolos")
	}
	other := reqSpec{nonce: "nonce-shared-0000-aa", jtiForKey: "jti-token-lain-0000"}.build(t)
	other.Header.Set("X-Test-JTI", "jti-token-lain-0000")
	if code, _, _ := do(r, other); code != 200 {
		t.Fatalf("nonce yang sama di token berbeda tidak boleh dianggap replay: %d", code)
	}
}

func TestSignatureMalformedHeaders(t *testing.T) {
	r, _ := engine(SignatureEnforce)
	mk := func(edit func(*http.Request)) int {
		req := reqSpec{nonce: "nonce-format-" + strconv.FormatInt(time.Now().UnixNano(), 36)}.build(t)
		edit(req)
		code, errCode, _ := do(r, req)
		if errCode != "SIGNATURE_INVALID" {
			t.Errorf("format salah harus SIGNATURE_INVALID, dapat %q", errCode)
		}
		return code
	}
	cases := map[string]func(*http.Request){
		"tanda tangan bukan hex":      func(q *http.Request) { q.Header.Set("X-Signature", strings.Repeat("z", 64)) },
		"tanda tangan terlalu pendek": func(q *http.Request) { q.Header.Set("X-Signature", "abc123") },
		"nonce terlalu pendek":        func(q *http.Request) { q.Header.Set("X-Nonce", "abc") },
		"nonce berisi karakter aneh":  func(q *http.Request) { q.Header.Set("X-Nonce", "nonce dengan spasi 123456") },
		"timestamp bukan angka":       func(q *http.Request) { q.Header.Set("X-Timestamp", "kemarin") },
		"hanya X-Signature":           func(q *http.Request) { q.Header.Del("X-Timestamp"); q.Header.Del("X-Nonce") },
		"tanpa X-Signature":           func(q *http.Request) { q.Header.Del("X-Signature") },
	}
	for name, f := range cases {
		if code := mk(f); code != 401 {
			t.Errorf("%s: status %d", name, code)
		}
	}
}

func TestSignatureAcceptsUppercaseHexAndReorderedQuery(t *testing.T) {
	r, _ := engine(SignatureEnforce)
	req := reqSpec{query: "a=1&b=2", nonce: "nonce-upper-0001-aaa"}.build(t)
	req.Header.Set("X-Signature", strings.ToUpper(req.Header.Get("X-Signature")))
	req.URL.RawQuery = "b=2&a=1" // urutan parameter di URL berbeda dari yang ditandatangani
	if code, errCode, _ := do(r, req); code != 200 {
		t.Fatalf("hex huruf besar dan urutan query berbeda harus lolos: %d %q", code, errCode)
	}
}

func TestInvalidSignatureDoesNotConsumeUserRateLimit(t *testing.T) {
	limiter := NewKeyLimiter(2)
	defer limiter.Stop()
	r, _ := engine(SignatureEnforce, limiter.UserMiddleware())
	for i := 0; i < 20; i++ { // pemegang token curian mengirim request tanpa tanda tangan
		req := httptest.NewRequest("GET", "/api/v1/me", nil)
		req.Header.Set("X-Test-JTI", testJTI)
		if code, errCode, _ := do(r, req); code != 401 || errCode != "SIGNATURE_REQUIRED" {
			t.Fatalf("harus 401 SIGNATURE_REQUIRED, bukan 429: %d %q", code, errCode)
		}
	}
	for i := 0; i < 2; i++ { // pemilik sah masih punya seluruh kuotanya
		if code, errCode, _ := do(r, reqSpec{nonce: "nonce-limit-" + strconv.Itoa(i) + "-aaaaaa"}.build(t)); code != 200 {
			t.Fatalf("request sah ke-%d harus lolos (kuota tidak boleh terpakai): %d %q", i+1, code, errCode)
		}
	}
	if code, errCode, _ := do(r, reqSpec{nonce: "nonce-limit-3-aaaaaaaa"}.build(t)); code != 429 {
		t.Fatalf("request sah ke-3 harus 429: %d %q", code, errCode)
	}
}

func TestSignatureRejectsOversizedBody(t *testing.T) {
	r, _ := engine(SignatureEnforce)
	body := strings.Repeat("x", maxBodyBytes+10)
	req := reqSpec{body: body, nonce: "nonce-big-0001-aaaaaaa"}.build(t)
	req.Body = http.MaxBytesReader(httptest.NewRecorder(), req.Body, maxBodyBytes) // seperti middleware Security
	if code, errCode, _ := do(r, req); code != 413 || errCode != "PAYLOAD_TOO_LARGE" {
		t.Fatalf("body > 1 MB harus 413: %d %q", code, errCode)
	}
}
