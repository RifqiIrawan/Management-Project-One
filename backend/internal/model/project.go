package model

import "time"

const (
	RoleOwner  = "owner"
	RoleMember = "member"
)

type Project struct {
	ID          string `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Name        string
	Key         string
	Description *string
	Color       string
	Icon        *string
	OwnerID     string `gorm:"type:uuid"`
	TaskCounter int
	ArchivedAt  *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type ProjectMember struct {
	ProjectID  string `gorm:"type:uuid;primaryKey"`
	UserID     string `gorm:"type:uuid;primaryKey"`
	Role       string
	IsFavorite bool
	JoinedAt   time.Time `gorm:"autoCreateTime"`
}
