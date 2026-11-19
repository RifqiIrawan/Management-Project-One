package repository

import (
	"errors"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
)

// isUniqueViolation true jika error berasal dari pelanggaran UNIQUE (SQLSTATE 23505).
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// escapeLike menetralkan karakter khusus LIKE agar input user dicari apa adanya.
func escapeLike(s string) string { return likeEscaper.Replace(s) }
