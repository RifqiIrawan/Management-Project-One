package jwt

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	gojwt "github.com/golang-jwt/jwt/v5"
)

var (
	ErrExpired = errors.New("token expired")
	ErrInvalid = errors.New("token invalid")
)

type Claims struct {
	Ver int `json:"ver"`
	gojwt.RegisteredClaims
}

type Manager struct {
	secret    []byte
	issuer    string
	accessTTL time.Duration
}

func NewManager(secret, issuer string, accessTTL time.Duration) *Manager {
	return &Manager{secret: []byte(secret), issuer: issuer, accessTTL: accessTTL}
}

// NewAccess membuat access token HS256 dan mengembalikan token, waktu kedaluwarsa, serta jti-nya
// (jti dipakai menurunkan kunci tanda tangan request untuk token ini).
func (m *Manager) NewAccess(userID string, ver int) (string, time.Time, string, error) {
	now := time.Now()
	exp := now.Add(m.accessTTL)
	jti, err := randomHex(16)
	if err != nil {
		return "", time.Time{}, "", err
	}
	claims := Claims{
		Ver: ver,
		RegisteredClaims: gojwt.RegisteredClaims{
			Subject:   userID,
			Issuer:    m.issuer,
			IssuedAt:  gojwt.NewNumericDate(now),
			ExpiresAt: gojwt.NewNumericDate(exp),
			ID:        jti,
		},
	}
	signed, err := gojwt.NewWithClaims(gojwt.SigningMethodHS256, claims).SignedString(m.secret)
	if err != nil {
		return "", time.Time{}, "", fmt.Errorf("sign access token: %w", err)
	}
	return signed, exp, jti, nil
}

// ParseAccess memvalidasi algoritma (HS256), issuer, dan expiry.
func (m *Manager) ParseAccess(raw string) (*Claims, error) {
	claims := &Claims{}
	tok, err := gojwt.ParseWithClaims(raw, claims,
		func(*gojwt.Token) (any, error) { return m.secret, nil },
		gojwt.WithValidMethods([]string{"HS256"}),
		gojwt.WithIssuer(m.issuer),
		gojwt.WithExpirationRequired(),
	)
	if err != nil {
		if errors.Is(err, gojwt.ErrTokenExpired) {
			return nil, ErrExpired
		}
		return nil, ErrInvalid
	}
	if !tok.Valid || claims.Subject == "" {
		return nil, ErrInvalid
	}
	return claims, nil
}

// NewRefreshToken menghasilkan token acak 32 byte dan hash SHA-256-nya.
// Hanya hash yang disimpan di database.
func NewRefreshToken() (raw, hashed string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", fmt.Errorf("generate refresh token: %w", err)
	}
	raw = base64.RawURLEncoding.EncodeToString(b)
	return raw, HashRefresh(raw), nil
}

func HashRefresh(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("random: %w", err)
	}
	return hex.EncodeToString(b), nil
}
