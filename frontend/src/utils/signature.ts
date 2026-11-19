// Tanda tangan request (HMAC-SHA256). Wajib identik dengan backend/internal/pkg/sign/sign.go;
// keduanya diuji dengan vektor yang sama (backend/internal/pkg/sign/testdata/vectors.json).
//
// Memakai @noble/hashes (sinkron, tanpa WebCrypto) agar jalan juga di HTTP non-secure (mis. IP LAN)
// dan bisa dipanggil langsung dari interceptor Axios.
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const SIGNATURE_VERSION = 'mpo1';

export interface SignatureHeaders {
  'X-Timestamp': string;
  'X-Nonce': string;
  'X-Signature': string;
}

/** Meng-encode semua byte UTF-8 kecuali karakter unreserved RFC 3986 (A-Z a-z 0-9 - . _ ~). */
export function pctEncode(s: string): string {
  let out = '';
  for (const b of utf8ToBytes(s)) {
    const unreserved =
      (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a) || (b >= 0x30 && b <= 0x39) || b === 0x2d || b === 0x2e || b === 0x5f || b === 0x7e;
    out += unreserved ? String.fromCharCode(b) : '%' + b.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}

/** Query kanonik: pasangan di-encode lalu diurutkan (ordinal, ASCII setelah encode) dan digabung dengan "&". */
export function canonicalQuery(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const pairs = [...params.entries()].map(([k, v]) => [pctEncode(k), pctEncode(v)] as const);
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return pairs.map(([k, v]) => `${k}=${v}`).join('&');
}

/** SHA-256 (hex) dari byte UTF-8 body. Body kosong = hash string kosong. */
export function bodyHash(body: string): string {
  return bytesToHex(sha256(utf8ToBytes(body)));
}

/** Mendecode kunci base64url (tanpa padding) menjadi byte. */
export function decodeKey(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Nonce acak 32 karakter hex (128 bit). */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export interface CanonicalParts {
  method: string;
  path: string; // path ter-escape persis seperti dikirim, tanpa query
  query: string; // query kanonik
  body: string;
  timestamp: string;
  nonce: string;
}

export function canonicalString(p: CanonicalParts): string {
  return [SIGNATURE_VERSION, p.method.toUpperCase(), p.path, p.query, bodyHash(p.body), p.timestamp, p.nonce].join('\n');
}

export function sign(key: Uint8Array, canonical: string): string {
  return bytesToHex(hmac(sha256, key, utf8ToBytes(canonical)));
}

export interface SignOptions {
  method: string;
  /** URL absolut atau relatif (mis. "http://localhost:6990/api/v1/projects?q=a" atau "/api/v1/me"). */
  url: string;
  /** Body persis seperti yang dikirim (string JSON). Kosong bila tanpa body. */
  body?: string;
  /** signing_key dari login/refresh (base64url). */
  key: string;
  /** Detik unix; default jam sekarang + offset. */
  timestamp?: number;
  nonce?: string;
  /** Selisih detik (server - klien) hasil sinkronisasi header Date. */
  clockOffsetSeconds?: number;
}

/** Menghasilkan header X-Timestamp, X-Nonce, X-Signature untuk satu request. */
export function signRequest(o: SignOptions): SignatureHeaders {
  const u = new URL(o.url, 'http://placeholder.invalid');
  const timestamp = String(o.timestamp ?? Math.floor(Date.now() / 1000) + Math.round(o.clockOffsetSeconds ?? 0));
  const nonce = o.nonce ?? newNonce();
  const canonical = canonicalString({
    method: o.method,
    path: u.pathname,
    query: canonicalQuery(u.search),
    body: o.body ?? '',
    timestamp,
    nonce,
  });
  return { 'X-Timestamp': timestamp, 'X-Nonce': nonce, 'X-Signature': sign(decodeKey(o.key), canonical) };
}