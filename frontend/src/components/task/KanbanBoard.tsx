import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { moveTask, tk, type Params } from '@/api/tasks.api';
import type { Board, Task, TaskStatus } from '@/types/api';
import { STATUS_CONFIG, STATUSES } from '@/utils/constants';
import { parseError } from '@/utils/errors';
import { ensureWhiteText } from '@/utils/color';
import { applyPlan, columnsFromBoard, findColumn, moveInColumns, planMove, type Columns } from '@/utils/taskLogic';
import TaskCard, { TaskCardBody } from './TaskCard';

interface Props {
  projectId: string;
  board: Board;
  params: Params;
  readOnly: boolean;
  filtered: boolean;
  onOpen: (task: Task) => void;
  onAdd: (status: TaskStatus) => void;
}

function Column({ status, tasks, readOnly, filtered, onOpen, onAdd }: { status: TaskStatus; tasks: Task[]; readOnly: boolean; filtered: boolean; onOpen: (t: Task) => void; onAdd: (s: TaskStatus) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const c = STATUS_CONFIG[status];
  return (
    <section className={`kanban-column${isOver ? ' is-over' : ''}`} style={{ '--col': ensureWhiteText(c.fill) } as React.CSSProperties} aria-label={`Kolom ${c.label}`}>
      <header className="kanban-head">
        <h3>{c.label}</h3>
        <span className="col-count" aria-label={`${tasks.length} tugas`}>
          {tasks.length}
        </span>
        {!readOnly && (
          <button type="button" className="kanban-head-add" aria-label={`Tambah tugas di ${c.label}`} onClick={() => onAdd(status)}>
            <i className="bi bi-plus-lg" aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="kanban-body">
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="list-unstyled d-grid gap-2 kanban-drop" aria-label={`Tugas ${c.label}`}>
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} onOpen={onOpen} disabled={readOnly} />
          ))}
          {tasks.length === 0 && <li className="kanban-empty small text-secondary text-center py-3">{filtered ? 'Tidak ada yang cocok' : 'Kosong'}</li>}
        </ul>
      </SortableContext>
      {!readOnly && (
        <button type="button" className="add-task-btn mt-2" onClick={() => onAdd(status)}>
          <i className="bi bi-plus-lg" aria-hidden="true" />
          Tambah tugas
        </button>
      )}
      </div>
    </section>
  );
}

export default function KanbanBoard({ projectId, board, params, readOnly, filtered, onOpen, onAdd }: Props) {
  const qc = useQueryClient();
  const [cols, setCols] = useState<Columns>(() => columnsFromBoard(board));
  const [active, setActive] = useState<Task | null>(null);
  const boardKey = tk.board(projectId, params);

  // sinkron dengan server selama tidak sedang drag
  useEffect(() => {
    if (!active) setCols(columnsFromBoard(board));
  }, [board, active]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const move = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: { status: TaskStatus; position?: number } }) => moveTask(id, plan),
    onError: (e) => toast.error(parseError(e).message),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: tk.tasks(projectId) });
      void qc.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });

  function onDragStart(e: DragStartEvent) {
    const s = findColumn(cols, String(e.active.id));
    setActive(s ? (cols[s].find((t) => t.id === e.active.id) ?? null) : null);
  }

  function onDragOver(e: DragOverEvent) {
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    const activeId = String(e.active.id);
    // antar-kolom saja di sini; urutan dalam kolom yang sama diselesaikan saat dilepas
    if (findColumn(cols, activeId) !== (STATUSES.includes(overId as TaskStatus) ? overId : findColumn(cols, overId))) setCols((c) => moveInColumns(c, activeId, overId));
  }

  function onDragEnd(e: DragEndEvent) {
    setActive(null);
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    const before = columnsFromBoard(board);
    let next = cols;
    if (overId && overId !== activeId) next = moveInColumns(cols, activeId, overId);
    const plan = planMove(next, activeId);
    if (!plan) return setCols(before);
    const original = findColumn(before, activeId);
    const samePlace = original === plan.status && before[plan.status].findIndex((t) => t.id === activeId) === next[plan.status].findIndex((t) => t.id === activeId);
    if (samePlace) return setCols(before);
    const applied = applyPlan(next, activeId, plan);
    setCols(applied);
    // tampilan langsung berubah (optimistis); server memutuskan, gagal -> dimuat ulang dari server
    qc.setQueryData<Board>(boardKey, { todo: applied.todo, in_progress: applied.in_progress, in_review: applied.in_review, done: applied.done });
    move.mutate({ id: activeId, plan });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setActive(null), setCols(columnsFromBoard(board)))}>
      <div className="kanban" role="group" aria-label="Board tugas">
        {STATUSES.map((s) => (
          <Column key={s} status={s} tasks={cols[s]} readOnly={readOnly} filtered={filtered} onOpen={onOpen} onAdd={onAdd} />
        ))}
      </div>
      <DragOverlay>
        {active ? (
          <div className="card task-card is-overlay">
            <div className="card-body p-3">
              <TaskCardBody task={active} />
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
