package dto

import "time"

type CreateProjectRequest struct {
	Name        string `json:"name" binding:"required,min=2,max=150"`
	Key         string `json:"key" binding:"required,min=2,max=5,alpha"`
	Description string `json:"description" binding:"max=5000"`
	Color       string `json:"color" binding:"omitempty,hexcolor"`
	Icon        string `json:"icon" binding:"max=10"`
}

// UpdateProjectRequest: field yang tidak dikirim tidak diubah. Key tidak bisa diubah
// karena sudah menjadi bagian kode tugas (MPO-1, ...).
type UpdateProjectRequest struct {
	Name        *string `json:"name" binding:"omitempty,min=2,max=150"`
	Description *string `json:"description" binding:"omitempty,max=5000"`
	Color       *string `json:"color" binding:"omitempty,hexcolor"`
	Icon        *string `json:"icon" binding:"omitempty,max=10"`
}

type ArchiveProjectRequest struct {
	Archived *bool `json:"archived" binding:"required"`
}

type DeleteProjectRequest struct {
	ConfirmName string `json:"confirm_name" binding:"required"`
}

type AddMemberRequest struct {
	Email string `json:"email" binding:"required,email"`
	Role  string `json:"role" binding:"omitempty,oneof=owner member"`
}

type UpdateMemberRoleRequest struct {
	Role string `json:"role" binding:"required,oneof=owner member"`
}

type MemberPreview struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	AvatarColor string `json:"avatar_color"`
}

type ProjectResponse struct {
	ID             string          `json:"id"`
	Name           string          `json:"name"`
	Key            string          `json:"key"`
	Description    *string         `json:"description"`
	Color          string          `json:"color"`
	Icon           *string         `json:"icon"`
	OwnerID        string          `json:"owner_id"`
	ArchivedAt     *time.Time      `json:"archived_at"`
	CreatedAt      time.Time       `json:"created_at"`
	MyRole         string          `json:"my_role"`
	IsFavorite     bool            `json:"is_favorite"`
	MemberCount    int             `json:"member_count"`
	MembersPreview []MemberPreview `json:"members_preview,omitempty"`
}

type FavoriteResponse struct {
	IsFavorite bool `json:"is_favorite"`
}

type MemberResponse struct {
	UserID      string    `json:"user_id"`
	Name        string    `json:"name"`
	Email       string    `json:"email"`
	AvatarColor string    `json:"avatar_color"`
	Role        string    `json:"role"`
	JoinedAt    time.Time `json:"joined_at"`
}

type UserSummary struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Email       string `json:"email"`
	AvatarColor string `json:"avatar_color"`
}
