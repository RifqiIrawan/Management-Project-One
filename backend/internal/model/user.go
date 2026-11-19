package model

import "time"

type User struct {
	ID           string `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Name         string
	Email        string
	PasswordHash string
	AvatarColor  string `gorm:"default:#6366F1"`
	TokenVersion int
	LastLoginAt  *time.Time
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
