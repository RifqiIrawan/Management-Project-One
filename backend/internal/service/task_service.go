package service

import (
	"context"
	"errors"
	"math"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/dto"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/validator"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/repository"
)

const (
	maxLabels      = 5
	maxLabelLen    = 30
	maxDescription = 20000
	maxPosition    = 1e12
	dateLayout     = "2006-01-02"
)

var errArchived = apperror.BadRequest("Proyek sedang diarsipkan. Pulihkan proyek terlebih dahulu untuk mengubah tugas.")

type TaskService struct {
	projectAccess
	tasks   *repository.TaskRepository
	members *repository.MemberRepository
}

func NewTaskService(projects *repository.ProjectRepository, tasks *repository.TaskRepository, members *repository.MemberRepository) *TaskService {
	return &TaskService{projectAccess: projectAccess{projects: projects}, tasks: tasks, members: members}
}

// Create membuat tugas baru di paling atas kolomnya dengan nomor berurutan (MPO-1, MPO-2, ...).
func (s *TaskService) Create(ctx context.Context, userID, projectID string, req dto.CreateTaskRequest) (*dto.TaskResponse, error) {
	proj, err := s.member(ctx, userID, projectID)
	if err != nil {
		return nil, err
	}
	if proj.ArchivedAt != nil {
		return nil, errArchived
	}

	details := map[string]string{}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		details["title"] = "Judul wajib diisi"
	}
	if utf8.RuneCountInString(req.Description) > maxDescription {
		details["description"] = "Deskripsi terlalu panjang"
	}
	labels, err := normalizeLabels(req.Labels)
	if err != nil {
		details["labels"] = err.Error()
	}
	start, err := parseDate(req.StartDate)
	if err != nil {
		details["start_date"] = err.Error()
	}
	due, err := parseDate(req.DueDate)
	if err != nil {
		details["due_date"] = err.Error()
	}
	if _, bad := details["start_date"]; !bad {
		if _, bad := details["due_date"]; !bad && dueBeforeStart(start, due) {
			details["due_date"] = "Deadline tidak boleh sebelum tanggal mulai"
		}
	}
	assignee, err := s.resolveAssignee(ctx, projectID, req.AssigneeID)
	if err != nil {
		details["assignee_id"] = err.Error()
	}
	if len(details) > 0 {
		return nil, apperror.Validation(details)
	}

	status := valueOr(req.Status, model.StatusTodo)
	var completedAt *time.Time
	if status == model.StatusDone {
		now := time.Now()
		completedAt = &now
	}

	var id string
	err = s.tasks.Transaction(ctx, func(tx *repository.TaskRepository) error {
		number, err := tx.NextNumber(ctx, projectID)
		if err != nil {
			return err
		}
		pos, err := tx.TopPosition(ctx, projectID, status)
		if err != nil {
			return err
		}
		id, err = tx.Insert(ctx, repository.NewTask{
			ProjectID: projectID, Number: number, Title: title, Description: nilIfBlank(req.Description),
			Status: status, Priority: valueOr(req.Priority, "medium"), Labels: labels, Position: pos,
			AssigneeID: assignee, CreatedBy: userID, StartDate: start, DueDate: due, CompletedAt: completedAt,
		})
		if err != nil {
			return err
		}
		return tx.LogActivity(ctx, projectID, &id, userID, "task.created",
			map[string]any{"code": proj.Key + "-" + strconv.Itoa(number), "title": title})
	})
	if err != nil {
		return nil, err
	}
	return s.get(ctx, userID, id)
}

