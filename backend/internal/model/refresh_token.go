package model

import "time"

type RefreshToken struct {
	ID        string `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID    string `gorm:"type:uuid"`
	TokenHash string
	UserAgent string
	IPAddress string
	ExpiresAt time.Time
	RevokedAt *time.Time
	CreatedAt time.Time
}
