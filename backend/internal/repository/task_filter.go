package repository

import (
	"context"
	"fmt"
	"strings"
)

// TaskFilter adalah kondisi pencarian tugas. Semua nilai dari user dipasang sebagai parameter query
// (tidak pernah disambung ke string SQL).
type TaskFilter struct {
	ProjectID    string // "" = lintas proyek
	MemberUserID string // bila diisi, hanya tugas dari proyek tempat user ini anggota
	Q            string // judul; bila memuat "-" (mis. MPO-12) juga kode tugas. Tanpa beda huruf besar/kecil
	Statuses     []string
	Priorities   []string
	AssigneeIDs  []string
	AssigneeNone bool     // sertakan tugas tanpa assignee
	Due          []string // overdue | today | week | none (digabung dengan OR)
	Today        string   // YYYY-MM-DD menurut zona waktu aplikasi
	WeekEnd      string   // YYYY-MM-DD akhir minggu ini (Minggu)

	HasDue          bool // hanya tugas yang punya deadline (internal, mis. dashboard)
	ExcludeDone     bool
	ExcludeArchived bool
}

// TaskSort: satu kunci pengurutan. Field divalidasi terhadap daftar putih sortFields.
type TaskSort struct {
	Field string
	Desc  bool
}

type SearchOptions struct {
	Sorts  []TaskSort
	Kanban bool // urut kolom Kanban lalu posisi (abaikan Sorts)
	Limit  int  // 0 = tanpa batas
	Offset int
}

const (
	priorityRank = `CASE t.priority WHEN 'low' THEN 1 WHEN 'medium' THEN 2 WHEN 'high' THEN 3 ELSE 4 END`
	statusRank   = `CASE t.status WHEN 'todo' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'in_review' THEN 3 ELSE 4 END`
)

// sortFields adalah daftar putih kolom urut. dir hanya "ASC" atau "DESC" (bukan input user).
var sortFields = map[string]func(dir string) string{
	"created_at": func(d string) string { return "t.created_at " + d },
	"updated_at": func(d string) string { return "t.updated_at " + d },
	"due_date":   func(d string) string { return "t.due_date " + d + " NULLS LAST" },
	"start_date": func(d string) string { return "t.start_date " + d + " NULLS LAST" },
	"title":      func(d string) string { return "lower(t.title) " + d },
	"priority":   func(d string) string { return priorityRank + " " + d },
	"status":     func(d string) string { return statusRank + " " + d },
	"code":       func(d string) string { return `p."key" ` + d + ", t.number " + d },
}

// IsSortField memeriksa apakah nama kolom urut diperbolehkan.
func IsSortField(name string) bool { _, ok := sortFields[name]; return ok }

func orderBy(o SearchOptions) string {
	if o.Kanban {
		return statusRank + ", t.position, t.created_at"
	}
	var parts []string
	for _, s := range o.Sorts {
		dir := "ASC"
		if s.Desc {
			dir = "DESC"
		}
		if f, ok := sortFields[s.Field]; ok {
			parts = append(parts, f(dir))
		}
	}
	if len(parts) == 0 {
		parts = append(parts, "t.created_at DESC")
	}
	// pembeda tetap agar urutan stabil antar halaman (tidak ada baris ganda/hilang)
	return strings.Join(parts, ", ") + ", t.created_at DESC, t.id"
}

