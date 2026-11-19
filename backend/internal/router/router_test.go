package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/config"
)

func testConfig() *config.Config {
	return &config.Config{
		AppEnv: "development", JWTSecret: strings.Repeat("s", 40), JWTIssuer: "t",
		AccessTTL: time.Minute, RefreshTTL: time.Hour, BcryptCost: 10, Timezone: time.UTC,
		AllowedOrigins: []string{"http://localhost:6969"},
	}
}

func newEngine(t *testing.T, cfg *config.Config) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r, err := New(cfg, nil) // route yang diuji tidak menyentuh database
	if err != nil {
		t.Fatal(err)
	}
	return r
}

// loginAttempts memanggil POST /auth/login (body kosong -> 400 sebelum menyentuh DB) sebanyak n kali
// dari RemoteAddr yang sama dengan X-Forwarded-For berbeda-beda, lalu mengembalikan status terakhir.
func loginAttempts(r *gin.Engine, n int) (statuses []int) {
	for i := 0; i < n; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader("{}"))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "10.0.0.5:4000"
		req.Header.Set("X-Forwarded-For", "203.0.113."+string(rune('1'+i)))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		statuses = append(statuses, w.Code)
	}
	return statuses
}

func TestForwardedForIgnoredByDefault(t *testing.T) {
	// X-Forwarded-For dari klien tak dipercaya: semua request dianggap dari 10.0.0.5, sehingga
	// batas login 5/menit tercapai walau header-nya berganti-ganti (tidak bisa di-spoof).
	got := loginAttempts(newEngine(t, testConfig()), 6)
	if got[4] != http.StatusBadRequest || got[5] != http.StatusTooManyRequests {
		t.Fatalf("rate limit harus tetap berlaku walau X-Forwarded-For berganti: %v", got)
	}
}

func TestForwardedForHonoredFromTrustedProxy(t *testing.T) {
	cfg := testConfig()
	cfg.TrustedProxies = []string{"10.0.0.5"}
	got := loginAttempts(newEngine(t, cfg), 6)
	for i, code := range got {
		if code != http.StatusBadRequest {
			t.Fatalf("dari proxy tepercaya tiap klien (XFF) punya kuota sendiri, request %d = %d: %v", i+1, code, got)
		}
	}
}

func TestInvalidTrustedProxyRejected(t *testing.T) {
	cfg := testConfig()
	cfg.TrustedProxies = []string{"bukan-ip"}
	if _, err := New(cfg, nil); err == nil {
		t.Fatal("trusted proxy tidak valid harus gagal saat membangun router")
	}
}

func TestSecurityAndRequestIDHeadersOnAllResponses(t *testing.T) {
	r := newEngine(t, testConfig())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/tidak-ada", nil))
	if w.Code != http.StatusNotFound || w.Header().Get("X-Request-ID") == "" || w.Header().Get("X-Frame-Options") != "DENY" {
		t.Fatalf("404 pun harus punya X-Request-ID dan header keamanan: %d %v", w.Code, w.Header())
	}
	if w.Header().Get("Strict-Transport-Security") != "" {
		t.Error("HSTS tidak boleh ada di development")
	}
	prod := testConfig()
	prod.AppEnv = "production"
	w = httptest.NewRecorder()
	newEngine(t, prod).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/tidak-ada", nil))
	if w.Header().Get("Strict-Transport-Security") == "" {
		t.Error("HSTS harus ada di production")
	}
}

func TestProtectedRoutesRequireAuthBeforeRateLimit(t *testing.T) {
	cfg := testConfig()
	cfg.APIRateLimit = 3
	r := newEngine(t, cfg)
	for i := 0; i < 10; i++ { // tanpa token selalu 401 (bukan 429): batas hanya untuk user yang sudah login
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/me", nil))
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("request %d tanpa token harus 401, dapat %d", i+1, w.Code)
		}
	}
}
