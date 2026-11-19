package dto

import "time"

type CreateCommentRequest struct {
	Body string `json:"body" binding:"required,max=5000"`
}

type UpdateCommentRequest struct {
	Body string `json:"body" binding:"required,max=5000"`
}

// PageParams: parameter pagination mentah (divalidasi di service).
type PageParams struct {
	Page    string
	PerPage string
}

type CommentResponse struct {
	ID        string     `json:"id"`
	TaskID    string     `json:"task_id"`
	Body      string     `json:"body"`
	Author    UserRef    `json:"author"`
	EditedAt  *time.Time `json:"edited_at"`
	CreatedAt time.Time  `json:"created_at"`
	CanEdit   bool       `json:"can_edit"`   // hanya penulis
	CanDelete bool       `json:"can_delete"` // penulis atau owner proyek
}

type ActivityResponse struct {
	ID        int64          `json:"id"`
	Action    string         `json:"action"`
	Message   string         `json:"message"` // kalimat siap tampil, mis. "Budi membuat tugas MPO-12"
	User      UserRef        `json:"user"`
	Project   *ProjectRef    `json:"project,omitempty"` // hanya pada riwayat lintas proyek (dashboard)
	TaskID    *string        `json:"task_id"`           // null bila tugasnya sudah dihapus
	Code      string         `json:"code"`
	Metadata  map[string]any `json:"metadata"`
	CreatedAt time.Time      `json:"created_at"`
}
