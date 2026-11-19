// Package sign membuat dan memverifikasi tanda tangan HMAC pada request API.
//
// Tujuan: access token yang bocor (log, proxy, riwayat) saja tidak cukup untuk membuat request baru,
// dan request yang tertangkap tidak bisa diubah (method, path, query, body) maupun diputar ulang.
//
// Kunci tanda tangan TIDAK statis dan tidak tertanam di frontend: ia diturunkan per access token dari
// rahasia server dan "jti" token itu, lalu dikirim ke klien bersama token saat login/refresh.
// Server cukup menurunkan ulang kunci dari jti token yang sudah tervalidasi (tanpa state).
//
// String yang ditandatangani (dipisah baris baru):
//
//	mpo1
//	METHOD
//	PATH            (path ter-escape persis seperti dikirim, tanpa query)
//	CANONICAL_QUERY (pasangan key=value di-encode RFC 3986, diurutkan; kosong bila tanpa query)
//	SHA256_HEX(body) (hash byte body yang dikirim; body kosong = hash string kosong)
//	TIMESTAMP       (detik unix)
//	NONCE
//
// Tanda tangan = hex(HMAC-SHA256(kunci, string di atas)). Implementasi TypeScript di
// frontend/src/utils/signature.ts wajib identik; keduanya diuji dengan vektor yang sama
// (testdata/vectors.json, dihitung dengan Node crypto).
package sign

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/url"
	"sort"
	"strings"
)

// Version adalah awalan versi pada string yang ditandatangani.
const Version = "mpo1"

const keyDomain = "mpo-request-signing-v1"

// DeriveKey menurunkan kunci tanda tangan untuk satu access token (jti). Dua langkah HMAC
// memisahkan penggunaan rahasia JWT agar tidak dipakai langsung untuk keperluan lain.
func DeriveKey(serverSecret, jti string) []byte {
	sub := hmac.New(sha256.New, []byte(serverSecret))
	sub.Write([]byte(keyDomain))
	mac := hmac.New(sha256.New, sub.Sum(nil))
	mac.Write([]byte(jti))
	return mac.Sum(nil)
}

// EncodeKey mengubah kunci ke bentuk base64url (tanpa padding) untuk dikirim ke klien.
func EncodeKey(key []byte) string { return base64.RawURLEncoding.EncodeToString(key) }

// DecodeKey kebalikan EncodeKey.
func DecodeKey(s string) ([]byte, error) { return base64.RawURLEncoding.DecodeString(s) }

// BodyHash adalah SHA-256 (hex) dari byte body.
func BodyHash(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

// CanonicalQuery mengurutkan pasangan query setelah di-encode (RFC 3986), sehingga urutan parameter di
// URL dan perbedaan cara encode (mis. "+" vs "%20") tidak memengaruhi tanda tangan.
func CanonicalQuery(q url.Values) string {
	type pair struct{ k, v string }
	var pairs []pair
	for k, vs := range q {
		for _, v := range vs {
			pairs = append(pairs, pair{pctEncode(k), pctEncode(v)})
		}
	}
	sort.Slice(pairs, func(i, j int) bool {
		if pairs[i].k != pairs[j].k {
			return pairs[i].k < pairs[j].k
		}
		return pairs[i].v < pairs[j].v
	})
	parts := make([]string, len(pairs))
	for i, p := range pairs {
		parts[i] = p.k + "=" + p.v
	}
	return strings.Join(parts, "&")
}

// pctEncode meng-encode semua byte UTF-8 kecuali karakter unreserved RFC 3986 (A-Z a-z 0-9 - . _ ~).
func pctEncode(s string) string {
	const hexUpper = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9', c == '-', c == '.', c == '_', c == '~':
			b.WriteByte(c)
		default:
			b.WriteByte('%')
			b.WriteByte(hexUpper[c>>4])
			b.WriteByte(hexUpper[c&0x0f])
		}
	}
	return b.String()
}

// Canonical menyusun string yang ditandatangani.
func Canonical(method, escapedPath, canonicalQuery, bodyHashHex, timestamp, nonce string) string {
	return strings.Join([]string{Version, strings.ToUpper(method), escapedPath, canonicalQuery, bodyHashHex, timestamp, nonce}, "\n")
}

// Sign menghitung tanda tangan hex.
func Sign(key []byte, canonical string) string {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(canonical))
	return hex.EncodeToString(mac.Sum(nil))
}

// Equal membandingkan dua tanda tangan hex dalam waktu konstan.
func Equal(a, b string) bool { return hmac.Equal([]byte(a), []byte(b)) }
