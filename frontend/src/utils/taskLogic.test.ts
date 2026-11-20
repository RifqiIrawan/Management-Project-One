import { describe, expect, it } from 'vitest';
import { parseLabels, validateLabels } from '@/schemas/task.schema';
import type { Task } from '@/types/api';
import { applyPlan, computePosition, filtersFromSearch, filtersToParams, moveInColumns, nextSort, planMove, POSITION_STEP, type Columns } from './taskLogic';

const t = (id: string, status: Task['status'], position: number): Task =>
  ({ id, code: id.toUpperCase(), status, position, title: id, labels: [], priority: 'medium', comment_count: 0, assignee: null, due_date: null, start_date: null }) as unknown as Task;

const cols = (): Columns => ({
  todo: [t('a', 'todo', 1000), t('b', 'todo', 2000), t('c', 'todo', 3000)],
  in_progress: [t('d', 'in_progress', 500)],
  in_review: [],
  done: [],
});
const ids = (c: Columns, s: keyof Columns) => c[s].map((x) => x.id);

describe('computePosition', () => {
  it('kolom kosong: tanpa posisi (backend menaruh di atas)', () => expect(computePosition(undefined, undefined)).toBeUndefined());
  it('paling atas: di bawah tetangga pertama; paling bawah: di atas tetangga terakhir', () => {
    expect(computePosition(undefined, 1000)).toBe(1000 - POSITION_STEP);
    expect(computePosition(3000, undefined)).toBe(3000 + POSITION_STEP);
  });
  it('di antara dua kartu: titik tengah desimal, tanpa menulis ulang kartu lain', () => {
    expect(computePosition(1000, 2000)).toBe(1500);
    expect(computePosition(1, 2)).toBe(1.5);
  });
});

describe('moveInColumns', () => {
  it('dalam kolom: turun (A di atas C) dan naik (C di atas A) mengikuti arrayMove', () => {
    expect(ids(moveInColumns(cols(), 'a', 'c'), 'todo')).toEqual(['b', 'c', 'a']);
    expect(ids(moveInColumns(cols(), 'c', 'a'), 'todo')).toEqual(['c', 'a', 'b']);
    expect(ids(moveInColumns(cols(), 'a', 'b'), 'todo')).toEqual(['b', 'a', 'c']);
  });
  it('antar kolom: masuk sebelum kartu sasaran dan status kartu ikut berubah', () => {
    const r = moveInColumns(cols(), 'b', 'd');
    expect(ids(r, 'todo')).toEqual(['a', 'c']);
    expect(ids(r, 'in_progress')).toEqual(['b', 'd']);
    expect(r.in_progress[0]?.status).toBe('in_progress');
  });
  it('dijatuhkan di kolom (kosong atau area kosong): masuk ke akhir kolom', () => {
    const r = moveInColumns(cols(), 'a', 'done');
    expect(ids(r, 'done')).toEqual(['a']);
    expect(ids(moveInColumns(cols(), 'a', 'in_progress'), 'in_progress')).toEqual(['d', 'a']);
  });
  it('id tak dikenal: tidak mengubah apa pun, dan tidak mengubah objek asli', () => {
    const c = cols();
    expect(moveInColumns(c, 'zzz', 'a')).toBe(c);
    moveInColumns(c, 'a', 'done');
    expect(ids(c, 'todo')).toEqual(['a', 'b', 'c']);
  });
});

describe('planMove', () => {
  it('menghitung status dan posisi dari tetangga di kolom hasil', () => {
    expect(planMove(moveInColumns(cols(), 'c', 'b'), 'c')).toEqual({ status: 'todo', position: 1500 }); // di antara a(1000) dan b(2000)
    expect(planMove(moveInColumns(cols(), 'c', 'a'), 'c')).toEqual({ status: 'todo', position: 1000 - POSITION_STEP });
    expect(planMove(moveInColumns(cols(), 'a', 'c'), 'a')).toEqual({ status: 'todo', position: 3000 + POSITION_STEP });
  });
  it('kolom kosong: hanya status (tanpa position)', () => expect(planMove(moveInColumns(cols(), 'a', 'done'), 'a')).toEqual({ status: 'done' }));
  it('applyPlan menuliskan posisi baru pada kartu', () => {
    const next = moveInColumns(cols(), 'c', 'b');
    const plan = planMove(next, 'c');
    expect(plan && applyPlan(next, 'c', plan).todo.find((x) => x.id === 'c')?.position).toBe(1500);
  });
});

describe('filter URL', () => {
  it('membaca dan menulis parameter; filter kosong tidak dikirim', () => {
    const f = filtersFromSearch(new URLSearchParams('q=login&status=todo,in_progress&assignee=me,none&due=week&sort=-priority&page=3'));
    expect(f).toEqual({ q: 'login', status: ['todo', 'in_progress'], priority: [], assignee: ['me', 'none'], due: ['week'], sort: '-priority', page: 3 });
    expect(filtersToParams(f)).toEqual({ q: 'login', status: 'todo,in_progress', assignee: 'me,none', due: 'week', sort: '-priority' });
    expect(filtersToParams(filtersFromSearch(new URLSearchParams()))).toEqual({});
  });
  it('halaman tidak valid menjadi 1; q hanya spasi tidak dikirim', () => {
    expect(filtersFromSearch(new URLSearchParams('page=abc')).page).toBe(1);
    expect(filtersFromSearch(new URLSearchParams('page=-2')).page).toBe(1);
    expect(filtersToParams({ ...filtersFromSearch(new URLSearchParams()), q: '   ' })).toEqual({});
  });
  it('nextSort: menaik -> menurun -> default', () => {
    expect(nextSort('', 'title')).toBe('title');
    expect(nextSort('title', 'title')).toBe('-title');
    expect(nextSort('-title', 'title')).toBe('');
    expect(nextSort('code', 'title')).toBe('title');
  });
});

describe('label', () => {
  it('dipangkas, tanpa kosong dan tanpa duplikat (tak beda huruf besar/kecil)', () => {
    expect(parseLabels(' bug , Bug,, frontend ,')).toEqual(['bug', 'frontend']);
    expect(parseLabels('')).toEqual([]);
  });
  it('maks 5 label dan 30 karakter', () => {
    expect(validateLabels(['1', '2', '3', '4', '5', '6'])).toMatch(/5 label/);
    expect(validateLabels(['x'.repeat(31)])).toMatch(/30 karakter/);
    expect(validateLabels(['a', 'b'])).toBeNull();
  });
});
