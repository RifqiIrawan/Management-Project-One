package repository

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
)

// CommentRow: komentar + penulis. Kolom proyek/role hanya terisi oleh FindForUser.
type CommentRow struct {
	ID          string
	TaskID      string
	UserID      string
	AuthorName  string
	AuthorColor string
	Body        string
	EditedAt    *time.Time
	CreatedAt   time.Time

	ProjectID       string
	TaskCode        string
	ProjectArchived bool
	MyRole          string
}

const commentColumns = `
c.id, c.task_id, c.user_id, au.name AS author_name, au.avatar_color AS author_color,
c.body, c.edited_at, c.created_at`

type CommentRepository struct{ db *gorm.DB }

func NewCommentRepository(db *gorm.DB) *CommentRepository { return &CommentRepository{db: db} }

// Transaction menjalankan fn dengan repository yang terikat ke satu transaksi.
func (r *CommentRepository) Transaction(ctx context.Context, fn func(tx *CommentRepository) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(&CommentRepository{db: tx})
	})
}

func (r *CommentRepository) Insert(ctx context.Context, taskID, userID, body string) (string, error) {
	var out struct{ ID string }
	err := r.db.WithContext(ctx).
		Raw(`INSERT INTO comments (task_id, user_id, body) VALUES (?, ?, ?) RETURNING id`, taskID, userID, body).
		Scan(&out).Error
	if err != nil {
		return "", fmt.Errorf("insert comment: %w", err)
	}
	return out.ID, nil
}

// FindForUser: komentar + role user di proyeknya. ErrNotFound bila komentar tidak ada
// ATAU user bukan anggota proyek (tidak membocorkan keberadaannya).
func (r *CommentRepository) FindForUser(ctx context.Context, commentID, userID string) (*CommentRow, error) {
	var row CommentRow
	res := r.db.WithContext(ctx).Raw(`
SELECT `+commentColumns+`, t.project_id, p."key" || '-' || t.number AS task_code,
       (p.archived_at IS NOT NULL) AS project_archived, pm.role AS my_role
FROM comments c
JOIN tasks t ON t.id = c.task_id
JOIN projects p ON p.id = t.project_id
JOIN users au ON au.id = c.user_id
JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ?
WHERE c.id = ?`, userID, commentID).Scan(&row)
	if res.Error != nil {
		return nil, fmt.Errorf("find comment for user: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return nil, apperror.ErrNotFound
	}
	return &row, nil
}

func (r *CommentRepository) Count(ctx context.Context, taskID string) (int, error) {
	var out struct{ N int }
	if err := r.db.WithContext(ctx).Raw(`SELECT COUNT(*) AS n FROM comments WHERE task_id = ?`, taskID).Scan(&out).Error; err != nil {
		return 0, fmt.Errorf("count comments: %w", err)
	}
	return out.N, nil
}

// ListByTask: terlama dulu (urutan percakapan), stabil antar halaman.
func (r *CommentRepository) ListByTask(ctx context.Context, taskID string, limit, offset int) ([]CommentRow, error) {
	rows := []CommentRow{}
	err := r.db.WithContext(ctx).Raw(`
SELECT `+commentColumns+`
FROM comments c
JOIN users au ON au.id = c.user_id
WHERE c.task_id = ?
ORDER BY c.created_at ASC, c.id
LIMIT ? OFFSET ?`, taskID, limit, offset).Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("list comments: %w", err)
	}
	return rows, nil
}

// UpdateBody mengganti isi dan menandai komentar sebagai diedit.
func (r *CommentRepository) UpdateBody(ctx context.Context, commentID, body string) error {
	if err := r.db.WithContext(ctx).Exec(`UPDATE comments SET body = ?, edited_at = now() WHERE id = ?`, body, commentID).Error; err != nil {
		return fmt.Errorf("update comment: %w", err)
	}
	return nil
}

func (r *CommentRepository) Delete(ctx context.Context, commentID string) error {
	if err := r.db.WithContext(ctx).Exec(`DELETE FROM comments WHERE id = ?`, commentID).Error; err != nil {
		return fmt.Errorf("delete comment: %w", err)
	}
	return nil
}

// DeleteCommentActivity menghapus catatan "mengomentari" milik komentar yang dihapus,
// agar riwayat tidak menampilkan komentar yang sudah tidak ada.
func (r *CommentRepository) DeleteCommentActivity(ctx context.Context, commentID string) error {
	err := r.db.WithContext(ctx).
		Exec(`DELETE FROM activities WHERE action = 'comment.created' AND metadata->>'comment_id' = ?`, commentID).Error
	if err != nil {
		return fmt.Errorf("delete comment activity: %w", err)
	}
	return nil
}

func (r *CommentRepository) LogActivity(ctx context.Context, projectID string, taskID *string, userID, action string, metadata map[string]any) error {
	return logActivity(ctx, r.db, projectID, taskID, userID, action, metadata)
}
