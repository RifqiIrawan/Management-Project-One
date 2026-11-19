package jwt

import (
	"errors"
	"testing"
	"time"

	gojwt "github.com/golang-jwt/jwt/v5"
)

const secret = "0123456789abcdef0123456789abcdef"

func TestAccessTokenRoundTrip(t *testing.T) {
	m := NewManager(secret, "mpo", time.Minute)
	tok, _, err := m.NewAccess("user-1", 3)
	if err != nil {
		t.Fatal(err)
	}
	c, err := m.ParseAccess(tok)
	if err != nil {
		t.Fatal(err)
	}
	if c.Subject != "user-1" || c.Ver != 3 {
		t.Fatalf("claims salah: %+v", c)
	}
}

func TestAccessTokenExpired(t *testing.T) {
	m := NewManager(secret, "mpo", -time.Minute)
	tok, _, _ := m.NewAccess("user-1", 0)
	if _, err := m.ParseAccess(tok); !errors.Is(err, ErrExpired) {
		t.Fatalf("harus ErrExpired, dapat %v", err)
	}
}

func TestAccessTokenWrongSecretOrIssuer(t *testing.T) {
	tok, _, _ := NewManager(secret, "mpo", time.Minute).NewAccess("u", 0)
	if _, err := NewManager("another-secret-another-secret-123", "mpo", time.Minute).ParseAccess(tok); !errors.Is(err, ErrInvalid) {
		t.Fatalf("secret beda harus ditolak, dapat %v", err)
	}
	if _, err := NewManager(secret, "lain", time.Minute).ParseAccess(tok); !errors.Is(err, ErrInvalid) {
		t.Fatalf("issuer beda harus ditolak, dapat %v", err)
	}
}

func TestAlgNoneRejected(t *testing.T) {
	claims := Claims{RegisteredClaims: gojwt.RegisteredClaims{
		Subject: "u", Issuer: "mpo", ExpiresAt: gojwt.NewNumericDate(time.Now().Add(time.Minute)),
	}}
	tok, _ := gojwt.NewWithClaims(gojwt.SigningMethodNone, claims).SignedString(gojwt.UnsafeAllowNoneSignatureType)
	if _, err := NewManager(secret, "mpo", time.Minute).ParseAccess(tok); !errors.Is(err, ErrInvalid) {
		t.Fatalf("alg none harus ditolak, dapat %v", err)
	}
}

func TestRefreshTokenHash(t *testing.T) {
	raw, h, err := NewRefreshToken()
	if err != nil || raw == "" || h == raw || HashRefresh(raw) != h {
		t.Fatalf("refresh token tidak benar: %v", err)
	}
	raw2, _, _ := NewRefreshToken()
	if raw == raw2 {
		t.Fatal("token harus acak")
	}
}
