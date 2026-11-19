# Jalankan server dulu (cd backend; go run ./cmd/api), lalu: powershell -File tests/e2e_auth.ps1
$base = 'http://localhost:8080/api/v1'
$script:pass = 0; $script:fail = 0

function Call($method, $path, $body = $null, $token = $null, $cookie = $null) {
  $h = @{}
  if ($token) { $h['Authorization'] = "Bearer $token" }
  $p = @{ Uri = "$base$path"; Method = $method; Headers = $h; UseBasicParsing = $true; ErrorAction = 'Stop' }
  if ($cookie) {
    $sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $sess.Cookies.Add((New-Object System.Net.Cookie('refresh_token', $cookie, '/api/v1/auth', 'localhost')))
    $p['WebSession'] = $sess
  }
  if ($body) { $p['Body'] = ($body | ConvertTo-Json); $p['ContentType'] = 'application/json' }
  $text = ''
  try { $r = Invoke-WebRequest @p; $text = $r.Content }
  catch {
    if ($_.Exception.Response) { $r = $_.Exception.Response; $text = $_.ErrorDetails.Message } else { throw }
  }
  $status = [int]$r.StatusCode
  $sc = $r.Headers['Set-Cookie']
  $json = $null; try { $json = $text | ConvertFrom-Json } catch {}
  $rt = $null
  if ($sc -and ($sc -join ';') -match 'refresh_token=([^;]*)') { $rt = $Matches[1] }
  [pscustomobject]@{ Status = $status; Json = $json; Cookie = $rt; SetCookie = ($sc -join ' | ') }
}

function Check($name, $cond) {
  if ($cond) { $script:pass++; "PASS  $name" } else { $script:fail++; "FAIL  $name" }
}

$email = "e2e_$([guid]::NewGuid().ToString('N').Substring(0,8))@Example.com"
$pw = 'Passw0rdOne'

# --- Register ---
$r = Call POST /auth/register @{ name = 'Tester E2E'; email = $email; password = $pw; confirm_password = $pw }
Check 'register 201' ($r.Status -eq 201)
Check 'register email lowercase' ($r.Json.data.email -ceq $email.ToLower())
Check 'register tidak membocorkan password_hash' (-not ($r.Json.data.PSObject.Properties.Name -match 'password'))
$r = Call POST /auth/register @{ name = 'Dup'; email = $email.ToUpper(); password = $pw; confirm_password = $pw }
Check 'register email duplikat -> 409' ($r.Status -eq 409 -and $r.Json.error.code -eq 'CONFLICT')
$r = Call POST /auth/register @{ name = 'Weak'; email = 'weak@example.com'; password = 'onlyletters'; confirm_password = 'onlyletters' }
Check 'password tanpa angka -> 400' ($r.Status -eq 400 -and $r.Json.error.details.password)
$r = Call POST /auth/register @{ name = 'X'; email = 'bukan-email'; password = 'abc12345'; confirm_password = 'beda12345' }
Check 'validasi nama/email/konfirmasi -> 400' ($r.Status -eq 400 -and $r.Json.error.details.name -and $r.Json.error.details.email -and $r.Json.error.details.confirm_password)

# --- Login ---
$r1 = Call POST /auth/login @{ email = $email; password = $pw }
Check 'login 200 + access token' ($r1.Status -eq 200 -and $r1.Json.data.access_token)
Check 'refresh token di cookie HttpOnly + SameSite=Strict' ($r1.Cookie -and $r1.SetCookie -match 'HttpOnly' -and $r1.SetCookie -match 'SameSite=Strict')
Check 'refresh token tidak ada di body' (-not ($r1.Json.data.PSObject.Properties.Name -contains 'refresh_token'))
$bad = Call POST /auth/login @{ email = $email; password = 'SalahBanget1' }
$unk = Call POST /auth/login @{ email = 'tidak.ada@example.com'; password = 'SalahBanget1' }
Check 'login password salah -> 401' ($bad.Status -eq 401)
Check 'pesan error sama utk email tak terdaftar (tidak membocorkan)' ($unk.Status -eq 401 -and $unk.Json.error.message -eq $bad.Json.error.message)

# --- Akses terproteksi ---
$r = Call GET /me
Check '/me tanpa token -> 401' ($r.Status -eq 401)
$r = Call GET /me $null 'token.palsu.xyz'
Check '/me token palsu -> 401' ($r.Status -eq 401)
$r = Call GET /me $null $r1.Json.data.access_token
Check '/me dengan token -> 200' ($r.Status -eq 200 -and $r.Json.data.email -ceq $email.ToLower())
$r = Call PATCH /me @{ name = 'Nama Baru'; avatar_color = '#ff0000' } $r1.Json.data.access_token
Check 'PATCH /me ubah nama & warna' ($r.Status -eq 200 -and $r.Json.data.name -eq 'Nama Baru' -and $r.Json.data.avatar_color -eq '#FF0000')
$r = Call PATCH /me @{ avatar_color = 'merah' } $r1.Json.data.access_token
Check 'PATCH /me warna tidak valid -> 400' ($r.Status -eq 400)

# --- Refresh + rotasi ---
$old = $r1.Cookie
$r2 = Call POST /auth/refresh $null $null $old
Check 'refresh 200 + token baru' ($r2.Status -eq 200 -and $r2.Json.data.access_token -and $r2.Cookie -and $r2.Cookie -ne $old)
$r = Call POST /auth/refresh
Check 'refresh tanpa cookie -> 401' ($r.Status -eq 401)
# pemakaian ulang token lama -> semua sesi dicabut
$reuse = Call POST /auth/refresh $null $null $old
Check 'refresh token lama dipakai ulang -> 401' ($reuse.Status -eq 401 -and $reuse.Json.error.message -match 'Sesi tidak valid')
$after = Call POST /auth/refresh $null $null $r2.Cookie
Check 'deteksi pencurian: token baru ikut dicabut' ($after.Status -eq 401 -and $after.Json.error.message -match 'Sesi tidak valid')

