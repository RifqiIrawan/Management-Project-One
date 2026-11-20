// Kerangka pemuatan (skeleton): menjaga tata letak stabil dan terasa lebih cepat daripada spinner.
// Setiap kelompok punya role="status" + teks tersembunyi agar pembaca layar tahu sedang memuat.
import type { CSSProperties } from 'react';

export function Bone({ w = '100%', h = 14, r = 8, className = '' }: { w?: number | string; h?: number | string; r?: number; className?: string }) {
  const style: CSSProperties = { width: w, height: h, borderRadius: r };
  return <span className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

function Wrap({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" className={className}>
      <span className="visually-hidden">{label}</span>
      {children}
    </div>
  );
}

/** Daftar baris (tabel/list). */
export function SkeletonRows({ rows = 6, label = 'Memuat...' }: { rows?: number; label?: string }) {
  return (
    <Wrap label={label} className="panel d-grid gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="d-flex align-items-center gap-3">
          <Bone w={22} h={22} r={6} />
          <div className="flex-grow-1 d-grid gap-2">
            <Bone w={`${55 + ((i * 13) % 35)}%`} h={14} />
            <Bone w={`${25 + ((i * 7) % 20)}%`} h={10} />
          </div>
          <Bone w={64} h={22} r={999} />
        </div>
      ))}
    </Wrap>
  );
}

/** Grid kartu (daftar proyek). */
export function SkeletonCards({ count = 6, label = 'Memuat...' }: { count?: number; label?: string }) {
  return (
    <Wrap label={label} className="project-grid">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card overflow-hidden">
          <Bone h={64} r={0} />
          <div className="p-3 d-grid gap-2">
            <Bone w="60%" h={16} />
            <Bone w="90%" h={12} />
            <Bone h={8} r={999} />
          </div>
        </div>
      ))}
    </Wrap>
  );
}

/** Papan Kanban 4 kolom. */
export function SkeletonBoard({ label = 'Memuat tugas...' }: { label?: string }) {
  return (
    <Wrap label={label} className="kanban">
      {[3, 2, 2, 1].map((n, c) => (
        <div key={c} className="kanban-column">
          <div className="kanban-head">
            <Bone w={90} h={14} />
          </div>
          <div className="kanban-body d-grid gap-2">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="card p-3 d-grid gap-2">
                <Bone w="50%" h={14} r={999} />
                <Bone w="85%" h={14} />
                <Bone w="30%" h={10} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </Wrap>
  );
}

/** Dashboard: 4 kartu angka + dua panel. */
export function SkeletonDashboard({ label = 'Memuat dashboard...' }: { label?: string }) {
  return (
    <Wrap label={label} className="d-grid gap-3">
      <div className="stat-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="stat-card">
            <Bone w="50%" h={12} />
            <Bone w="35%" h={30} />
          </div>
        ))}
      </div>
      <div className="d-flex flex-wrap gap-3">
        <div className="panel d-grid gap-3" style={{ flex: '2 1 520px' }}>
          <Bone w={140} h={18} />
          {[0, 1, 2].map((i) => (
            <div key={i} className="d-flex align-items-center gap-3">
              <Bone w={36} h={36} r={9} />
              <Bone w="40%" h={14} />
              <Bone w="25%" h={8} r={999} className="ms-auto" />
            </div>
          ))}
        </div>
        <div className="panel d-grid gap-3" style={{ flex: '1 1 300px' }}>
          <Bone w={120} h={18} />
          {[0, 1, 2].map((i) => (
            <Bone key={i} h={40} />
          ))}
        </div>
      </div>
    </Wrap>
  );
}

/** Cadangan umum untuk halaman yang dimuat malas (lazy). */
export function SkeletonPage({ label = 'Memuat halaman...' }: { label?: string }) {
  return (
    <Wrap label={label} className="d-grid gap-3">
      <Bone w={220} h={30} />
      <Bone h={110} r={16} />
      <Bone h={220} r={16} />
    </Wrap>
  );
}
