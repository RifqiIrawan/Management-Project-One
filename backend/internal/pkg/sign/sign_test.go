package sign

import (
	"encoding/json"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

type vectorFile struct {
	KeyBase64URL string `json:"keyBase64Url"`
	Cases        []struct {
		Name           string `json:"name"`
		Method         string `json:"method"`
		Path           string `json:"path"`
		Query          string `json:"query"`
		Body           string `json:"body"`
		TS             string `json:"ts"`
		Nonce          string `json:"nonce"`
		CanonicalQuery string `json:"canonicalQuery"`
		BodyHash       string `json:"bodyHash"`
		Canonical      string `json:"canonical"`
		Signature      string `json:"signature"`
	} `json:"cases"`
}

// Vektor dihitung dengan Node crypto (independen dari implementasi ini). Implementasi TypeScript
// di frontend memakai file yang sama, jadi keduanya terbukti kompatibel.
func TestVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var vf vectorFile
	if err := json.Unmarshal(raw, &vf); err != nil {
		t.Fatal(err)
	}
	key, err := DecodeKey(vf.KeyBase64URL)
	if err != nil || len(key) != 32 {
		t.Fatalf("kunci vektor tidak valid: %v", err)
	}
	if len(vf.Cases) < 8 {
		t.Fatalf("vektor terlalu sedikit: %d", len(vf.Cases))
	}
	for _, c := range vf.Cases {
		t.Run(c.Name, func(t *testing.T) {
			q, err := url.ParseQuery(c.Query)
			if err != nil {
				t.Fatal(err)
			}
			if got := CanonicalQuery(q); got != c.CanonicalQuery {
				t.Errorf("CanonicalQuery = %q, harapan %q", got, c.CanonicalQuery)
			}
			if got := BodyHash([]byte(c.Body)); got != c.BodyHash {
				t.Errorf("BodyHash = %s, harapan %s", got, c.BodyHash)
			}
			canon := Canonical(c.Method, c.Path, CanonicalQuery(q), BodyHash([]byte(c.Body)), c.TS, c.Nonce)
			if canon != c.Canonical {
				t.Errorf("Canonical salah:\n got  %q\n want %q", canon, c.Canonical)
			}
			if got := Sign(key, canon); got != c.Signature {
				t.Errorf("Sign = %s, harapan %s", got, c.Signature)
			}
		})
	}
}

func TestDeriveKeyProperties(t *testing.T) {
	a := DeriveKey("rahasia-server", "jti-1")
	if len(a) != 32 {
		t.Fatalf("panjang kunci = %d", len(a))
	}
	if string(a) != string(DeriveKey("rahasia-server", "jti-1")) {
		t.Error("harus deterministik (server menurunkan ulang tanpa state)")
	}
	if string(a) == string(DeriveKey("rahasia-server", "jti-2")) {
		t.Error("jti berbeda harus menghasilkan kunci berbeda")
	}
	if string(a) == string(DeriveKey("rahasia-lain", "jti-1")) {
		t.Error("rahasia berbeda harus menghasilkan kunci berbeda")
	}
	// domain separation: kunci turunan tidak boleh sama dengan HMAC langsung memakai rahasia JWT
	direct := Sign([]byte("rahasia-server"), "jti-1")
	if EncodeKey(a) == direct {
		t.Error("kunci tidak boleh identik dengan HMAC langsung dari rahasia")
	}
}

func TestKeyEncodingRoundTrip(t *testing.T) {
	k := DeriveKey("s", "j")
	enc := EncodeKey(k)
	if strings.ContainsAny(enc, "+/=") {
		t.Errorf("base64url tanpa padding: %q", enc)
	}
	dec, err := DecodeKey(enc)
	if err != nil || string(dec) != string(k) {
		t.Fatalf("round trip gagal: %v", err)
	}
	if _, err := DecodeKey("***bukan-base64***"); err == nil {
		t.Error("input tidak valid harus error")
	}
}

