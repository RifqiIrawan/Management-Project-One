.PHONY: help run build build-linux fmt fmt-check vet test check contract e2e e2e-quick backup

help: ## daftar target
	@grep -E '^[a-z0-9-]+:.*##' $(MAKEFILE_LIST) | sed 's/:.*##/\t/'

run: ## jalankan API (development), migrasi otomatis
	go run ./cmd/api

build: ## bangun biner untuk mesin ini
	go build -o bin/api ./cmd/api

build-linux: ## biner statis linux/amd64 untuk VPS (migrasi, OpenAPI, Swagger UI sudah tertanam)
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o bin/api-linux-amd64 ./cmd/api

fmt: ## rapikan kode
	gofmt -w .

fmt-check: ## gagal bila ada file yang belum rapi
	@test -z "$$(gofmt -l .)" || (echo "belum rapi:"; gofmt -l .; exit 1)

vet: ## analisis statis
	go vet ./...

test: ## unit test (tanpa database)
	go test -count=1 ./...

check: fmt-check vet test ## semua pemeriksaan cepat

contract: ## tes kontrak OpenAPI (butuh server baru: API_RATE_LIMIT_PER_MIN=0 go run ./cmd/api)
	CONTRACT_BASE_URL=http://localhost:6990 go test -count=1 -v ./tests/contract/

e2e: ## SELURUH tes (e2e PowerShell, butuh PowerShell + PostgreSQL), +-15 menit
	powershell -NoProfile -File tests/run_all.ps1

e2e-quick: ## gofmt, vet, unit, dan tes kontrak saja
	powershell -NoProfile -File tests/run_all.ps1 -Quick

backup: ## backup database (lihat docs/DEPLOY.md untuk penjadwalan)
	../scripts/backup-db.sh
