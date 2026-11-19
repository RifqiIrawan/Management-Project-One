package config

import (
	"strings"
	"testing"
)

const goodSecret = "0123456789abcdef0123456789abcdef"

func baseEnv(t *testing.T) {
	t.Helper()
	t.Setenv("APP_ENV", "development")
	t.Setenv("DB_PASSWORD", "rahasia-db")
	t.Setenv("JWT_SECRET", goodSecret)
	t.Setenv("COOKIE_SECURE", "false")
	t.Setenv("BCRYPT_COST", "12")
}

func TestLoadOK(t *testing.T) {
	baseEnv(t)
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.AccessTTL.Minutes() != 15 || c.RefreshTTL.Hours() != 168 || c.BcryptCost != 12 {
		t.Fatalf("default salah: %+v", c)
	}
	if got := c.AllowedOrigins[0]; got != "http://localhost:6969" {
		t.Fatalf("origin default salah: %s", got)
	}
}

func TestLoadRejectsBadSecrets(t *testing.T) {
	cases := map[string]struct{ key, val string }{
		"secret kosong":      {"JWT_SECRET", ""},
		"secret pendek":      {"JWT_SECRET", "terlalu-pendek"},
		"secret contoh":      {"JWT_SECRET", "ganti_dengan_string_acak_minimal_32_karakter"},
		"password db kosong": {"DB_PASSWORD", ""},
		"password db contoh": {"DB_PASSWORD", "ganti_dengan_password_kuat"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			baseEnv(t)
			t.Setenv(c.key, c.val)
			if _, err := Load(); err == nil {
				t.Fatal("harus error")
			}
		})
	}
}

func TestProductionRequiresSecureCookie(t *testing.T) {
	baseEnv(t)
	t.Setenv("APP_ENV", "production")
	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "COOKIE_SECURE") {
		t.Fatalf("harus menolak COOKIE_SECURE=false di production, dapat: %v", err)
	}
	t.Setenv("COOKIE_SECURE", "true")
	if _, err := Load(); err != nil {
		t.Fatal(err)
	}
}

func TestMigrateURLEscapesPassword(t *testing.T) {
	baseEnv(t)
	t.Setenv("DB_PASSWORD", "p@ss:w/rd#1")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	u := c.MigrateURL()
	if strings.Contains(u, "p@ss:w/rd#1") || !strings.HasPrefix(u, "pgx5://mpo:") {
		t.Fatalf("password tidak di-escape: %s", u)
	}
}
