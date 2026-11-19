# Uji end-to-end fitur 06: komentar, comment_count, dan riwayat aktivitas (per tugas & per proyek).
# Jalankan server dulu (cd backend; go run ./cmd/api), lalu: powershell -File tests/e2e_comments.ps1
# Bagian cek database memakai psql (kredensial dari backend/.env); dilewati bila psql tidak ada.
# Memakai 3 register + 3 login (batas rate limit 5/menit/IP).
param([string]$Base = 'http://localhost:6990/api/v1')
$script:pass = 0; $script:fail = 0

function Call($method, $path, $body = $null, $token = $null) {
  $h = @{}; if ($token) { $h['Authorization'] = "Bearer $token" }
  $p = @{ Uri = "$Base$path"; Method = $method; Headers = $h; UseBasicParsing = $true; ErrorAction = 'Stop' }
  if ($null -ne $body) {
    $json = if ($body -is [string]) { $body } else { $body | ConvertTo-Json -Depth 5 }
    $p['Body'] = [Text.Encoding]::UTF8.GetBytes($json); $p['ContentType'] = 'application/json; charset=utf-8'
  }
  $text = ''
  try { $r = Invoke-WebRequest @p; $text = $r.Content }
  catch { if ($_.Exception.Response) { $r = $_.Exception.Response; $text = $_.ErrorDetails.Message } else { throw } }
  $json = $null; try { $json = $text | ConvertFrom-Json } catch {}
  [pscustomobject]@{ Status = [int]$r.StatusCode; Json = $json; Data = $json.data; Err = $json.error }
}
function Check($name, $cond) { if ($cond) { $script:pass++; "PASS  $name" } else { $script:fail++; "FAIL  $name" } }
function NewUser($label) {
  $email = "${label}_$([guid]::NewGuid().ToString('N').Substring(0,8))@example.com"; $pw = 'Passw0rdTest1'
  $null = Call POST /auth/register @{ name = "User $label"; email = $email; password = $pw; confirm_password = $pw }
  $l = Call POST /auth/login @{ email = $email; password = $pw }
  [pscustomobject]@{ Email = $email; Id = $l.Data.user.id; Token = $l.Data.access_token }
}
function Msgs($r) { (@($r.Data | ForEach-Object { $_.message }) -join ' || ') }

$cfg = @{}; $envFile = Join-Path $PSScriptRoot '..\.env'
if (Test-Path $envFile) { Get-Content $envFile | ForEach-Object { if ($_ -match '^([A-Z_]+)=(.*)$') { $cfg[$Matches[1]] = $Matches[2] } } }
$hasPsql = [bool](Get-Command psql -ErrorAction SilentlyContinue) -and $cfg.DB_PASSWORD
function Sql($q) {
  $env:PGPASSWORD = $cfg.DB_PASSWORD
  $u = if ($cfg.DB_USER) { $cfg.DB_USER } else { 'mpo' }; $d = if ($cfg.DB_NAME) { $cfg.DB_NAME } else { 'management_project_one' }
  psql -h localhost -U $u -d $d -tA -F '|' -c $q 2>&1
}

$A = NewUser 'owner'; $B = NewUser 'member'; $C = NewUser 'outsider'
Check 'setup: 3 user terdaftar & login' ($A.Token -and $B.Token -and $C.Token)
$KEY = -join ((65..90) | Get-Random -Count 4 | ForEach-Object { [char]$_ })
$P = (Call POST /projects @{ name = 'Proyek Komentar'; key = $KEY } $A.Token).Data.id
$null = Call POST "/projects/$P/members" @{ email = $B.Email } $A.Token
$T = (Call POST "/projects/$P/tasks" @{ title = 'Tugas komentar' } $A.Token).Data
$T2 = (Call POST "/projects/$P/tasks" @{ title = 'Tugas riwayat' } $A.Token).Data
$none = '00000000-0000-4000-8000-000000000000'
$cmUrl = "/tasks/$($T.id)/comments"

