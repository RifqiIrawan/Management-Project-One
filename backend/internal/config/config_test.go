package config

import (
	"os"
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

func TestOpsDefaults(t *testing.T) {
	baseEnv(t)
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.APIRateLimit != 100 || len(c.TrustedProxies) != 0 || !c.SwaggerEnabled || c.CleanupInterval.Hours() != 1 {
		t.Fatalf("default operasional salah: %+v", c)
	}
}

func TestSwaggerDefaultOffInProduction(t *testing.T) {
	baseEnv(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("COOKIE_SECURE", "true")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.SwaggerEnabled {
		t.Fatal("Swagger harus nonaktif secara default di production")
	}
	t.Setenv("SWAGGER_ENABLED", "true")
	if c, _ := Load(); !c.SwaggerEnabled {
		t.Fatal("Swagger harus bisa diaktifkan eksplisit")
	}
}

func TestOpsOverridesAndValidation(t *testing.T) {
	baseEnv(t)
	t.Setenv("API_RATE_LIMIT_PER_MIN", "0")
	t.Setenv("TOKEN_CLEANUP_INTERVAL", "0")
	t.Setenv("TRUSTED_PROXIES", " 127.0.0.1 , 10.0.0.0/8 ,, ::1")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.APIRateLimit != 0 || c.CleanupInterval != 0 || len(c.TrustedProxies) != 3 || c.TrustedProxies[1] != "10.0.0.0/8" {
		t.Fatalf("override salah: %+v", c)
	}
	bad := map[string]string{
		"API_RATE_LIMIT_PER_MIN": "-1", "TRUSTED_PROXIES": "bukan-ip", "TOKEN_CLEANUP_INTERVAL": "-5m", "SWAGGER_ENABLED": "mungkin",
	}
	for k, v := range bad {
		t.Run(k, func(t *testing.T) {
			baseEnv(t)
			t.Setenv(k, v)
			if _, err := Load(); err == nil {
				t.Fatalf("%s=%q harus ditolak", k, v)
			}
		})
	}
}

func TestListenHost(t *testing.T) {
	cases := []struct {
		name, env, host, want string
		setHost               bool
	}{
		{"development: semua antarmuka", "development", "", ":6990", false},
		{"production: default localhost", "production", "", "127.0.0.1:6990", false},
		{"production: override eksplisit", "production", "0.0.0.0", "0.0.0.0:6990", true},
		{"development: bind localhost", "development", "127.0.0.1", "127.0.0.1:6990", true},
		{"HOST kosong eksplisit = semua antarmuka", "production", "", ":6990", true},
		{"IPv6", "development", "::1", "[::1]:6990", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			baseEnv(t)
			t.Setenv("APP_ENV", c.env)
			if c.env == "production" {
				t.Setenv("COOKIE_SECURE", "true")
			}
			if c.setHost {
				t.Setenv("HOST", c.host)
			} else {
				os.Unsetenv("HOST")
			}
			cfg, err := Load()
			if err != nil {
				t.Fatal(err)
			}
			if got := cfg.ListenAddr(); got != c.want {
				t.Fatalf("ListenAddr = %q, harapan %q", got, c.want)
			}
		})
	}
}

func TestSignatureModeDefaultsAndValidation(t *testing.T) {
	baseEnv(t)
	os.Unsetenv("API_SIGNATURE")
	if c, err := Load(); err != nil || c.SignatureMode != "optional" || c.SignatureSkew.Minutes() != 5 {
		t.Fatalf("development: default harus optional/5m: %+v %v", c, err)
	}
	t.Setenv("APP_ENV", "production")
	t.Setenv("COOKIE_SECURE", "true")
	if c, err := Load(); err != nil || c.SignatureMode != "enforce" {
		t.Fatalf("production: default harus enforce: %+v %v", c, err)
	}
	t.Setenv("API_SIGNATURE", " OFF ")
	if c, err := Load(); err != nil || c.SignatureMode != "off" {
		t.Fatalf("override (huruf besar/spasi dinormalisasi) harus off: %+v %v", c, err)
	}
	for _, kv := range [][2]string{{"API_SIGNATURE", "wajib"}, {"API_SIGNATURE_SKEW", "0"}, {"API_SIGNATURE_SKEW", "2h"}, {"API_SIGNATURE_SKEW", "abc"}} {
		baseEnv(t)
		t.Setenv(kv[0], kv[1])
		if _, err := Load(); err == nil {
			t.Errorf("%s=%q harus ditolak", kv[0], kv[1])
		}
	}
	baseEnv(t)
	t.Setenv("API_SIGNATURE_SKEW", "-1m")
	if _, err := Load(); err == nil {
		t.Error("skew negatif harus ditolak")
	}
}
