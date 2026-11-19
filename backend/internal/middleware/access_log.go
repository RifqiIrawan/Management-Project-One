package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"regexp"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
)

const requestIDKey = "request_id"

var validRequestID = regexp.MustCompile(`^[A-Za-z0-9._-]{8,64}$`)

// RequestID mengembalikan ID request milik context (kosong bila middleware AccessLog belum jalan).
func RequestID(c *gin.Context) string { return c.GetString(requestIDKey) }

func newRequestID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "unknown"
	}
	return hex.EncodeToString(b)
}

// AccessLog memberi setiap request sebuah ID (header X-Request-ID; ID dari client dipakai hanya
// bila formatnya aman) dan mencatat satu baris log terstruktur per request. Yang dicatat: method,
// pola route (bukan URL asli, agar tidak memuat ID/email), status, latensi, IP, dan user id.
// Query string dan body tidak pernah dicatat.
func AccessLog() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		id := c.GetHeader("X-Request-ID")
		if !validRequestID.MatchString(id) {
			id = newRequestID()
		}
		c.Set(requestIDKey, id)
		c.Header("X-Request-ID", id)

		c.Next()

		route := c.FullPath()
		if route == "" {
			route = "(tidak cocok)"
		}
		attrs := []any{
			"request_id", id, "method", c.Request.Method, "route", route,
			"status", c.Writer.Status(), "latency_ms", float64(time.Since(start).Microseconds()) / 1000,
			"ip", c.ClientIP(),
		}
		if v, ok := c.Get(userKey); ok {
			if u, ok := v.(*model.User); ok {
				attrs = append(attrs, "user_id", u.ID)
			}
		}
		switch status := c.Writer.Status(); {
		case status >= 500:
			slog.Error("request", attrs...)
		case status >= 400:
			slog.Warn("request", attrs...)
		default:
			slog.Info("request", attrs...)
		}
	}
}