// List mengembalikan semua tugas proyek; board=true mengelompokkan per status (kolom Kanban).
func (s *TaskService) List(ctx context.Context, userID, projectID string, board bool) (any, error) {
	if _, err := s.member(ctx, userID, projectID); err != nil {
		return nil, err
	}
	rows, err := s.tasks.ListByProject(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if !board {
		out := make([]dto.TaskResponse, len(rows))
		for i := range rows {
			out[i] = *toTaskResponse(&rows[i])
		}
		return out, nil
	}
	cols := make(map[string][]dto.TaskResponse, len(model.TaskStatuses))
	for _, st := range model.TaskStatuses {
		cols[st] = []dto.TaskResponse{}
	}
	for i := range rows {
		cols[rows[i].Status] = append(cols[rows[i].Status], *toTaskResponse(&rows[i]))
	}
	return cols, nil
}

func (s *TaskService) Get(ctx context.Context, userID, taskID string) (*dto.TaskResponse, error) {
	return s.get(ctx, userID, taskID)
}

// Update mengubah sebagian field. Perubahan status otomatis mengatur completed_at dan
// memindahkan kartu ke paling atas kolom tujuan.
func (s *TaskService) Update(ctx context.Context, actorID, taskID string, req dto.UpdateTaskRequest) (*dto.TaskResponse, error) {
	row, err := s.tasks.FindForUser(ctx, taskID, actorID)
	if err != nil {
		return nil, err
	}
	if row.ProjectArchived {
		return nil, errArchived
	}
	if !req.Provided() {
		return nil, apperror.BadRequest("Tidak ada data yang diubah")
	}

	details := map[string]string{}
	fields := map[string]any{}
	var changed []string

	if req.Title != nil {
		t := strings.TrimSpace(*req.Title)
		switch {
		case t == "":
			details["title"] = "Judul wajib diisi"
		case t != row.Title:
			fields["title"] = t
			changed = append(changed, "title")
		}
	}
	if req.Description.Set {
		var d *string
		if !req.Description.Null {
			if utf8.RuneCountInString(req.Description.Value) > maxDescription {
				details["description"] = "Deskripsi terlalu panjang"
			}
			d = nilIfBlank(req.Description.Value)
		}
		if !equalPtr(d, row.Description) {
			fields["description"] = ptrValue(d)
			changed = append(changed, "description")
		}
	}
	if req.Priority != nil && *req.Priority != row.Priority {
		fields["priority"] = *req.Priority
		changed = append(changed, "priority")
	}
	if req.Labels != nil {
		labels, err := normalizeLabels(*req.Labels)
		if err != nil {
			details["labels"] = err.Error()
		} else if !slices.Equal(labels, row.Labels) {
			fields["labels"] = labels
			changed = append(changed, "labels")
		}
	}

	start, due := row.StartDate, row.DueDate
	datesOK := true
	if req.StartDate.Set {
		v, err := optionalDate(req.StartDate)
		if err != nil {
			details["start_date"], datesOK = err.Error(), false
		} else {
			start = v
			if !equalPtr(v, row.StartDate) {
				fields["start_date"] = ptrValue(v)
				changed = append(changed, "start_date")
			}
		}
	}
	if req.DueDate.Set {
		v, err := optionalDate(req.DueDate)
		if err != nil {
			details["due_date"], datesOK = err.Error(), false
		} else {
			due = v
			if !equalPtr(v, row.DueDate) {
				fields["due_date"] = ptrValue(v)
				changed = append(changed, "due_date")
			}
		}
	}
	if datesOK && dueBeforeStart(start, due) {
		details["due_date"] = "Deadline tidak boleh sebelum tanggal mulai"
	}

	assigneeChanged := false
	var newAssignee *string
	if req.AssigneeID.Set {
		raw := ""
		if !req.AssigneeID.Null {
			raw = req.AssigneeID.Value
		}
		a, err := s.resolveAssignee(ctx, row.ProjectID, raw)
		if err != nil {
			details["assignee_id"] = err.Error()
		} else if !equalPtr(a, row.AssigneeID) {
			fields["assignee_id"] = ptrValue(a)
			assigneeChanged, newAssignee = true, a
		}
	}

	statusChanged := req.Status != nil && *req.Status != row.Status
	if len(details) > 0 {
		return nil, apperror.Validation(details)
	}
	if len(fields) == 0 && !statusChanged {
		return toTaskResponse(row), nil // tidak ada perubahan nyata
	}

	err = s.tasks.Transaction(ctx, func(tx *repository.TaskRepository) error {
		if statusChanged {
			pos, err := tx.TopPosition(ctx, row.ProjectID, *req.Status)
			if err != nil {
				return err
			}
			fields["status"], fields["position"], fields["completed_at"] = *req.Status, pos, completedAtFor(*req.Status)
		}
		if err := tx.Update(ctx, taskID, fields); err != nil {
			return err
		}
		return s.logChanges(ctx, tx, row, actorID, statusChanged, req.Status, assigneeChanged, newAssignee, changed)
	})
	if err != nil {
		return nil, err
	}
	return s.get(ctx, actorID, taskID)
}

// Move memindahkan kartu ke kolom/posisi lain (drag & drop). Tanpa position = paling atas kolom.
func (s *TaskService) Move(ctx context.Context, actorID, taskID string, req dto.MoveTaskRequest) (*dto.TaskResponse, error) {
	row, err := s.tasks.FindForUser(ctx, taskID, actorID)
	if err != nil {
		return nil, err
	}
	if row.ProjectArchived {
		return nil, errArchived
	}
	if req.Position != nil && (math.IsNaN(*req.Position) || math.IsInf(*req.Position, 0) || math.Abs(*req.Position) > maxPosition) {
		return nil, apperror.Validation(map[string]string{"position": "Posisi tidak valid"})
	}
	statusChanged := req.Status != row.Status
	if !statusChanged && req.Position == nil {
		return toTaskResponse(row), nil
	}

	err = s.tasks.Transaction(ctx, func(tx *repository.TaskRepository) error {
		var pos float64
		if req.Position != nil {
			pos = *req.Position
		} else {
			top, err := tx.TopPosition(ctx, row.ProjectID, req.Status)
			if err != nil {
				return err
			}
			pos = top
		}
		fields := map[string]any{"position": pos}
		if statusChanged {
			fields["status"], fields["completed_at"] = req.Status, completedAtFor(req.Status)
		}
		if err := tx.Update(ctx, taskID, fields); err != nil {
			return err
		}
		return s.logChanges(ctx, tx, row, actorID, statusChanged, &req.Status, false, nil, nil)
	})
	if err != nil {
		return nil, err
	}
	return s.get(ctx, actorID, taskID)
}

// Delete: hanya pembuat tugas atau owner proyek.
func (s *TaskService) Delete(ctx context.Context, actorID, taskID string) error {
	row, err := s.tasks.FindForUser(ctx, taskID, actorID)
	if err != nil {
		return err
	}
	if row.ProjectArchived {
		return errArchived
	}
	if row.CreatedBy != actorID && row.MyRole != model.RoleOwner {
		return apperror.ErrForbidden
	}
	return s.tasks.Transaction(ctx, func(tx *repository.TaskRepository) error {
		// task_id NULL agar catatan tetap ada setelah tugasnya terhapus (FK cascade).
		if err := tx.LogActivity(ctx, row.ProjectID, nil, actorID, "task.deleted",
			map[string]any{"code": row.Code, "title": row.Title}); err != nil {
			return err
		}
		return tx.Delete(ctx, taskID)
	})
}

func (s *TaskService) get(ctx context.Context, userID, taskID string) (*dto.TaskResponse, error) {
	row, err := s.tasks.FindForUser(ctx, taskID, userID)
	if err != nil {
		return nil, err
	}
	return toTaskResponse(row), nil
}

// resolveAssignee: "" berarti tanpa assignee. Selain itu harus UUID anggota proyek.
func (s *TaskService) resolveAssignee(ctx context.Context, projectID, raw string) (*string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	if !validator.IsUUID(raw) {
		return nil, errString("Assignee tidak valid")
	}
	raw = strings.ToLower(raw)
	if _, err := s.members.Find(ctx, projectID, raw); err != nil {
		if errors.Is(err, apperror.ErrNotFound) {
			return nil, errString("Assignee harus anggota proyek")
		}
		return nil, err
	}
	return &raw, nil
}

func (s *TaskService) logChanges(ctx context.Context, tx *repository.TaskRepository, row *repository.TaskRow, actorID string,
	statusChanged bool, newStatus *string, assigneeChanged bool, newAssignee *string, changed []string) error {
	log := func(action string, meta map[string]any) error {
		meta["code"] = row.Code
		return tx.LogActivity(ctx, row.ProjectID, &row.ID, actorID, action, meta)
	}
	if statusChanged {
		if err := log("task.status_changed", map[string]any{"from": row.Status, "to": *newStatus}); err != nil {
			return err
		}
	}
	if assigneeChanged {
		if err := log("task.assigned", map[string]any{"from": ptrValue(row.AssigneeID), "to": ptrValue(newAssignee)}); err != nil {
			return err
		}
	}
	if len(changed) > 0 {
		return log("task.updated", map[string]any{"fields": changed})
	}
	return nil
}

func toTaskResponse(r *repository.TaskRow) *dto.TaskResponse {
	resp := &dto.TaskResponse{
		ID: r.ID, Code: r.Code, Number: r.Number, ProjectID: r.ProjectID, Title: r.Title,
		Description: r.Description, Status: r.Status, Priority: r.Priority, Labels: r.Labels, Position: r.Position,
		CreatedBy: dto.UserRef{ID: r.CreatedBy, Name: r.CreatorName},
		StartDate: r.StartDate, DueDate: r.DueDate, CompletedAt: r.CompletedAt,
		CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
	if resp.Labels == nil {
		resp.Labels = []string{}
	}
	if r.AssigneeID != nil {
		ref := dto.UserRef{ID: *r.AssigneeID}
		if r.AssigneeName != nil {
			ref.Name = *r.AssigneeName
		}
		if r.AssigneeColor != nil {
			ref.AvatarColor = *r.AssigneeColor
		}
		resp.Assignee = &ref
	}
	return resp
}

// ---- helper murni (diuji di task_service_test.go) ----

type errString string

func (e errString) Error() string { return string(e) }

// normalizeLabels: trim, tolak kosong/terlalu panjang, hapus duplikat (tanpa membedakan huruf besar/kecil), maks. 5.
func normalizeLabels(in []string) (model.StringArray, error) {
	out := model.StringArray{}
	seen := map[string]bool{}
	for _, l := range in {
		l = strings.TrimSpace(l)
		if l == "" {
			return nil, errString("Label tidak boleh kosong")
		}
		if utf8.RuneCountInString(l) > maxLabelLen {
			return nil, errString("Label maksimal 30 karakter")
		}
		key := strings.ToLower(l)
		if !seen[key] {
			seen[key] = true
			out = append(out, l)
		}
	}
	if len(out) > maxLabels {
		return nil, errString("Maksimal 5 label")
	}
	return out, nil
}

// parseDate: "" -> nil; selain itu wajib format YYYY-MM-DD yang valid.
func parseDate(s string) (*string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, nil
	}
	t, err := time.Parse(dateLayout, s)
	if err != nil {
		return nil, errString("Format tanggal harus YYYY-MM-DD")
	}
	canonical := t.Format(dateLayout)
	return &canonical, nil
}

func optionalDate(o dto.Optional[string]) (*string, error) {
	if o.Null {
		return nil, nil
	}
	return parseDate(o.Value)
}

func dueBeforeStart(start, due *string) bool {
	return start != nil && due != nil && *due < *start // format ISO: urutan teks = urutan tanggal
}

func completedAtFor(status string) any {
	if status == model.StatusDone {
		return time.Now()
	}
	return nil
}

func equalPtr(a, b *string) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

// ptrValue mengubah pointer nil menjadi nil murni agar GORM menulis NULL.
func ptrValue(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}

func valueOr(v, def string) string {
	if v == "" {
		return def
	}
	return v
}
