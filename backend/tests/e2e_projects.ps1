# Uji end-to-end fitur 03 (proyek, anggota, hak akses).
# Jalankan server dulu (cd backend; go run ./cmd/api), lalu: powershell -File tests/e2e_projects.ps1
# Memakai 3 register + 3 login (batas rate limit 5/menit/IP), jadi jangan dijalankan
# bersamaan dengan e2e_auth.ps1 dalam satu menit.
$base = 'http://localhost:6990/api/v1'
$script:pass = 0; $script:fail = 0

function Call($method, $path, $body = $null, $token = $null) {
  $h = @{}; if ($token) { $h['Authorization'] = "Bearer $token" }
  $p = @{ Uri = "$base$path"; Method = $method; Headers = $h; UseBasicParsing = $true; ErrorAction = 'Stop' }
  if ($null -ne $body) { $p['Body'] = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json)); $p['ContentType'] = 'application/json; charset=utf-8' }
  $text = ''
  try { $r = Invoke-WebRequest @p; $text = $r.Content }
  catch { if ($_.Exception.Response) { $r = $_.Exception.Response; $text = $_.ErrorDetails.Message } else { throw } }
  $json = $null; try { $json = $text | ConvertFrom-Json } catch {}
  [pscustomobject]@{ Status = [int]$r.StatusCode; Json = $json; Data = $json.data; Err = $json.error }
}
function Check($name, $cond) { if ($cond) { $script:pass++; "PASS  $name" } else { $script:fail++; "FAIL  $name" } }

function NewUser($label) {
  $email = "${label}_$([guid]::NewGuid().ToString('N').Substring(0,8))@example.com"
  $pw = 'Passw0rdTest1'
  $null = Call POST /auth/register @{ name = "User $label"; email = $email; password = $pw; confirm_password = $pw }
  $l = Call POST /auth/login @{ email = $email; password = $pw }
  [pscustomobject]@{ Email = $email; Id = $l.Data.user.id; Token = $l.Data.access_token }
}

$A = NewUser 'owner'; $B = NewUser 'member'; $C = NewUser 'outsider'
Check 'setup: 3 user terdaftar & login' ($A.Token -and $B.Token -and $C.Token)
$key1 = -join ((65..90) | Get-Random -Count 4 | ForEach-Object { [char]$_ })
$key2 = -join ((65..90) | Get-Random -Count 4 | ForEach-Object { [char]$_ })

# --- Buat proyek ---
$r = Call POST /projects @{ name = '  Proyek Satu  '; key = $key1.ToLower(); description = 'Deskripsi'; icon = [char]::ConvertFromUtf32(0x1F680) } $A.Token
Check 'buat proyek 201, ikon emoji tersimpan utuh' ($r.Status -eq 201 -and $r.Data.icon -eq ([char]::ConvertFromUtf32(0x1F680)))
$P1 = $r.Data.id
Check 'pembuat otomatis owner, 1 anggota' ($r.Data.my_role -eq 'owner' -and $r.Data.member_count -eq 1)
Check 'key otomatis huruf besar, nama di-trim, warna default' ($r.Data.key -ceq $key1 -and $r.Data.name -eq 'Proyek Satu' -and $r.Data.color -eq '#6366F1')
$r = Call POST /projects @{ name = 'Duplikat'; key = $key1 } $B.Token
Check 'key duplikat (beda user) -> 409' ($r.Status -eq 409 -and $r.Err.code -eq 'CONFLICT')
$r = Call POST /projects @{ name = 'X'; key = 'A1' ; color = 'merah'; icon = '12345678901' } $A.Token
Check 'validasi nama/key/warna/ikon -> 400 dengan details' ($r.Status -eq 400 -and $r.Err.details.name -and $r.Err.details.key -and $r.Err.details.color -and $r.Err.details.icon)
$r = Call POST /projects @{ name = 'Tanpa Key' } $A.Token
Check 'key wajib -> 400' ($r.Status -eq 400 -and $r.Err.details.key)
$r = Call POST /projects @{ name = 'Tanpa login'; key = 'ZZZ' }
Check 'buat proyek tanpa token -> 401' ($r.Status -eq 401)

