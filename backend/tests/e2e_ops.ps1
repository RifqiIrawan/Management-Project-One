# Uji end-to-end aspek operasional (fitur 08). Skrip ini MENJALANKAN SERVER SENDIRI (port 6991-6993)
# dengan konfigurasi berbeda, jadi tidak mengganggu server development di 6990:
#   S1 (dev, batas API 20/menit, pembersihan token 2 dtk) : rate limit per user, Retry-After, request ID,
#                                                           header keamanan, Swagger aktif, X-Forwarded-For
#                                                           diabaikan, pembersihan refresh token, log tidak
#                                                           membocorkan data pribadi
#   S2 (production, JSON log, batas API mati)              : HSTS, Swagger mati, cookie Secure, log JSON
#   S3 (TRUSTED_PROXIES=127.0.0.1,::1)                     : X-Forwarded-For dihormati dari proxy tepercaya
#   S4 (TRUSTED_PROXIES tidak valid)                       : server menolak start
# Prasyarat: go build -o bin/api.exe ./cmd/api (dari folder backend), PostgreSQL + backend/.env.
# Jalankan: powershell -File backend/tests/e2e_ops.ps1
$script:pass = 0; $script:fail = 0
$root = Split-Path $PSScriptRoot -Parent
$exe = Join-Path $root 'bin\api.exe'
if (-not (Test-Path $exe)) { "bin\api.exe tidak ada. Jalankan: cd backend; go build -o bin/api.exe ./cmd/api"; exit 2 }
$logDir = Join-Path $env:TEMP "mpo-e2e-ops-$([guid]::NewGuid().ToString('N').Substring(0,6))"
New-Item -ItemType Directory -Force $logDir | Out-Null
. (Join-Path $PSScriptRoot 'lib\Signing.ps1')
. (Join-Path $PSScriptRoot 'lib\Server.ps1')

function Check($name, $cond) { if ($cond) { $script:pass++; "PASS  $name" } else { $script:fail++; "FAIL  $name" } }

function BodyText($resp) { if ($resp.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($resp.Content) } else { [string]$resp.Content } }
function LogText($s) { ((Get-Content $s.Out -Raw -ErrorAction SilentlyContinue) + "`n" + (Get-Content $s.Err -Raw -ErrorAction SilentlyContinue)) }

function Call($s, $method, $path, $body = $null, $token = $null, $headers = @{}, $key = $null) {
  $h = @{} + $headers; if ($token) { $h['Authorization'] = "Bearer $token" }
  if ($key) {
    $bodyText = if ($null -ne $body) { $body | ConvertTo-Json -Depth 5 } else { '' }
    foreach ($kv in (New-SignatureHeaders -Method $method -Url "$($s.Base)$path" -Body $bodyText -KeyB64 $key).GetEnumerator()) { $h[$kv.Key] = $kv.Value }
  }
  $p = @{ Uri = "$($s.Base)$path"; Method = $method; Headers = $h; UseBasicParsing = $true; ErrorAction = 'Stop' }
  if ($null -ne $body) { $p['Body'] = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 5)); $p['ContentType'] = 'application/json; charset=utf-8' }
  $text = ''
  try { $r = Invoke-WebRequest @p; $text = $r.Content }
  catch { if ($_.Exception.Response) { $r = $_.Exception.Response; $text = $_.ErrorDetails.Message } else { throw } }
  $json = $null; try { $json = $text | ConvertFrom-Json } catch {}
  [pscustomobject]@{ Status = [int]$r.StatusCode; Json = $json; Data = $json.data; Err = $json.error; Headers = $r.Headers; Text = $text }
}
function NewUser($s, $label) {
  $email = "${label}_$([guid]::NewGuid().ToString('N').Substring(0,8))@example.com"; $pw = 'Passw0rdTest1'
  $reg = Call $s POST /auth/register @{ name = "User $label"; email = $email; password = $pw; confirm_password = $pw }
  $l = Call $s POST /auth/login @{ email = $email; password = $pw }
  [pscustomobject]@{ Email = $email; Id = $reg.Data.id; Token = $l.Data.access_token; Key = $l.Data.signing_key; Login = $l }
}

