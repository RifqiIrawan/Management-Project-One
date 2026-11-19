package response

import (
	"errors"
	"log/slog"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
)

type ErrorBody struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Details map[string]string `json:"details,omitempty"`
}

type Body struct {
	Success bool       `json:"success"`
	Data    any        `json:"data,omitempty"`
	Meta    any        `json:"meta,omitempty"`
	Error   *ErrorBody `json:"error,omitempty"`
}

func OK(c *gin.Context, status int, data any) {
	c.JSON(status, Body{Success: true, Data: data})
}

// Err mengubah error menjadi response standar. Error tak dikenal dicatat di
// server dan dikirim sebagai 500 tanpa detail internal.
func Err(c *gin.Context, err error) {
	ae := toAppError(err)
	if ae == nil {
		slog.Error("unhandled error", "path", c.FullPath(), "err", err)
		ae = apperror.ErrInternal
	}
	c.AbortWithStatusJSON(ae.Status, Body{
		Error: &ErrorBody{Code: ae.Code, Message: ae.Message, Details: ae.Details},
	})
}

// toAppError mengembalikan nil untuk error yang tidak dikenal (akan menjadi 500).
func toAppError(err error) *apperror.Error {
	var ae *apperror.Error
	if errors.As(err, &ae) {
		return ae
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && (pgErr.Code == "22021" || pgErr.Code == "22P05") {
		// karakter NUL / byte tidak valid dalam teks yang dikirim client
		return apperror.BadRequest("Data mengandung karakter yang tidak diizinkan")
	}
	return nil
}
