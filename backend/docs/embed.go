// Package docs menyimpan spesifikasi OpenAPI yang ikut ter-compile ke binary.
package docs

import _ "embed"

// OpenAPI adalah isi openapi.yaml (OpenAPI 3.0). Dijaga tetap benar oleh tes di
// internal/router (kecocokan dengan route) dan tests/contract (kecocokan dengan respons nyata).
//
//go:embed openapi.yaml
var OpenAPI []byte
