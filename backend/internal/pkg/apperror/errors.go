package apperror

import "errors"

var (
	ErrNotFound     = errors.New("data tidak ditemukan")
	ErrForbidden    = errors.New("akses ditolak")
	ErrUnauthorized = errors.New("tidak terautentikasi")
	ErrConflict     = errors.New("data sudah ada")
	ErrBadRequest   = errors.New("permintaan tidak valid")
)
