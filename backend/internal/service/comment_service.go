package service

import (
	"context"
	"strings"
	"unicode/utf8"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/dto"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/repository"
)

const (
	maxCommentLen        = 5000
	defaultCommentsPerPg = 50
)

type CommentService struct {
	tasks    *repository.TaskRepository
	comments *repository.CommentRepository
}

func NewCommentService(tasks *repository.TaskRepository, comments *repository.CommentRepository) *CommentService {
	return &CommentService{tasks: tasks, comments: comments}
}

// List: komentar sebuah tugas, terlama dulu, berpaginasi (default 50/halaman). Anggota proyek.
func (s *CommentService) List(ctx context.Context, userID, taskID string, p dto.PageParams) ([]dto.CommentResponse, *dto.PageMeta, error) {
	task, err := s.tasks.FindForUser(ctx, taskID, userID)
	if err != nil {
		return nil, nil, err
	}
	details := map[string]string{}
	page, perPage := parsePaging(p.Page, p.PerPage, defaultCommentsPerPg, details)
	if len(details) > 0 {
		return nil, nil, apperror.Validation(details)
	}
	total, err := s.comments.Count(ctx, taskID)
	if err != nil {
		return nil, nil, err
	}
	rows, err := s.comments.ListByTask(ctx, taskID, perPage, (page-1)*perPage)
	if err != nil {
		return nil, nil, err
	}
	out := make([]dto.CommentResponse, len(rows))
	for i := range rows {
		out[i] = toCommentResponse(&rows[i], userID, task.MyRole)
	}
	return out, pageMeta(page, perPage, total), nil
}

// Create menulis komentar dan mencatat riwayat "mengomentari" dalam satu transaksi.
func (s *CommentService) Create(ctx context.Context, userID, taskID string, req dto.CreateCommentRequest) (*dto.CommentResponse, error) {
	task, err := s.tasks.FindForUser(ctx, taskID, userID)
	if err != nil {
		return nil, err
	}
	if task.ProjectArchived {
		return nil, errArchived
	}
	body, err := cleanBody(req.Body)
	if err != nil {
		return nil, err
	}
	var id string
	err = s.comments.Transaction(ctx, func(tx *repository.CommentRepository) error {
		id, err = tx.Insert(ctx, taskID, userID, body)
		if err != nil {
			return err
		}
		return tx.LogActivity(ctx, task.ProjectID, &taskID, userID, "comment.created",
			map[string]any{"code": task.Code, "comment_id": id})
	})
	if err != nil {
		return nil, err
	}
	return s.get(ctx, userID, id)
}

// Update: hanya penulis (anggota lain 403). Isi yang sama persis tidak menandai "diedit".
func (s *CommentService) Update(ctx context.Context, userID, commentID string, req dto.UpdateCommentRequest) (*dto.CommentResponse, error) {
	row, err := s.comments.FindForUser(ctx, commentID, userID)
	if err != nil {
		return nil, err
	}
	if row.ProjectArchived {
		return nil, errArchived
	}
	if row.UserID != userID {
		return nil, apperror.ErrForbidden
	}
	body, err := cleanBody(req.Body)
	if err != nil {
		return nil, err
	}
	if body != row.Body {
		if err := s.comments.UpdateBody(ctx, commentID, body); err != nil {
			return nil, err
		}
	}
	return s.get(ctx, userID, commentID)
}

// Delete: penulis atau owner proyek. Catatan riwayat "mengomentari" ikut dihapus.
func (s *CommentService) Delete(ctx context.Context, userID, commentID string) error {
	row, err := s.comments.FindForUser(ctx, commentID, userID)
	if err != nil {
		return err
	}
	if row.ProjectArchived {
		return errArchived
	}
	if row.UserID != userID && row.MyRole != model.RoleOwner {
		return apperror.ErrForbidden
	}
	return s.comments.Transaction(ctx, func(tx *repository.CommentRepository) error {
		if err := tx.DeleteCommentActivity(ctx, commentID); err != nil {
			return err
		}
		return tx.Delete(ctx, commentID)
	})
}

func (s *CommentService) get(ctx context.Context, userID, commentID string) (*dto.CommentResponse, error) {
	row, err := s.comments.FindForUser(ctx, commentID, userID)
	if err != nil {
		return nil, err
	}
	resp := toCommentResponse(row, userID, row.MyRole)
	return &resp, nil
}

// cleanBody: trim, tidak boleh kosong, maks. 5000 karakter. Baris baru & Markdown dipertahankan.
func cleanBody(raw string) (string, error) {
	body := strings.TrimSpace(raw)
	switch {
	case body == "":
		return "", apperror.Validation(map[string]string{"body": "Isi komentar wajib diisi"})
	case utf8.RuneCountInString(body) > maxCommentLen:
		return "", apperror.Validation(map[string]string{"body": "Isi komentar maksimal 5000 karakter"})
	}
	return body, nil
}

func toCommentResponse(r *repository.CommentRow, viewerID, viewerRole string) dto.CommentResponse {
	isAuthor := r.UserID == viewerID
	return dto.CommentResponse{
		ID: r.ID, TaskID: r.TaskID, Body: r.Body,
		Author:   dto.UserRef{ID: r.UserID, Name: r.AuthorName, AvatarColor: r.AuthorColor},
		EditedAt: r.EditedAt, CreatedAt: r.CreatedAt,
		CanEdit: isAuthor, CanDelete: isAuthor || viewerRole == model.RoleOwner,
	}
}