# ===================== KOMENTAR =====================
$multi = "  Halo **tim**`n`nBaris kedua $([char]::ConvertFromUtf32(0x1F680))  "
$r = Call POST $cmUrl @{ body = $multi } $B.Token
Check 'member menulis komentar -> 201' ($r.Status -eq 201)
$c1 = $r.Data
Check 'isi di-trim, baris baru/markdown/emoji dipertahankan' ($c1.body -ceq "Halo **tim**`n`nBaris kedua $([char]::ConvertFromUtf32(0x1F680))")
Check 'penulis tercatat, belum diedit, penulis boleh edit & hapus' ($c1.author.id -eq $B.Id -and $c1.author.name -eq 'User member' -and $null -eq $c1.edited_at -and $c1.can_edit -and $c1.can_delete -and $c1.task_id -eq $T.id)
$r = Call POST $cmUrl @{ body = 'Balasan owner' } $A.Token
$c2 = $r.Data
Check 'owner menulis komentar' ($r.Status -eq 201 -and $c2.author.id -eq $A.Id)

$r = Call GET $cmUrl $null $A.Token
Check 'daftar: terlama dulu + meta' ($r.Status -eq 200 -and @($r.Data).Count -eq 2 -and $r.Data[0].id -eq $c1.id -and $r.Data[1].id -eq $c2.id -and $r.Json.meta.total -eq 2 -and $r.Json.meta.per_page -eq 50 -and $r.Json.meta.total_pages -eq 1)
Check 'hak pada daftar (owner): edit hanya milik sendiri, hapus semua' (-not $r.Data[0].can_edit -and $r.Data[0].can_delete -and $r.Data[1].can_edit -and $r.Data[1].can_delete)
$r = Call GET $cmUrl $null $B.Token
Check 'hak pada daftar (member): tidak bisa edit/hapus milik orang lain' ($r.Data[0].can_edit -and $r.Data[0].can_delete -and -not $r.Data[1].can_edit -and -not $r.Data[1].can_delete)

# --- validasi ---
$r = Call POST $cmUrl @{ body = '' } $B.Token
Check 'body kosong -> 400 dengan details.body' ($r.Status -eq 400 -and $r.Err.details.body)
Check 'body tidak dikirim -> 400' ((Call POST $cmUrl @{} $B.Token).Status -eq 400)
Check 'body hanya spasi/baris baru -> 400' ((Call POST $cmUrl @{ body = "   `n`t  " } $B.Token).Status -eq 400)
Check 'body 5001 karakter -> 400' ((Call POST $cmUrl @{ body = ('x' * 5001) } $B.Token).Status -eq 400)
$r = Call POST $cmUrl @{ body = ('y' * 5000) } $B.Token
Check 'body tepat 5000 karakter -> 201' ($r.Status -eq 201)
$null = Call DELETE "/comments/$($r.Data.id)" $null $B.Token
Check 'karakter NUL pada komentar -> 400 (bukan 500)' ((Call POST $cmUrl '{"body":"a\u0000b"}' $B.Token).Status -eq 400)
Check 'body bukan string -> 400' ((Call POST $cmUrl '{"body":123}' $B.Token).Status -eq 400)
Check 'JSON rusak -> 400' ((Call POST $cmUrl '{rusak' $B.Token).Status -eq 400)