# --- Daftar, cari, favorit ---
Start-Sleep -Milliseconds 1100
$r = Call POST /projects @{ name = 'Alpha Kedua'; key = $key2 } $A.Token
$P2 = $r.Data.id
$r = Call GET /projects $null $A.Token
Check 'daftar: terbaru di atas' ($r.Status -eq 200 -and $r.Data.Count -eq 2 -and $r.Data[0].id -eq $P2)
Check 'daftar: memuat member_count & preview avatar' ($r.Data[0].member_count -eq 1 -and $r.Data[0].members_preview.Count -eq 1)
$r = Call GET '/projects?q=satu' $null $A.Token
Check 'cari nama (case-insensitive)' ($r.Data.Count -eq 1 -and $r.Data[0].id -eq $P1)
$r = Call GET '/projects?q=%25' $null $A.Token
Check 'cari dengan karakter % dianggap literal (0 hasil)' ($r.Status -eq 200 -and $r.Data.Count -eq 0)
$r = Call GET /projects $null $C.Token
Check 'user lain melihat daftar kosong (bukan null)' ($r.Status -eq 200 -and $r.Json.success -and ($r.Json.data -is [array] -or $r.Data.Count -eq 0))
$r = Call POST "/projects/$P1/favorite" $null $A.Token
Check 'favorit ON' ($r.Status -eq 200 -and $r.Data.is_favorite -eq $true)
$r = Call GET /projects $null $A.Token
Check 'proyek favorit naik ke paling atas' ($r.Data[0].id -eq $P1 -and $r.Data[0].is_favorite)
$r = Call POST "/projects/$P1/favorite" $null $A.Token
Check 'favorit OFF (toggle)' ($r.Data.is_favorite -eq $false)

# --- Non-anggota: 404 (bukan 403) ---
$r = Call GET "/projects/$P1" $null $C.Token
Check 'non-anggota GET proyek -> 404' ($r.Status -eq 404)
Check 'non-anggota PATCH -> 404' ((Call PATCH "/projects/$P1" @{ name = 'Hack' } $C.Token).Status -eq 404)
Check 'non-anggota lihat anggota -> 404' ((Call GET "/projects/$P1/members" $null $C.Token).Status -eq 404)
Check 'non-anggota tambah anggota -> 404' ((Call POST "/projects/$P1/members" @{ email = $C.Email } $C.Token).Status -eq 404)
Check 'non-anggota hapus proyek -> 404' ((Call DELETE "/projects/$P1" @{ confirm_name = 'Proyek Satu' } $C.Token).Status -eq 404)
Check 'non-anggota favorit -> 404' ((Call POST "/projects/$P1/favorite" $null $C.Token).Status -eq 404)
Check 'ID bukan UUID -> 404' ((Call GET '/projects/abc' $null $A.Token).Status -eq 404)
Check 'UUID tak ada -> 404' ((Call GET '/projects/00000000-0000-4000-8000-000000000000' $null $A.Token).Status -eq 404)

# --- Anggota ---
$r = Call POST "/projects/$P1/members" @{ email = $B.Email.ToUpper() } $A.Token
Check 'owner tambah anggota (email case-insensitive) 201, default role member' ($r.Status -eq 201 -and $r.Data.role -eq 'member' -and $r.Data.user_id -eq $B.Id)
Check 'tambah anggota duplikat -> 409' ((Call POST "/projects/$P1/members" @{ email = $B.Email } $A.Token).Status -eq 409)
$r = Call POST "/projects/$P1/members" @{ email = 'tidak.ada@example.com' } $A.Token
Check 'tambah email belum terdaftar -> 404' ($r.Status -eq 404)
Check 'role tidak valid -> 400' ((Call POST "/projects/$P1/members" @{ email = $C.Email; role = 'admin' } $A.Token).Status -eq 400)
$r = Call GET "/projects/$P1/members" $null $B.Token
Check 'member bisa lihat daftar anggota (owner dulu), tanpa data sensitif' ($r.Status -eq 200 -and $r.Data.Count -eq 2 -and $r.Data[0].role -eq 'owner' -and -not ($r.Data[0].PSObject.Properties.Name -match 'password'))

