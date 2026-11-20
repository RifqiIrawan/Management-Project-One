import { Navigate, type RouteObject } from 'react-router';
import AppLayout from '@/layouts/AppLayout';
import AuthLayout from '@/layouts/AuthLayout';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import DashboardPage from '@/pages/dashboard/DashboardPage';
import NotFoundPage from '@/pages/NotFoundPage';
import ProjectLayout from '@/pages/projects/ProjectLayout';
import ProjectMembersPage from '@/pages/projects/ProjectMembersPage';
import ProjectOverviewPage from '@/pages/projects/ProjectOverviewPage';
import ProjectSettingsPage from '@/pages/projects/ProjectSettingsPage';
import ProjectsPage from '@/pages/projects/ProjectsPage';
import TaskWorkspace from '@/pages/projects/TaskWorkspace';
import GuestRoute from './GuestRoute';
import ProtectedRoute from './ProtectedRoute';

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
