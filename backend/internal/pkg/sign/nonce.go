package sign

import (
	"sync"
	"time"
)

// NonceCache mencegah pemutaran ulang request: setiap (kunci, nonce) hanya boleh dipakai sekali
// dalam masa berlaku ttl. Disimpan di memori (satu instance); beberapa instance butuh penyimpanan bersama.
//
// Hanya request yang tanda tangannya sudah terverifikasi yang boleh memakai nonce, sehingga penyerang
// tanpa kunci tidak bisa memenuhi cache.
type NonceCache struct {
	mu   sync.Mutex
	seen map[string]time.Time
	ttl  time.Duration
	max  int
}

// NewNonceCache membuat cache dengan masa simpan ttl dan kapasitas maksimum max entri.
func NewNonceCache(ttl time.Duration, max int) *NonceCache {
	return &NonceCache{seen: make(map[string]time.Time), ttl: ttl, max: max}
}

// Use menandai key sebagai terpakai. Mengembalikan false bila sudah pernah dipakai (replay) atau
// cache penuh (gagal aman: request ditolak).
func (c *NonceCache) Use(key string, now time.Time) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if exp, ok := c.seen[key]; ok && now.Before(exp) {
		return false
	}
	if len(c.seen) >= c.max {
		c.purge(now)
		if len(c.seen) >= c.max {
			return false
		}
	}
	c.seen[key] = now.Add(c.ttl)
	return true
}

func (c *NonceCache) purge(now time.Time) {
	for k, exp := range c.seen {
		if !now.Before(exp) {
			delete(c.seen, k)
		}
	}
}

// Len jumlah entri tersimpan (untuk tes).
func (c *NonceCache) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.seen)
}
