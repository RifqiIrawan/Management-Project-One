package dto

import "time"

type CreateTaskRequest struct {
	Title       string   `json:"title" binding:"required,min=1,max=200"`
	Description string   `json:"description"`
	Status      string   `json:"status" binding:"omitempty,oneof=todo in_progress in_review done"`
	Priority    string   `json:"priority" binding:"omitempty,oneof=low medium high urgent"`
	AssigneeID  string   `json:"assignee_id"`
	StartDate   string   `json:"start_date"`
	DueDate     string   `json:"due_date"`
	Labels      []string `json:"labels" binding:"max=5,dive,max=30"`
}

// UpdateTaskRequest: field yang tidak dikirim tidak diubah; null mengosongkan field
// yang boleh kosong (description, assignee_id, start_date, due_date).
type UpdateTaskRequest struct {
	Title       *string          `json:"title" binding:"omitempty,min=1,max=200"`
	Description Optional[string] `json:"description"`
	Status      *string          `json:"status" binding:"omitempty,oneof=todo in_progress in_review done"`
	Priority    *string          `json:"priority" binding:"omitempty,oneof=low medium high urgent"`
	AssigneeID  Optional[string] `json:"assignee_id"`
	StartDate   Optional[string] `json:"start_date"`
	DueDate     Optional[string] `json:"due_date"`
	Labels      *[]string        `json:"labels" binding:"omitempty,max=5,dive,max=30"`
}

// Provided true bila body memuat setidaknya satu field.
func (r UpdateTaskRequest) Provided() bool {
	return r.Title != nil || r.Description.Set || r.Status != nil || r.Priority != nil ||
		r.AssigneeID.Set || r.StartDate.Set || r.DueDate.Set || r.Labels != nil
}

type MoveTaskRequest struct {
	Status   string   `json:"status" binding:"required,oneof=todo in_progress in_review done"`
	Position *float64 `json:"position"`
}

type UserRef struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	AvatarColor string `json:"avatar_color,omitempty"`
}

type TaskResponse struct {
	ID          string     `json:"id"`
	Code        string     `json:"code"`
	Number      int        `json:"number"`
	ProjectID   string     `json:"project_id"`
	Title       string     `json:"title"`
	Description *string    `json:"description"`
	Status      string     `json:"status"`
	Priority    string     `json:"priority"`
	Labels      []string   `json:"labels"`
	Position    float64    `json:"position"`
	Assignee    *UserRef   `json:"assignee"`
	CreatedBy   UserRef    `json:"created_by"`
	StartDate   *string    `json:"start_date"`
	DueDate     *string    `json:"due_date"`
	CompletedAt *time.Time `json:"completed_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}
