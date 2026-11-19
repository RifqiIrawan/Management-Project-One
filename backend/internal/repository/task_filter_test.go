package repository

import (
	"strings"
	"testing"
)

func TestWhereEmpty(t *testing.T) {
	w, args := TaskFilter{}.where()
	if w != "1=1" || len(args) != 0 {
		t.Fatalf("filter kosong harus 1=1 tanpa argumen: %q %v", w, args)
	}
}

// Input user hanya boleh masuk sebagai argumen terparameter, tidak pernah ke teks SQL.
func TestWhereNeverInlinesUserInput(t *testing.T) {
	evil := "'; DROP TABLE tasks; --"
	f := TaskFilter{
		ProjectID: "11111111-1111-4111-8111-111111111111", Q: evil,
		Statuses: []string{evil}, Priorities: []string{evil}, AssigneeIDs: []string{evil},
		Due: []string{"overdue", "today", "week", "none", evil}, Today: evil, WeekEnd: evil,
	}
	w, args := f.where()
	if strings.Contains(w, "DROP") || strings.Contains(w, evil) || strings.Contains(w, "11111111") {
		t.Fatalf("input user bocor ke teks SQL: %s", w)
	}
	if got, want := strings.Count(w, "?"), countArgs(args); got != want {
		t.Fatalf("jumlah placeholder (%d) harus sama dengan argumen (%d): %s", got, want, w)
	}
}

// slice (IN ?) dihitung satu placeholder oleh GORM; hitung placeholder, bukan elemen.
func countArgs(args []any) int { return len(args) }

func TestWhereQueryMatchesCodeOnlyWithHyphen(t *testing.T) {
	w, args := TaskFilter{Q: "mp"}.where()
	if strings.Contains(w, `"key"`) || len(args) != 1 {
		t.Fatalf("tanpa tanda hubung hanya judul (jangan cocokkan kode): %q %v", w, args)
	}
	w, args = TaskFilter{Q: "MPO-12"}.where()
	if !strings.Contains(w, `"key"`) || len(args) != 2 {
		t.Fatalf("dengan tanda hubung cocokkan judul DAN kode: %q %v", w, args)
	}
}

func TestWhereAssigneeCombinations(t *testing.T) {
	ids := []string{"a"}
	cases := []struct {
		f    TaskFilter
		want string
	}{
		{TaskFilter{AssigneeIDs: ids}, "t.assignee_id IN ?"},
		{TaskFilter{AssigneeNone: true}, "t.assignee_id IS NULL"},
		{TaskFilter{AssigneeIDs: ids, AssigneeNone: true}, "(t.assignee_id IN ? OR t.assignee_id IS NULL)"},
	}
	for _, c := range cases {
		if w, _ := c.f.where(); !strings.Contains(w, c.want) {
			t.Errorf("harus memuat %q, dapat %q", c.want, w)
		}
	}
}

func TestWhereDueOverdueExcludesDone(t *testing.T) {
	w, args := TaskFilter{Due: []string{"overdue"}, Today: "2026-11-19"}.where()
	if !strings.Contains(w, "t.status <> 'done'") || len(args) != 1 {
		t.Fatalf("overdue harus mengecualikan done dan memakai 1 argumen: %q %v", w, args)
	}
	w, args = TaskFilter{Due: []string{"week", "none"}, Today: "a", WeekEnd: "b"}.where()
	if !strings.Contains(w, " OR ") || len(args) != 2 {
		t.Fatalf("week+none digabung OR, week memakai 2 argumen: %q %v", w, args)
	}
}

func TestWhereFlagsAndMembership(t *testing.T) {
	w, args := TaskFilter{MemberUserID: "u", ExcludeArchived: true, ExcludeDone: true}.where()
	for _, want := range []string{"project_members", "p.archived_at IS NULL", "t.status <> 'done'"} {
		if !strings.Contains(w, want) {
			t.Errorf("harus memuat %q: %s", want, w)
		}
	}
	if len(args) != 1 {
		t.Errorf("hanya user id yang jadi argumen: %v", args)
	}
}

func TestOrderByWhitelistAndStability(t *testing.T) {
	if got := orderBy(SearchOptions{}); got != "t.created_at DESC, t.created_at DESC, t.id" {
		t.Errorf("default salah: %s", got)
	}
	got := orderBy(SearchOptions{Sorts: []TaskSort{{Field: "due_date"}, {Field: "priority", Desc: true}}})
	if !strings.HasPrefix(got, "t.due_date ASC NULLS LAST, CASE t.priority") || !strings.Contains(got, " DESC, t.created_at DESC, t.id") {
		t.Errorf("sort majemuk salah: %s", got)
	}
	// field di luar daftar putih diabaikan, tidak pernah masuk SQL
	got = orderBy(SearchOptions{Sorts: []TaskSort{{Field: "title; DROP TABLE tasks"}, {Field: "password_hash"}}})
	if strings.Contains(got, "DROP") || strings.Contains(got, "password") {
		t.Errorf("field tak dikenal bocor ke SQL: %s", got)
	}
	if got := orderBy(SearchOptions{Kanban: true, Sorts: []TaskSort{{Field: "title"}}}); !strings.Contains(got, "t.position") || strings.Contains(got, "title") {
		t.Errorf("kanban harus mengabaikan Sorts: %s", got)
	}
}

func TestSortFieldsNullsLastForDates(t *testing.T) {
	for _, f := range []string{"due_date", "start_date"} {
		for _, d := range []string{"ASC", "DESC"} {
			if !strings.HasSuffix(sortFields[f](d), "NULLS LAST") {
				t.Errorf("%s %s harus NULLS LAST", f, d)
			}
		}
	}
	if !IsSortField("code") || IsSortField("password_hash") || IsSortField("") {
		t.Error("IsSortField salah")
	}
}
