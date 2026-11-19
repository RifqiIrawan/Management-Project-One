package middleware

import (
	"math"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/response"
)

type visitor struct {
	lim  *rate.Limiter
	seen time.Time
}

// KeyLimiter membatasi request per kunci (IP atau user id) dengan token bucket di memori:
// perMinute request per menit, burst sebesar perMinute. Cocok untuk satu instance; untuk
// beberapa instance perlu penyimpanan bersama (mis. Redis).
type KeyLimiter struct {
	mu        sync.Mutex
	visitors  map[string]*visitor
	limit     rate.Limit
	burst     int
	perMinute int
	stop      chan struct{}
	stopOnce  sync.Once
}

func NewKeyLimiter(perMinute int) *KeyLimiter {
	if perMinute < 1 {
		perMinute = 1
	}
	l := &KeyLimiter{
		visitors:  make(map[string]*visitor),
		limit:     rate.Every(time.Minute / time.Duration(perMinute)),
		burst:     perMinute,
		perMinute: perMinute,
		stop:      make(chan struct{}),
	}
	go l.cleanup()
	return l
}

// NewIPLimiter mengizinkan perMinute request per menit per IP.
func NewIPLimiter(perMinute int) *KeyLimiter { return NewKeyLimiter(perMinute) }

// Allow menggunakan satu token untuk key. Bila habis, mengembalikan false dan berapa lama lagi
// sampai satu request boleh lewat (untuk header Retry-After).
func (l *KeyLimiter) Allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	v, ok := l.visitors[key]
	if !ok {
		v = &visitor{lim: rate.NewLimiter(l.limit, l.burst)}
		l.visitors[key] = v
	}
	v.seen = time.Now()
	res := v.lim.Reserve()
	if !res.OK() {
		return false, time.Minute
	}
	if d := res.Delay(); d > 0 {
		res.Cancel() // jangan "meminjam" token dari masa depan
		return false, d
	}
	return true, 0
}

func (l *KeyLimiter) cleanup() {
	t := time.NewTicker(5 * time.Minute)
	defer t.Stop()
	for {
		select {
		case <-l.stop:
			return
		case <-t.C:
			l.mu.Lock()
			for k, v := range l.visitors {
				if time.Since(v.seen) > 10*time.Minute {
					delete(l.visitors, k)
				}
			}
			l.mu.Unlock()
		}
	}
}

// Stop menghentikan goroutine pembersih (dipakai di tes).
func (l *KeyLimiter) Stop() { l.stopOnce.Do(func() { close(l.stop) }) }

func (l *KeyLimiter) reject(c *gin.Context, retryAfter time.Duration) {
	secs := int(math.Ceil(retryAfter.Seconds()))
	if secs < 1 {
		secs = 1
	}
	c.Header("Retry-After", strconv.Itoa(secs))
	c.Header("X-RateLimit-Limit", strconv.Itoa(l.perMinute))
	response.Err(c, apperror.ErrTooMany)
}

// Middleware membatasi per IP klien (untuk endpoint publik: login, register).
func (l *KeyLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if ok, d := l.Allow(c.ClientIP()); !ok {
			l.reject(c, d)
			return
		}
		c.Next()
	}
}

// UserMiddleware membatasi per user yang sudah login. Pasang SETELAH middleware Auth.
func (l *KeyLimiter) UserMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if ok, d := l.Allow(CurrentUser(c).ID); !ok {
			l.reject(c, d)
			return
		}
		c.Next()
	}
}
