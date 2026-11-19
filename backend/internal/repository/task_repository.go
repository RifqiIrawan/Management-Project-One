package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
)

// TaskRow adalah tugas lengkap dengan data assignee & pembuat (hasil join).
type TaskRow struct {
	ID              string
	Code            string
	Number          int
	ProjectID       string
	Title           string
	Description     *string
	Status          string
	Priority        string
	Labels          model.StringArray
	Position        float64
	AssigneeID      *string
	AssigneeName    *string
	AssigneeColor   *string
	CreatedBy       string
	CreatorName     string
	StartDate       *string
	DueDate         *string
	CompletedAt     *time.Time
	CreatedAt       time.Time
	UpdatedAt       time.Time
	ProjectArchived bool
	ProjectName     string
	ProjectColor    string
	ProjectKey      string
	MyRole          string // hanya terisi oleh FindForUser
}

const taskColumns = `
t.id, p."key" || '-' || t.number AS code, t.number, t.project_id, t.title, t.description,
t.status, t.priority, COALESCE(to_json(t.labels)::text, '[]') AS labels, t.position,
t.assignee_id, a.name AS assignee_name, a.avatar_color AS assignee_color,
t.created_by, c.name AS creator_name,
to_char(t.start_date, 'YYYY-MM-DD') AS start_date, to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
t.completed_at, t.created_at, t.updated_at, (p.archived_at IS NOT NULL) AS project_archived,
p.name AS project_name, p.color AS project_color, p."key" AS project_key`

const taskFrom = `
FROM tasks t
JOIN projects p ON p.id = t.project_id
JOIN users c ON c.id = t.created_by
LEFT JOIN users a ON a.id = t.assignee_id`

// NewTask adalah data untuk menyisipkan tugas baru.
type NewTask struct {
	ProjectID   string
	Number      int
	Title       string
	Description *string
	Status      string
	Priority    string
	Labels      model.StringArray
	Position    float64
	AssigneeID  *string
	CreatedBy   string
	StartDate   *string
	DueDate     *string
	CompletedAt *time.Time
}

type TaskRepository struct{ db *gorm.DB }

func NewTaskRepository(db *gorm.DB) *TaskRepository { return &TaskRepository{db: db} }

// Transaction menjalankan fn dengan repository yang terikat ke satu transaksi.
func (r *TaskRepository) Transaction(ctx context.Context, fn func(tx *TaskRepository) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(&TaskRepository{db: tx})
	})
}

// NextNumber menaikkan task_counter proyek secara atomik dan mengembalikan nomor barunya.
// UPDATE ini mengunci baris proyek sampai transaksi selesai, sehingga pembuatan tugas
// bersamaan diserialkan dan nomor tidak pernah bentrok.
func (r *TaskRepository) NextNumber(ctx context.Context, projectID string) (int, error) {
	var out struct{ TaskCounter int }
	res := r.db.WithContext(ctx).
		Raw(`UPDATE projects SET task_counter = task_counter + 1 WHERE id = ? RETURNING task_counter`, projectID).
		Scan(&out)
	if res.Error != nil {
		return 0, fmt.Errorf("next task number: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return 0, apperror.ErrNotFound
	}
	return out.TaskCounter, nil
}

// TopPosition: posisi yang menaruh kartu di paling atas kolom (di atas kartu pertama).
func (r *TaskRepository) TopPosition(ctx context.Context, projectID, status string) (float64, error) {
	var out struct{ Pos float64 }
	err := r.db.WithContext(ctx).
		Raw(`SELECT COALESCE(MIN(position), 1024) - 1024 AS pos FROM tasks WHERE project_id = ? AND status = ?`, projectID, status).
		Scan(&out).Error
	if err != nil {
		return 0, fmt.Errorf("top position: %w", err)
	}
	return out.Pos, nil
}

func (r *TaskRepository) Insert(ctx context.Context, t NewTask) (string, error) {
	var out struct{ ID string }
	err := r.db.WithContext(ctx).Raw(`
INSERT INTO tasks (project_id, number, title, description, status, priority, labels, position,
                   assignee_id, created_by, start_date, due_date, completed_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING id`,
		t.ProjectID, t.Number, t.Title, t.Description, t.Status, t.Priority, t.Labels, t.Position,
		t.AssigneeID, t.CreatedBy, t.StartDate, t.DueDate, t.CompletedAt).Scan(&out).Error
	if err != nil {
		return "", fmt.Errorf("insert task: %w", err)
	}
	return out.ID, nil
}

// FindForUser mengembalikan tugas beserta role user di proyeknya.
// ErrNotFound bila tugas tidak ada ATAU user bukan anggota proyek (agar tidak membocorkan keberadaannya).
func (r *TaskRepository) FindForUser(ctx context.Context, taskID, userID string) (*TaskRow, error) {
	var row TaskRow
	res := r.db.WithContext(ctx).Raw(
		`SELECT `+taskColumns+`, pm.role AS my_role `+taskFrom+`
JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ?
WHERE t.id = ?`, userID, taskID).Scan(&row)
	if res.Error != nil {
		return nil, fmt.Errorf("find task for user: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return nil, apperror.ErrNotFound
	}
	return &row, nil
}

func (r *TaskRepository) Update(ctx context.Context, taskID string, fields map[string]any) error {
	if err := r.db.WithContext(ctx).Model(&model.Task{}).Where("id = ?", taskID).Updates(fields).Error; err != nil {
		return fmt.Errorf("update task: %w", err)
	}
	return nil
}

func (r *TaskRepository) Delete(ctx context.Context, taskID string) error {
	if err := r.db.WithContext(ctx).Where("id = ?", taskID).Delete(&model.Task{}).Error; err != nil {
		return fmt.Errorf("delete task: %w", err)
	}
	return nil
}

// LogActivity mencatat riwayat. Panggil di dalam Transaction yang sama dengan perubahannya.
func (r *TaskRepository) LogActivity(ctx context.Context, projectID string, taskID *string, userID, action string, metadata map[string]any) error {
	meta, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("marshal activity: %w", err)
	}
	err = r.db.WithContext(ctx).Exec(
		`INSERT INTO activities (project_id, task_id, user_id, action, metadata) VALUES (?, ?, ?, ?, ?::jsonb)`,
		projectID, taskID, userID, action, string(meta)).Error
	if err != nil {
		return fmt.Errorf("log activity: %w", err)
	}
	return nil
}
