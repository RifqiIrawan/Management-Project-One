package service

import (
	"strings"
	"testing"
	"time"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/dto"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
)

const (
	me    = "4f1c9a52-8d3e-4b6a-9c11-0a1b2c3d4e5f"
	other = "9a2e7b10-1111-4222-8333-444455556666"
	today = "2026-11-19"
	wk    = "2026-11-22"
)

func parse(t *testing.T, p dto.TaskListParams) *listQuery {
	t.Helper()
	q, err := parseTaskQuery(p, me, today, wk)
	if err != nil {
		t.Fatalf("seharusnya valid: %v", err)
	}
	return q
}

func details(t *testing.T, p dto.TaskListParams) map[string]string {
	t.Helper()
	_, err := parseTaskQuery(p, me, today, wk)
	ae, ok := err.(*apperror.Error)
	if !ok || ae.Status != 400 {
		t.Fatalf("seharusnya 400 VALIDATION_ERROR, dapat %v", err)
	}
	return ae.Details
}

func TestParseDefaults(t *testing.T) {
	q := parse(t, dto.TaskListParams{})
	if q.page != 1 || q.perPage != 20 || q.board || q.group || q.includeDone || len(q.sorts) != 0 {
		t.Fatalf("default salah: %+v", q)
	}
}

func TestParseFilters(t *testing.T) {
	q := parse(t, dto.TaskListParams{
		Q: "  Login ", Status: "todo, IN_PROGRESS ,todo", Priority: "high,urgent", Due: "overdue,none",
		Assignee: "me," + other + ",none,ME", Sort: "-priority,due_date", Page: "3", PerPage: "50",
	})
	f := q.filter
	if f.Q != "Login" || len(f.Statuses) != 2 || f.Statuses[1] != "in_progress" {
		t.Errorf("q/status salah: %+v", f)
	}
	if len(f.Priorities) != 2 || len(f.Due) != 2 {
		t.Errorf("priority/due salah: %+v", f)
	}
	if !f.AssigneeNone || len(f.AssigneeIDs) != 2 || f.AssigneeIDs[0] != me || f.AssigneeIDs[1] != other {
		t.Errorf("assignee (me->id, dedupe, none) salah: %+v", f)
	}
	if len(q.sorts) != 2 || q.sorts[0].Field != "priority" || !q.sorts[0].Desc || q.sorts[1].Desc {
		t.Errorf("sort salah: %+v", q.sorts)
	}
	if q.page != 3 || q.perPage != 50 {
		t.Errorf("pagination salah: %d %d", q.page, q.perPage)
	}
	if f.Today != today || f.WeekEnd != wk {
		t.Errorf("jendela tanggal tidak terbawa: %+v", f)
	}
}

func TestParseRejectsInvalid(t *testing.T) {
	cases := map[string]dto.TaskListParams{
		"status":       {Status: "todo,selesai"},
		"priority":     {Priority: "kritis"},
		"due":          {Due: "kemarin"},
		"assignee":     {Assignee: "bukan-uuid"},
		"sort":         {Sort: "password"},
		"page":         {Page: "0"},
		"per_page":     {PerPage: "101"},
		"view":         {View: "grid"},
		"group":        {Group: "status"},
		"include_done": {IncludeDone: "mungkin"},
		"q":            {Q: strings.Repeat("x", 101)},
	}
	for field, p := range cases {
		if d := details(t, p); d[field] == "" {
			t.Errorf("%s: harus ada detail error untuk field ini, dapat %v", field, d)
		}
	}
	// beberapa kesalahan sekaligus dilaporkan bersamaan
	if d := details(t, dto.TaskListParams{Status: "x", Page: "abc", Sort: "x"}); len(d) != 3 {
		t.Errorf("semua kesalahan harus dikumpulkan: %v", d)
	}
	for _, bad := range []string{"abc", "-1", "1.5", "", "9999999"} {
		if bad == "" {
			continue
		}
		if _, err := parseTaskQuery(dto.TaskListParams{Page: bad}, me, today, wk); err == nil {
			t.Errorf("page=%q harus ditolak", bad)
		}
	}
}

