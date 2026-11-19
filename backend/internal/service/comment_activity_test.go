package service

import (
	"strings"
	"testing"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/repository"
)

func msg(action, metaJSON string, user string, to *string) string {
	row := repository.ActivityRow{Action: action, UserName: user, ToName: to}
	return activityMessage(row, parseMetadata(metaJSON))
}

func TestActivityMessages(t *testing.T) {
	andi := "Andi"
	empty := ""
	cases := []struct {
		name, action, meta string
		to                 *string
		want               string
	}{
		{"dibuat", "task.created", `{"code":"MPO-12","title":"x"}`, nil, "Budi membuat tugas MPO-12"},
		{"dihapus", "task.deleted", `{"code":"MPO-12"}`, nil, "Budi menghapus tugas MPO-12"},
		{"status", "task.status_changed", `{"code":"MPO-12","from":"todo","to":"in_progress"}`, nil, "Budi memindahkan MPO-12 dari To Do ke In Progress"},
		{"status review->done", "task.status_changed", `{"code":"A-1","from":"in_review","to":"done"}`, nil, "Budi memindahkan A-1 dari In Review ke Done"},
		{"assign", "task.assigned", `{"code":"MPO-12","from":null,"to":"u-1"}`, &andi, "Budi meng-assign MPO-12 ke Andi"},
		{"assign tanpa nama", "task.assigned", `{"code":"MPO-12","to":"u-1"}`, &empty, "Budi meng-assign MPO-12 ke seseorang"},
		{"lepas assignee", "task.assigned", `{"code":"MPO-12","from":"u-1","to":null}`, nil, "Budi melepas assignee dari MPO-12"},
		{"update", "task.updated", `{"code":"MPO-12","fields":["title","due_date","labels"]}`, nil, "Budi mengubah MPO-12 (judul, deadline, label)"},
		{"update tanpa field", "task.updated", `{"code":"MPO-12"}`, nil, "Budi mengubah MPO-12"},
		{"komentar", "comment.created", `{"code":"MPO-12","comment_id":"c-1"}`, nil, "Budi mengomentari MPO-12"},
		{"kode hilang", "task.created", `{}`, nil, "Budi membuat tugas sebuah tugas"},
		{"metadata rusak", "task.created", `bukan json`, nil, "Budi membuat tugas sebuah tugas"},
		{"aksi tak dikenal", "task.xyz", `{"code":"MPO-1"}`, nil, "Budi melakukan task.xyz pada MPO-1"},
		{"status tak dikenal dipertahankan", "task.status_changed", `{"code":"M-1","from":"x","to":"y"}`, nil, "Budi memindahkan M-1 dari x ke y"},
	}
	for _, c := range cases {
		if got := msg(c.action, c.meta, "Budi", c.to); got != c.want {
			t.Errorf("%s: %q, harapan %q", c.name, got, c.want)
		}
	}
}

func TestCleanBody(t *testing.T) {
	if b, err := cleanBody("  halo\n\n**tebal**  "); err != nil || b != "halo\n\n**tebal**" {
		t.Fatalf("trim + pertahankan baris baru/markdown: %q %v", b, err)
	}
	for _, bad := range []string{"", "   ", "\n\t "} {
		if _, err := cleanBody(bad); err == nil {
			t.Errorf("%q harus ditolak", bad)
		}
	}
	if _, err := cleanBody(strings.Repeat("a", 5000)); err != nil {
		t.Error("tepat 5000 karakter harus diterima")
	}
	if _, err := cleanBody(strings.Repeat("a", 5001)); err == nil {
		t.Error("5001 karakter harus ditolak")
	}
	if _, err := cleanBody(strings.Repeat("🚀", 5000)); err != nil {
		t.Error("batas dihitung per karakter (rune), bukan byte")
	}
	_, err := cleanBody("")
	if ae, ok := err.(*apperror.Error); !ok || ae.Status != 400 || ae.Details["body"] == "" {
		t.Errorf("harus 400 dengan details.body: %v", err)
	}
}

func TestCommentPermissionsInResponse(t *testing.T) {
	row := &repository.CommentRow{ID: "c", UserID: "author"}
	cases := []struct {
		viewer, role         string
		wantEdit, wantDelete bool
	}{
		{"author", model.RoleMember, true, true},
		{"author", model.RoleOwner, true, true},
		{"other", model.RoleOwner, false, true}, // owner boleh hapus, tidak boleh edit milik orang lain
		{"other", model.RoleMember, false, false},
	}
	for _, c := range cases {
		r := toCommentResponse(row, c.viewer, c.role)
		if r.CanEdit != c.wantEdit || r.CanDelete != c.wantDelete {
			t.Errorf("viewer=%s role=%s: can_edit=%v can_delete=%v, harapan %v/%v", c.viewer, c.role, r.CanEdit, r.CanDelete, c.wantEdit, c.wantDelete)
		}
	}
}

func TestParsePaging(t *testing.T) {
	d := map[string]string{}
	if p, per := parsePaging("", "", 50, d); p != 1 || per != 50 || len(d) != 0 {
		t.Fatalf("default salah: %d %d %v", p, per, d)
	}
	if p, per := parsePaging("3", "10", 50, d); p != 3 || per != 10 || len(d) != 0 {
		t.Fatalf("nilai valid salah: %d %d %v", p, per, d)
	}
	for _, c := range [][2]string{{"0", ""}, {"abc", ""}, {"", "0"}, {"", "101"}, {"", "x"}, {"-1", ""}} {
		d = map[string]string{}
		parsePaging(c[0], c[1], 20, d)
		if len(d) == 0 {
			t.Errorf("page=%q per_page=%q harus ditolak", c[0], c[1])
		}
	}
}
