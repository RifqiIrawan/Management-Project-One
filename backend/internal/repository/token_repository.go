package repository

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
)

type TokenRepository struct{ db *gorm.DB }

func NewTokenRepository(db *gorm.DB) *TokenRepository { return &TokenRepository{db: db} }

func (r *TokenRepository) Create(ctx context.Context, t *model.RefreshToken) error {
	if err := r.db.WithContext(ctx).Create(t).Error; err != nil {
		return fmt.Errorf("create refresh token: %w", err)
	}
	return nil
}

func (r *TokenRepository) FindByHash(ctx context.Context, hashed string) (*model.RefreshToken, error) {
	var t model.RefreshToken
	err := r.db.WithContext(ctx).Where("token_hash = ?", hashed).First(&t).Error
	return &t, wrapFind(err, "find refresh token")
}

// RevokeIfActive mencabut token hanya jika belum dicabut (atomik).
// Mengembalikan false jika token sudah dicabut lebih dulu (mis. pemakaian ganda bersamaan).
func (r *TokenRepository) RevokeIfActive(ctx context.Context, id string) (bool, error) {
	res := r.db.WithContext(ctx).Model(&model.RefreshToken{}).
		Where("id = ? AND revoked_at IS NULL", id).
		UpdateColumn("revoked_at", time.Now())
	if res.Error != nil {
		return false, fmt.Errorf("revoke refresh token: %w", res.Error)
	}
	return res.RowsAffected == 1, nil
}

func (r *TokenRepository) RevokeByHash(ctx context.Context, hashed string) error {
	err := r.db.WithContext(ctx).Model(&model.RefreshToken{}).
		Where("token_hash = ? AND revoked_at IS NULL", hashed).
		UpdateColumn("revoked_at", time.Now()).Error
	if err != nil {
		return fmt.Errorf("revoke by hash: %w", err)
	}
	return nil
}

func (r *TokenRepository) RevokeAllForUser(ctx context.Context, userID string) error {
	err := r.db.WithContext(ctx).Model(&model.RefreshToken{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		UpdateColumn("revoked_at", time.Now()).Error
	if err != nil {
		return fmt.Errorf("revoke all tokens: %w", err)
	}
	return nil
}
