package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/config"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/dto"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/hash"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/jwt"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/sign"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/validator"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/repository"
)

// ClientMeta adalah info perangkat yang disimpan bersama refresh token.
type ClientMeta struct {
	UserAgent string
	IP        string
}

// Session adalah hasil login/refresh/ganti password.
type Session struct {
	SigningKey     string // kunci tanda tangan request untuk AccessToken ini (base64url)
	AccessToken    string
	ExpiresIn      int
	User           *model.User
	RefreshToken   string
	RefreshExpires time.Time
}

type AuthService struct {
	users     *repository.UserRepository
	tokens    *repository.TokenRepository
	jwt       *jwt.Manager
	cfg       *config.Config
	dummyHash string // dipakai agar waktu respons sama untuk email tak terdaftar
}

func NewAuthService(users *repository.UserRepository, tokens *repository.TokenRepository, jm *jwt.Manager, cfg *config.Config) (*AuthService, error) {
	dummy, err := hash.Password("dummy-password-1", cfg.BcryptCost)
	if err != nil {
		return nil, fmt.Errorf("dummy hash: %w", err)
	}
	return &AuthService{users: users, tokens: tokens, jwt: jm, cfg: cfg, dummyHash: dummy}, nil
}

var errInvalidCredentials = apperror.Unauthorized("Email atau password salah")

