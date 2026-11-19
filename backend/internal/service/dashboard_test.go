package service

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/dto"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/repository"
)

func TestDashboardTaskJSONIsFlat(t *testing.T) {
	b, err := json.Marshal(dto.DashboardTask{
		TaskResponse: dto.TaskResponse{ID: "1", Code: "MPO-1", Title: "Judul", Labels: []string{}},
		IsOverdue:    true,
	})
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	if m["title"] != "Judul" || m["code"] != "MPO-1" || m["is_overdue"] != true {
		t.Fatalf("field tugas harus rata (bukan bersarang) dan memuat is_overdue: %s", b)
	}
	if _, nested := m["TaskResponse"]; nested {
		t.Fatalf("TaskResponse tidak boleh bersarang: %s", b)
	}
}

func TestDashboardEmptyListsAreArraysNotNull(t *testing.T) {
	b, err := json.Marshal(dto.DashboardResponse{
		UpcomingTasks: []dto.DashboardTask{}, RecentProjects: []dto.ProjectResponse{}, RecentActivities: []dto.ActivityResponse{},
	})
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	for _, key := range []string{`"upcoming_tasks":[]`, `"recent_projects":[]`, `"recent_activities":[]`} {
		if !strings.Contains(s, key) {
			t.Errorf("harus memuat %s: %s", key, s)
		}
	}
}

func TestActivityResponseProjectOnlyWhenKnown(t *testing.T) {
	base := repository.ActivityRow{ID: 1, Action: "task.created", UserName: "Budi", Metadata: `{"code":"MPO-1"}`, CreatedAt: time.Now()}
	if r := toActivityResponse(base); r.Project != nil || r.Message != "Budi membuat tugas MPO-1" || r.Code != "MPO-1" {
		t.Fatalf("tanpa proyek: %+v", r)
	}
	base.ProjectID, base.ProjectName, base.ProjectKey = "p-1", "Proyek Satu", "MPO"
	r := toActivityResponse(base)
	if r.Project == nil || r.Project.Key != "MPO" || r.Project.Name != "Proyek Satu" || r.Project.ID != "p-1" {
		t.Fatalf("dengan proyek: %+v", r.Project)
	}
	b, _ := json.Marshal(toActivityResponse(repository.ActivityRow{Metadata: `{}`}))
	if strings.Contains(string(b), `"project"`) {
		t.Errorf("project tidak boleh muncul bila kosong: %s", b)
	}
}
