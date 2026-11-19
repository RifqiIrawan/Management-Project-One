package service

import (
	"strings"
	"testing"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/dto"
)

func TestNormalizeLabels(t *testing.T) {
	got, err := normalizeLabels([]string{" Design ", "design", "Frontend", "DESIGN"})
	if err != nil || len(got) != 2 || got[0] != "Design" || got[1] != "Frontend" {
		t.Fatalf("trim + dedupe case-insensitive salah: %v %v", got, err)
	}
	if got, err := normalizeLabels(nil); err != nil || got == nil || len(got) != 0 {
		t.Fatalf("nil harus menjadi slice kosong non-nil: %#v %v", got, err)
	}
	if _, err := normalizeLabels([]string{"ok", "  "}); err == nil {
		t.Fatal("label kosong harus ditolak")
	}
	if _, err := normalizeLabels([]string{strings.Repeat("x", 31)}); err == nil {
		t.Fatal("label > 30 karakter harus ditolak")
	}
	if _, err := normalizeLabels([]string{"a", "b", "c", "d", "e", "f"}); err == nil {
		t.Fatal("6 label harus ditolak")
	}
	// duplikat tidak dihitung ke batas 5
	if _, err := normalizeLabels([]string{"a", "A", "b", "c", "d", "e"}); err != nil {
		t.Fatalf("5 label unik (+duplikat) harus diterima: %v", err)
	}
}

func TestParseDate(t *testing.T) {
	if d, err := parseDate(""); d != nil || err != nil {
		t.Fatal("string kosong = tanpa tanggal")
	}
	if d, err := parseDate(" 2026-12-01 "); err != nil || d == nil || *d != "2026-12-01" {
		t.Fatalf("tanggal valid ditolak: %v %v", d, err)
	}
	for _, bad := range []string{"2026-13-01", "2026-02-30", "01-12-2026", "besok", "2026-1-1"} {
		if _, err := parseDate(bad); err == nil {
			t.Errorf("%q harus ditolak", bad)
		}
	}
}

func TestDueBeforeStart(t *testing.T) {
	a, b := "2026-12-01", "2026-12-05"
	if !dueBeforeStart(&b, &a) {
		t.Error("due 12-01 sebelum start 12-05 harus terdeteksi")
	}
	if dueBeforeStart(&a, &b) || dueBeforeStart(&a, &a) || dueBeforeStart(nil, &a) || dueBeforeStart(&a, nil) {
		t.Error("kasus valid / salah satu kosong tidak boleh ditolak")
	}
}

func TestProgressPercent(t *testing.T) {
	cases := []struct{ done, total, want int }{{0, 0, 0}, {0, 5, 0}, {1, 3, 33}, {2, 3, 67}, {5, 5, 100}}
	for _, c := range cases {
		if got := progressPercent(c.done, c.total); got != c.want {
			t.Errorf("progress(%d/%d) = %d, harapan %d", c.done, c.total, got, c.want)
		}
	}
}

func TestEqualPtrAndPtrValue(t *testing.T) {
	a, b, c := "x", "x", "y"
	if !equalPtr(nil, nil) || !equalPtr(&a, &b) || equalPtr(&a, &c) || equalPtr(&a, nil) || equalPtr(nil, &a) {
		t.Error("equalPtr salah")
	}
	if ptrValue(nil) != nil || ptrValue(&a) != "x" {
		t.Error("ptrValue salah")
	}
}

func TestUpdateRequestProvided(t *testing.T) {
	if (dto.UpdateTaskRequest{}).Provided() {
		t.Error("body kosong tidak boleh dianggap berisi")
	}
	if !(dto.UpdateTaskRequest{AssigneeID: dto.Optional[string]{Set: true, Null: true}}).Provided() {
		t.Error("assignee_id: null harus dianggap berisi (mengosongkan assignee)")
	}
}
