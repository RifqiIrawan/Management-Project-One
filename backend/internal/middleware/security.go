package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

const maxBodyBytes = 1 << 20 // 1 MB

// Security menambah header keamanan dan membatasi ukuran body request.
func Security() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBodyBytes)
		c.Next()
	}
}
