package service

import (
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
	defaultPerPage = 20
	maxPerPage     = 100
	maxPage        = 1_000_000
	maxCSVItems    = 20
	maxSortKeys    = 3
	maxQueryLen    = 100
)

var (
	validStatuses   = setOf(model.TaskStatuses...)
	validPriorities = map[string]bool{"low": true, "medium": true, "high": true, "urgent": true}
	validDue        = map[string]bool{"overdue": true, "today": true, "week": true, "none": true}
)

// listQuery adalah hasil validasi query string daftar tugas.
type listQuery struct {
	filter      repository.TaskFilter
	sorts       []repository.TaskSort
	page        int
	perPage     int
	board       bool
	group       bool
	includeDone bool
}

// parseTaskQuery memvalidasi seluruh parameter. Semua kesalahan dikumpulkan dalam satu respons 400.
// me menggantikan token assignee "me". today/weekEnd menurut zona waktu aplikasi (YYYY-MM-DD).
func parseTaskQuery(p dto.TaskListParams, me, today, weekEnd string) (*listQuery, error) {
	details := map[string]string{}
	q := &listQuery{page: 1, perPage: defaultPerPage}
	q.filter.Today, q.filter.WeekEnd = today, weekEnd

	if s := strings.TrimSpace(p.Q); s != "" {
		if utf8.RuneCountInString(s) > maxQueryLen {
			details["q"] = "Kata kunci maksimal 100 karakter"
		}
		q.filter.Q = s
	}
	q.filter.Statuses = enumList(p.Status, validStatuses, "status", details)
	q.filter.Priorities = enumList(p.Priority, validPriorities, "priority", details)
	q.filter.Due = enumList(p.Due, validDue, "due", details)

	tokens, tooMany := splitCSV(p.Assignee)
	if tooMany {
		details["assignee"] = "Terlalu banyak nilai (maks. 20)"
	}
	for _, tok := range tokens {
		switch {
		case tok == "none":
			q.filter.AssigneeNone = true
		case tok == "me":
			q.filter.AssigneeIDs = appendUnique(q.filter.AssigneeIDs, me)
		case validator.IsUUID(tok):
			q.filter.AssigneeIDs = appendUnique(q.filter.AssigneeIDs, tok)
		default:
			details["assignee"] = "Nilai harus UUID, 'me', atau 'none'"
		}
	}

	sortTokens, tooMany := splitCSV(p.Sort)
	if tooMany || len(sortTokens) > maxSortKeys {
		details["sort"] = "Maksimal 3 kolom urut"
	}
	for _, tok := range sortTokens {
		field, desc := strings.TrimPrefix(tok, "-"), strings.HasPrefix(tok, "-")
		if !repository.IsSortField(field) {
			details["sort"] = "Kolom urut tidak dikenal: " + tok
			break
		}
		q.sorts = append(q.sorts, repository.TaskSort{Field: field, Desc: desc})
	}

	if s := strings.TrimSpace(p.Page); s != "" {
		if n, err := strconv.Atoi(s); err != nil || n < 1 || n > maxPage {
			details["page"] = "Halaman harus angka antara 1 dan 1000000"
		} else {
			q.page = n
		}
	}
	if s := strings.TrimSpace(p.PerPage); s != "" {
		if n, err := strconv.Atoi(s); err != nil || n < 1 || n > maxPerPage {
			details["per_page"] = "Jumlah per halaman harus angka antara 1 dan 100"
		} else {
			q.perPage = n
		}
	}

	switch strings.ToLower(strings.TrimSpace(p.View)) {
	case "", "list":
	case "board":
		q.board = true
	default:
		details["view"] = "Nilai harus 'list' atau 'board'"
	}
	switch strings.ToLower(strings.TrimSpace(p.Group)) {
	case "":
	case "due":
		q.group = true
	default:
		details["group"] = "Nilai harus 'due'"
	}
	if s := strings.TrimSpace(p.IncludeDone); s != "" {
		b, err := strconv.ParseBool(s)
		if err != nil {
			details["include_done"] = "Nilai harus true atau false"
		}
		q.includeDone = b
	}

	if len(details) > 0 {
		return nil, apperror.Validation(details)
	}
	return q, nil
}

// enumList memecah nilai dipisah koma dan memastikan semuanya ada di daftar yang diizinkan.
func enumList(raw string, allowed map[string]bool, name string, details map[string]string) []string {
	tokens, tooMany := splitCSV(raw)
	if tooMany {
		details[name] = "Terlalu banyak nilai (maks. 20)"
		return nil
	}
	for _, t := range tokens {
		if !allowed[t] {
			details[name] = "Nilai tidak dikenal: " + t
			return nil
		}
	}
	return tokens
}

// splitCSV: pecah di koma, trim, huruf kecil, buang kosong & duplikat. tooMany bila > maxCSVItems.
func splitCSV(s string) (items []string, tooMany bool) {
	seen := map[string]bool{}
	for _, part := range strings.Split(s, ",") {
		part = strings.ToLower(strings.TrimSpace(part))
		if part == "" || seen[part] {
			continue
		}
		seen[part] = true
		items = append(items, part)
	}
	return items, len(items) > maxCSVItems
}

func appendUnique(list []string, v string) []string {
	for _, x := range list {
		if x == v {
			return list
		}
	}
	return append(list, v)
}

// dateWindow mengembalikan tanggal hari ini dan akhir minggu ini (Minggu) menurut zona waktu loc.
func dateWindow(now time.Time, loc *time.Location) (today, weekEnd string) {
	n := now.In(loc)
	weekday := (int(n.Weekday()) + 6) % 7 // Senin=0 ... Minggu=6
	d := time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, loc)
	return d.Format(dateLayout), d.AddDate(0, 0, 6-weekday).Format(dateLayout)
}

// dueGroup menentukan kelompok deadline (saling lepas) untuk halaman "Tugas Saya".
func dueGroup(due *string, today, weekEnd string) string {
	switch {
	case due == nil:
		return "no_deadline"
	case *due < today:
		return "overdue"
	case *due == today:
		return "today"
	case *due <= weekEnd:
		return "this_week"
	default:
		return "later"
	}
}

func pageMeta(page, perPage, total int) *dto.PageMeta {
	pages := 0
	if total > 0 {
		pages = (total + perPage - 1) / perPage
	}
	return &dto.PageMeta{Page: page, PerPage: perPage, Total: total, TotalPages: pages}
}

// defaultMySorts: yang paling mendesak dulu (deadline terdekat, lalu prioritas tertinggi).
var defaultMySorts = []repository.TaskSort{{Field: "due_date"}, {Field: "priority", Desc: true}}

func setOf(items ...string) map[string]bool {
	m := make(map[string]bool, len(items))
	for _, s := range items {
		m[s] = true
	}
	return m
}