# --- non-anggota & ID salah: 404 ---
Check 'non-anggota lihat komentar -> 404' ((Call GET $cmUrl $null $C.Token).Status -eq 404)
Check 'non-anggota tulis komentar -> 404' ((Call POST $cmUrl @{ body = 'x' } $C.Token).Status -eq 404)
Check 'non-anggota edit komentar -> 404' ((Call PATCH "/comments/$($c1.id)" @{ body = 'x' } $C.Token).Status -eq 404)
Check 'non-anggota hapus komentar -> 404' ((Call DELETE "/comments/$($c1.id)" $null $C.Token).Status -eq 404)
Check 'tanpa login -> 401' ((Call GET $cmUrl).Status -eq 401)
Check 'ID tugas bukan UUID -> 404' ((Call GET '/tasks/abc/comments' $null $A.Token).Status -eq 404)
Check 'ID tugas tak ada -> 404' ((Call GET "/tasks/$none/comments" $null $A.Token).Status -eq 404)
Check 'ID komentar tak ada -> 404' ((Call PATCH "/comments/$none" @{ body = 'x' } $A.Token).Status -eq 404)
Check 'ID komentar bukan UUID -> 404' ((Call DELETE '/comments/abc' $null $A.Token).Status -eq 404)

# --- edit ---
$r = Call PATCH "/comments/$($c1.id)" @{ body = 'Halo, versi baru' } $B.Token
Check 'penulis edit -> 200, body berubah, edited_at terisi' ($r.Status -eq 200 -and $r.Data.body -eq 'Halo, versi baru' -and $r.Data.edited_at)
$edited1 = "$($r.Data.edited_at)"
$r = Call PATCH "/comments/$($c1.id)" @{ body = '  Halo, versi baru  ' } $B.Token
Check 'edit dengan isi sama persis (setelah trim) -> 200 tanpa mengubah edited_at' ($r.Status -eq 200 -and "$($r.Data.edited_at)" -eq $edited1)
Check 'owner edit komentar orang lain -> 403' ((Call PATCH "/comments/$($c1.id)" @{ body = 'disusupi' } $A.Token).Status -eq 403)
Check 'member edit komentar orang lain -> 403' ((Call PATCH "/comments/$($c2.id)" @{ body = 'disusupi' } $B.Token).Status -eq 403)
Check 'edit dengan body kosong -> 400' ((Call PATCH "/comments/$($c1.id)" @{ body = '  ' } $B.Token).Status -eq 400)
Check 'komentar tidak berubah setelah edit ditolak' ((Call GET $cmUrl $null $A.Token).Data[0].body -eq 'Halo, versi baru')

# --- hapus ---
Check 'member hapus komentar orang lain -> 403' ((Call DELETE "/comments/$($c2.id)" $null $B.Token).Status -eq 403)
Check 'owner menghapus komentar member (moderasi) -> 200' ((Call DELETE "/comments/$($c1.id)" $null $A.Token).Status -eq 200)
Check 'penulis menghapus komentar sendiri -> 200' ((Call DELETE "/comments/$($c2.id)" $null $A.Token).Status -eq 200)
Check 'hapus komentar yang sudah terhapus -> 404' ((Call DELETE "/comments/$($c1.id)" $null $A.Token).Status -eq 404)
$r = Call GET $cmUrl $null $A.Token
Check 'daftar kosong setelah semua dihapus' ($r.Status -eq 200 -and $r.Json.data -is [array] -and @($r.Data).Count -eq 0 -and $r.Json.meta.total -eq 0)

# --- comment_count ---
foreach ($i in 1..3) { $null = Call POST $cmUrl @{ body = "Komentar hitung $i" } $(if ($i % 2) { $B.Token } else { $A.Token }) }
Check 'comment_count di detail tugas = 3' ((Call GET "/tasks/$($T.id)" $null $A.Token).Data.comment_count -eq 3)
Check 'comment_count 0 pada tugas tanpa komentar' ((Call GET "/tasks/$($T2.id)" $null $A.Token).Data.comment_count -eq 0)
$list = (Call GET "/projects/$P/tasks?per_page=100" $null $A.Token).Data
Check 'comment_count di daftar tugas' ((@($list | Where-Object { $_.id -eq $T.id }).comment_count -eq 3) -and (@($list | Where-Object { $_.id -eq $T2.id }).comment_count -eq 0))
$board = (Call GET "/projects/$P/tasks?view=board" $null $A.Token).Data
Check 'comment_count di board' ((@($board.todo | Where-Object { $_.id -eq $T.id }).comment_count -eq 3))
$mine = (Call GET '/me/tasks?include_done=true' $null $A.Token)
$null = Call PATCH "/tasks/$($T.id)" @{ assignee_id = $A.Id } $A.Token
Check 'comment_count di Tugas Saya' ((@((Call GET '/me/tasks' $null $A.Token).Data | Where-Object { $_.id -eq $T.id }).comment_count -eq 3))
$last = (Call GET $cmUrl $null $A.Token).Data[-1]
$null = Call DELETE "/comments/$($last.id)" $null $A.Token
Check 'comment_count turun setelah komentar dihapus' ((Call GET "/tasks/$($T.id)" $null $A.Token).Data.comment_count -eq 2)

