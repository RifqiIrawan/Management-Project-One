package migrations

import "embed"

// FS berisi seluruh file migrasi SQL, ikut ter-compile ke binary.
//
//go:embed *.sql
var FS embed.FS
