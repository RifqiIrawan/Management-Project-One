# Uji end-to-end tanda tangan request (HMAC). Menjalankan server sendiri:
#   S1 port 6995: API_SIGNATURE=enforce, API_RATE_LIMIT_PER_MIN=15
#   S2 port 6996: API_SIGNATURE=optional
# Penanda tangan di sini adalah implementasi PowerShell independen (tests/lib/Signing.ps1).
# Prasyarat: bin\api.exe sudah dibangun, PostgreSQL + backend/.env. Jalankan: powershell -File backend/tests/e2e_signature.ps1
$script:pass = 0; $script:fail = 0
. (Join-Path $PSScriptRoot 'lib\Signing.ps1')
. (Join-Path $PSScriptRoot 'lib\Server.ps1')
$script:logDir = Join-Path $env:TEMP "mpo-e2e-sig-$([guid]::NewGuid().ToString('N').Substring(0,6))"
New-Item -ItemType Directory -Force $script:logDir | Out-Null

function Check($name, $cond) { if ($cond) { $script:pass++; "PASS  $name" } else { $script:fail++; "FAIL  $name" } }

# Call: -Key menandatangani request; -Mutate (scriptblock) boleh mengubah hashtable header sesudah ditandatangani.
function Call($s, $method, $path, $body = $null, $token = $null, $key = $null, $headers = @{}, [scriptblock]$mutate = $null, $signBody = $null, $signPath = $null, $signMethod = $null, $cookie = $null) {
  $url = "$($s.Base)$path"
  $bodyText = if ($null -ne $body) { if ($body -is [string]) { $body } else { $body | ConvertTo-Json -Depth 5 -Compress } } else { '' }
  $h = @{} + $headers
  if ($token) { $h['Authorization'] = "Bearer $token" }
  if ($key) {
    $sigBody = if ($null -ne $signBody) { $signBody } else { $bodyText }
    $sigUrl = if ($signPath) { "$($s.Base)$signPath" } else { $url }
    $sigMethod = if ($signMethod) { $signMethod } else { $method }
    foreach ($kv in (New-SignatureHeaders -Method $sigMethod -Url $sigUrl -Body $sigBody -KeyB64 $key).GetEnumerator()) { $h[$kv.Key] = $kv.Value }
  }
  if ($mutate) { & $mutate $h }
  $p = @{ Uri = $url; Method = $method; Headers = $h; UseBasicParsing = $true; ErrorAction = 'Stop' }
  if ($body -ne $null) { $p['Body'] = [Text.Encoding]::UTF8.GetBytes($bodyText); $p['ContentType'] = 'application/json; charset=utf-8' }
  if ($cookie) { $sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession; $sess.Cookies.Add((New-Object System.Net.Cookie('refresh_token', $cookie, '/api/v1/auth', 'localhost'))); $p['WebSession'] = $sess }
  $text = ''
  try { $r = Invoke-WebRequest @p; $text = $r.Content }
  catch { if ($_.Exception.Response) { $r = $_.Exception.Response; $text = $_.ErrorDetails.Message } else { throw } }
  $json = $null; try { $json = $text | ConvertFrom-Json } catch {}
  $setCookie = "$($r.Headers['Set-Cookie'])"; $rt = $null
  if ($setCookie -match 'refresh_token=([^;]*)') { $rt = $Matches[1] }
  [pscustomobject]@{ Status = [int]$r.StatusCode; Json = $json; Data = $json.data; Code = $json.error.code; Headers = $r.Headers; Cookie = $rt }
}

