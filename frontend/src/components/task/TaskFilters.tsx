import { useEffect, useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import type { Member } from '@/types/api';
import { DUE_OPTIONS, PRIORITIES, PRIORITY_CONFIG, STATUS_CONFIG, STATUSES } from '@/utils/constants';
import { hasActiveFilters, type TaskFilters as Filters } from '@/utils/taskLogic';

interface Option {
  value: string;
  label: string;
}

function MultiFilter({ label, options, selected, onChange }: { label: string; options: Option[]; selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <Dropdown autoClose="outside">
      <Dropdown.Toggle variant={selected.length ? 'primary' : 'outline-secondary'} size="sm" aria-label={`Filter ${label}`}>
        {label}
        {selected.length > 0 && <span className="badge text-bg-light ms-1">{selected.length}</span>}
      </Dropdown.Toggle>
      <Dropdown.Menu className="p-2" style={{ minWidth: 200 }}>
        {options.map((o) => (
          <div key={o.value} className="form-check">
            <input className="form-check-input" type="checkbox" id={`f-${label}-${o.value}`} checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
            <label className="form-check-label w-100" htmlFor={`f-${label}-${o.value}`}>
              {o.label}
            </label>
          </div>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}

interface Props {
  filters: Filters;
  members: Member[];
  onChange: (patch: Partial<Filters>) => void;
  onClear: () => void;
}

export default function TaskFilters({ filters, members, onChange, onClear }: Props) {
  // kotak cari diketik bebas, ke URL (dan server) setelah jeda singkat
  const [text, setText] = useState(filters.q);
  useEffect(() => setText(filters.q), [filters.q]);
  useEffect(() => {
    if (text === filters.q) return;
    const t = setTimeout(() => onChange({ q: text }), 300);
    return () => clearTimeout(t);
  }, [text, filters.q, onChange]);

  const assignees: Option[] = [{ value: 'me', label: 'Saya' }, { value: 'none', label: 'Belum di-assign' }, ...members.map((m) => ({ value: m.user_id, label: m.name }))];

  return (
    <div className="d-flex flex-wrap align-items-center gap-2 mb-3" role="search" aria-label="Filter tugas">
      <div style={{ width: 240 }}>
        <label htmlFor="task-search" className="visually-hidden">
          Cari tugas
        </label>
        <input id="task-search" type="search" className="form-control form-control-sm" placeholder="Cari judul atau kode..." value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <MultiFilter label="Status" options={STATUSES.map((s) => ({ value: s, label: STATUS_CONFIG[s].label }))} selected={filters.status} onChange={(status) => onChange({ status })} />
      <MultiFilter label="Prioritas" options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_CONFIG[p].label }))} selected={filters.priority} onChange={(priority) => onChange({ priority })} />
      <MultiFilter label="Penanggung jawab" options={assignees} selected={filters.assignee} onChange={(assignee) => onChange({ assignee })} />
      <MultiFilter label="Deadline" options={DUE_OPTIONS.map((d) => ({ value: d.value, label: d.label }))} selected={filters.due} onChange={(due) => onChange({ due })} />
      {hasActiveFilters(filters) && (
        <button type="button" className="btn btn-sm btn-link" onClick={onClear}>
          Hapus filter
        </button>
      )}
    </div>
  );
}
