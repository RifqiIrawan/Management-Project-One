import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { Toaster } from 'react-hot-toast';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { restoreSession } from '@/api/auth.api';
import { routes } from '@/routes';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

// Dipanggil sekali walau StrictMode memasang komponen dua kali (hindari dua refresh bersamaan).
let restoring: Promise<void> | null = null;

export default function App() {
  const router = useMemo(() => createBrowserRouter(routes), []);
  useEffect(() => {
    restoring ??= restoreSession();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" toastOptions={{ duration: 3000 }} />
    </QueryClientProvider>
  );
}