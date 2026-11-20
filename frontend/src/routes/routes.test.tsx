import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/axios';
import { useAuthStore } from '@/store/authStore';
import type { Auth } from '@/types/api';
import { routes } from './index';

const user = { id: 'u1', name: 'Budi Santoso', email: 'b@x.co', avatar_color: '#6366F1', last_login_at: null, created_at: '2026-01-01T00:00:00Z' };
const auth: Auth = { access_token: 'tok', signing_key: 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA', token_type: 'Bearer', expires_in: 900, user };
const ok = (data: unknown) => [200, { success: true, data }] as [number, unknown];

let mock: MockAdapter;
const setStatus = (status: 'unknown' | 'guest' | 'authenticated') =>
  useAuthStore.setState({ status, user: status === 'authenticated' ? user : null, accessToken: status === 'authenticated' ? 'tok' : null, signingKey: status === 'authenticated' ? auth.signing_key : null });

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  mock = new MockAdapter(api);
});
afterEach(() => mock.restore());

describe('route guard', () => {
  it('belum login: / diarahkan ke /login dan halaman asal diingat', async () => {
    setStatus('guest');
    const router = renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Masuk' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect((router.state.location.state as { from?: string }).from).toBe('/');
  });
  it('sesi belum dipulihkan (unknown): tampil spinner, BUKAN halaman login (tidak berkedip)', () => {
    setStatus('unknown');
    renderAt('/');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Masuk' })).not.toBeInTheDocument();
  });
  it('sudah login: /login diarahkan ke dashboard dengan sapaan dan nama', async () => {
    setStatus('authenticated');
    renderAt('/login');
    expect(await screen.findByRole('heading', { name: /Budi Santoso/ })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navigasi utama' })).toBeInTheDocument();
  });
  it('route tidak dikenal: halaman 404 di dalam kerangka aplikasi', async () => {
    setStatus('authenticated');
    renderAt('/tidak-ada');
    expect(await screen.findByText('Halaman tidak ditemukan.')).toBeInTheDocument();
  });
});

describe('halaman login', () => {
  beforeEach(() => setStatus('guest'));

  it('input kosong: pesan validasi per field dan API tidak dipanggil', async () => {
    renderAt('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Masuk' }));
    expect(await screen.findByText('Email wajib diisi')).toBeInTheDocument();
    expect(screen.getByText('Password wajib diisi')).toBeInTheDocument();
    expect(mock.history['post']).toHaveLength(0);
  });

  it('login berhasil: sesi tersimpan di store dan masuk ke dashboard', async () => {
    mock.onPost('/auth/login').reply(() => ok(auth));
    const router = renderAt('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'b@x.co');
    await userEvent.type(screen.getByLabelText('Password'), 'Passw0rd1');
    await userEvent.click(screen.getByRole('button', { name: 'Masuk' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(useAuthStore.getState().accessToken).toBe('tok');
    expect(useAuthStore.getState().signingKey).toBe(auth.signing_key);
    expect(JSON.parse(mock.history['post']?.[0]?.data as string)).toEqual({ email: 'b@x.co', password: 'Passw0rd1' });
  });

  it('kembali ke halaman asal setelah login', async () => {
    mock.onPost('/auth/login').reply(() => ok(auth));
    const router = createMemoryRouter(routes, { initialEntries: [{ pathname: '/login', state: { from: '/tidak-ada' } }] });
    render(<RouterProvider router={router} />);
    await userEvent.type(await screen.findByLabelText('Email'), 'b@x.co');
    await userEvent.type(screen.getByLabelText('Password'), 'Passw0rd1');
    await userEvent.click(screen.getByRole('button', { name: 'Masuk' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/tidak-ada'));
  });

  it('kredensial salah: pesan umum dari server ditampilkan, tetap di halaman login, sesi kosong', async () => {
    mock.onPost('/auth/login').reply(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Email atau password salah' } });
    const router = renderAt('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'b@x.co');
    await userEvent.type(screen.getByLabelText('Password'), 'SalahBanget1');
    await userEvent.click(screen.getByRole('button', { name: 'Masuk' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email atau password salah');
    expect(router.state.location.pathname).toBe('/login');
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('galat validasi dari server dipetakan ke field-nya', async () => {
    mock.onPost('/auth/login').reply(400, { success: false, error: { code: 'VALIDATION_ERROR', message: 'Data yang dikirim tidak valid', details: { email: 'Email tidak valid dari server' } } });
    renderAt('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'b@x.co');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Masuk' }));
    expect(await screen.findByText('Email tidak valid dari server')).toBeInTheDocument();
  });

  it('tombol kirim nonaktif saat memproses (cegah klik ganda) dan password bisa ditampilkan', async () => {
    let release: () => void = () => undefined;
    mock.onPost('/auth/login').reply(() => new Promise((res) => { release = () => res(ok(auth)); }));
    renderAt('/login');
    const pw = await screen.findByLabelText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Tampilkan password' }));
    expect(pw).toHaveAttribute('type', 'text');
    await userEvent.type(screen.getByLabelText('Email'), 'b@x.co');
    await userEvent.type(pw, 'Passw0rd1');
    await userEvent.click(screen.getByRole('button', { name: 'Masuk' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Masuk' })).toBeDisabled());
    release();
  });
});

describe('halaman daftar', () => {
  beforeEach(() => setStatus('guest'));
  const fill = async (over: Partial<Record<'Nama' | 'Email' | 'Password' | 'Konfirmasi password', string>> = {}) => {
    const v = { Nama: 'Budi', Email: 'b@x.co', Password: 'Passw0rd1', 'Konfirmasi password': 'Passw0rd1', ...over };
    for (const [label, value] of Object.entries(v)) await userEvent.type(await screen.findByLabelText(label), value);
  };

  it('konfirmasi password berbeda: pesan galat dan tidak memanggil API', async () => {
    renderAt('/register');
    await fill({ 'Konfirmasi password': 'Beda12345' });
    await userEvent.click(screen.getByRole('button', { name: 'Daftar' }));
    expect(await screen.findByText('Konfirmasi password tidak sama')).toBeInTheDocument();
    expect(mock.history['post']).toHaveLength(0);
  });

  it('indikator kekuatan password muncul dan berubah', async () => {
    renderAt('/register');
    await userEvent.type(await screen.findByLabelText('Password'), 'abc');
    expect(screen.getByText(/Kekuatan: Sangat lemah/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Password'));
    await userEvent.type(screen.getByLabelText('Password'), 'Sangat-Kuat-Sekali-123!');
    expect(screen.getByText(/Kekuatan: Sangat kuat/)).toBeInTheDocument();
  });

  it('daftar berhasil: register lalu login otomatis dan masuk dashboard', async () => {
    mock.onPost('/auth/register').reply(201, { success: true, data: user });
    mock.onPost('/auth/login').reply(() => ok(auth));
    const router = renderAt('/register');
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Daftar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(mock.history['post']?.map((r) => r.url)).toEqual(['/auth/register', '/auth/login']);
  });

  it('email sudah terdaftar (409): galat di field email, bukan banner umum', async () => {
    mock.onPost('/auth/register').reply(409, { success: false, error: { code: 'CONFLICT', message: 'Email sudah terdaftar' } });
    renderAt('/register');
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Daftar' }));
    expect(await screen.findByText('Email sudah terdaftar')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('keluar', () => {
  it('menu pengguna: Keluar memanggil /auth/logout, mengosongkan sesi, dan kembali ke login', async () => {
    setStatus('authenticated');
    mock.onPost('/auth/logout').reply(200, { success: true });
    const router = renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Menu pengguna' }));
    await userEvent.click(await screen.findByText('Keluar'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(useAuthStore.getState().status).toBe('guest');
    expect(useAuthStore.getState().signingKey).toBeNull();
    expect(mock.history['post']?.[0]?.url).toBe('/auth/logout');
  });
});