import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import { addMember, listMembers, qk, removeMember, searchUsers, updateMemberRole } from '@/api/projects.api';
import Avatar from '@/components/common/Avatar';
import ConfirmModal from '@/components/common/ConfirmModal';
import ErrorState from '@/components/common/ErrorState';
import Spinner from '@/components/common/Spinner';
import { inviteSchema } from '@/schemas/project.schema';
import { useAuthStore } from '@/store/authStore';
import type { Member, Role } from '@/types/api';
import { parseError } from '@/utils/errors';
import { useProjectContext } from './ProjectLayout';

export default function ProjectMembersPage() {
  const { project, isOwner } = useProjectContext();
  const me = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [debounced, setDebounced] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<Member | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(email.trim()), 300);
    return () => clearTimeout(t);
  }, [email]);

  const members = useQuery({ queryKey: qk.members(project.id), queryFn: () => listMembers(project.id) });
  const suggestions = useQuery({
    queryKey: ['user-search', debounced],
    queryFn: () => searchUsers(debounced),
    enabled: isOwner && debounced.length >= 3,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.members(project.id) });
    void qc.invalidateQueries({ queryKey: qk.project(project.id) });
    void qc.invalidateQueries({ queryKey: qk.projectsAll });
  };

  const invite = useMutation({
    mutationFn: (addr: string) => addMember(project.id, addr),
    onSuccess: (m) => {
      refresh();
      setEmail('');
      setInviteError(null);
      toast.success(`${m.name} ditambahkan`);
    },
    onError: (e) => {
      const err = parseError(e);
      setInviteError(err.code === 'NOT_FOUND' ? 'Pengguna dengan email itu belum terdaftar' : err.code === 'CONFLICT' ? 'Pengguna ini sudah menjadi anggota' : err.message);
    },
  });

  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) => updateMemberRole(project.id, userId, role),
    onSuccess: refresh,
    onError: (e) => {
      toast.error(parseError(e).message);
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (m: Member) => removeMember(project.id, m.user_id),
    onSuccess: (_r, m) => {
      setToRemove(null);
      if (m.user_id === me) {
        // keluar sendiri: akses hilang, kembali ke daftar proyek
        qc.removeQueries({ queryKey: qk.project(project.id) });
        void qc.invalidateQueries({ queryKey: qk.projectsAll });
        toast.success(`Anda keluar dari ${project.name}`);
        navigate('/projects', { replace: true });
      } else {
        refresh();
        toast.success(`${m.name} dikeluarkan`);
      }
    },
    onError: (e) => {
      setToRemove(null);
      toast.error(parseError(e).message);
    },
  });

  function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    const parsed = inviteSchema.safeParse({ email });
    if (!parsed.success) {
      setInviteError(parsed.error.issues[0]?.message ?? 'Email tidak valid');
      return;
    }
    setInviteError(null);
    invite.mutate(parsed.data.email);
  }

  const existing = new Set((members.data ?? []).map((m) => m.email.toLowerCase()));
  const options = (suggestions.data ?? []).filter((u) => !existing.has(u.email.toLowerCase()));

  return (
    <div className="row g-4">
      {isOwner && (
        <div className="col-12 col-lg-4 order-lg-2">
          <form className="card card-body" onSubmit={submitInvite} noValidate aria-label="Undang anggota">
            <h2 className="h5">Undang anggota</h2>
            <label htmlFor="invite-email" className="form-label small">
              Email pengguna terdaftar
            </label>
            <input
              id="invite-email"
              type="email"
              className={`form-control ${inviteError ? 'is-invalid' : ''}`}
              value={email}
              autoComplete="off"
              onChange={(e) => {
                setEmail(e.target.value);
                setInviteError(null);
              }}
            />
            {inviteError && (
              <div className="invalid-feedback" role="alert">
                {inviteError}
              </div>
            )}
            {options.length > 0 && (
              <ul className="list-group mt-2" aria-label="Saran pengguna">
                {options.map((u) => (
                  <li key={u.id} className="list-group-item list-group-item-action p-0">
                    <button type="button" className="btn w-100 text-start d-flex align-items-center gap-2 border-0" onClick={() => invite.mutate(u.email)} disabled={invite.isPending}>
                      <Avatar name={u.name} color={u.avatar_color} size={28} />
                      <span className="min-w-0">
                        <span className="d-block text-truncate">{u.name}</span>
                        <span className="d-block small text-secondary text-truncate">{u.email}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="submit" className="btn btn-primary mt-3" disabled={invite.isPending}>
              {invite.isPending && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
              Undang
            </button>
          </form>
        </div>
      )}

      <div className={`col-12 ${isOwner ? 'col-lg-8' : ''} order-lg-1`}>
        <h2 className="h5 mb-3">Anggota ({members.data?.length ?? project.member_count})</h2>
        {members.isLoading && <Spinner label="Memuat anggota..." />}
        {members.isError && <ErrorState message={parseError(members.error).message} onRetry={() => void members.refetch()} />}
        {members.data && (
          <ul className="list-group" aria-label="Daftar anggota">
            {members.data.map((m) => {
              const self = m.user_id === me;
              return (
                <li key={m.user_id} className="list-group-item d-flex align-items-center gap-3 flex-wrap">
                  <Avatar name={m.name} color={m.avatar_color} size={36} />
                  <div className="flex-grow-1 min-w-0">
                    <div className="fw-medium text-truncate">
                      {m.name}
                      {self && <span className="badge text-bg-light ms-2">Anda</span>}
                    </div>
                    <div className="small text-secondary text-truncate">{m.email}</div>
                  </div>
                  {isOwner ? (
                    <select
                      className="form-select form-select-sm w-auto"
                      aria-label={`Peran ${m.name}`}
                      value={m.role}
                      disabled={changeRole.isPending}
                      onChange={(e) => changeRole.mutate({ userId: m.user_id, role: e.target.value as Role })}
                    >
                      <option value="owner">Owner</option>
                      <option value="member">Member</option>
                    </select>
                  ) : (
                    <span className={`badge ${m.role === 'owner' ? 'text-bg-primary' : 'text-bg-secondary'}`}>{m.role === 'owner' ? 'Owner' : 'Member'}</span>
                  )}
                  {(isOwner || self) && (
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setToRemove(m)}>
                      {self ? 'Keluar' : 'Keluarkan'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmModal
        show={toRemove !== null}
        title={toRemove?.user_id === me ? 'Keluar dari proyek?' : 'Keluarkan anggota?'}
        body={
          toRemove?.user_id === me
            ? `Anda tidak akan bisa mengakses ${project.name} lagi kecuali diundang kembali.`
            : `${toRemove?.name ?? ''} kehilangan akses, dan tugas yang di-assign ke anggota ini menjadi tanpa penanggung jawab.`
        }
        confirmLabel={toRemove?.user_id === me ? 'Keluar' : 'Keluarkan'}
        busy={remove.isPending}
        onConfirm={() => toRemove && remove.mutate(toRemove)}
        onHide={() => setToRemove(null)}
      />
    </div>
  );
}