# --- pagination komentar ---
foreach ($i in 1..5) { $null = Call POST $cmUrl @{ body = "Halaman $i" } $B.Token }     # total 7
$r = Call GET "$cmUrl`?per_page=3" $null $A.Token
Check 'pagination komentar: halaman 1 berisi 3, total 7, 3 halaman' (@($r.Data).Count -eq 3 -and $r.Json.meta.total -eq 7 -and $r.Json.meta.total_pages -eq 3)
$ids = @(); foreach ($pg in 1..4) { $ids += @((Call GET "$cmUrl`?per_page=3&page=$pg" $null $A.Token).Data | ForEach-Object { $_.id }) }
Check 'pagination komentar stabil: 7 id unik di semua halaman' ($ids.Count -eq 7 -and @($ids | Sort-Object -Unique).Count -eq 7)
$r = Call GET "$cmUrl`?per_page=3&page=9" $null $A.Token
Check 'halaman di luar batas -> [] dengan meta benar' ($r.Status -eq 200 -and @($r.Data).Count -eq 0 -and $r.Json.meta.total -eq 7)
foreach ($bad in 'per_page=0', 'per_page=101', 'page=0', 'page=abc') {
  Check "pagination komentar: $bad -> 400" ((Call GET "$cmUrl`?$bad" $null $A.Token).Status -eq 400)
}

# ===================== RIWAYAT AKTIVITAS =====================
$t2Url = "/tasks/$($T2.id)"
$null = Call PATCH $t2Url @{ status = 'in_progress' } $A.Token
$null = Call PATCH $t2Url @{ assignee_id = $B.Id } $A.Token
$null = Call PATCH $t2Url @{ title = 'Judul diubah'; priority = 'urgent' } $A.Token
$null = Call PATCH $t2Url '{"assignee_id":null}' $A.Token
$cc = (Call POST "$t2Url/comments" @{ body = 'Komentar riwayat' } $B.Token).Data
$r = Call GET "$t2Url/activities" $null $A.Token
$expected = @(
  "User member mengomentari $KEY-2",
  "User owner melepas assignee dari $KEY-2",
  "User owner mengubah $KEY-2 (judul, prioritas)",
  "User owner meng-assign $KEY-2 ke User member",
  "User owner memindahkan $KEY-2 dari To Do ke In Progress",
  "User owner membuat tugas $KEY-2"
) -join ' || '
Check 'riwayat tugas: kalimat Indonesia, terbaru dulu, urutan lengkap' ($r.Status -eq 200 -and (Msgs $r) -ceq $expected)
Check 'riwayat tugas: meta total 6' ($r.Json.meta.total -eq 6 -and $r.Json.meta.total_pages -eq 1)
$first = $r.Data[0]; $stat = $r.Data[4]
Check 'riwayat: data terstruktur (aksi, pelaku, task_id, kode, created_at)' ($first.action -eq 'comment.created' -and $first.user.id -eq $B.Id -and $first.user.name -eq 'User member' -and $first.task_id -eq $T2.id -and $first.code -ceq "$KEY-2" -and $first.created_at)
Check 'riwayat: metadata status_changed memuat from/to' ($stat.action -eq 'task.status_changed' -and $stat.metadata.from -eq 'todo' -and $stat.metadata.to -eq 'in_progress')
$r = Call GET "$t2Url/activities?per_page=2&page=2" $null $A.Token
Check 'riwayat: pagination (halaman 2 dari 3, 2 item)' (@($r.Data).Count -eq 2 -and $r.Json.meta.page -eq 2 -and $r.Json.meta.total_pages -eq 3 -and $r.Data[0].message -eq "User owner mengubah $KEY-2 (judul, prioritas)")
Check 'riwayat: per_page tidak valid -> 400' ((Call GET "$t2Url/activities?per_page=500" $null $A.Token).Status -eq 400)
Check 'riwayat: member boleh membaca' ((Call GET "$t2Url/activities" $null $B.Token).Status -eq 200)
Check 'riwayat tugas: non-anggota -> 404' ((Call GET "$t2Url/activities" $null $C.Token).Status -eq 404)
Check 'riwayat tugas: tanpa login -> 401' ((Call GET "$t2Url/activities").Status -eq 401)
Check 'riwayat tugas: ID bukan UUID -> 404' ((Call GET '/tasks/abc/activities' $null $A.Token).Status -eq 404)

