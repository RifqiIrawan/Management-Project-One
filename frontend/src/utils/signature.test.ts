import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bodyHash, canonicalQuery, canonicalString, decodeKey, newNonce, pctEncode, sign, signRequest } from './signature';

interface VectorCase {
  name: string;
  method: string;
  path: string;
  query: string;
  body: string;
  ts: string;
  nonce: string;
  canonicalQuery: string;
  bodyHash: string;
  canonical: string;
  signature: string;
}
// Vektor yang SAMA dengan yang dipakai tes Go dan skrip PowerShell (dihitung dengan Node crypto).
const vectors = JSON.parse(
  readFileSync(resolve(process.cwd(), '..', 'backend', 'internal', 'pkg', 'sign', 'testdata', 'vectors.json'), 'utf8').replace(/^\uFEFF/, ''),
) as { keyBase64Url: string; cases: VectorCase[] };

describe('vektor bersama dengan backend (Go) dan PowerShell', () => {
  it('memuat minimal 8 vektor dan kunci 32 byte', () => {
    expect(vectors.cases.length).toBeGreaterThanOrEqual(8);
    expect(decodeKey(vectors.keyBase64Url)).toHaveLength(32);
  });

  for (const c of vectors.cases) {
    it(c.name, () => {
      const key = decodeKey(vectors.keyBase64Url);
      expect(canonicalQuery(c.query)).toBe(c.canonicalQuery);
      expect(bodyHash(c.body)).toBe(c.bodyHash);
      const canonical = canonicalString({
        method: c.method, path: c.path, query: canonicalQuery(c.query), body: c.body, timestamp: c.ts, nonce: c.nonce,
      });
      expect(canonical).toBe(c.canonical);
      expect(sign(key, canonical)).toBe(c.signature);
      // jalur lengkap lewat URL, seperti yang dipakai interceptor
      const h = signRequest({
        method: c.method, url: `http://localhost:6990${c.path}${c.query ? '?' + c.query : ''}`, body: c.body,
        key: vectors.keyBase64Url, timestamp: Number(c.ts), nonce: c.nonce,
      });
      expect(h['X-Signature']).toBe(c.signature);
      expect(h['X-Timestamp']).toBe(c.ts);
      expect(h['X-Nonce']).toBe(c.nonce);
    });
  }
});

describe('pctEncode', () => {
  it('menjaga karakter unreserved dan meng-encode sisanya (UTF-8, huruf besar)', () => {
    expect(pctEncode('Az09-._~')).toBe('Az09-._~');
    expect(pctEncode('a b')).toBe('a%20b');
    expect(pctEncode('a+b/c?d=e&f')).toBe('a%2Bb%2Fc%3Fd%3De%26f');
    expect(pctEncode('✓')).toBe('%E2%9C%93');
    expect(pctEncode('🚀')).toBe('%F0%9F%9A%80');
  });
});

describe('canonicalQuery', () => {
  it('tidak terpengaruh urutan, "+" vs "%20", dan huruf besar/kecil heksadesimal', () => {
    expect(canonicalQuery('b=2&a=1')).toBe(canonicalQuery('a=1&b=2'));
    expect(canonicalQuery('q=a+b')).toBe(canonicalQuery('q=a%20b'));
    expect(canonicalQuery('a=%e2%9c%93')).toBe(canonicalQuery('a=%E2%9C%93'));
    expect(canonicalQuery('?a=1')).toBe('a=1');
    expect(canonicalQuery('')).toBe('');
  });
  it('mempertahankan nilai duplikat dan mengurutkannya', () => {
    expect(canonicalQuery('a=2&a=1')).toBe('a=1&a=2');
    expect(canonicalQuery('a=1&a=2')).not.toBe(canonicalQuery('a=2'));
  });
  it('mengurutkan setelah encode (ordinal), bukan sebelum', () => {
    expect(canonicalQuery('a-b=1&a=2')).toBe('a=2&a-b=1');
  });
});

describe('signRequest', () => {
  const key = vectors.keyBase64Url;
  it('menghasilkan nonce acak berbeda dan timestamp dari jam + offset', () => {
    const a = signRequest({ method: 'GET', url: '/api/v1/me', key, timestamp: 100 });
    const b = signRequest({ method: 'GET', url: '/api/v1/me', key, timestamp: 100 });
    expect(a['X-Nonce']).not.toBe(b['X-Nonce']);
    expect(a['X-Signature']).not.toBe(b['X-Signature']);
    expect(newNonce()).toMatch(/^[0-9a-f]{32}$/);
    const nowSec = Math.floor(Date.now() / 1000);
    const shifted = Number(signRequest({ method: 'GET', url: '/api/v1/me', key, clockOffsetSeconds: 120 })['X-Timestamp']);
    expect(shifted - nowSec).toBeGreaterThanOrEqual(119);
    expect(shifted - nowSec).toBeLessThanOrEqual(122);
  });
  it('setiap bagian request memengaruhi tanda tangan', () => {
    const base = { method: 'POST', url: '/api/v1/x?a=1', body: '{"k":1}', key, timestamp: 100, nonce: 'nonce-aaaaaaaaaaaa' };
    const sig = (o: Partial<typeof base>) => signRequest({ ...base, ...o })['X-Signature'];
    const orig = sig({});
    for (const mut of [{ method: 'PUT' }, { url: '/api/v1/y?a=1' }, { url: '/api/v1/x?a=2' }, { body: '{"k":2}' }, { timestamp: 101 }, { nonce: 'nonce-bbbbbbbbbbbb' }]) {
      expect(sig(mut)).not.toBe(orig);
    }
    expect(sig({ method: 'post' })).toBe(orig); // method tidak peka huruf besar/kecil
  });
  it('tanda tangan berupa 64 karakter hex huruf kecil', () => {
    expect(signRequest({ method: 'GET', url: '/api/v1/me', key })['X-Signature']).toMatch(/^[0-9a-f]{64}$/);
  });
});