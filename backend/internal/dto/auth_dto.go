package dto

import (
	"time"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
)

type RegisterRequest struct {
	Name            string `json:"name" binding:"required,min=2,max=100"`
	Email           string `json:"email" binding:"required,email,max=150"`
	Password        string `json:"password" binding:"required,min=8,max=72"`
	ConfirmPassword string `json:"confirm_password" binding:"required,eqfield=Password"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8,max=72"`
	ConfirmPassword string `json:"confirm_password" binding:"required,eqfield=NewPassword"`
}

type UpdateProfileRequest struct {
	Name        *string `json:"name" binding:"omitempty,min=2,max=100"`
	AvatarColor *string `json:"avatar_color" binding:"omitempty,hexcolor"`
}

type UserResponse struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Email       string     `json:"email"`
	AvatarColor string     `json:"avatar_color"`
	LastLoginAt *time.Time `json:"last_login_at"`
	CreatedAt   time.Time  `json:"created_at"`
}

type AuthResponse struct {
	AccessToken string       `json:"access_token"`
	TokenType   string       `json:"token_type"`
	ExpiresIn   int          `json:"expires_in"`
	User        UserResponse `json:"user"`
}

func NewUserResponse(u *model.User) UserResponse {
	return UserResponse{
		ID: u.ID, Name: u.Name, Email: u.Email, AvatarColor: u.AvatarColor,
		LastLoginAt: u.LastLoginAt, CreatedAt: u.CreatedAt,
	}
}