# menghapus komentar menghapus catatan "mengomentari"-nya
$null = Call DELETE "/comments/$($cc.id)" $null $B.Token
$r = Call GET "$t2Url/activities" $null $A.Token
Check 'hapus komentar -> catatan "mengomentari" ikut hilang dari riwayat' ($r.Json.meta.total -eq 5 -and $r.Data[0].message -eq "User owner melepas assignee dari $KEY-2")

# --- riwayat proyek ---
$T3 = (Call POST "/projects/$P/tasks" @{ title = 'Akan dihapus' } $A.Token).Data
$null = Call DELETE "/tasks/$($T3.id)" $null $A.Token
$r = Call GET "/projects/$P/activities" $null $B.Token
Check 'riwayat proyek: member boleh membaca, terbaru dulu' ($r.Status -eq 200 -and $r.Data[0].message -eq "User owner menghapus tugas $KEY-3")
Check 'riwayat proyek: catatan penghapusan task_id null, kode tetap ada' ($null -eq $r.Data[0].task_id -and $r.Data[0].code -ceq "$KEY-3")
Check 'riwayat proyek: memuat aktivitas dari beberapa tugas' ((@($r.Data | ForEach-Object { $_.code } | Sort-Object -Unique)).Count -ge 3)
Check 'riwayat proyek: riwayat lama tugas yang dihapus ikut hilang (FK cascade), hanya penghapusan yang tersisa' (@($r.Data | Where-Object { $_.code -ceq "$KEY-3" }).Count -eq 1)
$pg = Call GET "/projects/$P/activities?per_page=4&page=2" $null $A.Token
Check 'riwayat proyek: pagination' ($pg.Status -eq 200 -and @($pg.Data).Count -eq 4 -and $pg.Json.meta.page -eq 2 -and $pg.Json.meta.total -eq $r.Json.meta.total)
$allIds = @(); foreach ($pageNo in 1..8) { $allIds += @((Call GET "/projects/$P/activities?per_page=5&page=$pageNo" $null $A.Token).Data | ForEach-Object { $_.id }) }
Check 'riwayat proyek: pagination stabil (tanpa duplikat, jumlah = total)' ($allIds.Count -eq $r.Json.meta.total -and @($allIds | Sort-Object -Unique).Count -eq $allIds.Count)
Check 'riwayat proyek: non-anggota -> 404' ((Call GET "/projects/$P/activities" $null $C.Token).Status -eq 404)
Check 'riwayat proyek: ID bukan UUID -> 404' ((Call GET '/projects/abc/activities' $null $A.Token).Status -eq 404)
Check 'riwayat proyek: tanpa login -> 401' ((Call GET "/projects/$P/activities").Status -eq 401)