func (f TaskFilter) where() (string, []any) {
	conds := []string{"1=1"}
	var args []any
	add := func(cond string, a ...any) { conds = append(conds, cond); args = append(args, a...) }

	if f.ProjectID != "" {
		add("t.project_id = ?", f.ProjectID)
	}
	if f.MemberUserID != "" {
		add("EXISTS (SELECT 1 FROM project_members pmx WHERE pmx.project_id = t.project_id AND pmx.user_id = ?)", f.MemberUserID)
	}
	if f.ExcludeArchived {
		add("p.archived_at IS NULL")
	}
	if f.HasDue {
		add("t.due_date IS NOT NULL")
	}
	if f.ExcludeDone {
		add("t.status <> 'done'")
	}
	if f.Q != "" {
		pat := "%" + escapeLike(f.Q) + "%"
		if strings.Contains(f.Q, "-") {
			// kata kunci berbentuk kode (MPO-12 / mpo-1): cocokkan juga kode tugas
			add(`(t.title ILIKE ? OR (p."key" || '-' || t.number) ILIKE ?)`, pat, pat)
		} else {
			// tanpa tanda hubung hanya judul, agar "mp" tidak cocok dengan SEMUA tugas proyek MPO
			// lewat kodenya; juga memungkinkan indeks trigram idx_tasks_title_trgm dipakai
			add(`t.title ILIKE ?`, pat)
		}
	}
	if len(f.Statuses) > 0 {
		add("t.status IN ?", f.Statuses)
	}
	if len(f.Priorities) > 0 {
		add("t.priority IN ?", f.Priorities)
	}
	switch {
	case len(f.AssigneeIDs) > 0 && f.AssigneeNone:
		add("(t.assignee_id IN ? OR t.assignee_id IS NULL)", f.AssigneeIDs)
	case len(f.AssigneeIDs) > 0:
		add("t.assignee_id IN ?", f.AssigneeIDs)
	case f.AssigneeNone:
		add("t.assignee_id IS NULL")
	}
	if len(f.Due) > 0 {
		var ors []string
		var dueArgs []any
		for _, d := range f.Due {
			switch d {
			case "overdue":
				ors = append(ors, "(t.due_date < CAST(? AS date) AND t.status <> 'done')")
				dueArgs = append(dueArgs, f.Today)
			case "today":
				ors = append(ors, "t.due_date = CAST(? AS date)")
				dueArgs = append(dueArgs, f.Today)
			case "week":
				ors = append(ors, "(t.due_date >= CAST(? AS date) AND t.due_date <= CAST(? AS date))")
				dueArgs = append(dueArgs, f.Today, f.WeekEnd)
			case "none":
				ors = append(ors, "t.due_date IS NULL")
			}
		}
		if len(ors) > 0 {
			add("("+strings.Join(ors, " OR ")+")", dueArgs...)
		}
	}
	return strings.Join(conds, " AND "), args
}

// TaskStats: ringkasan tugas yang di-assign ke seorang user.
type TaskStats struct {
	TotalTasks     int
	OpenTasks      int
	CompletedTasks int
	InProgress     int
	DueThisWeek    int
	Overdue        int
}

// StatsForUser menghitung semua angka dashboard dalam satu query agregat (FILTER). Cakupan sama dengan
// "Tugas Saya": tugas di-assign ke user, proyek tidak terarsip, user masih anggota proyek.
func (r *TaskRepository) StatsForUser(ctx context.Context, userID, today, weekEnd string) (TaskStats, error) {
	var out TaskStats
	err := r.db.WithContext(ctx).Raw(`
SELECT COUNT(*) AS total_tasks,
       COUNT(*) FILTER (WHERE t.status <> 'done') AS open_tasks,
       COUNT(*) FILTER (WHERE t.status = 'done') AS completed_tasks,
       COUNT(*) FILTER (WHERE t.status = 'in_progress') AS in_progress,
       COUNT(*) FILTER (WHERE t.status <> 'done' AND t.due_date >= CAST(? AS date) AND t.due_date <= CAST(? AS date)) AS due_this_week,
       COUNT(*) FILTER (WHERE t.status <> 'done' AND t.due_date < CAST(? AS date)) AS overdue
FROM tasks t
JOIN projects p ON p.id = t.project_id
WHERE t.assignee_id = ? AND p.archived_at IS NULL
  AND EXISTS (SELECT 1 FROM project_members pmx WHERE pmx.project_id = t.project_id AND pmx.user_id = ?)`,
		today, weekEnd, today, userID, userID).Scan(&out).Error
	if err != nil {
		return TaskStats{}, fmt.Errorf("task stats: %w", err)
	}
	return out, nil
}

// Count menghitung tugas yang cocok dengan filter (untuk meta pagination).
func (r *TaskRepository) Count(ctx context.Context, f TaskFilter) (int, error) {
	where, args := f.where()
	var out struct{ N int }
	err := r.db.WithContext(ctx).
		Raw(`SELECT COUNT(*) AS n FROM tasks t JOIN projects p ON p.id = t.project_id WHERE `+where, args...).
		Scan(&out).Error
	if err != nil {
		return 0, fmt.Errorf("count tasks: %w", err)
	}
	return out.N, nil
}

// Search mengembalikan tugas yang cocok dengan filter, urut sesuai opsi.
func (r *TaskRepository) Search(ctx context.Context, f TaskFilter, o SearchOptions) ([]TaskRow, error) {
	where, args := f.where()
	query := `SELECT ` + taskColumns + taskFrom + ` WHERE ` + where + ` ORDER BY ` + orderBy(o)
	if o.Limit > 0 {
		query += ` LIMIT ? OFFSET ?`
		args = append(args, o.Limit, o.Offset)
	}
	rows := []TaskRow{}
	if err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("search tasks: %w", err)
	}
	return rows, nil
}
