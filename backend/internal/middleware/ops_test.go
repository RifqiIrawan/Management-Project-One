package middleware

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
)

func init() { gin.SetMode(gin.TestMode) }

func TestKeyLimiterBurstThenReject(t *testing.T) {
	l := NewKeyLimiter(5)
	defer l.Stop()
	for i := 0; i < 5; i++ {
		if ok, _ := l.Allow("a"); !ok {
			t.Fatalf("request ke-%d dalam burst harus lolos", i+1)
		}
	}
	ok, wait := l.Allow("a")
	if ok || wait <= 0 || wait > 13*time.Second {
		t.Fatalf("request ke-6 harus ditolak dengan Retry-After ≤ 12 dtk (60/5), dapat ok=%v wait=%v", ok, wait)
	}
	// ditolak berulang tidak boleh "memajukan" waktu tunggu (token yang ditolak dikembalikan)
	_, wait2 := l.Allow("a")
	for i := 0; i < 50; i++ {
		_, wait2 = l.Allow("a")
	}
	if wait2 > wait+time.Second {
		t.Fatalf("waktu tunggu tidak boleh membengkak akibat penolakan berulang: %v -> %v", wait, wait2)
	}
	if ok, _ := l.Allow("b"); !ok {
		t.Fatal("kunci lain tidak boleh terpengaruh")
	}
}

func TestKeyLimiterGuardsZero(t *testing.T) {
	l := NewKeyLimiter(0) // tidak boleh panik (pembagian nol)
	defer l.Stop()
	if ok, _ := l.Allow("x"); !ok {
		t.Fatal("request pertama harus lolos")
	}
}

func TestUserMiddlewareRejectsWithHeaders(t *testing.T) {
	l := NewKeyLimiter(2)
	defer l.Stop()
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set(userKey, &model.User{ID: "user-1"}); c.Next() }, l.UserMiddleware())
	r.GET("/x", func(c *gin.Context) { c.String(200, "ok") })

	do := func() *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", "/x", nil))
		return w
	}
	if do().Code != 200 || do().Code != 200 {
		t.Fatal("2 request pertama harus lolos")
	}
	w := do()
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("request ke-3 harus 429, dapat %d", w.Code)
	}
	if secs, err := strconv.Atoi(w.Header().Get("Retry-After")); err != nil || secs < 1 || secs > 30 {
		t.Errorf("Retry-After harus angka detik 1..30, dapat %q", w.Header().Get("Retry-After"))
	}
	if w.Header().Get("X-RateLimit-Limit") != "2" {
		t.Errorf("X-RateLimit-Limit salah: %q", w.Header().Get("X-RateLimit-Limit"))
	}
	var body struct {
		Success bool `json:"success"`
		Error   struct{ Code string }
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body.Success || body.Error.Code != "TOO_MANY_REQUESTS" {
		t.Errorf("body error standar salah: %s", w.Body.String())
	}
}

func TestUserMiddlewareIsPerUser(t *testing.T) {
	l := NewKeyLimiter(1)
	defer l.Stop()
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set(userKey, &model.User{ID: c.GetHeader("X-User")}); c.Next() }, l.UserMiddleware())
	r.GET("/x", func(c *gin.Context) { c.Status(200) })
	hit := func(user string) int {
		req := httptest.NewRequest("GET", "/x", nil)
		req.Header.Set("X-User", user)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}
	if hit("u1") != 200 || hit("u1") != 429 || hit("u2") != 200 {
		t.Fatal("batas harus terpisah per user")
	}
}

// ---- AccessLog ----

func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(old) })
	return &buf
}

