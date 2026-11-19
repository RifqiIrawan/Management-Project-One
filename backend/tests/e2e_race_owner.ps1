# Uji race condition "owner terakhir": dua owner saling menurunkan role secara bersamaan.
#
# Agar tumpang-tindih terjadi secara deterministik, sebuah transaksi psql menahan kunci baris
# owner selama beberapa detik. Dua request dikirim saat kunci ditahan: keduanya lolos pengecekan
# akses (keduanya masih owner), lalu antre di SELECT ... FOR UPDATE milik server.
#   - Dengan penguncian : satu 200 dan satu 400 (owner terakhir) -> proyek tetap punya 1 owner.
#   - Tanpa penguncian  : dua-duanya 200 -> proyek tanpa owner (bug).
#
# Butuh psql dan kredensial DB dari backend/.env. Jalankan server dulu, lalu:
#   powershell -File backend/tests/e2e_race_owner.ps1 [-Rounds 6] [-HoldSeconds 5]
param([int]$Rounds = 6, [int]$HoldSeconds = 5, [string]$Base = 'http://localhost:6990/api/v1')

$envFile = Join-Path $PSScriptRoot '..\.env'
$cfg = @{}; Get-Content $envFile | ForEach-Object { if ($_ -match '^([A-Z_]+)=(.*)$') { $cfg[$Matches[1]] = $Matches[2] } }
$dbName = if ($cfg.DB_NAME) { $cfg.DB_NAME } else { 'management_project_one' }
$dbUser = if ($cfg.DB_USER) { $cfg.DB_USER } else { 'mpo' }

function Api($method, $path, $body, $token) {
  $h = @{}; if ($token) { $h['Authorization'] = "Bearer $token" }
  $p = @{ Uri = "$Base$path"; Method = $method; Headers = $h; UseBasicParsing = $true; ErrorAction = 'Stop' }
  if ($null -ne $body) { $p['Body'] = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json)); $p['ContentType'] = 'application/json; charset=utf-8' }
  try { $r = Invoke-WebRequest @p; $t = $r.Content } catch { $r = $_.Exception.Response; $t = $_.ErrorDetails.Message }
  [pscustomobject]@{ Status = [int]$r.StatusCode; Data = ($t | ConvertFrom-Json).data }
}
function NewUser($label) {
  $e = "${label}_$([guid]::NewGuid().ToString('N').Substring(0,8))@example.com"; $pw = 'Passw0rdTest1'
  $null = Api POST /auth/register @{ name = $label; email = $e; password = $pw; confirm_password = $pw }
  $l = Api POST /auth/login @{ email = $e; password = $pw }
  [pscustomobject]@{ Email = $e; Id = $l.Data.user.id; Token = $l.Data.access_token }
}

$A = NewUser 'raceA'; $B = NewUser 'raceB'
$zeroOwner = 0; $overlapped = 0
for ($i = 1; $i -le $Rounds; $i++) {
  $key = -join ((65..90) | Get-Random -Count 5 | ForEach-Object { [char]$_ })
  $proj = (Api POST /projects @{ name = "Race $i"; key = $key } $A.Token).Data.id
  $null = Api POST "/projects/$proj/members" @{ email = $B.Email; role = 'owner' } $A.Token

  # 1) tahan kunci baris owner dari sisi database
  $sql = "BEGIN; SELECT 1 FROM project_members WHERE project_id = '$proj' AND role = 'owner' FOR UPDATE; SELECT pg_sleep($HoldSeconds); COMMIT;"
  $holder = Start-Job -ArgumentList $dbUser, $dbName, $cfg.DB_PASSWORD, $sql -ScriptBlock {
    param($u, $d, $pw, $q); $env:PGPASSWORD = $pw; psql -h localhost -U $u -d $d -q -c $q 2>&1 | Out-Null
  }
  Start-Sleep -Milliseconds 800

  # 2) dua owner saling menurunkan saat kunci ditahan
  $jobs = @(@{ Tok = $A.Token; Target = $B.Id }, @{ Tok = $B.Token; Target = $A.Id }) | ForEach-Object {
    Start-Job -ArgumentList $Base, $proj, $_.Tok, $_.Target -ScriptBlock {
      param($base, $proj, $tok, $target)
      $body = [Text.Encoding]::UTF8.GetBytes('{"role":"member"}')
      try { (Invoke-WebRequest "$base/projects/$proj/members/$target" -Method PATCH -Headers @{ Authorization = "Bearer $tok" } -Body $body -ContentType 'application/json' -UseBasicParsing).StatusCode }
      catch { [int]$_.Exception.Response.StatusCode }
    }
  }
  $codes = @($jobs | Wait-Job | Receive-Job | Sort-Object); $jobs | Remove-Job
  $holder | Wait-Job | Remove-Job

  $view = Api GET "/projects/$proj/members" $null $A.Token
  if ($view.Status -ne 200) { $view = Api GET "/projects/$proj/members" $null $B.Token }
  $ownerCount = @($view.Data | Where-Object { $_.role -eq 'owner' }).Count
  if ($ownerCount -eq 0) { $zeroOwner++ }
  if ($codes -notcontains 403) { $overlapped++ }
  "ronde ${i}: status=$($codes -join ',') owner_tersisa=$ownerCount"
}
"`nRINGKAS: $Rounds ronde, tumpang-tindih terjadi = $overlapped, proyek tanpa owner = $zeroOwner"
if ($zeroOwner -gt 0) { 'GAGAL: race condition terdeteksi'; exit 1 }
if ($overlapped -eq 0) { 'TIDAK VALID: request tidak pernah tumpang-tindih (coba naikkan -HoldSeconds)'; exit 2 }
'LULUS: proyek tidak pernah tanpa owner meski request tumpang-tindih'