# ===================== PROYEK TERARSIP =====================
$cm = (Call POST $cmUrl @{ body = 'Sebelum diarsipkan' } $B.Token).Data
$null = Call POST "/projects/$P/archive" @{ archived = $true } $A.Token
Check 'proyek terarsip: tulis komentar ditolak (400)' ((Call POST $cmUrl @{ body = 'x' } $B.Token).Status -eq 400)
Check 'proyek terarsip: edit komentar ditolak (400)' ((Call PATCH "/comments/$($cm.id)" @{ body = 'x' } $B.Token).Status -eq 400)
Check 'proyek terarsip: hapus komentar ditolak (400)' ((Call DELETE "/comments/$($cm.id)" $null $B.Token).Status -eq 400)
Check 'proyek terarsip: komentar & riwayat tetap bisa dibaca' ((Call GET $cmUrl $null $B.Token).Status -eq 200 -and (Call GET "/projects/$P/activities" $null $B.Token).Status -eq 200)
$null = Call POST "/projects/$P/archive" @{ archived = $false } $A.Token
Check 'setelah dipulihkan: komentar bisa diedit lagi' ((Call PATCH "/comments/$($cm.id)" @{ body = 'Sesudah dipulihkan' } $B.Token).Status -eq 200)

# ===================== ANGGOTA DIKELUARKAN =====================
Check 'owner mengeluarkan member -> 200' ((Call DELETE "/projects/$P/members/$($B.Id)" $null $A.Token).Status -eq 200)
$r = Call GET $cmUrl $null $A.Token
Check 'komentar mantan anggota tetap tampil (nama penulis ada)' (@($r.Data | Where-Object { $_.author.id -eq $B.Id -and $_.author.name -eq 'User member' }).Count -ge 1)
Check 'mantan anggota tidak bisa lagi membaca komentar -> 404' ((Call GET $cmUrl $null $B.Token).Status -eq 404)
Check 'mantan anggota tidak bisa mengedit komentarnya -> 404' ((Call PATCH "/comments/$($cm.id)" @{ body = 'x' } $B.Token).Status -eq 404)
Check 'owner masih bisa menghapus komentar mantan anggota' ((Call DELETE "/comments/$($cm.id)" $null $A.Token).Status -eq 200)

# ===================== DATABASE =====================
if ($hasPsql) {
  $blank = Sql "INSERT INTO comments(task_id,user_id,body) VALUES ('$($T.id)','$($A.Id)','   ')"
  Check 'DB: constraint menolak komentar kosong (hanya spasi)' (($blank | Out-String) -match 'check constraint')
  $perTask = (Sql "SELECT COUNT(*) FROM comments WHERE task_id = '$($T.id)'") -as [int]
  Check 'DB: jumlah komentar sama dengan comment_count API' ($perTask -eq (Call GET "/tasks/$($T.id)" $null $A.Token).Data.comment_count)
  $null = Call DELETE "/tasks/$($T.id)" $null $A.Token
  Check 'DB: hapus tugas -> komentarnya ikut terhapus (cascade)' (((Sql "SELECT COUNT(*) FROM comments WHERE task_id = '$($T.id)'") -as [int]) -eq 0)
  $null = Call DELETE "/projects/$P" @{ confirm_name = 'Proyek Komentar' } $A.Token
  $left = (Sql "SELECT (SELECT COUNT(*) FROM activities WHERE project_id = '$P') + (SELECT COUNT(*) FROM comments c JOIN tasks t ON t.id = c.task_id WHERE t.project_id = '$P')") -as [int]
  Check 'DB: hapus proyek -> aktivitas & komentarnya terhapus' ($left -eq 0)
} else { 'SKIP  cek database (psql / kredensial tidak tersedia)' }

"`nHASIL: $script:pass lulus, $script:fail gagal"
if ($script:fail -gt 0) { exit 1 }