func (s *AuthService) Register(ctx context.Context, req dto.RegisterRequest) (*model.User, error) {
	name := strings.TrimSpace(req.Name)
	if utf8.RuneCountInString(name) < 2 {
		return nil, apperror.Validation(map[string]string{"name": "Nama minimal 2 karakter"})
	}
	if msg := validator.CheckPassword(req.Password); msg != "" {
		return nil, apperror.Validation(map[string]string{"password": msg})
	}
	hashed, err := hash.Password(req.Password, s.cfg.BcryptCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	u := &model.User{Name: name, Email: normalizeEmail(req.Email), PasswordHash: hashed}
	if err := s.users.Create(ctx, u); err != nil {
		return nil, err
	}
	return u, nil
}

func (s *AuthService) Login(ctx context.Context, req dto.LoginRequest, meta ClientMeta) (*Session, error) {
	u, err := s.users.FindByEmail(ctx, normalizeEmail(req.Email))
	if err != nil {
		if errors.Is(err, apperror.ErrNotFound) {
			hash.Compare(s.dummyHash, req.Password)
			return nil, errInvalidCredentials
		}
		return nil, err
	}
	if !hash.Compare(u.PasswordHash, req.Password) {
		return nil, errInvalidCredentials
	}
	if err := s.users.TouchLogin(ctx, u.ID); err != nil {
		slog.Warn("gagal mencatat last_login_at", "err", err)
	} else {
		now := time.Now()
		u.LastLoginAt = &now
	}
	return s.issueSession(ctx, u, meta)
}

// Refresh menukar refresh token dengan sepasang token baru (rotasi).
// Memakai ulang token yang sudah dicabut dianggap pencurian: semua sesi user dicabut.
func (s *AuthService) Refresh(ctx context.Context, raw string, meta ClientMeta) (*Session, error) {
	invalid := apperror.Unauthorized("Sesi tidak valid, silakan login kembali")

	rt, err := s.tokens.FindByHash(ctx, jwt.HashRefresh(raw))
	if err != nil {
		if errors.Is(err, apperror.ErrNotFound) {
			return nil, invalid
		}
		return nil, err
	}
	if rt.RevokedAt != nil {
		return nil, s.handleReuse(ctx, rt.UserID, invalid)
	}
	if time.Now().After(rt.ExpiresAt) {
		return nil, invalid
	}
	ok, err := s.tokens.RevokeIfActive(ctx, rt.ID)
	if err != nil {
		return nil, err
	}
	if !ok { // dicabut bersamaan oleh request lain
		return nil, s.handleReuse(ctx, rt.UserID, invalid)
	}
	u, err := s.users.FindByID(ctx, rt.UserID)
	if err != nil {
		if errors.Is(err, apperror.ErrNotFound) {
			return nil, invalid
		}
		return nil, err
	}
	return s.issueSession(ctx, u, meta)
}

func (s *AuthService) handleReuse(ctx context.Context, userID string, invalid error) error {
	slog.Warn("refresh token yang sudah dicabut dipakai ulang; semua sesi dicabut", "user_id", userID)
	if err := s.tokens.RevokeAllForUser(ctx, userID); err != nil {
		return err
	}
	return invalid
}

func (s *AuthService) Logout(ctx context.Context, raw string) error {
	if raw == "" {
		return nil
	}
	return s.tokens.RevokeByHash(ctx, jwt.HashRefresh(raw))
}

// LogoutAll mencabut semua refresh token dan membuat access token lama tidak berlaku.
func (s *AuthService) LogoutAll(ctx context.Context, userID string) error {
	if err := s.users.BumpTokenVersion(ctx, userID); err != nil {
		return err
	}
	return s.tokens.RevokeAllForUser(ctx, userID)
}

// ChangePassword mengganti password, mencabut semua sesi, lalu membuat sesi baru
// untuk perangkat yang sedang dipakai.
func (s *AuthService) ChangePassword(ctx context.Context, userID string, req dto.ChangePasswordRequest, meta ClientMeta) (*Session, error) {
	u, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !hash.Compare(u.PasswordHash, req.CurrentPassword) {
		return nil, apperror.Validation(map[string]string{"current_password": "Password lama salah"})
	}
	if msg := validator.CheckPassword(req.NewPassword); msg != "" {
		return nil, apperror.Validation(map[string]string{"new_password": msg})
	}
	hashed, err := hash.Password(req.NewPassword, s.cfg.BcryptCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	if err := s.users.UpdatePassword(ctx, u.ID, hashed); err != nil {
		return nil, err
	}
	if err := s.tokens.RevokeAllForUser(ctx, u.ID); err != nil {
		return nil, err
	}
	u, err = s.users.FindByID(ctx, userID) // ambil token_version terbaru
	if err != nil {
		return nil, err
	}
	return s.issueSession(ctx, u, meta)
}

// Authenticate memvalidasi access token dan mengembalikan user beserta claims-nya
// (claims.ID = jti, dipakai verifikasi tanda tangan request).
func (s *AuthService) Authenticate(ctx context.Context, raw string) (*model.User, *jwt.Claims, error) {
	claims, err := s.jwt.ParseAccess(raw)
	if err != nil {
		if errors.Is(err, jwt.ErrExpired) {
			return nil, nil, apperror.ErrTokenExpired
		}
		return nil, nil, apperror.ErrUnauthorized
	}
	u, err := s.users.FindByID(ctx, claims.Subject)
	if err != nil {
		if errors.Is(err, apperror.ErrNotFound) {
			return nil, nil, apperror.ErrUnauthorized
		}
		return nil, nil, err
	}
	if u.TokenVersion != claims.Ver {
		return nil, nil, apperror.ErrUnauthorized
	}
	return u, claims, nil
}

func (s *AuthService) issueSession(ctx context.Context, u *model.User, meta ClientMeta) (*Session, error) {
	access, exp, jti, err := s.jwt.NewAccess(u.ID, u.TokenVersion)
	if err != nil {
		return nil, err
	}
	raw, hashed, err := jwt.NewRefreshToken()
	if err != nil {
		return nil, err
	}
	refreshExp := time.Now().Add(s.cfg.RefreshTTL)
	rt := &model.RefreshToken{
		UserID:    u.ID,
		TokenHash: hashed,
		UserAgent: truncate(meta.UserAgent, 255),
		IPAddress: truncate(meta.IP, 45),
		ExpiresAt: refreshExp,
	}
	if err := s.tokens.Create(ctx, rt); err != nil {
		return nil, err
	}
	return &Session{
		SigningKey:     sign.EncodeKey(sign.DeriveKey(s.cfg.JWTSecret, jti)),
		AccessToken:    access,
		ExpiresIn:      int(time.Until(exp).Seconds()),
		User:           u,
		RefreshToken:   raw,
		RefreshExpires: refreshExp,
	}, nil
}

func normalizeEmail(e string) string { return strings.ToLower(strings.TrimSpace(e)) }

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