function NewUser($s, $label) {
  $email = "${label}_$([guid]::NewGuid().ToString('N').Substring(0,8))@example.com"; $pw = 'Passw0rdTest1'
  $null = Call $s POST /auth/register @{ name = "User $label"; email = $email; password = $pw; confirm_password = $pw }
  $l = Call $s POST /auth/login @{ email = $email; password = $pw }
  [pscustomobject]@{ Email = $email; Pw = $pw; Token = $l.Data.access_token; Key = $l.Data.signing_key; Cookie = $l.Cookie; Login = $l }
}
$now = { [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }

$servers = @()
try {
  # ======================================================== S1: enforce
  $S1 = Start-Api 'sig1' 6995 @{ API_SIGNATURE = 'enforce'; API_RATE_LIMIT_PER_MIN = '15'; APP_ENV = 'development'; TOKEN_CLEANUP_INTERVAL = '0' }
  $servers += $S1
  Check 'S1: server (API_SIGNATURE=enforce) berjalan' (Wait-Healthy $S1)

  Check 'publik tanpa tanda tangan: /health' ((Call $S1 GET /health).Status -eq 200)
  $A = NewUser $S1 'siga'; $B = NewUser $S1 'sigb'
  Check 'publik tanpa tanda tangan: register + login berhasil' ($A.Token -and $B.Token)
  Check 'login mengembalikan signing_key (base64url 32 byte = 43 karakter) yang berbeda untuk tiap token' ($A.Key -match '^[A-Za-z0-9_-]{43}$' -and $A.Key -ne $B.Key)

  # ---- request sah ----
  Check 'GET /me bertanda tangan -> 200' ((Call $S1 GET /me $null $A.Token $A.Key).Status -eq 200)
  $r = Call $S1 POST /projects @{ name = 'Proyek TTD'; key = (-join ((65..90) | Get-Random -Count 4 | ForEach-Object { [char]$_ })); description = 'Judul dengan unicode: halo dunia' } $A.Token $A.Key
  Check 'POST dengan body JSON bertanda tangan -> 201 (hash body benar)' ($r.Status -eq 201)
  $P = $r.Data.id
  $ru = Call $S1 POST /projects @{ name = ('Proyek Unik ' + [char]0x00E9 + [char]0x4E2D + ' ' + [char]::ConvertFromUtf32(0x1F680)); key = (-join ((65..90) | Get-Random -Count 4 | ForEach-Object { [char]$_ })) } $A.Token $A.Key
  Check 'body berisi karakter non-ASCII dan emoji bertanda tangan -> 201 (hash UTF-8)' ($ru.Status -eq 201)
  Check 'query dengan spasi, plus, unicode, dan urutan acak -> 200' ((Call $S1 GET "/projects?q=Proyek+TTD&archived=false&x=$([uri]::EscapeDataString([string][char]0x4E2D))" $null $A.Token $A.Key).Status -eq 200)
  $rr = Call $S1 GET "/projects/$P/tasks?status=todo,in_progress&sort=-created_at&per_page=5" $null $A.Token $A.Key
  Check 'query filter dengan koma bertanda tangan -> 200 (tanda tangan diterima, bukan 401)' ($rr.Status -eq 200)
  Check 'DELETE tanpa body bertanda tangan -> 200 (hash string kosong)' ((Call $S1 DELETE "/projects/$($ru.Data.id)" @{ confirm_name = $ru.Data.name } $A.Token $A.Key).Status -eq 200)

  # ---- tanda tangan wajib ----
  $r = Call $S1 GET /me $null $A.Token
  Check 'tanpa tanda tangan -> 401 SIGNATURE_REQUIRED' ($r.Status -eq 401 -and $r.Code -eq 'SIGNATURE_REQUIRED')
  Check 'token valid saja (tanpa kunci) tidak cukup untuk membaca data' ((Call $S1 GET /projects $null $A.Token).Status -eq 401)
  Check 'hanya X-Signature tanpa X-Timestamp/X-Nonce -> 401 SIGNATURE_INVALID' ((Call $S1 GET /me $null $A.Token $A.Key -mutate { param($h) $h.Remove('X-Timestamp'); $h.Remove('X-Nonce') }).Code -eq 'SIGNATURE_INVALID')
  Check 'tanpa X-Signature tetapi ada timestamp+nonce -> 401 SIGNATURE_INVALID' ((Call $S1 GET /me $null $A.Token $A.Key -mutate { param($h) $h.Remove('X-Signature') }).Code -eq 'SIGNATURE_INVALID')

  # ---- pemalsuan ----
  $r = Call $S1 PATCH /me @{ name = 'Nama Asli' } $A.Token $A.Key -signBody '{"name":"Nama Lain"}'
  Check 'body diubah setelah ditandatangani -> 401 SIGNATURE_INVALID' ($r.Status -eq 401 -and $r.Code -eq 'SIGNATURE_INVALID')
  Check 'efek pemalsuan tidak terjadi (nama tidak berubah)' ((Call $S1 GET /me $null $A.Token $A.Key).Data.name -eq 'User siga')
  Check 'path diubah (ditandatangani untuk /projects, dikirim ke /me) -> 401 SIGNATURE_INVALID' ((Call $S1 GET /me $null $A.Token $A.Key -signPath '/projects').Code -eq 'SIGNATURE_INVALID')
  Check 'query diubah -> 401 SIGNATURE_INVALID' ((Call $S1 GET '/projects?q=b' $null $A.Token $A.Key -signPath '/projects?q=a').Code -eq 'SIGNATURE_INVALID')
  $r = Call $S1 DELETE "/projects/$P" @{ confirm_name = 'Proyek TTD' } $A.Token $A.Key -signMethod 'GET'
  Check 'method diubah (ditandatangani GET, dikirim DELETE) -> 401 dan proyek TIDAK terhapus' ($r.Code -eq 'SIGNATURE_INVALID' -and (Call $S1 GET "/projects/$P" $null $A.Token $A.Key).Status -eq 200)
  Check 'tanda tangan bukan hex -> 401 SIGNATURE_INVALID' ((Call $S1 GET /me $null $A.Token $A.Key -mutate { param($h) $h['X-Signature'] = ('z' * 64) }).Code -eq 'SIGNATURE_INVALID')
  Check 'nonce terlalu pendek -> 401 SIGNATURE_INVALID' ((Call $S1 GET /me $null $A.Token $A.Key -mutate { param($h) $h['X-Nonce'] = 'abc' }).Code -eq 'SIGNATURE_INVALID')
  Check 'timestamp bukan angka -> 401 SIGNATURE_INVALID' ((Call $S1 GET /me $null $A.Token $A.Key -mutate { param($h) $h['X-Timestamp'] = 'kemarin' }).Code -eq 'SIGNATURE_INVALID')

  # ---- kunci terikat pada token ----
  Check 'kunci milik user lain -> 401 SIGNATURE_INVALID' ((Call $S1 GET /me $null $A.Token $B.Key).Code -eq 'SIGNATURE_INVALID')
  Check 'token user lain + kunci sendiri -> 401' ((Call $S1 GET /me $null $B.Token $A.Key).Status -eq 401)

  # ---- kedaluwarsa & replay ----
  $old = (& $now) - 600; $future = (& $now) + 600
  $h1 = New-SignatureHeaders -Method GET -Url "$($S1.Base)/me" -KeyB64 $A.Key -Timestamp $old
  $r = Call $S1 GET /me $null $A.Token -headers $h1
  Check 'waktu 10 menit lalu (ditandatangani benar) -> 401 SIGNATURE_EXPIRED' ($r.Status -eq 401 -and $r.Code -eq 'SIGNATURE_EXPIRED')
  $h2 = New-SignatureHeaders -Method GET -Url "$($S1.Base)/me" -KeyB64 $A.Key -Timestamp $future
  Check 'waktu 10 menit ke depan -> 401 SIGNATURE_EXPIRED' ((Call $S1 GET /me $null $A.Token -headers $h2).Code -eq 'SIGNATURE_EXPIRED')
  $h3 = New-SignatureHeaders -Method GET -Url "$($S1.Base)/me" -KeyB64 $A.Key -Timestamp ((& $now) - 240)
  Check 'waktu 4 menit lalu (dalam toleransi 5 menit) -> 200' ((Call $S1 GET /me $null $A.Token -headers $h3).Status -eq 200)
  $rep = New-SignatureHeaders -Method GET -Url "$($S1.Base)/me" -KeyB64 $A.Key
  $first = Call $S1 GET /me $null $A.Token -headers $rep
  $second = Call $S1 GET /me $null $A.Token -headers $rep
  Check 'replay: pengiriman pertama 200, pengiriman ulang identik -> 401 SIGNATURE_REPLAY' ($first.Status -eq 200 -and $second.Status -eq 401 -and $second.Code -eq 'SIGNATURE_REPLAY')
  $repPost = New-SignatureHeaders -Method POST -Url "$($S1.Base)/projects/$P/favorite" -KeyB64 $A.Key
  $a1 = Call $S1 POST "/projects/$P/favorite" $null $A.Token -headers $repPost
  $a2 = Call $S1 POST "/projects/$P/favorite" $null $A.Token -headers $repPost
  Check 'replay request yang mengubah data tidak dieksekusi dua kali (toggle favorit hanya sekali)' ($a1.Data.is_favorite -eq $true -and $a2.Code -eq 'SIGNATURE_REPLAY' -and (Call $S1 GET "/projects/$P" $null $A.Token $A.Key).Data.is_favorite -eq $true)

  # ---- kunci berganti tiap token baru ----
  $rf = Call $S1 POST /auth/refresh -cookie $A.Cookie
  Check 'refresh (publik, tanpa tanda tangan) memberi token + signing_key baru' ($rf.Status -eq 200 -and $rf.Data.signing_key -match '^[A-Za-z0-9_-]{43}$' -and $rf.Data.signing_key -ne $A.Key)
  $newTok = $rf.Data.access_token; $newKey = $rf.Data.signing_key
  Check 'token baru + kunci baru -> 200' ((Call $S1 GET /me $null $newTok $newKey).Status -eq 200)
  Check 'token baru + kunci LAMA -> 401 SIGNATURE_INVALID' ((Call $S1 GET /me $null $newTok $A.Key).Code -eq 'SIGNATURE_INVALID')
  Check 'token lama + kunci lama tetap berlaku sampai token itu kedaluwarsa' ((Call $S1 GET /me $null $A.Token $A.Key).Status -eq 200)
  $pw = Call $S1 PATCH /me/password @{ current_password = $B.Pw; new_password = 'Passw0rdBaru2'; confirm_password = 'Passw0rdBaru2' } $B.Token $B.Key
  Check 'ganti password (bertanda tangan) -> 200 dengan token dan signing_key baru' ($pw.Status -eq 200 -and $pw.Data.signing_key -match '^[A-Za-z0-9_-]{43}$' -and $pw.Data.signing_key -ne $B.Key)
  Check 'setelah ganti password: token lama ditolak (UNAUTHORIZED, bukan soal tanda tangan)' ((Call $S1 GET /me $null $B.Token $B.Key).Code -eq 'UNAUTHORIZED')
  Check 'token baru + kunci baru berfungsi' ((Call $S1 GET /me $null $pw.Data.access_token $pw.Data.signing_key).Status -eq 200)
  Check 'logout-all (POST tanpa body, bertanda tangan) -> 200' ((Call $S1 POST /auth/logout-all $null $pw.Data.access_token $pw.Data.signing_key).Status -eq 200)

  # ---- request tak bertanda tangan tidak menghabiskan kuota rate limit pemilik token ----
  $C = NewUser $S1 'sigc'
  $codes = 1..30 | ForEach-Object { (Call $S1 GET /me $null $C.Token).Status }
  Check 'pemegang token curian: 30 request tanpa tanda tangan semuanya 401 (bukan 429)' (@($codes | Where-Object { $_ -eq 401 }).Count -eq 30)
  $okCodes = 1..15 | ForEach-Object { (Call $S1 GET /me $null $C.Token $C.Key).Status }
  Check 'pemilik sah masih punya seluruh kuota 15/menit (semua 200)' (@($okCodes | Where-Object { $_ -eq 200 }).Count -eq 15)
  Check 'request sah ke-16 -> 429 (batas laju tetap bekerja setelah verifikasi)' ((Call $S1 GET /me $null $C.Token $C.Key).Status -eq 429)

  # ---- CORS: browser perlu izin header kustom dan boleh membaca Date ----
  $pre = Invoke-WebRequest "$($S1.Base)/me" -Method OPTIONS -UseBasicParsing -Headers @{ Origin = 'http://localhost:6969'; 'Access-Control-Request-Method' = 'GET'; 'Access-Control-Request-Headers' = 'authorization,x-signature,x-timestamp,x-nonce' }
  $allow = "$($pre.Headers['Access-Control-Allow-Headers'])".ToLower()
  Check 'CORS preflight mengizinkan Authorization, X-Signature, X-Timestamp, X-Nonce' (($pre.StatusCode -eq 204 -or $pre.StatusCode -eq 200) -and ($allow -match 'x-signature') -and ($allow -match 'x-timestamp') -and ($allow -match 'x-nonce') -and ($allow -match 'authorization'))
  $evil = $null; try { $evil = (Invoke-WebRequest "$($S1.Base)/me" -Method OPTIONS -UseBasicParsing -Headers @{ Origin = 'http://evil.example'; 'Access-Control-Request-Method' = 'GET' }).Headers['Access-Control-Allow-Origin'] } catch { $evil = $null }
Check 'CORS preflight dari origin asing tidak diberi izin' (-not $evil)
  $g = Invoke-WebRequest "$($S1.Base)/health" -UseBasicParsing -Headers @{ Origin = 'http://localhost:6969' }
  $expose = "$($g.Headers['Access-Control-Expose-Headers'])".ToLower()
  Check 'CORS mengekspos Date (sinkron jam), X-Request-ID, Retry-After ke JavaScript' (($expose -match 'date') -and ($expose -match 'x-request-id') -and ($expose -match 'retry-after'))
  $skew = [Math]::Abs(([DateTimeOffset]::Parse("$($g.Headers['Date'])").ToUnixTimeSeconds()) - (& $now))
  Check 'header Date server dekat dengan jam lokal (dasar sinkronisasi jam klien)' ($skew -le 5)

  # ======================================================== S2: optional
  $S2 = Start-Api 'sig2' 6996 @{ API_SIGNATURE = 'optional'; API_RATE_LIMIT_PER_MIN = '0'; APP_ENV = 'development'; TOKEN_CLEANUP_INTERVAL = '0' }
  $servers += $S2
  Check 'S2: server (API_SIGNATURE=optional) berjalan' (Wait-Healthy $S2)
  $D = NewUser $S2 'sigd'
  Check 'optional: tanpa tanda tangan -> 200 (Swagger/skrip lama tetap bisa)' ((Call $S2 GET /me $null $D.Token).Status -eq 200)
  Check 'optional: tanda tangan valid -> 200' ((Call $S2 GET /me $null $D.Token $D.Key).Status -eq 200)
  Check 'optional: tanda tangan SALAH tetap ditolak (tidak bisa dipakai melewati pemeriksaan)' ((Call $S2 GET /me $null $D.Token $D.Key -mutate { param($h) $h['X-Signature'] = ('0' * 64) }).Code -eq 'SIGNATURE_INVALID')
  $rep2 = New-SignatureHeaders -Method GET -Url "$($S2.Base)/me" -KeyB64 $D.Key
  $null = Call $S2 GET /me $null $D.Token -headers $rep2
  Check 'optional: replay tetap ditolak' ((Call $S2 GET /me $null $D.Token -headers $rep2).Code -eq 'SIGNATURE_REPLAY')
}
finally {
  foreach ($s in $servers) { Stop-Api $s }
  Remove-Item $script:logDir -Recurse -Force -ErrorAction SilentlyContinue
}

"`nHASIL: $script:pass lulus, $script:fail gagal"
if ($script:fail -gt 0) { exit 1 }
