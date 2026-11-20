import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { createComment, deleteComment, listComments, tk, updateComment } from '@/api/tasks.api';
import Avatar from '@/components/common/Avatar';
import ErrorState from '@/components/common/ErrorState';
import Spinner from '@/components/common/Spinner';
import type { Comment } from '@/types/api';
import { parseError } from '@/utils/errors';
import { timeAgo } from '@/utils/format';

const MAX = 5000;

function CommentItem({ c, readOnly, onSave, onDelete, busy }: { c: Comment; readOnly: boolean; onSave: (id: string, body: string) => Promise<void>; onDelete: (id: string) => void; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body);
  const tooLong = text.length > MAX;
  const empty = text.trim() === '';

  return (
    <li className="d-flex gap-2 mb-3">
      <Avatar name={c.author.name} color={c.author.avatar_color} size={32} />
      <div className="flex-grow-1 min-w-0">
        <div className="small">
          <strong>{c.author.name}</strong> <span className="text-secondary">{timeAgo(c.created_at)}</span>
          {c.edited_at && <span className="text-secondary"> (diedit)</span>}
        </div>
        {editing ? (
          <>
            <label htmlFor={`edit-${c.id}`} className="visually-hidden">
              Ubah komentar
            </label>
            <textarea id={`edit-${c.id}`} className={`form-control form-control-sm mt-1 ${tooLong ? 'is-invalid' : ''}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
            {tooLong && <div className="invalid-feedback">Komentar maksimal {MAX} karakter</div>}
            <div className="d-flex gap-2 mt-2">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={empty || tooLong || busy}
                onClick={() =>
                  void onSave(c.id, text.trim()).then(
                    () => setEditing(false),
                    () => undefined,
                  )
                }
              >
                Simpan
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => {
                  setText(c.body);
                  setEditing(false);
                }}
              >
                Batal
              </button>
            </div>
          </>
        ) : (
          <>
            {/* teks polos (bukan HTML/Markdown): aman dari XSS, baris baru dipertahankan */}
            <div className="comment-body">{c.body}</div>
            {!readOnly && (c.can_edit || c.can_delete) && (
              <div className="small mt-1">
                {c.can_edit && (
                  <button type="button" className="btn btn-link btn-sm p-0 me-3" onClick={() => setEditing(true)}>
                    Ubah
                  </button>
                )}
                {c.can_delete && (
                  <button type="button" className="btn btn-link btn-sm p-0 text-danger" onClick={() => onDelete(c.id)} disabled={busy}>
                    Hapus
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export default function CommentSection({ taskId, projectId, readOnly }: { taskId: string; projectId: string; readOnly: boolean }) {
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const comments = useQuery({ queryKey: tk.comments(taskId), queryFn: () => listComments(taskId) });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: tk.comments(taskId) });
    void qc.invalidateQueries({ queryKey: tk.activities(taskId) });
    void qc.invalidateQueries({ queryKey: tk.tasks(projectId) }); // comment_count pada kartu
  };

  const add = useMutation({
    mutationFn: (text: string) => createComment(taskId, text),
    onSuccess: () => {
      setBody('');
      refresh();
    },
    onError: (e) => toast.error(parseError(e).message),
  });
  const save = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => updateComment(id, text),
    onSuccess: refresh,
    onError: (e) => toast.error(parseError(e).message),
  });
  const remove = useMutation({
    mutationFn: deleteComment,
    onSuccess: refresh,
    onError: (e) => toast.error(parseError(e).message),
  });

  const tooLong = body.length > MAX;
  const canSend = body.trim() !== '' && !tooLong && !add.isPending;

  return (
    <div>
      {comments.isLoading && <Spinner label="Memuat komentar..." />}
      {comments.isError && <ErrorState message={parseError(comments.error).message} onRetry={() => void comments.refetch()} />}
      {comments.data && comments.data.length === 0 && <p className="text-secondary small">Belum ada komentar.</p>}
      {comments.data && comments.data.length > 0 && (
        <ul className="list-unstyled" aria-label="Komentar">
          {comments.data.map((c) => (
            <CommentItem key={c.id} c={c} readOnly={readOnly} busy={save.isPending || remove.isPending} onSave={(id, text) => save.mutateAsync({ id, text }).then(() => undefined)} onDelete={(id) => remove.mutate(id)} />
          ))}
        </ul>
      )}
      {!readOnly && (
        <form
          aria-label="Tulis komentar"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSend) add.mutate(body.trim());
          }}
        >
          <label htmlFor="new-comment" className="visually-hidden">
            Tulis komentar
          </label>
          <textarea
            id="new-comment"
            className={`form-control ${tooLong ? 'is-invalid' : ''}`}
            rows={3}
            placeholder="Tulis komentar... (Ctrl+Enter untuk kirim)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSend) add.mutate(body.trim());
            }}
          />
          {tooLong && <div className="invalid-feedback">Komentar maksimal {MAX} karakter</div>}
          <button type="submit" className="btn btn-primary btn-sm mt-2" disabled={!canSend}>
            {add.isPending && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
            Kirim
          </button>
        </form>
      )}
    </div>
  );
}
