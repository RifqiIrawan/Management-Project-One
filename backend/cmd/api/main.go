package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/config"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/database"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/jobs"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/repository"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/router"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server berhenti dengan error", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	setupLogger(cfg.AppEnv)
	if err := database.Migrate(cfg); err != nil {
		return err
	}
	db, err := database.Connect(cfg)
	if err != nil {
		return err
	}
	if sqlDB, err := db.DB(); err == nil {
		defer sqlDB.Close()
	}
	r, err := router.New(cfg, db)
	if err != nil {
		return err
	}

	srv := &http.Server{
		Addr:              cfg.ListenAddr(),
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go jobs.RunTokenCleanup(ctx, repository.NewTokenRepository(db), cfg.CleanupInterval)

	errCh := make(chan error, 1)
	go func() { errCh <- srv.ListenAndServe() }()
	slog.Info("server berjalan", "addr", cfg.ListenAddr(), "env", cfg.AppEnv)

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		slog.Info("menerima sinyal berhenti, mematikan server...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
	return nil
}

// setupLogger: JSON di produksi (mudah diproses log collector), teks biasa di development.
func setupLogger(env string) {
	var h slog.Handler = slog.NewTextHandler(os.Stdout, nil)
	if env == "production" {
		h = slog.NewJSONHandler(os.Stdout, nil)
	}
	slog.SetDefault(slog.New(h))
}
