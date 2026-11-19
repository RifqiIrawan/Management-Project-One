package jobs

import (
	"context"
	"log/slog"
	"time"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/repository"
)

// tokenGrace: token baru dihapus setelah kedaluwarsa selama ini (jaga-jaga selisih jam & investigasi).
const tokenGrace = 24 * time.Hour

// RunTokenCleanup menghapus refresh token kedaluwarsa: sekali saat start lalu tiap interval,
// sampai ctx dibatalkan. interval <= 0 menonaktifkan job.
func RunTokenCleanup(ctx context.Context, repo *repository.TokenRepository, interval time.Duration) {
	if interval <= 0 {
		slog.Info("pembersihan refresh token dinonaktifkan")
		return
	}
	run := func() {
		n, err := repo.DeleteExpired(ctx, time.Now().Add(-tokenGrace))
		switch {
		case err != nil && ctx.Err() == nil:
			slog.Error("pembersihan refresh token gagal", "err", err)
		case err == nil && n > 0:
			slog.Info("refresh token kedaluwarsa dihapus", "jumlah", n)
		}
	}
	run()
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			run()
		}
	}
}
