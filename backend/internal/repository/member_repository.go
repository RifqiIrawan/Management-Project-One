package repository

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
)

type MemberRow struct {
	UserID      string
	Name        string
	Email       string
	AvatarColor string
	Role        string
	JoinedAt    time.Time
}

const memberSelect = `
SELECT u.id AS user_id, u.name, u.email, u.avatar_color, pm.role, pm.joined_at
FROM project_members pm
JOIN users u ON u.id = pm.user_id
WHERE pm.project_id = ?`

type MemberRepository struct{ db *gorm.DB }

func NewMemberRepository(db *gorm.DB) *MemberRepository { return &MemberRepository{db: db} }

// Transaction menjalankan fn dengan repository yang terikat ke satu transaksi.
func (r *MemberRepository) Transaction(ctx context.Context, fn func(tx *MemberRepository) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(&MemberRepository{db: tx})
	})
}

// LockOwners mengunci baris owner proyek (SELECT ... FOR UPDATE) dan mengembalikan id mereka.
// Dipakai agar pengecekan "owner terakhir" aman dari race condition. Wajib di dalam Transaction.
func (r *MemberRepository) LockOwners(ctx context.Context, projectID string) ([]string, error) {
	var rows []struct{ UserID string }
	err := r.db.WithContext(ctx).
		Raw(`SELECT user_id FROM project_members WHERE project_id = ? AND role = 'owner' FOR UPDATE`, projectID).
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("lock owners: %w", err)
	}
	ids := make([]string, len(rows))
	for i, row := range rows {
		ids[i] = row.UserID
	}
	return ids, nil
}

func (r *MemberRepository) Find(ctx context.Context, projectID, userID string) (*model.ProjectMember, error) {
	var m model.ProjectMember
	err := r.db.WithContext(ctx).Where("project_id = ? AND user_id = ?", projectID, userID).First(&m).Error
	return &m, wrapFind(err, "find member")
}

func (r *MemberRepository) List(ctx context.Context, projectID string) ([]MemberRow, error) {
	rows := []MemberRow{}
	err := r.db.WithContext(ctx).
		Raw(memberSelect+` ORDER BY (pm.role = 'owner') DESC, pm.joined_at`, projectID).
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}
	return rows, nil
}

func (r *MemberRepository) GetRow(ctx context.Context, projectID, userID string) (*MemberRow, error) {
	var row MemberRow
	res := r.db.WithContext(ctx).Raw(memberSelect+` AND pm.user_id = ?`, projectID, userID).Scan(&row)
	if res.Error != nil {
		return nil, fmt.Errorf("get member: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return nil, apperror.ErrNotFound
	}
	return &row, nil
}

func (r *MemberRepository) Add(ctx context.Context, m *model.ProjectMember) error {
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isUniqueViolation(err) {
			return apperror.Conflict("User sudah menjadi anggota proyek")
		}
		return fmt.Errorf("add member: %w", err)
	}
	return nil
}

func (r *MemberRepository) UpdateRole(ctx context.Context, projectID, userID, role string) error {
	err := r.db.WithContext(ctx).Model(&model.ProjectMember{}).
		Where("project_id = ? AND user_id = ?", projectID, userID).
		UpdateColumn("role", role).Error
	if err != nil {
		return fmt.Errorf("update member role: %w", err)
	}
	return nil
}

func (r *MemberRepository) Remove(ctx context.Context, projectID, userID string) error {
	err := r.db.WithContext(ctx).
		Where("project_id = ? AND user_id = ?", projectID, userID).
		Delete(&model.ProjectMember{}).Error
	if err != nil {
		return fmt.Errorf("remove member: %w", err)
	}
	return nil
}

// UnassignTasks mengosongkan assignee semua tugas anggota di proyek ini (saat ia dikeluarkan/keluar).
func (r *MemberRepository) UnassignTasks(ctx context.Context, projectID, userID string) error {
	err := r.db.WithContext(ctx).
		Exec(`UPDATE tasks SET assignee_id = NULL, updated_at = now() WHERE project_id = ? AND assignee_id = ?`, projectID, userID).Error
	if err != nil {
		return fmt.Errorf("unassign tasks: %w", err)
	}
	return nil
}

// ToggleFavorite membalik status favorit dalam satu statement atomik dan mengembalikan nilai barunya.
func (r *MemberRepository) ToggleFavorite(ctx context.Context, projectID, userID string) (bool, error) {
	var out struct{ IsFavorite bool }
	res := r.db.WithContext(ctx).Raw(
		`UPDATE project_members SET is_favorite = NOT is_favorite
		 WHERE project_id = ? AND user_id = ? RETURNING is_favorite`, projectID, userID).Scan(&out)
	if res.Error != nil {
		return false, fmt.Errorf("toggle favorite: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return false, apperror.ErrNotFound
	}
	return out.IsFavorite, nil
}
