import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, resolveTheme, useThemeStore } from './themeStore';
import { useAuthStore } from './authStore';

describe('authStore', () => {
  beforeEach(() => useAuthStore.setState({ status: 'unknown', user: null, accessToken: null, signingKey: null, clockOffsetSeconds: 0 }));
  it('awalnya unknown; setSession -> authenticated dengan token dan kunci; clear -> guest', () => {
    expect(useAuthStore.getState().status).toBe('unknown');
    useAuthStore.getState().setSession({
      access_token: 't', signing_key: 'k', token_type: 'Bearer', expires_in: 900,
      user: { id: '1', name: 'A', email: 'a@x.co', avatar_color: '#000', last_login_at: null, created_at: '' },
    });
    const s = useAuthStore.getState();
    expect([s.status, s.accessToken, s.signingKey, s.user?.name]).toEqual(['authenticated', 't', 'k', 'A']);
    useAuthStore.getState().clear();
    expect([useAuthStore.getState().status, useAuthStore.getState().accessToken, useAuthStore.getState().signingKey]).toEqual(['guest', null, null]);
  });
  it('token dan kunci tidak pernah ditulis ke localStorage/sessionStorage', () => {
    useAuthStore.getState().setSession({
      access_token: 'RAHASIA-TOKEN', signing_key: 'RAHASIA-KUNCI', token_type: 'Bearer', expires_in: 900,
      user: { id: '1', name: 'A', email: 'a@x.co', avatar_color: '#000', last_login_at: null, created_at: '' },
    });
    const dump = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(dump).not.toContain('RAHASIA');
  });
});

describe('themeStore', () => {
  it('resolveTheme: system mengikuti preferensi OS', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
  it('setMode menyimpan pilihan dan memasang data-bs-theme di <html>', () => {
    useThemeStore.getState().setMode('dark');
    expect(localStorage.getItem('mpo.theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
    useThemeStore.getState().setMode('light');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
    applyTheme('light');
  });
});