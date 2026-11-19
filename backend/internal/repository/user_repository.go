package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
)

type UserRepository struct{ db *gorm.DB }

func NewUserRepository(db *gorm.DB) *UserRepository { return &UserRepository{db: db} }

func (r *UserRepository) Create(ctx context.Context, u *model.User) error {
	if err := r.db.WithContext(ctx).Create(u).Error; err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return apperror.Conflict("Email sudah terdaftar")
		}
		return fmt.Errorf("create user: %w", err)
	}
	return nil
}

func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*model.User, error) {
	var u model.User
	err := r.db.WithContext(ctx).Where("email = ?", email).First(&u).Error
	return &u, wrapFind(err, "find user by email")
}

func (r *UserRepository) FindByID(ctx context.Context, id string) (*model.User, error) {
	var u model.User
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&u).Error
	return &u, wrapFind(err, "find user by id")
}

func (r *UserRepository) UpdateProfile(ctx context.Context, id string, fields map[string]any) error {
	err := r.db.WithContext(ctx).Model(&model.User{}).Where("id = ?", id).Updates(fields).Error
	if err != nil {
		return fmt.Errorf("update profile: %w", err)
	}
	return nil
}

func (r *UserRepository) TouchLogin(ctx context.Context, id string) error {
	err := r.db.WithContext(ctx).Model(&model.User{}).Where("id = ?", id).
		UpdateColumn("last_login_at", time.Now()).Error
	if err != nil {
		return fmt.Errorf("touch login: %w", err)
	}
	return nil
}

// UpdatePassword mengganti hash dan menaikkan token_version sehingga
// semua access token lama langsung tidak berlaku.
func (r *UserRepository) UpdatePassword(ctx context.Context, id, hashed string) error {
	err := r.db.WithContext(ctx).Model(&model.User{}).Where("id = ?", id).Updates(map[string]any{
		"password_hash": hashed,
		"token_version": gorm.Expr("token_version + 1"),
	}).Error
	if err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	return nil
}

func (r *UserRepository) BumpTokenVersion(ctx context.Context, id string) error {
	err := r.db.WithContext(ctx).Model(&model.User{}).Where("id = ?", id).
		UpdateColumn("token_version", gorm.Expr("token_version + 1")).Error
	if err != nil {
		return fmt.Errorf("bump token version: %w", err)
	}
	return nil
}

func wrapFind(err error, op string) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return apperror.ErrNotFound
	}
	return fmt.Errorf("%s: %w", op, err)
}
