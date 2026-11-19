package middleware

import (
	"log/slog"

	"github.com/gin-gonic/gin"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/response"
)

// Recovery menangkap panic dan membalas dengan JSON 500 standar (tanpa detail internal).
func Recovery() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered any) {
		slog.Error("panic", "request_id", RequestID(c), "route", c.FullPath(), "err", recovered)
		response.Err(c, apperror.ErrInternal)
	})
}