func TestParseSortInjectionRejected(t *testing.T) {
	for _, s := range []string{"title;DROP TABLE tasks", "due_date desc", "(select 1)", "t.title", "-", "--title"} {
		if _, err := parseTaskQuery(dto.TaskListParams{Sort: s}, me, today, wk); err == nil {
			t.Errorf("sort=%q harus ditolak", s)
		}
	}
}

func TestParseLimits(t *testing.T) {
	many := strings.TrimSuffix(strings.Repeat("todo,", 5)+strings.Repeat("a,", 30), ",")
	if _, err := parseTaskQuery(dto.TaskListParams{Status: many}, me, today, wk); err == nil {
		t.Error("terlalu banyak nilai harus ditolak")
	}
	if _, err := parseTaskQuery(dto.TaskListParams{Sort: "title,code,status,priority"}, me, today, wk); err == nil {
		t.Error("lebih dari 3 kolom urut harus ditolak")
	}
}

func TestParseViewGroupIncludeDone(t *testing.T) {
	q := parse(t, dto.TaskListParams{View: "BOARD", Group: "due", IncludeDone: "true"})
	if !q.board || !q.group || !q.includeDone {
		t.Fatalf("view/group/include_done salah: %+v", q)
	}
	if q := parse(t, dto.TaskListParams{View: "list", IncludeDone: "false"}); q.board || q.includeDone {
		t.Fatalf("list/false salah: %+v", q)
	}
}

func TestDateWindow(t *testing.T) {
	jkt, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		t.Skip("zona waktu tidak tersedia")
	}
	cases := []struct {
		now             time.Time
		wantToday, want string
	}{
		{time.Date(2026, 11, 19, 10, 0, 0, 0, jkt), "2026-11-19", "2026-11-22"},  // Kamis -> Minggu
		{time.Date(2026, 11, 16, 0, 0, 0, 0, jkt), "2026-11-16", "2026-11-22"},   // Senin
		{time.Date(2026, 11, 22, 23, 59, 0, 0, jkt), "2026-11-22", "2026-11-22"}, // Minggu: akhir minggu = hari ini
		// 17:30 UTC = 00:30 WIB hari berikutnya -> "hari ini" harus mengikuti WIB, bukan UTC
		{time.Date(2026, 11, 19, 17, 30, 0, 0, time.UTC), "2026-11-20", "2026-11-22"},
		{time.Date(2026, 12, 31, 20, 0, 0, 0, time.UTC), "2027-01-01", "2027-01-03"}, // lintas tahun
	}
	for _, c := range cases {
		td, we := dateWindow(c.now, jkt)
		if td != c.wantToday || we != c.want {
			t.Errorf("dateWindow(%v) = %s,%s; harapan %s,%s", c.now, td, we, c.wantToday, c.want)
		}
	}
}

func TestDueGroup(t *testing.T) {
	s := func(v string) *string { return &v }
	cases := []struct {
		due  *string
		want string
	}{
		{nil, "no_deadline"}, {s("2026-11-18"), "overdue"}, {s("2026-11-19"), "today"},
		{s("2026-11-20"), "this_week"}, {s("2026-11-22"), "this_week"}, {s("2026-11-23"), "later"},
	}
	for _, c := range cases {
		if got := dueGroup(c.due, today, wk); got != c.want {
			t.Errorf("dueGroup = %s, harapan %s", got, c.want)
		}
	}
	// hari ini = Minggu: tidak ada "minggu ini" selain hari ini
	if got := dueGroup(s("2026-11-23"), "2026-11-22", "2026-11-22"); got != "later" {
		t.Errorf("hari Minggu: besok harus 'later', dapat %s", got)
	}
}

func TestPageMeta(t *testing.T) {
	cases := []struct{ page, per, total, pages int }{{1, 20, 0, 0}, {1, 20, 1, 1}, {1, 20, 20, 1}, {2, 20, 21, 2}, {1, 2, 5, 3}}
	for _, c := range cases {
		m := pageMeta(c.page, c.per, c.total)
		if m.TotalPages != c.pages || m.Total != c.total || m.Page != c.page || m.PerPage != c.per {
			t.Errorf("pageMeta%+v = %+v", c, m)
		}
	}
}
