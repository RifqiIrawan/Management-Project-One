package middleware

import (
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

// IPLimiter membatasi request per IP (token bucket, di memori).
type IPLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	limit    rate.Limit
	burst    int
}

// NewIPLimiter mengizinkan perMinute request per menit per IP.
func NewIPLimiter(perMinute int) *IPLimiter {
	l := &IPLimiter{
		visitors: make(map[string]*visitor),
		limit:    rate.Every(time.Minute / time.Duration(perMinute)),
		burst:    perMinute,
	}
	go l.cleanup()
	return l
}

func (l *IPLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	v, ok := l.visitors[ip]
	if !ok {
		v = &visitor{lim: rate.NewLimiter(l.limit, l.burst)}
		l.visitors[ip] = v
	}
	v.seen = time.Now()
	return v.lim.Allow()
}

func (l *IPLimiter) cleanup() {
	for range time.Tick(5 * time.Minute) {
		l.mu.Lock()
		for ip, v := range l.visitors {
			if time.Since(v.seen) > 10*time.Minute {
				delete(l.visitors, ip)
			}
		}
		l.mu.Unlock()
	}
}

func (l *IPLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !l.allow(c.ClientIP()) {
			response.Err(c, apperror.ErrTooMany)
			return
		}
		c.Next()
	}
}