func TestCanonicalQueryEquivalences(t *testing.T) {
	parse := func(s string) string {
		q, err := url.ParseQuery(s)
		if err != nil {
			t.Fatal(err)
		}
		return CanonicalQuery(q)
	}
	if parse("a=1&b=2") != parse("b=2&a=1") {
		t.Error("urutan parameter tidak boleh memengaruhi")
	}
	if parse("q=a+b") != parse("q=a%20b") {
		t.Error("'+' dan '%20' harus setara")
	}
	if parse("a=1&a=2") == parse("a=2") {
		t.Error("nilai duplikat harus tetap terhitung")
	}
	if parse("a=1&a=2") != parse("a=2&a=1") {
		t.Error("urutan nilai duplikat diurutkan")
	}
	if parse("a=%e2%9c%93") != parse("a=%E2%9C%93") {
		t.Error("huruf besar/kecil heksadesimal tidak boleh memengaruhi")
	}
	if parse("") != "" {
		t.Error("tanpa query harus string kosong")
	}
}

func TestSignatureDetectsTampering(t *testing.T) {
	key := DeriveKey("s", "j")
	base := func(method, path, query, body, ts, nonce string) string {
		q, _ := url.ParseQuery(query)
		return Sign(key, Canonical(method, path, CanonicalQuery(q), BodyHash([]byte(body)), ts, nonce))
	}
	orig := base("POST", "/api/v1/x", "a=1", `{"k":1}`, "100", "nonce-aaaaaaaa")
	mutants := map[string]string{
		"method": base("PUT", "/api/v1/x", "a=1", `{"k":1}`, "100", "nonce-aaaaaaaa"),
		"path":   base("POST", "/api/v1/y", "a=1", `{"k":1}`, "100", "nonce-aaaaaaaa"),
		"query":  base("POST", "/api/v1/x", "a=2", `{"k":1}`, "100", "nonce-aaaaaaaa"),
		"body":   base("POST", "/api/v1/x", "a=1", `{"k":2}`, "100", "nonce-aaaaaaaa"),
		"waktu":  base("POST", "/api/v1/x", "a=1", `{"k":1}`, "101", "nonce-aaaaaaaa"),
		"nonce":  base("POST", "/api/v1/x", "a=1", `{"k":1}`, "100", "nonce-bbbbbbbb"),
	}
	for name, sig := range mutants {
		if Equal(orig, sig) {
			t.Errorf("perubahan %s harus mengubah tanda tangan", name)
		}
	}
	if !Equal(orig, base("post", "/api/v1/x", "a=1", `{"k":1}`, "100", "nonce-aaaaaaaa")) {
		t.Error("method tidak peka huruf besar/kecil")
	}
	if Equal("abc", "abcd") || !Equal("abc", "abc") {
		t.Error("Equal salah")
	}
}

func TestNonceCache(t *testing.T) {
	now := time.Unix(1000, 0)
	c := NewNonceCache(time.Minute, 3)
	if !c.Use("a", now) || c.Use("a", now.Add(time.Second)) {
		t.Fatal("nonce hanya boleh dipakai sekali dalam masa berlaku")
	}
	if !c.Use("a", now.Add(2*time.Minute)) {
		t.Fatal("setelah kedaluwarsa nonce boleh dipakai lagi")
	}
	c = NewNonceCache(time.Minute, 2)
	if !c.Use("x", now) || !c.Use("y", now) {
		t.Fatal("dua entri pertama harus lolos")
	}
	if c.Use("z", now) {
		t.Fatal("cache penuh dan belum ada yang kedaluwarsa: tolak (gagal aman)")
	}
	if !c.Use("z", now.Add(2*time.Minute)) || c.Len() != 1 {
		t.Fatalf("entri kedaluwarsa harus dibersihkan saat penuh (len=%d)", c.Len())
	}
}
