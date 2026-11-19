package service

import (
	"context"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/dto"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/repository"
)

type ActivityService struct {
	projectAccess
	tasks      *repository.TaskRepository
	activities *repository.ActivityRepository
}

func NewActivityService(projects *repository.ProjectRepository, tasks *repository.TaskRepository, activities *repository.ActivityRepository) *ActivityService {
	return &ActivityService{projectAccess: projectAccess{projects: projects}, tasks: tasks, activities: activities}
}

// ListProject: riwayat seluruh proyek (anggota), terbaru dulu.
func (s *ActivityService) ListProject(ctx context.Context, userID, projectID string, p dto.PageParams) ([]dto.ActivityResponse, *dto.PageMeta, error) {
	if _, err := s.member(ctx, userID, projectID); err != nil {
		return nil, nil, err
	}
	return s.list(ctx, repository.ActivityScope{ProjectID: projectID}, p)
}

// ListTask: riwayat satu tugas (anggota proyeknya), terbaru dulu.
func (s *ActivityService) ListTask(ctx context.Context, userID, taskID string, p dto.PageParams) ([]dto.ActivityResponse, *dto.PageMeta, error) {
	task, err := s.tasks.FindForUser(ctx, taskID, userID)
	if err != nil {
		return nil, nil, err
	}
	return s.list(ctx, repository.ActivityScope{ProjectID: task.ProjectID, TaskID: taskID}, p)
}

func (s *ActivityService) list(ctx context.Context, scope repository.ActivityScope, p dto.PageParams) ([]dto.ActivityResponse, *dto.PageMeta, error) {
	details := map[string]string{}
	page, perPage := parsePaging(p.Page, p.PerPage, defaultPerPage, details)
	if len(details) > 0 {
		return nil, nil, apperror.Validation(details)
	}
	total, err := s.activities.Count(ctx, scope)
	if err != nil {
		return nil, nil, err
	}
	rows, err := s.activities.List(ctx, scope, perPage, (page-1)*perPage)
	if err != nil {
		return nil, nil, err
	}
	out := make([]dto.ActivityResponse, len(rows))
	for i := range rows {
		meta := parseMetadata(rows[i].Metadata)
		out[i] = dto.ActivityResponse{
			ID: rows[i].ID, Action: rows[i].Action, Message: activityMessage(rows[i], meta),
			User:   dto.UserRef{ID: rows[i].UserID, Name: rows[i].UserName, AvatarColor: rows[i].UserColor},
			TaskID: rows[i].TaskID, Code: metaString(meta, "code"), Metadata: meta, CreatedAt: rows[i].CreatedAt,
		}
	}
	return out, pageMeta(page, perPage, total), nil
}
