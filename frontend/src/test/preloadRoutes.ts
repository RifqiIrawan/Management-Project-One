// Halaman dimuat malas (React.lazy). Tanpa pemanasan, tes pertama di tiap berkas menanggung biaya memuat modul yang
// dingin (mis. dnd-kit) dan bisa melewati batas waktu findBy. Panggil di beforeAll agar tes mengukur perilaku, bukan waktu impor.
export async function preloadRoutes(): Promise<void> {
  await Promise.all([
    import('@/pages/auth/LoginPage'),
    import('@/pages/auth/RegisterPage'),
    import('@/pages/dashboard/DashboardPage'),
    import('@/pages/my-tasks/MyTasksPage'),
    import('@/pages/profile/ProfilePage'),
    import('@/pages/NotFoundPage'),
    import('@/pages/projects/ProjectsPage'),
    import('@/pages/projects/ProjectLayout'),
    import('@/pages/projects/TaskWorkspace'),
    import('@/pages/projects/ProjectOverviewPage'),
    import('@/pages/projects/ProjectMembersPage'),
    import('@/pages/projects/ProjectSettingsPage'),
  ]);
}