# --- Hak akses member ---
$r = Call GET "/projects/$P1" $null $B.Token
Check 'member GET proyek 200 dengan my_role member' ($r.Status -eq 200 -and $r.Data.my_role -eq 'member' -and $r.Data.member_count -eq 2)
Check 'member edit pengaturan -> 403' ((Call PATCH "/projects/$P1" @{ name = 'Ubah' } $B.Token).Status -eq 403)
Check 'member arsipkan -> 403' ((Call POST "/projects/$P1/archive" @{ archived = $true } $B.Token).Status -eq 403)
Check 'member hapus proyek -> 403' ((Call DELETE "/projects/$P1" @{ confirm_name = 'Proyek Satu' } $B.Token).Status -eq 403)
Check 'member undang anggota -> 403' ((Call POST "/projects/$P1/members" @{ email = $C.Email } $B.Token).Status -eq 403)
Check 'member ubah role -> 403' ((Call PATCH "/projects/$P1/members/$($A.Id)" @{ role = 'member' } $B.Token).Status -eq 403)
Check 'member keluarkan owner -> 403' ((Call DELETE "/projects/$P1/members/$($A.Id)" $null $B.Token).Status -eq 403)
$r = Call POST "/projects/$P1/favorite" $null $B.Token
Check 'member bisa favorit (per user, tidak memengaruhi owner)' ($r.Status -eq 200 -and $r.Data.is_favorite -eq $true -and (Call GET "/projects/$P1" $null $A.Token).Data.is_favorite -eq $false)

# --- Edit & arsip ---
$r = Call PATCH "/projects/$P1" @{ name = 'Nama Baru'; color = '#ff0000'; description = ''; icon = [char]::ConvertFromUtf32(0x1F4CC); key = 'HACK' } $A.Token
Check 'owner edit: nama, warna (uppercase), deskripsi dikosongkan, ikon' ($r.Status -eq 200 -and $r.Data.name -eq 'Nama Baru' -and $r.Data.color -eq '#FF0000' -and $null -eq $r.Data.description -and $r.Data.icon -eq ([char]::ConvertFromUtf32(0x1F4CC)))
Check 'key tidak bisa diubah lewat PATCH' ($r.Data.key -ceq $key1)
Check 'PATCH kosong -> 400' ((Call PATCH "/projects/$P1" @{} $A.Token).Status -eq 400)
Check 'PATCH warna salah -> 400' ((Call PATCH "/projects/$P1" @{ color = 'x' } $A.Token).Status -eq 400)
$r = Call POST "/projects/$P2/archive" @{ archived = $true } $A.Token
Check 'owner arsipkan 200, archived_at terisi' ($r.Status -eq 200 -and $r.Data.archived_at)
Check 'daftar default menyembunyikan proyek terarsip' ((Call GET /projects $null $A.Token).Data.id -notcontains $P2)
Check 'daftar ?archived=true menampilkannya' ((Call GET '/projects?archived=true' $null $A.Token).Data.id -contains $P2)
$r = Call POST "/projects/$P2/archive" @{ archived = $false } $A.Token
Check 'pulihkan dari arsip' ($r.Status -eq 200 -and $null -eq $r.Data.archived_at)
Check 'archive tanpa body -> 400' ((Call POST "/projects/$P2/archive" @{} $A.Token).Status -eq 400)

