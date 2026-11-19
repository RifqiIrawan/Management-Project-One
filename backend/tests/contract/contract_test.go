// Package contract adalah tes kontrak: menjalankan alur nyata terhadap server yang sedang berjalan dan
// memvalidasi SETIAP respons (body, status, header) terhadap docs/openapi.yaml. Dokumen API ditulis
// tangan, jadi tes ini yang menjaganya tetap sesuai perilaku sebenarnya.
//
// Opt-in (butuh server + database). Jalankan server pada instance BARU (batas login/register 5/menit/IP
// dihitung per proses) dengan batas API umum dimatikan, lalu:
//
//	API_RATE_LIMIT_PER_MIN=0 go run ./cmd/api
//	CONTRACT_BASE_URL=http://localhost:6990 go test ./tests/contract/ -v -count=1
package contract

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers"
	"github.com/getkin/kin-openapi/routers/legacy"

	"github.com/RifqiIrawan/Management-Project-One/backend/docs"
)

type api struct {
	t       *testing.T
	base    string
	router  routers.Router
	covered map[string]bool
}

type result struct {
	Status int
	Header http.Header
	Raw    []byte
	JSON   map[string]any
}

// data mengembalikan objek "data" respons.
func (r result) data() map[string]any {
	d, _ := r.JSON["data"].(map[string]any)
	return d
}

func (r result) list() []any {
	d, _ := r.JSON["data"].([]any)
	return d
}

func (r result) str(key string) string {
	s, _ := r.data()[key].(string)
	return s
}

func newAPI(t *testing.T, base string) *api {
	t.Helper()
	doc, err := openapi3.NewLoader().LoadFromData(docs.OpenAPI)
	if err != nil {
		t.Fatalf("openapi.yaml: %v", err)
	}
	if err := doc.Validate(context.Background()); err != nil {
		t.Fatalf("openapi.yaml tidak valid: %v", err)
	}
	doc.Servers = openapi3.Servers{{URL: base + "/api/v1"}}
	rt, err := legacy.NewRouter(doc)
	if err != nil {
		t.Fatalf("router spesifikasi: %v", err)
	}
	return &api{t: t, base: base, router: rt, covered: map[string]bool{}}
}

func (a *api) newRequest(method, path string, body any, token, cookie string) *http.Request {
	var rd io.Reader
	if body != nil {
		switch b := body.(type) {
		case string:
			rd = strings.NewReader(b)
		default:
			raw, _ := json.Marshal(b)
			rd = bytes.NewReader(raw)
		}
	}
	req, err := http.NewRequest(method, a.base+"/api/v1"+path, rd)
	if err != nil {
		a.t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: "refresh_token", Value: cookie})
	}
	return req
}

