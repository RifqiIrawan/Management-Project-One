# Menjalankan SELURUH tes backend dengan satu perintah dan mencetak ringkasan.
#
#   cd backend
#   powershell -File tests/run_all.ps1            # semua (±15 menit; e2e_auth & e2e_ops menunggu rate limiter)
#   powershell -File tests/run_all.ps1 -Quick     # hanya gofmt, vet, unit test, dan tes kontrak
#
# Urutan: gofmt -> go vet -> go test (unit) -> build -> tes kontrak OpenAPI -> e2e fitur 02..07 -> uji race
#         owner terakhir -> e2e operasional (menjalankan server sendiri di port 6991-6994).
# Tiap suite e2e fungsional memakai SERVER BARU di port 6990 dengan API_RATE_LIMIT_PER_MIN=0, karena skrip
# e2e memanggil API jauh lebih sering daripada batas umum 100/menit/user. Batas login/register (5/menit/IP)
# tetap aktif dan dihitung per proses, itulah alasan tiap suite mendapat server baru.
# Prasyarat: Go, PostgreSQL berjalan, backend/.env terisi (DB_PASSWORD, JWT_SECRET). Hentikan server di 6990 dulu.
param([switch]$Quick)
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$exe = Join-Path $root 'bin\api.exe'
$results = New-Object System.Collections.Generic.List[object]
$started = Get-Date

function Add-Result($name, $ok, $detail, $seconds) { $results.Add([pscustomobject]@{ Suite = $name; Status = $(if ($ok) { 'LULUS' } else { 'GAGAL' }); Detail = $detail; Detik = [int]$seconds }) }

