import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { qk, toggleFavorite } from '@/api/projects.api';
import { parseError } from '@/utils/errors';

/** Toggle favorit lalu segarkan daftar proyek, detail, dan dashboard. */
export function useFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => toggleFavorite(projectId),
    onSuccess: (_r, projectId) => {
      void qc.invalidateQueries({ queryKey: qk.projectsAll });
      void qc.invalidateQueries({ queryKey: qk.project(projectId) });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
    onError: (e) => toast.error(parseError(e).message),
  });
}