# --- Role & owner terakhir ---
Check 'owner tunggal turunkan diri -> 400' ((Call PATCH "/projects/$P1/members/$($A.Id)" @{ role = 'member' } $A.Token).Status -eq 400)
Check 'owner tunggal keluar -> 400' ((Call DELETE "/projects/$P1/members/$($A.Id)" $null $A.Token).Status -eq 400)
$r = Call PATCH "/projects/$P1/members/$($B.Id)" @{ role = 'owner' } $A.Token
Check 'owner promosikan member jadi owner' ($r.Status -eq 200 -and $r.Data.role -eq 'owner')
Check 'owner baru bisa edit pengaturan' ((Call PATCH "/projects/$P1" @{ name = 'Diubah B' } $B.Token).Status -eq 200)
Check 'ubah role target bukan anggota -> 404' ((Call PATCH "/projects/$P1/members/$($C.Id)" @{ role = 'owner' } $A.Token).Status -eq 404)
$r = Call PATCH "/projects/$P1/members/$($B.Id)" @{ role = 'member' } $A.Token
Check 'turunkan owner saat masih ada owner lain -> 200' ($r.Status -eq 200 -and $r.Data.role -eq 'member')
$null = Call PATCH "/projects/$P1/members/$($B.Id)" @{ role = 'owner' } $A.Token

# --- Keluar / dikeluarkan ---
Check 'owner keluar saat ada owner lain -> 200' ((Call DELETE "/projects/$P1/members/$($A.Id)" $null $A.Token).Status -eq 200)
Check 'setelah keluar, proyek 404 bagi mantan anggota' ((Call GET "/projects/$P1" $null $A.Token).Status -eq 404)
Check 'owner tersisa (B) tidak bisa keluar -> 400' ((Call DELETE "/projects/$P1/members/$($B.Id)" $null $B.Token).Status -eq 400)
$null = Call POST "/projects/$P1/members" @{ email = $C.Email } $B.Token
Check 'member biasa tidak bisa mengeluarkan orang lain -> 403' ((Call DELETE "/projects/$P1/members/$($B.Id)" $null $C.Token).Status -eq 403)
Check 'owner mengeluarkan member -> 200' ((Call DELETE "/projects/$P1/members/$($C.Id)" $null $B.Token).Status -eq 200)
Check 'mengeluarkan non-anggota -> 404' ((Call DELETE "/projects/$P1/members/$($C.Id)" $null $B.Token).Status -eq 404)
$null = Call POST "/projects/$P1/members" @{ email = $C.Email } $B.Token
Check 'member keluar sendiri -> 200' ((Call DELETE "/projects/$P1/members/$($C.Id)" $null $C.Token).Status -eq 200)

# --- Hapus proyek ---
$r = Call DELETE "/projects/$P1" @{ confirm_name = 'salah' } $B.Token
Check 'hapus dengan nama konfirmasi salah -> 400' ($r.Status -eq 400 -and $r.Err.details.confirm_name)
Check 'hapus tanpa konfirmasi -> 400' ((Call DELETE "/projects/$P1" @{} $B.Token).Status -eq 400)
Check 'hapus dengan nama benar -> 200' ((Call DELETE "/projects/$P1" @{ confirm_name = 'Diubah B' } $B.Token).Status -eq 200)
Check 'proyek terhapus -> 404' ((Call GET "/projects/$P1" $null $B.Token).Status -eq 404)

# --- Cari user untuk diundang ---
$prefix = $C.Email.Substring(0, 12)
$r = Call GET "/users/search?email=$prefix" $null $A.Token
Check 'cari user (awalan email) menemukan user' ($r.Status -eq 200 -and $r.Data.email -contains $C.Email)
Check 'hasil pencarian tidak memuat password/hash' (($r.Json | ConvertTo-Json -Depth 5) -notmatch 'password')
$r = Call GET "/users/search?email=$($C.Email.Substring(0,12))" $null $C.Token
Check 'pencarian tidak menyertakan diri sendiri' ($r.Data.email -notcontains $C.Email)
Check 'pencarian < 3 karakter -> 400' ((Call GET '/users/search?email=ab' $null $A.Token).Status -eq 400)
Check 'pencarian tanpa login -> 401' ((Call GET '/users/search?email=abc').Status -eq 401)

"`nHASIL: $script:pass lulus, $script:fail gagal"
if ($script:fail -gt 0) { exit 1 }