function Start-Server {
  $saved = [Environment]::GetEnvironmentVariable('API_RATE_LIMIT_PER_MIN', 'Process')
  [Environment]::SetEnvironmentVariable('API_RATE_LIMIT_PER_MIN', '0', 'Process')
  try { $p = Start-Process -FilePath $exe -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\mpo-run.out.log" -RedirectStandardError "$env:TEMP\mpo-run.err.log" }
  finally { [Environment]::SetEnvironmentVariable('API_RATE_LIMIT_PER_MIN', $saved, 'Process') }
  foreach ($i in 1..40) {
    if ($p.HasExited) { break }
    try { if ((Invoke-WebRequest 'http://localhost:6990/api/v1/health' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { return $p } } catch {}
    Start-Sleep -Milliseconds 400
  }
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  throw 'server tidak sehat di port 6990 (apakah server lain masih berjalan, atau .env/DB bermasalah?)'
}

function Run-Step($name, [scriptblock]$body) {
  "`n=== $name ==="
  $t0 = Get-Date
  try { $out = & $body; $ok = $out.Ok; $detail = $out.Detail } catch { $ok = $false; $detail = $_.Exception.Message }
  $sec = ((Get-Date) - $t0).TotalSeconds
  Add-Result $name $ok $detail $sec
  "{0}: {1} ({2})" -f $name, $(if ($ok) { 'LULUS' } else { 'GAGAL' }), $detail
}

function Run-E2E($script) {
  $srv = Start-Server
  try {
    $lines = & powershell -NoProfile -File (Join-Path $PSScriptRoot $script) 2>&1 | ForEach-Object { "$_" }
    $summary = $lines | Where-Object { $_ -match '^HASIL:' } | Select-Object -Last 1
    $fails = @($lines | Where-Object { $_ -match '^FAIL' })
    $fails | ForEach-Object { "  $_" }
    [pscustomobject]@{ Ok = ($summary -and $summary -match ' 0 gagal' -and $fails.Count -eq 0); Detail = $(if ($summary) { $summary } else { 'tidak ada baris HASIL (skrip berhenti?)' }) }
  } finally { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 }
}

Get-Process api -ErrorAction SilentlyContinue | Stop-Process -Force

Run-Step 'gofmt' {
  $bad = @(gofmt -l . | Where-Object { $_ })
  [pscustomobject]@{ Ok = ($bad.Count -eq 0); Detail = $(if ($bad.Count) { "belum rapi: $($bad -join ', ')" } else { 'semua file rapi' }) }
}
Run-Step 'go vet' {
  $o = go vet ./... 2>&1 | Out-String
  [pscustomobject]@{ Ok = ($LASTEXITCODE -eq 0); Detail = $(if ($LASTEXITCODE -eq 0) { 'bersih' } else { $o.Trim() }) }
}
Run-Step 'go test (unit)' {
  $o = go test -count=1 ./... 2>&1 | Out-String
  $pk = ([regex]::Matches($o, '(?m)^ok\s')).Count
  [pscustomobject]@{ Ok = ($LASTEXITCODE -eq 0); Detail = $(if ($LASTEXITCODE -eq 0) { "$pk paket lulus" } else { ($o -split "`n" | Select-String 'FAIL|---' | Select-Object -First 5) -join ' | ' }) }
}
Run-Step 'build' {
  go build -o $exe ./cmd/api 2>&1 | Out-Null
  [pscustomobject]@{ Ok = ($LASTEXITCODE -eq 0); Detail = $(if ($LASTEXITCODE -eq 0) { 'bin/api.exe' } else { 'gagal membangun' }) }
}
Run-Step 'tes kontrak OpenAPI' {
  $srv = Start-Server
  try {
    $env:CONTRACT_BASE_URL = 'http://localhost:6990'
    $o = go test -count=1 -v ./tests/contract/ 2>&1 | Out-String
    $n = [regex]::Match($o, 'divalidasi: (\d+)').Groups[1].Value
    [pscustomobject]@{ Ok = ($LASTEXITCODE -eq 0 -and $n); Detail = $(if ($LASTEXITCODE -eq 0 -and $n) { "$n operasi divalidasi terhadap openapi.yaml" } else { ($o -split "`n" | Select-String 'tidak sesuai|belum dijalankan|status' | Select-Object -First 4) -join ' | ' }) }
  } finally { Remove-Item Env:CONTRACT_BASE_URL -ErrorAction SilentlyContinue; Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 }
}

if (-not $Quick) {
  foreach ($s in 'e2e_dashboard.ps1', 'e2e_comments.ps1', 'e2e_task_filters.ps1', 'e2e_tasks.ps1', 'e2e_projects.ps1', 'e2e_auth.ps1') {
    Run-Step $s ([scriptblock]::Create("Run-E2E '$s'"))
  }
  Run-Step 'e2e_race_owner.ps1' {
    $srv = Start-Server
    try {
      $o = & powershell -NoProfile -File (Join-Path $PSScriptRoot 'e2e_race_owner.ps1') -Rounds 3 2>&1 | ForEach-Object { "$_" }
      $line = $o | Where-Object { $_ -match '^(LULUS|GAGAL|TIDAK VALID)' } | Select-Object -Last 1
      [pscustomobject]@{ Ok = ($line -match '^LULUS'); Detail = "$line" }
    } finally { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 }
  }
  Run-Step 'e2e_ops.ps1' {
    $lines = & powershell -NoProfile -File (Join-Path $PSScriptRoot 'e2e_ops.ps1') 2>&1 | ForEach-Object { "$_" }
    $summary = $lines | Where-Object { $_ -match '^HASIL:' } | Select-Object -Last 1
    $fails = @($lines | Where-Object { $_ -match '^FAIL' }); $fails | ForEach-Object { "  $_" }
    [pscustomobject]@{ Ok = ($summary -and $summary -match ' 0 gagal'); Detail = $(if ($summary) { $summary } else { 'tidak ada baris HASIL' }) }
  }
}

"`n==================== RINGKASAN ===================="
$results | Format-Table Suite, Status, Detik, Detail -AutoSize -Wrap | Out-String -Width 200
$bad = @($results | Where-Object { $_.Status -ne 'LULUS' })
"Total: $($results.Count) langkah, gagal: $($bad.Count), waktu: $([int]((Get-Date) - $started).TotalMinutes) menit"
if ($bad.Count -gt 0) { exit 1 }
