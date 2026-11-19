package dto

// DashboardStats: angka kartu statistik, dihitung dari tugas yang di-assign ke pemanggil
// (proyek tidak terarsip). Definisinya sama dengan halaman Tugas Saya.
type DashboardStats struct {
	TotalTasks     int `json:"total_tasks"`     // semua tugas saya (termasuk selesai)
	OpenTasks      int `json:"open_tasks"`      // belum done
	CompletedTasks int `json:"completed_tasks"` // done
	InProgress     int `json:"in_progress"`     // status in_progress
	DueThisWeek    int `json:"due_this_week"`   // belum done, deadline hari ini s/d Minggu
	Overdue        int `json:"overdue"`         // belum done, deadline sebelum hari ini
}

// DashboardTask: tugas + penanda terlambat (menurut zona waktu aplikasi) agar UI tidak menebak.
type DashboardTask struct {
	TaskResponse
	IsOverdue bool `json:"is_overdue"`
}

type DashboardResponse struct {
	User             UserRef            `json:"user"`
	Today            string             `json:"today"`    // YYYY-MM-DD menurut APP_TIMEZONE
	WeekEnd          string             `json:"week_end"` // Minggu ini
	Stats            DashboardStats     `json:"stats"`
	UpcomingTasks    []DashboardTask    `json:"upcoming_tasks"`
	RecentProjects   []ProjectResponse  `json:"recent_projects"`
	RecentActivities []ActivityResponse `json:"recent_activities"`
}
