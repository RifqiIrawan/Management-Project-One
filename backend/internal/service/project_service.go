package service

import (
	"context"
	"math"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/dto"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/repository"
)

const defaultProjectColor = "#6366F1"

type ProjectService struct {
	projectAccess
	members *repository.MemberRepository
}

func NewProjectService(projects *repository.ProjectRepository, members *repository.MemberRepository) *ProjectService {
	return &ProjectService{projectAccess: projectAccess{projects: projects}, members: members}
}

func (s *ProjectService) Create(ctx context.Context, userID string, req dto.CreateProjectRequest) (*dto.ProjectResponse, error) {
	name := strings.TrimSpace(req.Name)
	if utf8.RuneCountInString(name) < 2 {
		return nil, apperror.Validation(map[string]string{"name": "Nama minimal 2 karakter"})
	}
	color := strings.ToUpper(req.Color)
	if color == "" {
		color = defaultProjectColor
	}
	p := &model.Project{
		Name:        name,
		Key:         strings.ToUpper(req.Key),
		Description: nilIfBlank(req.Description),
		Color:       color,
		Icon:        nilIfBlank(req.Icon),
		OwnerID:     userID,
	}
	if err := s.projects.CreateWithOwner(ctx, p); err != nil {
		return nil, err
	}
	row, err := s.projects.FindForUser(ctx, p.ID, userID)
	if err != nil {
		return nil, err
	}
	return toProjectResponse(row), nil
}

func (s *ProjectService) List(ctx context.Context, userID, q string, archived bool) ([]dto.ProjectResponse, error) {
	rows, err := s.projects.ListForUser(ctx, userID, q, archived)
	if err != nil {
		return nil, err
	}
	ids := make([]string, len(rows))
	for i, r := range rows {
		ids[i] = r.ID
	}
	previews, err := s.projects.MembersPreview(ctx, ids)
	if err != nil {
		return nil, err
	}
	byProject := make(map[string][]dto.MemberPreview, len(rows))
	for _, p := range previews {
		byProject[p.ProjectID] = append(byProject[p.ProjectID],
			dto.MemberPreview{ID: p.UserID, Name: p.Name, AvatarColor: p.AvatarColor})
	}
	out := make([]dto.ProjectResponse, len(rows))
	for i := range rows {
		resp := toProjectResponse(&rows[i])
		resp.MembersPreview = byProject[rows[i].ID]
		out[i] = *resp
	}
	return out, nil
}

func (s *ProjectService) Get(ctx context.Context, userID, projectID string) (*dto.ProjectResponse, error) {
	row, err := s.member(ctx, userID, projectID)
	if err != nil {
		return nil, err
	}
	return toProjectResponse(row), nil
}

func (s *ProjectService) Update(ctx context.Context, userID, projectID string, req dto.UpdateProjectRequest) (*dto.ProjectResponse, error) {
	if _, err := s.owner(ctx, userID, projectID); err != nil {
		return nil, err
	}
	fields := map[string]any{}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if utf8.RuneCountInString(name) < 2 {
			return nil, apperror.Validation(map[string]string{"name": "Nama minimal 2 karakter"})
		}
		fields["name"] = name
	}
	if req.Description != nil {
		fields["description"] = nilIfBlank(*req.Description)
	}
	if req.Color != nil {
		fields["color"] = strings.ToUpper(*req.Color)
	}
	if req.Icon != nil {
		fields["icon"] = nilIfBlank(*req.Icon)
	}
	if len(fields) == 0 {
		return nil, apperror.BadRequest("Tidak ada data yang diubah")
	}
	if err := s.projects.Update(ctx, projectID, fields); err != nil {
		return nil, err
	}
	return s.Get(ctx, userID, projectID)
}

// SetArchived mengarsipkan (true) atau memulihkan (false) proyek.
func (s *ProjectService) SetArchived(ctx context.Context, userID, projectID string, archived bool) (*dto.ProjectResponse, error) {
	if _, err := s.owner(ctx, userID, projectID); err != nil {
		return nil, err
	}
	var at any
	if archived {
		at = time.Now()
	}
	if err := s.projects.Update(ctx, projectID, map[string]any{"archived_at": at}); err != nil {
		return nil, err
	}
	return s.Get(ctx, userID, projectID)
}

// Delete menghapus permanen; pemanggil wajib mengetik nama proyek persis sebagai konfirmasi.
func (s *ProjectService) Delete(ctx context.Context, userID, projectID string, req dto.DeleteProjectRequest) error {
	row, err := s.owner(ctx, userID, projectID)
	if err != nil {
		return err
	}
	if req.ConfirmName != row.Name {
		return apperror.Validation(map[string]string{"confirm_name": "Nama konfirmasi tidak sama dengan nama proyek"})
	}
	return s.projects.Delete(ctx, projectID)
}

func (s *ProjectService) ToggleFavorite(ctx context.Context, userID, projectID string) (bool, error) {
	if _, err := s.member(ctx, userID, projectID); err != nil {
		return false, err
	}
	return s.members.ToggleFavorite(ctx, projectID, userID)
}

func toProjectResponse(r *repository.ProjectRow) *dto.ProjectResponse {
	return &dto.ProjectResponse{
		ID: r.ID, Name: r.Name, Key: r.Key, Description: r.Description, Color: r.Color, Icon: r.Icon,
		OwnerID: r.OwnerID, ArchivedAt: r.ArchivedAt, CreatedAt: r.CreatedAt,
		MyRole: r.MyRole, IsFavorite: r.IsFavorite, MemberCount: r.MemberCount,
		TaskCount: r.TaskCount, DoneCount: r.DoneCount, Progress: progressPercent(r.DoneCount, r.TaskCount),
	}
}

// progressPercent = done / total x 100, dibulatkan; 0 bila belum ada tugas.
func progressPercent(done, total int) int {
	if total <= 0 {
		return 0
	}
	return int(math.Round(float64(done) * 100 / float64(total)))
}

// nilIfBlank mengubah string kosong menjadi NULL di database.
func nilIfBlank(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}
