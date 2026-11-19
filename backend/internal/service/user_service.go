package service

import (
	"context"
	"strings"
	"unicode/utf8"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/dto"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/repository"
)

type UserService struct{ users *repository.UserRepository }

func NewUserService(users *repository.UserRepository) *UserService {
	return &UserService{users: users}
}

// Search: pencarian awalan email (min. 3 karakter, maks. 5 hasil, tidak termasuk diri sendiri).
func (s *UserService) Search(ctx context.Context, actorID, q string) ([]dto.UserSummary, error) {
	q = strings.ToLower(strings.TrimSpace(q))
	if utf8.RuneCountInString(q) < 3 {
		return nil, apperror.Validation(map[string]string{"email": "Email minimal 3 karakter"})
	}
	users, err := s.users.SearchByEmailPrefix(ctx, q, actorID, 5)
	if err != nil {
		return nil, err
	}
	out := make([]dto.UserSummary, len(users))
	for i, u := range users {
		out[i] = dto.UserSummary{ID: u.ID, Name: u.Name, Email: u.Email, AvatarColor: u.AvatarColor}
	}
	return out, nil
}

func (s *UserService) UpdateProfile(ctx context.Context, userID string, req dto.UpdateProfileRequest) (*model.User, error) {
	fields := map[string]any{}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if utf8.RuneCountInString(name) < 2 {
			return nil, apperror.Validation(map[string]string{"name": "Nama minimal 2 karakter"})
		}
		fields["name"] = name
	}
	if req.AvatarColor != nil {
		fields["avatar_color"] = strings.ToUpper(*req.AvatarColor)
	}
	if len(fields) == 0 {
		return nil, apperror.BadRequest("Tidak ada data yang diubah")
	}
	if err := s.users.UpdateProfile(ctx, userID, fields); err != nil {
		return nil, err
	}
	return s.users.FindByID(ctx, userID)
}