func TestAccessLogRequestID(t *testing.T) {
	captureLogs(t)
	r := gin.New()
	r.Use(AccessLog())
	r.GET("/x", func(c *gin.Context) { c.String(200, RequestID(c)) })

	get := func(id string) (*httptest.ResponseRecorder, string) {
		req := httptest.NewRequest("GET", "/x", nil)
		if id != "" {
			req.Header["X-Request-Id"] = []string{id}
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w, w.Header().Get("X-Request-ID")
	}
	if w, id := get(""); len(id) != 16 || w.Body.String() != id {
		t.Errorf("tanpa header: harus dibuat ID 16 hex dan tersedia di handler: %q %q", id, w.Body.String())
	}
	if _, id := get("abc-12345.XYZ_6"); id != "abc-12345.XYZ_6" {
		t.Errorf("ID aman dari client harus dipakai: %q", id)
	}
	for _, bad := range []string{"pendek", "ada spasi di sini", "inject\r\nSet-Cookie: x=1", strings.Repeat("a", 65), "<script>alert(1)</script>"} {
		if _, id := get(bad); id == bad || len(id) != 16 {
			t.Errorf("ID tidak aman %q harus diganti, dapat %q", bad, id)
		}
	}
}

func TestAccessLogRecordsRouteNotRawPathOrQuery(t *testing.T) {
	buf := captureLogs(t)
	r := gin.New()
	r.Use(AccessLog())
	r.GET("/projects/:id", func(c *gin.Context) { c.Status(404) })
	req := httptest.NewRequest("GET", "/projects/4f1c9a52-8d3e-4b6a-9c11-0a1b2c3d4e5f?email=rahasia@example.com", nil)
	r.ServeHTTP(httptest.NewRecorder(), req)

	line := buf.String()
	for _, secret := range []string{"4f1c9a52", "rahasia@example.com", "email="} {
		if strings.Contains(line, secret) {
			t.Fatalf("log tidak boleh memuat %q: %s", secret, line)
		}
	}
	var rec map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(line)), &rec); err != nil {
		t.Fatalf("log harus JSON valid: %v: %s", err, line)
	}
	if rec["route"] != "/projects/:id" || rec["status"] != float64(404) || rec["level"] != "WARN" || rec["method"] != "GET" || rec["request_id"] == "" {
		t.Errorf("isi log salah: %v", rec)
	}
}

func TestAccessLogLevels(t *testing.T) {
	buf := captureLogs(t)
	r := gin.New()
	r.Use(AccessLog())
	r.GET("/ok", func(c *gin.Context) { c.Status(200) })
	r.GET("/boom", func(c *gin.Context) { c.Status(500) })
	for _, p := range []string{"/ok", "/boom"} {
		r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", p, nil))
	}
	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	if len(lines) != 2 || !strings.Contains(lines[0], `"level":"INFO"`) || !strings.Contains(lines[1], `"level":"ERROR"`) {
		t.Fatalf("2xx harus INFO dan 5xx ERROR: %v", lines)
	}
}

func TestAccessLogIncludesUserID(t *testing.T) {
	buf := captureLogs(t)
	r := gin.New()
	r.Use(AccessLog())
	r.GET("/me", func(c *gin.Context) { c.Set(userKey, &model.User{ID: "user-77"}); c.Status(200) })
	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/me", nil))
	if !strings.Contains(buf.String(), `"user_id":"user-77"`) {
		t.Fatalf("user_id harus tercatat: %s", buf.String())
	}
}

// ---- Security ----

func TestSecurityHSTSOnlyWhenEnabled(t *testing.T) {
	for _, hsts := range []bool{false, true} {
		r := gin.New()
		r.Use(Security(hsts))
		r.GET("/x", func(c *gin.Context) { c.Status(200) })
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", "/x", nil))
		got := w.Header().Get("Strict-Transport-Security")
		if hsts && !strings.Contains(got, "max-age=31536000") {
			t.Errorf("HSTS harus ada di produksi: %q", got)
		}
		if !hsts && got != "" {
			t.Errorf("HSTS tidak boleh ada di development: %q", got)
		}
		if w.Header().Get("X-Frame-Options") != "DENY" || w.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Error("header keamanan dasar harus selalu ada")
		}
	}
}
