package repository

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
)

// ProjectRow adalah proyek dari sudut pandang satu user (role & favorit miliknya).
type ProjectRow struct {
	ID          string
	Name        string
	Key         string
	Description *string
	Color       string
	Icon        *string
	OwnerID     string
	ArchivedAt  *time.Time
	CreatedAt   time.Time
	MyRole      string
	IsFavorite  bool
	MemberCount int
	TaskCount   int
	DoneCount   int
}

type MemberPreviewRow struct {
	ProjectID   string
	UserID      string
	Name        string
	AvatarColor string
}

// Query ini juga menjadi pintu akses: user yang bukan anggota tidak mendapat baris sama sekali.
const projectSelect = `
SELECT p.id, p.name, p."key", p.description, p.color, p.icon, p.owner_id, p.archived_at, p.created_at,
       pm.role AS my_role, pm.is_favorite,
       (SELECT COUNT(*) FROM project_members x WHERE x.project_id = p.id) AS member_count,
       (SELECT COUNT(*) FROM tasks tk WHERE tk.project_id = p.id) AS task_count,
       (SELECT COUNT(*) FROM tasks tk WHERE tk.project_id = p.id AND tk.status = 'done') AS done_count
FROM projects p
JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?`

type ProjectRepository struct{ db *gorm.DB }

func NewProjectRepository(db *gorm.DB) *ProjectRepository { return &ProjectRepository{db: db} }

// CreateWithOwner menyimpan proyek dan menjadikan pembuatnya owner, dalam satu transaksi.
func (r *ProjectRepository) CreateWithOwner(ctx context.Context, p *model.Project) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(p).Error; err != nil {
			if isUniqueViolation(err) {
				return apperror.Conflict("Key proyek sudah dipakai")
			}
			return fmt.Errorf("create project: %w", err)
		}
		m := &model.ProjectMember{ProjectID: p.ID, UserID: p.OwnerID, Role: model.RoleOwner}
		if err := tx.Create(m).Error; err != nil {
			return fmt.Errorf("create owner membership: %w", err)
		}
		return nil
	})
}

// FindForUser mengembalikan ErrNotFound bila proyek tidak ada ATAU user bukan anggota.
func (r *ProjectRepository) FindForUser(ctx context.Context, projectID, userID string) (*ProjectRow, error) {
	var row ProjectRow
	res := r.db.WithContext(ctx).Raw(projectSelect+` WHERE p.id = ?`, userID, projectID).Scan(&row)
	if res.Error != nil {
		return nil, fmt.Errorf("find project for user: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return nil, apperror.ErrNotFound
	}
	return &row, nil
}

// ListForUser: daftar proyek milik user, favorit di atas. q opsional (cari nama).
func (r *ProjectRepository) ListForUser(ctx context.Context, userID, q string, archived bool) ([]ProjectRow, error) {
	query := projectSelect + ` WHERE (p.archived_at IS NOT NULL) = ?`
	args := []any{userID, archived}
	if q != "" {
		query += ` AND p.name ILIKE ?`
		args = append(args, "%"+escapeLike(q)+"%")
	}
	query += ` ORDER BY pm.is_favorite DESC, p.created_at DESC`

	rows := []ProjectRow{}
	if err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	return rows, nil
}

// MembersPreview mengambil maks. 4 anggota pertama tiap proyek (untuk avatar di kartu).
func (r *ProjectRepository) MembersPreview(ctx context.Context, projectIDs []string) ([]MemberPreviewRow, error) {
	rows := []MemberPreviewRow{}
	if len(projectIDs) == 0 {
		return rows, nil
	}
	const q = `
SELECT t.project_id, t.user_id, t.name, t.avatar_color FROM (
    SELECT pm.project_id, u.id AS user_id, u.name, u.avatar_color,
           ROW_NUMBER() OVER (PARTITION BY pm.project_id ORDER BY (pm.role = 'owner') DESC, pm.joined_at) AS rn
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id IN ?
) t
WHERE t.rn <= 4
ORDER BY t.project_id, t.rn`
	if err := r.db.WithContext(ctx).Raw(q, projectIDs).Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("members preview: %w", err)
	}
	return rows, nil
}

func (r *ProjectRepository) Update(ctx context.Context, id string, fields map[string]any) error {
	if err := r.db.WithContext(ctx).Model(&model.Project{}).Where("id = ?", id).Updates(fields).Error; err != nil {
		return fmt.Errorf("update project: %w", err)
	}
	return nil
}

func (r *ProjectRepository) Delete(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Where("id = ?", id).Delete(&model.Project{}).Error; err != nil {
		return fmt.Errorf("delete project: %w", err)
	}
	return nil
}
