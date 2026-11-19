package service

import (
	"context"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/repository"
)

// projectAccess adalah pengecekan hak akses proyek yang dipakai semua service proyek/tugas.
type projectAccess struct{ projects *repository.ProjectRepository }

// member: 404 bila proyek tidak ada atau user bukan anggota (agar keberadaan proyek tidak bocor).
func (a projectAccess) member(ctx context.Context, userID, projectID string) (*repository.ProjectRow, error) {
	return a.projects.FindForUser(ctx, projectID, userID)
}

// owner: 404 untuk non-anggota, 403 untuk anggota biasa.
func (a projectAccess) owner(ctx context.Context, userID, projectID string) (*repository.ProjectRow, error) {
	row, err := a.member(ctx, userID, projectID)
	if err != nil {
		return nil, err
	}
	if row.MyRole != model.RoleOwner {
		return nil, apperror.ErrForbidden
	}
	return row, nil
}