# --- Logout ---
$s = Call POST /auth/login @{ email = $email; password = $pw }
$lo = Call POST /auth/logout $null $null $s.Cookie
Check 'logout 200' ($lo.Status -eq 200)
$r = Call POST /auth/refresh $null $null $s.Cookie
Check 'refresh setelah logout -> 401 (token dicabut)' ($r.Status -eq 401 -and $r.Json.error.message -match 'Sesi tidak valid')

# --- Ganti password ---
Start-Sleep 26  # beri limiter login waktu mengisi ulang (5/menit)
$s = Call POST /auth/login @{ email = $email; password = $pw }
$tokA = $s.Json.data.access_token
$r = Call PATCH /me/password @{ current_password = 'SalahBanget1'; new_password = 'NewPassw0rd2'; confirm_password = 'NewPassw0rd2' } $tokA
Check 'ganti password: password lama salah -> 400' ($r.Status -eq 400 -and $r.Json.error.details.current_password)
$r = Call PATCH /me/password @{ current_password = $pw; new_password = 'NewPassw0rd2'; confirm_password = 'NewPassw0rd2' } $tokA
Check 'ganti password 200 + sesi baru' ($r.Status -eq 200 -and $r.Json.data.access_token -and $r.Cookie)
$newTok = $r.Json.data.access_token; $newCookie = $r.Cookie
$r = Call GET /me $null $tokA
Check 'access token lama tidak berlaku setelah ganti password' ($r.Status -eq 401)
$r = Call POST /auth/refresh $null $null $s.Cookie
Check 'refresh token lama dicabut setelah ganti password' ($r.Status -eq 401 -and $r.Json.error.message -match 'Sesi tidak valid')
$r = Call GET /me $null $newTok
Check 'sesi baru (perangkat ini) tetap berlaku' ($r.Status -eq 200)
$r = Call POST /auth/login @{ email = $email; password = 'NewPassw0rd2' }
Check 'login dengan password baru' ($r.Status -eq 200)
$tokB = $r.Json.data.access_token; $cookB = $r.Cookie

# --- Logout all ---
$r = Call POST /auth/logout-all $null $tokB
Check 'logout-all 200' ($r.Status -eq 200)
$r = Call GET /me $null $tokB
Check 'access token mati setelah logout-all' ($r.Status -eq 401)
$r = Call POST /auth/refresh $null $null $cookB
Check 'refresh token mati setelah logout-all' ($r.Status -eq 401 -and $r.Json.error.message -match 'Sesi tidak valid')

# --- Infrastruktur: health, error JSON, header, CORS, ukuran body ---
# (dijalankan setelah limiter terisi penuh; dua cek memakai /auth/login dan memakai kuota limiter)
Start-Sleep 60
$r = Call GET /health
Check 'health 200 + database terhubung' ($r.Status -eq 200 -and $r.Json.data.status -eq 'ok')
$r = Call GET /tidak-ada
Check 'route tidak ada -> 404 JSON' ($r.Status -eq 404 -and $r.Json.error.code -eq 'NOT_FOUND')
$r = Call DELETE /auth/login
Check 'method salah -> 405 JSON' ($r.Status -eq 405 -and $r.Json.error.code -eq 'METHOD_NOT_ALLOWED')
$hdr = Invoke-WebRequest "$base/health" -UseBasicParsing
Check 'header keamanan terpasang' ($hdr.Headers['X-Content-Type-Options'] -eq 'nosniff' -and $hdr.Headers['X-Frame-Options'] -eq 'DENY' -and $hdr.Headers['Referrer-Policy'])
$pre = Invoke-WebRequest "$base/auth/login" -Method OPTIONS -UseBasicParsing -Headers @{ Origin = 'http://localhost:6969'; 'Access-Control-Request-Method' = 'POST'; 'Access-Control-Request-Headers' = 'authorization,content-type' }
Check 'CORS: origin frontend (6969) diizinkan + credentials' ($pre.Headers['Access-Control-Allow-Origin'] -eq 'http://localhost:6969' -and $pre.Headers['Access-Control-Allow-Credentials'] -eq 'true')
$evil = $null
try { $evil = Invoke-WebRequest "$base/auth/login" -Method OPTIONS -UseBasicParsing -Headers @{ Origin = 'http://evil.example'; 'Access-Control-Request-Method' = 'POST' } } catch { $evil = $_.Exception.Response }
Check 'CORS: origin asing tidak diberi izin' (-not $evil.Headers['Access-Control-Allow-Origin'])
$big = '{"email":"a@b.co","password":"' + ('x' * 1200000) + '"}'
try { Invoke-WebRequest "$base/auth/login" -Method POST -ContentType application/json -Body $big -UseBasicParsing | Out-Null; $code = 200 } catch { $code = [int]$_.Exception.Response.StatusCode }
Check 'body > 1 MB -> 413' ($code -eq 413)
$r = Call POST /auth/login @{ email = 'x' }
Check 'login body tidak lengkap -> 400 dengan details' ($r.Status -eq 400 -and $r.Json.error.details.email)

# --- Rate limit login (5/menit/IP) ---
$codes = 1..6 | ForEach-Object { (Call POST /auth/login @{ email = $email; password = 'x' }).Status }
Check "rate limit login -> 429 (status: $($codes -join ','))" ($codes -contains 429)

"`nHASIL: $script:pass lulus, $script:fail gagal"
if ($script:fail -gt 0) { exit 1 }

