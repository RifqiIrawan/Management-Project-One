package router

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"

	"github.com/RifqiIrawan/Management-Project-One/backend/docs"
)

func loadSpec(t *testing.T) *openapi3.T {
	t.Helper()
	doc, err := openapi3.NewLoader().LoadFromData(docs.OpenAPI)
	if err != nil {
		t.Fatalf("openapi.yaml tidak bisa dibaca: %v", err)
	}
	if err := doc.Validate(context.Background()); err != nil {
		t.Fatalf("openapi.yaml tidak valid: %v", err)
	}
	return doc
}

// ginToOpenAPI mengubah "/api/v1/projects/:projectId" menjadi "/projects/{projectId}".
func ginToOpenAPI(path string) string {
	path = strings.TrimPrefix(path, "/api/v1")
	parts := strings.Split(path, "/")
	for i, p := range parts {
		if strings.HasPrefix(p, ":") {
			parts[i] = "{" + p[1:] + "}"
		}
	}
	return strings.Join(parts, "/")
}

func TestOpenAPISpecIsValid(t *testing.T) { loadSpec(t) }

// Setiap route API harus terdokumentasi, dan setiap operasi di dokumen harus punya route nyata.
func TestOpenAPIMatchesRoutes(t *testing.T) {
	doc := loadSpec(t)

	documented := map[string]bool{}
	for path, item := range doc.Paths.Map() {
		for method := range item.Operations() {
			documented[method+" "+path] = true
		}
	}

	actual := map[string]bool{}
	for _, rt := range newEngine(t, testConfig()).Routes() {
		if !strings.HasPrefix(rt.Path, "/api/v1") {
			continue
		}
		actual[rt.Method+" "+ginToOpenAPI(rt.Path)] = true
	}

	var missingDoc, staleDoc []string
	for k := range actual {
		if !documented[k] {
			missingDoc = append(missingDoc, k)
		}
	}
	for k := range documented {
		if !actual[k] {
			staleDoc = append(staleDoc, k)
		}
	}
	sort.Strings(missingDoc)
	sort.Strings(staleDoc)
	if len(missingDoc) > 0 {
		t.Errorf("route ada tetapi belum terdokumentasi di openapi.yaml:\n  %s", strings.Join(missingDoc, "\n  "))
	}
	if len(staleDoc) > 0 {
		t.Errorf("openapi.yaml mendokumentasikan operasi yang tidak ada di router:\n  %s", strings.Join(staleDoc, "\n  "))
	}
	if len(actual) < 30 {
		t.Errorf("jumlah route mencurigakan sedikit (%d); pembacaan route gagal?", len(actual))
	}
}

// Setiap operasi wajib punya operationId unik, ringkasan, dan minimal satu respons sukses.
func TestOpenAPIOperationsAreComplete(t *testing.T) {
	doc := loadSpec(t)
	seen := map[string]string{}
	for path, item := range doc.Paths.Map() {
		for method, op := range item.Operations() {
			id := method + " " + path
			if op.OperationID == "" || op.Summary == "" {
				t.Errorf("%s: operationId dan summary wajib", id)
			}
			if prev, dup := seen[op.OperationID]; dup {
				t.Errorf("operationId %q ganda: %s dan %s", op.OperationID, prev, id)
			}
			seen[op.OperationID] = id
			ok := false
			for code := range op.Responses.Map() {
				if strings.HasPrefix(code, "2") {
					ok = true
				}
			}
			if !ok {
				t.Errorf("%s: tidak ada respons 2xx", id)
			}
			if len(op.Tags) == 0 {
				t.Errorf("%s: tag wajib", id)
			}
		}
	}
}

func TestSwaggerRoutesEnabledByDefaultInDev(t *testing.T) {
	r := newEngine(t, testConfig()) // testConfig tidak mengaktifkan Swagger
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/openapi.yaml", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("Swagger nonaktif harus 404, dapat %d", w.Code)
	}

	cfg := testConfig()
	cfg.SwaggerEnabled = true
	r = newEngine(t, cfg)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/openapi.yaml", nil))
	if w.Code != http.StatusOK || !strings.HasPrefix(w.Body.String(), "openapi: 3.0.3") {
		t.Fatalf("spesifikasi harus disajikan: %d %.40s", w.Code, w.Body.String())
	}
	for _, p := range []string{"/api/docs", "/api/docs/"} {
		w = httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, p, nil))
		if w.Code != http.StatusFound || w.Header().Get("Location") != "/api/docs/index.html" {
			t.Errorf("%s harus mengarah ke UI: %d %q", p, w.Code, w.Header().Get("Location"))
		}
	}
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/docs/index.html", nil))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "swagger-ui") {
		t.Errorf("halaman Swagger UI harus tersaji: %d", w.Code)
	}
	// URL spesifikasi diatur di swagger-initializer.js; validator online harus mati (spesifikasi tidak dikirim keluar)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/docs/swagger-initializer.js", nil))
	js := w.Body.String()
	if w.Code != http.StatusOK || !strings.Contains(js, `url: "/api/openapi.yaml"`) || !strings.Contains(js, "validatorUrl: null") {
		t.Errorf("Swagger UI harus memuat /api/openapi.yaml dan tanpa validator online: %d %.200s", w.Code, js)
	}
}
