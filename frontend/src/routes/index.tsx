import { lazy } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import AppLayout from '@/layouts/AppLayout';
import AuthLayout from '@/layouts/AuthLayout';
import GuestRoute from './GuestRoute';
import ProtectedRoute from './ProtectedRoute';

// Halaman dimuat malas: bundel awal kecil, kode Kanban (dnd-kit) hanya diunduh saat proyek dibuka.
// Layout (kerangka) tetap statis; Suspense-nya ada di AppLayout dan AuthLayout.
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const MyTasksPage = lazy(() => import('@/pages/my-tasks/MyTasksPage'));
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const ProjectsPage = lazy(() => import('@/pages/projects/ProjectsPage'));
const ProjectLayout = lazy(() => import('@/pages/projects/ProjectLayout'));
const TaskWorkspace = lazy(() => import('@/pages/projects/TaskWorkspace'));
const ProjectOverviewPage = lazy(() => import('@/pages/projects/ProjectOverviewPage'));
const ProjectMembersPage = lazy(() => import('@/pages/projects/ProjectMembersPage'));
const ProjectSettingsPage = lazy(() => import('@/pages/projects/ProjectSettingsPage'));

export const routes: RouteObject[] = [
  {
    element: <GuestRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/my-tasks', element: <MyTasksPage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/projects', element: <ProjectsPage /> },
          {
            path: '/projects/:projectId',
            element: <ProjectLayout />,
            children: [
              { index: true, element: <Navigate to="board" replace /> },
              { path: 'board', element: <TaskWorkspace view="board" /> },
              { path: 'list', element: <TaskWorkspace view="list" /> },
              { path: 'overview', element: <ProjectOverviewPage /> },
              { path: 'members', element: <ProjectMembersPage /> },
              { path: 'settings', element: <ProjectSettingsPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
