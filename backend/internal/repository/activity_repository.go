package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// logActivity menulis satu baris riwayat. Dipakai repository lain agar pencatatan
// ikut transaksi yang sama dengan perubahannya.
func logActivity(ctx context.Context, db *gorm.DB, projectID string, taskID *string, userID, action string, metadata map[string]any) error {
	meta, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("marshal activity: %w", err)
	}
	err = db.WithContext(ctx).Exec(
		`INSERT INTO activities (project_id, task_id, user_id, action, metadata) VALUES (?, ?, ?, ?, ?::jsonb)`,
		projectID, taskID, userID, action, string(meta)).Error
	if err != nil {
		return fmt.Errorf("log activity: %w", err)
	}
	return nil
}

// ActivityRow: satu catatan riwayat beserta nama pelaku dan (untuk penugasan) nama assignee lama/baru.
type ActivityRow struct {
	ID        int64
	Action    string
	TaskID    *string
	UserID    string
	UserName  string
	UserColor string
	Metadata  string // JSON
	CreatedAt time.Time
	FromName  *string
	ToName    *string

	// hanya terisi oleh ListForUser (riwayat lintas proyek)
	ProjectID   string
	ProjectName string
	ProjectKey  string
}

// ActivityScope menentukan riwayat proyek (TaskID kosong) atau satu tugas.
type ActivityScope struct {
	ProjectID string
	TaskID    string
}

type ActivityRepository struct{ db *gorm.DB }

func NewActivityRepository(db *gorm.DB) *ActivityRepository { return &ActivityRepository{db: db} }

func (s ActivityScope) where() (string, []any) {
	if s.TaskID != "" {
		return "a.task_id = ?", []any{s.TaskID}
	}
	return "a.project_id = ?", []any{s.ProjectID}
}

func (r *ActivityRepository) Count(ctx context.Context, s ActivityScope) (int, error) {
	where, args := s.where()
	var out struct{ N int }
	if err := r.db.WithContext(ctx).Raw(`SELECT COUNT(*) AS n FROM activities a WHERE `+where, args...).Scan(&out).Error; err != nil {
		return 0, fmt.Errorf("count activities: %w", err)
	}
	return out.N, nil
}

// List: terbaru dulu. Nama assignee lama/baru diambil lewat join; CASE menjamin cast uuid
// hanya dievaluasi untuk baris task.assigned (baris lain menyimpan metadata berbeda).
func (r *ActivityRepository) List(ctx context.Context, s ActivityScope, limit, offset int) ([]ActivityRow, error) {
	where, args := s.where()
	args = append(args, limit, offset)
	rows := []ActivityRow{}
	err := r.db.WithContext(ctx).Raw(`
SELECT a.id, a.action, a.task_id, a.user_id, u.name AS user_name, u.avatar_color AS user_color,
       a.metadata::text AS metadata, a.created_at, fu.name AS from_name, tu.name AS to_name
FROM activities a
JOIN users u ON u.id = a.user_id
LEFT JOIN users fu ON fu.id = CASE WHEN a.action = 'task.assigned' THEN (a.metadata->>'from')::uuid END
LEFT JOIN users tu ON tu.id = CASE WHEN a.action = 'task.assigned' THEN (a.metadata->>'to')::uuid END
WHERE `+where+`
ORDER BY a.created_at DESC, a.id DESC
LIMIT ? OFFSET ?`, args...).Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("list activities: %w", err)
	}
	return rows, nil
}

// ListForUser: aktivitas terbaru dari proyek aktif yang diikuti user (lintas proyek), maks. limit.
// LATERAL mengambil limit catatan teratas PER proyek lewat idx_activities_project lalu menggabungkannya,
// sehingga biayanya mengikuti jumlah proyek user, bukan total riwayat seluruh proyek.
func (r *ActivityRepository) ListForUser(ctx context.Context, userID string, limit int) ([]ActivityRow, error) {
	rows := []ActivityRow{}
	err := r.db.WithContext(ctx).Raw(`
SELECT a.id, a.action, a.task_id, a.user_id, u.name AS user_name, u.avatar_color AS user_color,
       a.metadata::text AS metadata, a.created_at, fu.name AS from_name, tu.name AS to_name,
       p.id AS project_id, p.name AS project_name, p."key" AS project_key
FROM project_members pm
JOIN projects p ON p.id = pm.project_id AND p.archived_at IS NULL
CROSS JOIN LATERAL (
    SELECT * FROM activities x WHERE x.project_id = pm.project_id
    ORDER BY x.created_at DESC, x.id DESC LIMIT ?
) a
JOIN users u ON u.id = a.user_id
LEFT JOIN users fu ON fu.id = CASE WHEN a.action = 'task.assigned' THEN (a.metadata->>'from')::uuid END
LEFT JOIN users tu ON tu.id = CASE WHEN a.action = 'task.assigned' THEN (a.metadata->>'to')::uuid END
WHERE pm.user_id = ?
ORDER BY a.created_at DESC, a.id DESC
LIMIT ?`, limit, userID, limit).Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("list user activities: %w", err)
	}
	return rows, nil
}
