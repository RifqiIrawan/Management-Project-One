package database

import (
	"errors"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/config"
	"github.com/RifqiIrawan/Management-Project-One/backend/migrations"
)

// Migrate menjalankan semua migrasi SQL yang belum diterapkan.
func Migrate(cfg *config.Config) error {
	src, err := iofs.New(migrations.FS, ".")
	if err != nil {
		return fmt.Errorf("migration source: %w", err)
	}
	m, err := migrate.NewWithSourceInstance("iofs", src, cfg.MigrateURL())
	if err != nil {
		return fmt.Errorf("migration init: %w", err)
	}
	defer m.Close()
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migration up: %w", err)
	}
	return nil
}
