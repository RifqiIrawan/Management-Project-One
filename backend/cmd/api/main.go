package main

import (
	"log/slog"
	"os"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/config"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/database"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/router"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("load config", "err", err)
		os.Exit(1)
	}
	if err := database.Migrate(cfg); err != nil {
		slog.Error("migrate database", "err", err)
		os.Exit(1)
	}
	db, err := database.Connect(cfg)
	if err != nil {
		slog.Error("connect database", "err", err)
		os.Exit(1)
	}
	r, err := router.New(cfg, db)
	if err != nil {
		slog.Error("setup router", "err", err)
		os.Exit(1)
	}
	slog.Info("server berjalan", "port", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		slog.Error("run server", "err", err)
		os.Exit(1)
	}
}
