package apperror

import "net/http"

// Error adalah error yang aman ditampilkan ke client.
type Error struct {
	Status  int
	Code    string
	Message string
	Details map[string]string
}

func (e *Error) Error() string { return e.Message }

func New(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

var (
	ErrNotFound     = New(http.StatusNotFound, "NOT_FOUND", "Data tidak ditemukan")
	ErrForbidden    = New(http.StatusForbidden, "FORBIDDEN", "Anda tidak punya izin untuk aksi ini")
	ErrUnauthorized = New(http.StatusUnauthorized, "UNAUTHORIZED", "Silakan login terlebih dahulu")
	ErrTokenExpired = New(http.StatusUnauthorized, "TOKEN_EXPIRED", "Token kedaluwarsa")
	ErrTooMany      = New(http.StatusTooManyRequests, "TOO_MANY_REQUESTS", "Terlalu banyak percobaan, coba lagi nanti")
	ErrNoRoute      = New(http.StatusNotFound, "NOT_FOUND", "Endpoint tidak ditemukan")
	ErrNoMethod     = New(http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method tidak diizinkan untuk endpoint ini")
	ErrTooLarge     = New(http.StatusRequestEntityTooLarge, "PAYLOAD_TOO_LARGE", "Ukuran data terlalu besar (maks. 1 MB)")
	ErrInternal     = New(http.StatusInternalServerError, "INTERNAL_ERROR", "Terjadi kesalahan pada server")
)

func Unauthorized(msg string) *Error { return New(http.StatusUnauthorized, "UNAUTHORIZED", msg) }
func Conflict(msg string) *Error     { return New(http.StatusConflict, "CONFLICT", msg) }
func BadRequest(msg string) *Error   { return New(http.StatusBadRequest, "VALIDATION_ERROR", msg) }

func Validation(details map[string]string) *Error {
	return &Error{
		Status:  http.StatusBadRequest,
		Code:    "VALIDATION_ERROR",
		Message: "Data yang dikirim tidak valid",
		Details: details,
	}
}
