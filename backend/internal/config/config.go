package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv         string
	Port           string
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
}

// Load membaca .env (jika ada) lalu environment variable.
func Load() (*Config, error) {
	_ = godotenv.Load()

	c := &Config{
		AppEnv:         get("APP_ENV", "development"),
		Port:           get("PORT", "8080"),
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
	if len(c.JWTSecret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET wajib diisi, minimal 32 karakter acak")
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
	return c, nil
}

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
