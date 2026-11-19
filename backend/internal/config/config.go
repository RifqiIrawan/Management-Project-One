package config

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata" // zona waktu tertanam di binary (Windows tidak punya database tz bawaan)

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv         string
	Port           string
	Host           string // alamat bind; default 127.0.0.1 di production, semua antarmuka di development
	DBHost         string
	DBPort         string
	DBUser         string
	DBPassword     string
	DBName         string
	DBSSLMode      string
	AllowedOrigins []string

	JWTSecret    string
	JWTIssuer    string
	AccessTTL    time.Duration
	RefreshTTL   time.Duration
	CookieSecure bool
	BcryptCost   int
	Timezone     *time.Location // acuan "hari ini" / "minggu ini" untuk deadline

	// Operasional
	APIRateLimit    int           // request/menit/user untuk API terautentikasi; 0 = nonaktif
	TrustedProxies  []string      // IP/CIDR reverse proxy yang boleh menentukan IP klien (X-Forwarded-For)
	SwaggerEnabled  bool          // sajikan Swagger UI + openapi.yaml
	CleanupInterval time.Duration // interval pembersihan refresh token kedaluwarsa; 0 = nonaktif
}

// Load membaca .env (jika ada) lalu environment variable.
func Load() (*Config, error) {
	_ = godotenv.Load()               // dijalankan dari folder backend/
	_ = godotenv.Load("backend/.env") // dijalankan dari root repo

	c := &Config{
		AppEnv:         get("APP_ENV", "development"),
		Port:           get("PORT", "6990"),
		DBHost:         get("DB_HOST", "localhost"),
		DBPort:         get("DB_PORT", "5432"),
		DBUser:         get("DB_USER", "mpo"),
		DBPassword:     os.Getenv("DB_PASSWORD"),
		DBName:         get("DB_NAME", "management_project_one"),
		DBSSLMode:      get("DB_SSLMODE", "disable"),
		AllowedOrigins: strings.Split(get("CORS_ORIGINS", "http://localhost:6969"), ","),
		JWTSecret:      os.Getenv("JWT_SECRET"),
		JWTIssuer:      get("JWT_ISSUER", "management-project-one"),
	}
	if c.DBPassword == "" {
		return nil, fmt.Errorf("DB_PASSWORD wajib diisi (lihat .env.example)")
	}
	if len(c.JWTSecret) < 32 || strings.HasPrefix(c.JWTSecret, placeholderPrefix) {
		return nil, fmt.Errorf("JWT_SECRET wajib diisi dengan string acak minimal 32 karakter (bukan nilai contoh); buat dengan: openssl rand -hex 32")
	}
	if strings.HasPrefix(c.DBPassword, placeholderPrefix) {
		return nil, fmt.Errorf("DB_PASSWORD masih berisi nilai contoh dari .env.example")
	}

	var err error
	if c.AccessTTL, err = time.ParseDuration(get("JWT_ACCESS_TTL", "15m")); err != nil {
		return nil, fmt.Errorf("JWT_ACCESS_TTL: %w", err)
	}
	if c.RefreshTTL, err = time.ParseDuration(get("JWT_REFRESH_TTL", "168h")); err != nil {
		return nil, fmt.Errorf("JWT_REFRESH_TTL: %w", err)
	}
	if c.CookieSecure, err = strconv.ParseBool(get("COOKIE_SECURE", "false")); err != nil {
		return nil, fmt.Errorf("COOKIE_SECURE: %w", err)
	}
	if c.BcryptCost, err = strconv.Atoi(get("BCRYPT_COST", "12")); err != nil || c.BcryptCost < 10 || c.BcryptCost > 14 {
		return nil, fmt.Errorf("BCRYPT_COST harus angka 10-14")
	}
	if c.Timezone, err = time.LoadLocation(get("APP_TIMEZONE", "Asia/Jakarta")); err != nil {
		return nil, fmt.Errorf("APP_TIMEZONE tidak dikenal (contoh: Asia/Jakarta): %w", err)
	}
	// Di production API hanya boleh dijangkau lewat reverse proxy: bind ke localhost kecuali diubah eksplisit.
	if host, set := os.LookupEnv("HOST"); set {
		c.Host = strings.TrimSpace(host)
	} else if c.AppEnv == "production" {
		c.Host = "127.0.0.1"
	}
	if c.AppEnv == "production" && !c.CookieSecure {
		return nil, fmt.Errorf("COOKIE_SECURE harus true saat APP_ENV=production")
	}

	if c.APIRateLimit, err = strconv.Atoi(get("API_RATE_LIMIT_PER_MIN", "100")); err != nil || c.APIRateLimit < 0 {
		return nil, fmt.Errorf("API_RATE_LIMIT_PER_MIN harus angka >= 0 (0 = nonaktif)")
	}
	if c.TrustedProxies, err = parseProxies(os.Getenv("TRUSTED_PROXIES")); err != nil {
		return nil, err
	}
	// Swagger aktif secara default di development, nonaktif di production kecuali diminta eksplisit.
	if c.SwaggerEnabled, err = strconv.ParseBool(get("SWAGGER_ENABLED", strconv.FormatBool(c.AppEnv != "production"))); err != nil {
		return nil, fmt.Errorf("SWAGGER_ENABLED: %w", err)
	}
	if c.CleanupInterval, err = time.ParseDuration(get("TOKEN_CLEANUP_INTERVAL", "1h")); err != nil || c.CleanupInterval < 0 {
		return nil, fmt.Errorf("TOKEN_CLEANUP_INTERVAL harus durasi >= 0 (mis. 1h, 0 = nonaktif)")
	}
	return c, nil
}

// parseProxies memvalidasi daftar IP / CIDR dipisah koma (kosong = tidak ada proxy tepercaya).
func parseProxies(raw string) ([]string, error) {
	var out []string
	for _, p := range strings.Split(raw, ",") {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if net.ParseIP(p) == nil {
			if _, _, err := net.ParseCIDR(p); err != nil {
				return nil, fmt.Errorf("TRUSTED_PROXIES berisi nilai bukan IP/CIDR: %q", p)
			}
		}
		out = append(out, p)
	}
	return out, nil
}

// placeholderPrefix menandai nilai contoh di .env.example yang tidak boleh dipakai.
const placeholderPrefix = "ganti_dengan"

// ListenAddr adalah alamat untuk http.Server (host kosong = semua antarmuka).
func (c *Config) ListenAddr() string { return net.JoinHostPort(c.Host, c.Port) }

func (c *Config) DSN() string {
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s TimeZone=UTC",
		c.DBHost, c.DBPort, c.DBUser, c.DBPassword, c.DBName, c.DBSSLMode)
}

// MigrateURL adalah URL koneksi untuk golang-migrate (driver pgx5).
func (c *Config) MigrateURL() string {
	u := url.URL{
		Scheme:   "pgx5",
		User:     url.UserPassword(c.DBUser, c.DBPassword),
		Host:     c.DBHost + ":" + c.DBPort,
		Path:     c.DBName,
		RawQuery: "sslmode=" + c.DBSSLMode,
	}
	return u.String()
}

func get(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