// do mengirim request, lalu memastikan (1) request sesuai spesifikasi bila validReq, (2) respons sesuai
// spesifikasi termasuk bahwa status tersebut terdokumentasi, dan (3) status sama dengan want.
func (a *api) do(want int, method, path string, body any, token, cookie string, validReq bool) result {
	a.t.Helper()
	req := a.newRequest(method, path, body, token, cookie)
	route, params, err := a.router.FindRoute(a.newRequest(method, path, nil, "", ""))
	if err != nil {
		a.t.Fatalf("%s %s: tidak ada di openapi.yaml: %v", method, path, err)
	}
	a.covered[method+" "+route.Path] = true

	if validReq {
		in := &openapi3filter.RequestValidationInput{
			Request: a.newRequest(method, path, body, token, cookie), PathParams: params, Route: route,
			Options: &openapi3filter.Options{AuthenticationFunc: openapi3filter.NoopAuthenticationFunc},
		}
		if err := openapi3filter.ValidateRequest(context.Background(), in); err != nil {
			a.t.Errorf("%s %s: REQUEST tidak sesuai openapi.yaml: %v", method, path, err)
		}
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		a.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	rin := &openapi3filter.RequestValidationInput{
		Request: a.newRequest(method, path, nil, "", ""), PathParams: params, Route: route,
		Options: &openapi3filter.Options{AuthenticationFunc: openapi3filter.NoopAuthenticationFunc},
	}
	out := &openapi3filter.ResponseValidationInput{
		RequestValidationInput: rin, Status: resp.StatusCode, Header: resp.Header,
		Options: &openapi3filter.Options{IncludeResponseStatus: true},
	}
	out.SetBodyBytes(raw)
	if err := openapi3filter.ValidateResponse(context.Background(), out); err != nil {
		a.t.Errorf("%s %s -> %d: RESPONS tidak sesuai openapi.yaml: %v\n  body: %.400s", method, path, resp.StatusCode, err, raw)
	}
	if resp.StatusCode != want {
		a.t.Errorf("%s %s: status %d, harapan %d\n  body: %.300s", method, path, resp.StatusCode, want, raw)
	}
	var js map[string]any
	_ = json.Unmarshal(raw, &js)
	return result{Status: resp.StatusCode, Header: resp.Header, Raw: raw, JSON: js}
}

func (a *api) ok(want int, method, path string, body any, token string) result {
	a.t.Helper()
	return a.do(want, method, path, body, token, "", true)
}

// bad: request sengaja salah (tidak divalidasi terhadap spesifikasi), responsnya tetap divalidasi.
func (a *api) bad(want int, method, path string, body any, token string) result {
	a.t.Helper()
	return a.do(want, method, path, body, token, "", false)
}

func refreshCookie(r result) string {
	for _, c := range (&http.Response{Header: r.Header}).Cookies() {
		if c.Name == "refresh_token" {
			return c.Value
		}
	}
	return ""
}

type user struct{ email, id, token, cookie string }

func (a *api) newUser(label string) user {
	a.t.Helper()
	email := fmt.Sprintf("%s_%d@example.com", label, rand.Int63())
	reg := a.ok(201, "POST", "/auth/register", map[string]any{
		"name": "Contract " + label, "email": email, "password": "Passw0rdContract1", "confirm_password": "Passw0rdContract1",
	}, "")
	login := a.ok(200, "POST", "/auth/login", map[string]any{"email": email, "password": "Passw0rdContract1"}, "")
	return user{email: email, id: reg.str("id"), token: login.data()["access_token"].(string), cookie: refreshCookie(login)}
}

func randKey() string {
	b := make([]byte, 4)
	for i := range b {
		b[i] = byte('A' + rand.Intn(26))
	}
	return string(b)
}

func TestAPIConformsToOpenAPI(t *testing.T) {
	base := strings.TrimRight(os.Getenv("CONTRACT_BASE_URL"), "/")
	if base == "" {
		t.Skip("CONTRACT_BASE_URL tidak diisi; tes kontrak dilewati (butuh server berjalan)")
	}
	rand.New(rand.NewSource(time.Now().UnixNano()))
	a := newAPI(t, base)
	today := time.Now().UTC().Format("2006-01-02")

	// ---------------------------------------------------------- sistem
	a.ok(200, "GET", "/health", nil, "")

	// ---------------------------------------------------------- auth (5 register, 5 login = batas limiter)
	A := a.newUser("owner")                              // register 1, login 1
	B := a.newUser("member")                             // register 2, login 2
	C := a.newUser("other")                              // register 3, login 3
	a.bad(409, "POST", "/auth/register", map[string]any{ // register 4
		"name": "Dup", "email": A.email, "password": "Passw0rdContract1", "confirm_password": "Passw0rdContract1"}, "")
	a.bad(400, "POST", "/auth/register", map[string]any{"name": "x"}, "")                               // register 5
	a.bad(401, "POST", "/auth/login", map[string]any{"email": A.email, "password": "SalahBanget1"}, "") // login 4

	ref := a.do(200, "POST", "/auth/refresh", nil, "", A.cookie, true)
	A.token, A.cookie = ref.data()["access_token"].(string), refreshCookie(ref)
	a.bad(401, "POST", "/auth/refresh", nil, "")
	a.do(200, "POST", "/auth/logout", nil, "", A.cookie, true)
	relog := a.ok(200, "POST", "/auth/login", map[string]any{"email": A.email, "password": "Passw0rdContract1"}, "") // login 5
	A.token, A.cookie = relog.data()["access_token"].(string), refreshCookie(relog)
	r429 := a.bad(429, "POST", "/auth/login", map[string]any{"email": A.email, "password": "x"}, "") // login 6 -> dibatasi
	if r429.Header.Get("Retry-After") == "" {
		t.Error("429 harus menyertakan Retry-After")
	}

	// ---------------------------------------------------------- profil
	a.ok(200, "GET", "/me", nil, A.token)
	a.bad(401, "GET", "/me", nil, "")
	a.ok(200, "PATCH", "/me", map[string]any{"name": "Owner Baru", "avatar_color": "#FF0000"}, A.token)
	a.bad(400, "PATCH", "/me", map[string]any{"avatar_color": "merah"}, A.token)
	a.bad(400, "PATCH", "/me/password", map[string]any{"current_password": "salah", "new_password": "Passw0rdBaru2", "confirm_password": "Passw0rdBaru2"}, A.token)
	pw := a.ok(200, "PATCH", "/me/password", map[string]any{"current_password": "Passw0rdContract1", "new_password": "Passw0rdBaru2", "confirm_password": "Passw0rdBaru2"}, A.token)
	A.token = pw.data()["access_token"].(string)
	a.ok(200, "GET", "/users/search?email="+strings.Split(B.email, "_")[0], nil, A.token)
	a.bad(400, "GET", "/users/search?email=ab", nil, A.token)

	// ---------------------------------------------------------- proyek
	key := randKey()
	proj := a.ok(201, "POST", "/projects", map[string]any{"name": "Proyek Kontrak", "key": key, "description": "Uji", "color": "#123456", "icon": "🚀"}, A.token)
	P := proj.str("id")
	a.bad(409, "POST", "/projects", map[string]any{"name": "Dup", "key": key}, B.token)
	a.bad(400, "POST", "/projects", map[string]any{"name": "X", "key": "1"}, A.token)
	a.ok(200, "GET", "/projects", nil, A.token)
	a.ok(200, "GET", "/projects?q=kontrak&archived=false", nil, A.token)
	a.ok(200, "GET", "/projects/"+P, nil, A.token)
	a.bad(404, "GET", "/projects/"+P, nil, C.token)
	a.bad(404, "GET", "/projects/abc", nil, A.token)
	a.ok(200, "PATCH", "/projects/"+P, map[string]any{"name": "Proyek Kontrak 2", "description": ""}, A.token)
	a.ok(200, "POST", "/projects/"+P+"/favorite", nil, A.token)

	// ---------------------------------------------------------- anggota
	a.ok(201, "POST", "/projects/"+P+"/members", map[string]any{"email": B.email}, A.token)
	a.bad(409, "POST", "/projects/"+P+"/members", map[string]any{"email": B.email}, A.token)
	a.bad(403, "POST", "/projects/"+P+"/members", map[string]any{"email": C.email}, B.token)
	a.ok(200, "GET", "/projects/"+P+"/members", nil, B.token)
	a.bad(400, "PATCH", "/projects/"+P+"/members/"+A.id, map[string]any{"role": "member"}, A.token) // owner terakhir
	a.bad(403, "PATCH", "/projects/"+P+"/members/"+B.id, map[string]any{"role": "owner"}, B.token)
	a.ok(200, "PATCH", "/projects/"+P+"/members/"+B.id, map[string]any{"role": "owner"}, A.token)
	a.ok(200, "PATCH", "/projects/"+P+"/members/"+B.id, map[string]any{"role": "member"}, A.token)
	a.bad(403, "PATCH", "/projects/"+P, map[string]any{"name": "Hack"}, B.token)

	// ---------------------------------------------------------- tugas
	task := a.ok(201, "POST", "/projects/"+P+"/tasks", map[string]any{
		"title": "Tugas kontrak", "description": "Deskripsi", "priority": "high", "assignee_id": B.id,
		"start_date": today, "due_date": today, "labels": []string{"api", "kontrak"}}, A.token)
	T := task.str("id")
	a.bad(400, "POST", "/projects/"+P+"/tasks", map[string]any{"title": ""}, A.token)
	a.bad(404, "POST", "/projects/"+P+"/tasks", map[string]any{"title": "x"}, C.token)
	task2 := a.ok(201, "POST", "/projects/"+P+"/tasks", map[string]any{"title": "Tugas tanpa assignee"}, A.token)
	T2 := task2.str("id")
	a.ok(200, "GET", "/projects/"+P+"/tasks", nil, A.token)
	a.ok(200, "GET", "/projects/"+P+"/tasks?q=kontrak&status=todo,in_progress&priority=high&assignee=me,none&due=today,none&sort=priority,-due_date&page=1&per_page=10", nil, A.token)
	a.ok(200, "GET", "/projects/"+P+"/tasks?view=board", nil, A.token)
	a.bad(400, "GET", "/projects/"+P+"/tasks?status=salah", nil, A.token)
	a.ok(200, "GET", "/tasks/"+T, nil, B.token)
	a.bad(404, "GET", "/tasks/"+T, nil, C.token)
	a.ok(200, "PATCH", "/tasks/"+T, map[string]any{"title": "Tugas kontrak v2", "status": "in_progress"}, B.token)
	a.ok(200, "PATCH", "/tasks/"+T, map[string]any{"description": nil, "due_date": nil, "assignee_id": nil}, A.token)
	a.bad(400, "PATCH", "/tasks/"+T, map[string]any{}, A.token)
	a.ok(200, "PATCH", "/tasks/"+T+"/move", map[string]any{"status": "in_review", "position": 1.5}, A.token)
	a.ok(200, "PATCH", "/tasks/"+T+"/move", map[string]any{"status": "done"}, A.token)
	a.bad(400, "PATCH", "/tasks/"+T+"/move", map[string]any{"status": "x"}, A.token)
	a.ok(200, "PATCH", "/tasks/"+T2, map[string]any{"assignee_id": A.id, "due_date": today}, A.token)
	a.ok(200, "GET", "/me/tasks", nil, A.token)
	a.ok(200, "GET", "/me/tasks?group=due&include_done=true", nil, A.token)
	a.bad(400, "GET", "/me/tasks?group=minggu", nil, A.token)

	// ---------------------------------------------------------- komentar & aktivitas
	cm := a.ok(201, "POST", "/tasks/"+T+"/comments", map[string]any{"body": "Halo **tim**"}, B.token)
	CM := cm.str("id")
	a.bad(400, "POST", "/tasks/"+T+"/comments", map[string]any{"body": "  "}, B.token)
	a.ok(200, "GET", "/tasks/"+T+"/comments", nil, A.token)
	a.ok(200, "GET", "/tasks/"+T+"/comments?page=1&per_page=5", nil, A.token)
	a.ok(200, "PATCH", "/comments/"+CM, map[string]any{"body": "Halo, diedit"}, B.token)
	a.bad(403, "PATCH", "/comments/"+CM, map[string]any{"body": "disusupi"}, A.token)
	a.ok(200, "GET", "/tasks/"+T+"/activities", nil, A.token)
	a.ok(200, "GET", "/tasks/"+T+"/activities?per_page=2&page=2", nil, A.token)
	a.ok(200, "GET", "/projects/"+P+"/activities", nil, B.token)
	a.bad(400, "GET", "/projects/"+P+"/activities?per_page=500", nil, A.token)
	a.ok(200, "DELETE", "/comments/"+CM, nil, A.token) // owner memoderasi

	// ---------------------------------------------------------- dashboard
	dash := a.ok(200, "GET", "/dashboard", nil, A.token)
	if dash.data()["stats"] == nil {
		t.Error("dashboard harus memuat stats")
	}

	// ---------------------------------------------------------- arsip, hapus, keluar
	a.ok(200, "POST", "/projects/"+P+"/archive", map[string]any{"archived": true}, A.token)
	a.bad(400, "POST", "/tasks/"+T+"/comments", map[string]any{"body": "x"}, B.token) // read-only saat terarsip
	a.ok(200, "POST", "/projects/"+P+"/archive", map[string]any{"archived": false}, A.token)
	a.bad(403, "DELETE", "/tasks/"+T2, nil, B.token) // B bukan pembuat dan bukan owner
	a.ok(200, "DELETE", "/tasks/"+T2, nil, A.token)
	a.ok(200, "DELETE", "/projects/"+P+"/members/"+B.id, nil, A.token)
	a.bad(400, "DELETE", "/projects/"+P, map[string]any{"confirm_name": "salah"}, A.token)
	a.ok(200, "DELETE", "/projects/"+P, map[string]any{"confirm_name": "Proyek Kontrak 2"}, A.token)

	// ---------------------------------------------------------- logout all
	a.ok(200, "POST", "/auth/logout-all", nil, A.token)

	// ---------------------------------------------------------- setiap operasi di dokumen harus pernah dijalankan
	doc, _ := openapi3.NewLoader().LoadFromData(docs.OpenAPI)
	var missing []string
	for path, item := range doc.Paths.Map() {
		for method := range item.Operations() {
			if !a.covered[method+" "+path] {
				missing = append(missing, method+" "+path)
			}
		}
	}
	sort.Strings(missing)
	if len(missing) > 0 {
		t.Errorf("operasi di openapi.yaml yang belum dijalankan tes kontrak:\n  %s", strings.Join(missing, "\n  "))
	}
	t.Logf("operasi terdokumentasi yang divalidasi: %d", len(a.covered))
}