$cfg = @{}; $envFile = Join-Path $root '.env'
if (Test-Path $envFile) { Get-Content $envFile | ForEach-Object { if ($_ -match '^([A-Z_]+)=(.*)$') { $cfg[$Matches[1]] = $Matches[2] } } }
$hasPsql = [bool](Get-Command psql -ErrorAction SilentlyContinue) -and $cfg.DB_PASSWORD
function Sql($q) {
  $env:PGPASSWORD = $cfg.DB_PASSWORD
  $u = if ($cfg.DB_USER) { $cfg.DB_USER } else { 'mpo' }; $d = if ($cfg.DB_NAME) { $cfg.DB_NAME } else { 'management_project_one' }
  psql -h localhost -U $u -d $d -tA -F '|' -c $q 2>&1
}

$servers = @()
try {
  # ============================================================ S1: development
  $S1 = Start-Api 's1' 6991 @{ API_RATE_LIMIT_PER_MIN = '20'; TOKEN_CLEANUP_INTERVAL = '2s'; TRUSTED_PROXIES = ''; SWAGGER_ENABLED = ''; APP_ENV = 'development' }
  $servers += $S1
  Check 'S1: server development berjalan' (Wait-Healthy $S1)

  $A = NewUser $S1 'ratea'; $B = NewUser $S1 'rateb'
  Check 'S1: dua user terdaftar & login' ($A.Token -and $B.Token)

  # ---- rate limit per user ----
  $codes = 1..20 | ForEach-Object { (Call $S1 GET /me $null $A.Token).Status }
  Check 'rate limit: 20 request pertama (burst) lolos' (@($codes | Where-Object { $_ -eq 200 }).Count -eq 20)
  $r = Call $S1 GET /me $null $A.Token
  $ra = [int]($r.Headers['Retry-After'])
  Check 'rate limit: request ke-21 -> 429 dengan kode TOO_MANY_REQUESTS' ($r.Status -eq 429 -and $r.Err.code -eq 'TOO_MANY_REQUESTS' -and $r.Json.success -eq $false)
  Check 'rate limit: Retry-After (1..3 dtk) dan X-RateLimit-Limit=20 ada' ($ra -ge 1 -and $ra -le 3 -and $r.Headers['X-RateLimit-Limit'] -eq '20')
  Check 'rate limit: 429 tetap membawa X-Request-ID' ($r.Headers['X-Request-ID'] -match '^[0-9a-f]{16}$')
  Check 'rate limit: user lain tidak terpengaruh (batas per user)' ((Call $S1 GET /me $null $B.Token).Status -eq 200)
  Check 'rate limit: berlaku juga untuk endpoint lain milik user yang sama' ((Call $S1 GET /dashboard $null $A.Token).Status -eq 429)
  Start-Sleep -Seconds ($ra + 1)
  Check 'rate limit: setelah menunggu Retry-After user bisa lagi' ((Call $S1 GET /me $null $A.Token).Status -eq 200)
  $codes = 1..25 | ForEach-Object { (Call $S1 GET /projects).Status }
  Check 'tanpa login selalu 401 (bukan 429): batas hanya untuk user terautentikasi' (@($codes | Where-Object { $_ -eq 401 }).Count -eq 25)
  $codes = 1..30 | ForEach-Object { (Call $S1 GET /health).Status }
  Check '/health (publik) tidak dibatasi' (@($codes | Where-Object { $_ -eq 200 }).Count -eq 30)

  # ---- request id & header keamanan ----
  $r = Call $S1 GET /health
  $rid = $r.Headers['X-Request-ID']
  Check 'X-Request-ID dibuat server (16 hex)' ($rid -match '^[0-9a-f]{16}$')
  Check 'X-Request-ID dari client yang aman dipakai kembali' ((Call $S1 GET /health $null $null @{ 'X-Request-ID' = 'client-trace-0001' }).Headers['X-Request-ID'] -eq 'client-trace-0001')
  Check 'X-Request-ID tidak aman (terlalu pendek) diganti' ((Call $S1 GET /health $null $null @{ 'X-Request-ID' = 'abc' }).Headers['X-Request-ID'] -match '^[0-9a-f]{16}$')
  $r = Call $S1 GET /rute-tidak-ada
  Check 'respons error (404) juga memuat X-Request-ID dan header keamanan' ($r.Status -eq 404 -and $r.Headers['X-Request-ID'] -and $r.Headers['X-Frame-Options'] -eq 'DENY' -and $r.Headers['X-Content-Type-Options'] -eq 'nosniff')
  Check 'development: tidak ada HSTS' (-not (Call $S1 GET /health).Headers['Strict-Transport-Security'])

  # ---- Swagger aktif di development ----
  $sw = Invoke-WebRequest "http://localhost:$($S1.Port)/api/openapi.yaml" -UseBasicParsing
  Check 'Swagger (dev): /api/openapi.yaml disajikan' ($sw.StatusCode -eq 200 -and (BodyText $sw).StartsWith('openapi: 3.0.3') -and (BodyText $sw).Contains('operationId: dashboard'))
  $ui = Invoke-WebRequest "http://localhost:$($S1.Port)/api/docs/index.html" -UseBasicParsing
  Check 'Swagger (dev): UI tersaji' ($ui.StatusCode -eq 200 -and (BodyText $ui) -match 'Swagger UI')
  $js = Invoke-WebRequest "http://localhost:$($S1.Port)/api/docs/swagger-initializer.js" -UseBasicParsing
  Check 'Swagger (dev): memuat spesifikasi lokal & validator online dimatikan' ((BodyText $js) -match 'url: "/api/openapi.yaml"' -and (BodyText $js) -match 'validatorUrl: null')

  # ---- X-Forwarded-For tidak dipercaya tanpa TRUSTED_PROXIES ----
  # register sudah terpakai 2x (A, B); batas 5/menit/IP. Kirim 4x dengan XFF berbeda-beda: yang ke-4 (total ke-6) harus 429.
  $spoof = 1..4 | ForEach-Object { (Call $S1 POST /auth/register @{ name = 'x' } $null @{ 'X-Forwarded-For' = "198.51.100.$_" }).Status }
  Check "X-Forwarded-For diabaikan: batas register tetap berlaku walau header berganti ($($spoof -join ','))" ($spoof[0] -eq 400 -and $spoof[1] -eq 400 -and $spoof[2] -eq 400 -and $spoof[3] -eq 429)

  # ---- pembersihan refresh token kedaluwarsa ----
  if ($hasPsql) {
    $tag = "e2e-$([guid]::NewGuid().ToString('N').Substring(0,8))"
    $null = Sql @"
INSERT INTO refresh_tokens(user_id, token_hash, expires_at, revoked_at) VALUES
 ('$($A.Id)', '$tag-hapus-kedaluwarsa-3hari', now() - interval '3 days', NULL),
 ('$($A.Id)', '$tag-hapus-dicabut-kedaluwarsa', now() - interval '5 days', now() - interval '6 days'),
 ('$($A.Id)', '$tag-simpan-baru-kedaluwarsa', now() - interval '2 hours', NULL),
 ('$($A.Id)', '$tag-simpan-aktif', now() + interval '1 day', NULL),
 ('$($A.Id)', '$tag-simpan-dicabut-belum-kedaluwarsa', now() + interval '1 day', now() - interval '1 hour')
"@
    Start-Sleep -Seconds 6
    $left = @(Sql "SELECT token_hash FROM refresh_tokens WHERE token_hash LIKE '$tag-%' ORDER BY token_hash") | ForEach-Object { $_ -replace "^$tag-", '' }
    Check 'pembersihan: token kedaluwarsa > 1 hari (aktif maupun dicabut) dihapus job' (($left -notcontains 'hapus-kedaluwarsa-3hari') -and ($left -notcontains 'hapus-dicabut-kedaluwarsa'))
    Check 'pembersihan: token yang baru kedaluwarsa (masa tenggang), aktif, dan dicabut-tapi-belum-kedaluwarsa tetap ada' (($left -contains 'simpan-baru-kedaluwarsa') -and ($left -contains 'simpan-aktif') -and ($left -contains 'simpan-dicabut-belum-kedaluwarsa'))
    Check 'pembersihan: login/refresh yang sah tidak terpengaruh' ((Call $S1 GET /me $null $B.Token).Status -eq 200)
    $null = Sql "DELETE FROM refresh_tokens WHERE token_hash LIKE '$tag-%'"
  } else { 'SKIP  pembersihan refresh token (psql / kredensial tidak tersedia)' }

  # ---- log: terstruktur, ada request id, tidak membocorkan data pribadi ----
  $marker = 'zzprivasiqq' + ([guid]::NewGuid().ToString('N').Substring(0, 6))
  $rr = Call $S1 GET "/users/search?email=$marker" $null $B.Token
  $rid2 = $rr.Headers['X-Request-ID']
  Start-Sleep -Milliseconds 500
  $log = LogText $S1
  Check 'log: query string (email pencarian) TIDAK tercatat' (-not $log.Contains($marker) -and $log -notmatch 'email=')
  Check 'log: email user (A, B) tidak tercatat' (-not $log.Contains($A.Email) -and -not $log.Contains($B.Email))
  Check 'log: tidak memuat access token / password' ($log -notmatch 'Bearer ' -and -not $log.Contains($A.Token) -and $log -notmatch 'Passw0rdTest1')
  Check 'log: baris request memuat pola route (bukan URL asli) dan request_id yang sama dengan respons' ($log -match 'route=/api/v1/users/search' -and $log.Contains("request_id=$rid2"))
  $null = Call $S1 GET "/projects/00000000-0000-4000-8000-000000000000" $null $B.Token
  Start-Sleep -Milliseconds 300
  $log = LogText $S1
  Check 'log: route detail ditulis sebagai pola /projects/:projectId' ($log -match 'route=/api/v1/projects/:projectId' -and -not $log.Contains('00000000-0000-4000-8000-000000000000'))
  Check 'log: 429 dicatat sebagai WARN, 401 sebagai WARN' (($log -split "`n" | Where-Object { $_ -match 'status=429' -and $_ -match 'WARN' }).Count -ge 1 -and ($log -split "`n" | Where-Object { $_ -match 'status=401' -and $_ -match 'WARN' }).Count -ge 1)

  # ============================================================ S2: production
  $S2 = Start-Api 's2' 6992 @{ APP_ENV = 'production'; COOKIE_SECURE = 'true'; API_RATE_LIMIT_PER_MIN = '0'; TOKEN_CLEANUP_INTERVAL = '0'; SWAGGER_ENABLED = ''; TRUSTED_PROXIES = '' } '127.0.0.1'
  $servers += $S2
  Check 'S2: server production berjalan (diakses lewat 127.0.0.1)' (Wait-Healthy $S2)

  # ---- production hanya bind ke localhost (HOST default 127.0.0.1) ----
  # Kontrol dulu: server development (S1, semua antarmuka) harus bisa dijangkau lewat IP LAN mesin ini; bila tidak
  # (mis. tidak ada IP LAN / firewall), tes penolakan di bawah akan lolos sia-sia, jadi dilewati.
  $lan = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } | Select-Object -First 1).IPAddress
  $control = $false
  if ($lan) { try { $control = ((Invoke-WebRequest "http://${lan}:6991/api/v1/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) } catch {} }
  if ($control) {
    Check 'kontrol: server development (semua antarmuka) bisa dijangkau lewat IP LAN' $true
    $refused = $false
    try { $null = Invoke-WebRequest "http://${lan}:6992/api/v1/health" -UseBasicParsing -TimeoutSec 3 } catch { $refused = $true }
    Check 'production: API TIDAK bisa dijangkau lewat IP LAN (hanya localhost; wajib lewat reverse proxy)' $refused
  } else { 'SKIP  uji bind localhost (tidak ada IP LAN yang bisa dijangkau sebagai kontrol)' }
  Check 'production: tetap bisa dijangkau lewat 127.0.0.1' ((Call $S2 GET /health).Status -eq 200)
  $r = Call $S2 GET /health
  Check 'production: HSTS terpasang' ($r.Headers['Strict-Transport-Security'] -match 'max-age=31536000')
  $swOff = @('/api/openapi.yaml', '/api/docs', '/api/docs/index.html') | ForEach-Object { try { (Invoke-WebRequest "http://127.0.0.1:6992$_" -UseBasicParsing -MaximumRedirection 0 -ErrorAction Stop).StatusCode } catch { [int]$_.Exception.Response.StatusCode } }
  Check "production: semua jalur Swagger 404 ($($swOff -join ','))" (@($swOff | Where-Object { $_ -eq 404 }).Count -eq 3)
  $C = NewUser $S2 'prod'
  Check 'production: mode tanda tangan default ENFORCE (tanpa tanda tangan -> 401 SIGNATURE_REQUIRED)' ((Call $S2 GET /me $null $C.Token).Err.code -eq 'SIGNATURE_REQUIRED')
  Check 'production: request bertanda tangan diterima' ((Call $S2 GET /me $null $C.Token @{} $C.Key).Status -eq 200)
  Check 'production: cookie refresh_token memakai atribut Secure + HttpOnly + SameSite=Strict' ($C.Login.Headers['Set-Cookie'] -match 'Secure' -and $C.Login.Headers['Set-Cookie'] -match 'HttpOnly' -and $C.Login.Headers['Set-Cookie'] -match 'SameSite=Strict')
  $codes = 1..40 | ForEach-Object { (Call $S2 GET /me $null $C.Token @{} $C.Key).Status }
  Check 'production dengan API_RATE_LIMIT_PER_MIN=0: batas umum nonaktif (40 request lolos)' (@($codes | Where-Object { $_ -eq 200 }).Count -eq 40)
  Start-Sleep -Milliseconds 500
  $lines = @(Get-Content $S2.Out -ErrorAction SilentlyContinue | Where-Object { $_.Trim() -ne '' })
  $json = @($lines | Where-Object { $_.TrimStart().StartsWith('{') } | ForEach-Object { try { $_ | ConvertFrom-Json } catch { $null } } | Where-Object { $_ })
  $reqs = @($json | Where-Object { $_.msg -eq 'request' })
  Check 'production: log berformat JSON dan memuat catatan request' ($json.Count -ge 5 -and $reqs.Count -ge 40)
  Check 'production: tiap catatan request memuat request_id, method, route, status, latency_ms, ip' (@($reqs | Where-Object { $_.request_id -and $_.method -and $_.route -and $_.status -and $null -ne $_.latency_ms -and $_.ip }).Count -eq $reqs.Count)
  Check 'production: request terautentikasi mencatat user_id yang benar' (@($reqs | Where-Object { $_.route -eq '/api/v1/me' -and $_.user_id -eq $C.Id }).Count -ge 40)
  Check 'production: pembersihan token dinonaktifkan tercatat saat start' (($lines -join "`n") -match 'dinonaktifkan')
  $allText = Get-Content $S2.Out -Raw
  Check 'production: tidak ada email/token/password di log' (-not $allText.Contains($C.Email) -and -not $allText.Contains($C.Token) -and $allText -notmatch 'Passw0rdTest1')

  # ============================================================ S3: di belakang proxy tepercaya
  $S3 = Start-Api 's3' 6993 @{ TRUSTED_PROXIES = '127.0.0.1,::1'; API_RATE_LIMIT_PER_MIN = '0'; TOKEN_CLEANUP_INTERVAL = '0'; APP_ENV = 'development'; SWAGGER_ENABLED = '' }
  $servers += $S3
  Check 'S3: server dengan TRUSTED_PROXIES berjalan' (Wait-Healthy $S3)
  $diff = 1..8 | ForEach-Object { (Call $S3 POST /auth/register @{ name = 'x' } $null @{ 'X-Forwarded-For' = "203.0.113.$_" }).Status }
  Check "proxy tepercaya: tiap klien (X-Forwarded-For berbeda) punya kuota sendiri ($($diff -join ','))" (@($diff | Where-Object { $_ -eq 400 }).Count -eq 8)
  $same = 1..6 | ForEach-Object { (Call $S3 POST /auth/register @{ name = 'x' } $null @{ 'X-Forwarded-For' = '203.0.113.99' }).Status }
  Check "proxy tepercaya: klien yang sama (XFF sama) tetap dibatasi 5/menit ($($same -join ','))" ($same[4] -eq 400 -and $same[5] -eq 429)

  # ============================================================ S4: konfigurasi salah
  $S4 = Start-Api 's4' 6994 @{ TRUSTED_PROXIES = 'bukan-ip'; APP_ENV = 'development' }
  $servers += $S4
  $deadline = (Get-Date).AddSeconds(15)
  while (-not $S4.Proc.HasExited -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 300 }
  Check 'konfigurasi TRUSTED_PROXIES tidak valid: server menolak start (exit code != 0)' ($S4.Proc.HasExited -and $S4.Proc.ExitCode -ne 0)
  Check 'konfigurasi salah: pesan error menyebut TRUSTED_PROXIES' ((LogText $S4) -match 'TRUSTED_PROXIES')
}
finally {
  foreach ($s in $servers) { Stop-Api $s }
  Remove-Item $logDir -Recurse -Force -ErrorAction SilentlyContinue
}

"`nHASIL: $script:pass lulus, $script:fail gagal"
if ($script:fail -gt 0) { exit 1 }
