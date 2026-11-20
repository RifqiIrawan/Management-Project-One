import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { loginSchema, passwordStrength, registerSchema } from '@/schemas/auth.schema';
import { parseError } from './errors';
import { initials } from './format';

describe('initials', () => {
  it('dua kata pertama, huruf besar; nama kosong -> ?', () => {
    expect(initials('Budi Santoso')).toBe('BS');
    expect(initials('budi')).toBe('B');
    expect(initials('  rifqi   irawan  putra ')).toBe('RI');
    expect(initials('')).toBe('?');
  });
});

describe('skema login/register (sama dengan aturan backend)', () => {
  it('login: email dan password wajib', () => {
    expect(loginSchema.safeParse({ email: '', password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'bukan-email', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });
  const base = { name: 'Budi', email: 'b@x.co', password: 'Passw0rd1', confirm_password: 'Passw0rd1' };
  it('register valid', () => expect(registerSchema.safeParse(base).success).toBe(true));
  it('password: min 8, wajib huruf dan angka, maks 72 byte', () => {
    for (const bad of ['short1', 'hanyahuruf', '12345678', 'a1'.repeat(40)]) {
      expect(registerSchema.safeParse({ ...base, password: bad, confirm_password: bad }).success).toBe(false);
    }
  });
  it('konfirmasi harus sama dan galatnya ada di field confirm_password', () => {
    const r = registerSchema.safeParse({ ...base, confirm_password: 'beda1234' });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0]?.path).toEqual(['confirm_password']);
  });
  it('nama minimal 2 karakter', () => expect(registerSchema.safeParse({ ...base, name: 'B' }).success).toBe(false));
  it('passwordStrength naik seiring kompleksitas dan dibatasi 0-4', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abc')).toBe(0);
    expect(passwordStrength('abcd1234')).toBeGreaterThan(passwordStrength('abcdefgh'));
    expect(passwordStrength('Sangat-Kuat-Sekali-123!')).toBe(4);
  });
});

describe('parseError', () => {
  it('memakai pesan dan detail dari server', () => {
    const e = new AxiosError('x', undefined, undefined, undefined, {
      status: 400, statusText: '', headers: {}, config: {} as never,
      data: { success: false, error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid', details: { email: 'Email tidak valid' } } },
    });
    expect(parseError(e)).toEqual({ code: 'VALIDATION_ERROR', message: 'Data tidak valid', details: { email: 'Email tidak valid' } });
  });
  it('jaringan putus -> pesan ramah; error lain -> pesan umum (tanpa membocorkan detail internal)', () => {
    expect(parseError(new AxiosError('Network Error')).code).toBe('NETWORK');
    expect(parseError(new Error('stack rahasia internal')).message).not.toContain('rahasia');
  });
});