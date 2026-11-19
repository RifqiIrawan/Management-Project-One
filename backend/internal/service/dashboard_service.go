package service

import (
	"context"
	"time"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/dto"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/repository"
)

const (
	dashboardUpcomingLimit   = 5  // tugas jatuh tempo terdekat
	dashboardProjectsLimit   = 6  // kartu proyek
	dashboardActivitiesLimit = 10 // aktivitas terbaru
)

type DashboardService struct {
	tasks      *repository.TaskRepository
	activities *repository.ActivityRepository
	projects   *ProjectService
	loc        *time.Location
	now        func() time.Time
}

func NewDashboardService(tasks *repository.TaskRepository, activities *repository.ActivityRepository, projects *ProjectService, loc *time.Location) *DashboardService {
	return &DashboardService{tasks: tasks, activities: activities, projects: projects, loc: loc, now: time.Now}
}

// Get mengumpulkan seluruh data dashboard untuk satu pemanggil. Semua daftar selalu berupa [] (bukan null).
func (s *DashboardService) Get(ctx context.Context, user *model.User) (*dto.DashboardResponse, error) {
	today, weekEnd := dateWindow(s.now(), s.loc)

	stats, err := s.tasks.StatsForUser(ctx, user.ID, today, weekEnd)
	if err != nil {
		return nil, err
	}

	// 5 tugas terdekat deadline-nya: milik saya, belum done, punya deadline. Yang sudah lewat
	// (terlambat) otomatis di depan karena diurut deadline menaik.
	upcoming, err := s.tasks.Search(ctx, repository.TaskFilter{
		AssigneeIDs: []string{user.ID}, MemberUserID: user.ID,
		ExcludeArchived: true, ExcludeDone: true, HasDue: true,
	}, repository.SearchOptions{Sorts: defaultMySorts, Limit: dashboardUpcomingLimit})
	if err != nil {
		return nil, err
	}
	tasks := make([]dto.DashboardTask, len(upcoming))
	for i := range upcoming {
		tasks[i] = dto.DashboardTask{
			TaskResponse: *toTaskResponse(&upcoming[i]),
			IsOverdue:    dueGroup(upcoming[i].DueDate, today, weekEnd) == "overdue",
		}
	}

	projects, err := s.projects.ListRecent(ctx, user.ID, dashboardProjectsLimit)
	if err != nil {
		return nil, err
	}

	rows, err := s.activities.ListForUser(ctx, user.ID, dashboardActivitiesLimit)
	if err != nil {
		return nil, err
	}
	activities := make([]dto.ActivityResponse, len(rows))
	for i := range rows {
		activities[i] = toActivityResponse(rows[i])
	}

	return &dto.DashboardResponse{
		User:  dto.UserRef{ID: user.ID, Name: user.Name, AvatarColor: user.AvatarColor},
		Today: today, WeekEnd: weekEnd,
		Stats: dto.DashboardStats{
			TotalTasks: stats.TotalTasks, OpenTasks: stats.OpenTasks, CompletedTasks: stats.CompletedTasks,
			InProgress: stats.InProgress, DueThisWeek: stats.DueThisWeek, Overdue: stats.Overdue,
		},
		UpcomingTasks: tasks, RecentProjects: projects, RecentActivities: activities,
	}, nil
}
