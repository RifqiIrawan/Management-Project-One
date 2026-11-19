package config

import (
	"fmt"
	"os"
	"strings"

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
		AllowedOrigins: strings.Split(get("CORS_ORIGINS", "http://localhost:5173"), ","),
	}
	if c.DBPassword == "" {
		return nil, fmt.Errorf("DB_PASSWORD wajib diisi (lihat .env.example)")
	}
	return c, nil
}

func (c *Config) DSN() string {
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s TimeZone=UTC",
		c.DBHost, c.DBPort, c.DBUser, c.DBPassword, c.DBName, c.DBSSLMode)
}

func get(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
