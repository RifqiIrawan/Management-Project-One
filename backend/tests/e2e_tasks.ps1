# Uji end-to-end fitur 04 (tugas, Kanban, nomor MPO-x, riwayat aktivitas).
# Jalankan server dulu (cd backend; go run ./cmd/api), lalu: powershell -File tests/e2e_tasks.ps1
# Bagian riwayat aktivitas membaca tabel lewat psql (kredensial dari backend/.env); dilewati bila psql tidak ada.
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

# --- psql (opsional) ---
$cfg = @{}; $envFile = Join-Path $PSScriptRoot '..\.env'
if (Test-Path $envFile) { Get-Content $envFile | ForEach-Object { if ($_ -match '^([A-Z_]+)=(.*)$') { $cfg[$Matches[1]] = $Matches[2] } } }
$hasPsql = [bool](Get-Command psql -ErrorAction SilentlyContinue) -and $cfg.DB_PASSWORD
function Sql($q) {
  $env:PGPASSWORD = $cfg.DB_PASSWORD
  $u = if ($cfg.DB_USER) { $cfg.DB_USER } else { 'mpo' }; $d = if ($cfg.DB_NAME) { $cfg.DB_NAME } else { 'management_project_one' }
  psql -h localhost -U $u -d $d -tA -F '|' -c $q
}

$A = NewUser 'owner'; $B = NewUser 'member'; $C = NewUser 'outsider'
Check 'setup: 3 user terdaftar & login' ($A.Token -and $B.Token -and $C.Token)
$KEY = -join ((65..90) | Get-Random -Count 4 | ForEach-Object { [char]$_ })
$P = (Call POST /projects @{ name = 'Proyek Tugas'; key = $KEY } $A.Token).Data.id
$null = Call POST "/projects/$P/members" @{ email = $B.Email } $A.Token
$none = '00000000-0000-4000-8000-000000000000'

# --- Buat tugas ---
$r = Call POST "/projects/$P/tasks" @{ title = '  Desain halaman login  '; description = 'Layout split-screen'; priority = 'high'; labels = @('design', 'frontend'); start_date = '2026-12-01'; due_date = '2026-12-10' } $A.Token
Check 'buat tugas 201' ($r.Status -eq 201)
$T1 = $r.Data
Check 'kode otomatis KEY-1, status default todo, judul di-trim' ($T1.code -ceq "$KEY-1" -and $T1.number -eq 1 -and $T1.status -eq 'todo' -and $T1.title -eq 'Desain halaman login')
Check 'pembuat tercatat, tanpa assignee, tanggal & label tersimpan' ($T1.created_by.id -eq $A.Id -and $null -eq $T1.assignee -and "$($T1.due_date)" -match '2026-12-10' -and @($T1.labels).Count -eq 2)
$r = Call POST "/projects/$P/tasks" @{ title = 'Tugas dua' } $A.Token
$T2 = $r.Data
Check 'nomor berurutan KEY-2, prioritas default medium, label kosong ([] bukan null)' ($T2.code -ceq "$KEY-2" -and $T2.priority -eq 'medium' -and $r.Json.data.labels -is [array] -and @($T2.labels).Count -eq 0)
Check 'tugas baru berada di posisi paling atas kolom' ($T2.position -lt $T1.position)
$r = Call POST "/projects/$P/tasks" @{ title = 'Untuk B'; assignee_id = $B.Id; status = 'in_progress' } $A.Token
$T3 = $r.Data
Check 'assign ke anggota + status awal in_progress' ($r.Status -eq 201 -and $T3.assignee.id -eq $B.Id -and $T3.assignee.name -eq 'User member' -and $T3.status -eq 'in_progress')
$r = Call POST "/projects/$P/tasks" @{ title = 'Sudah selesai'; status = 'done' } $A.Token
Check 'dibuat langsung done -> completed_at terisi' ($r.Status -eq 201 -and $r.Data.completed_at)
$T4 = $r.Data

# --- Validasi ---
$r = Call POST "/projects/$P/tasks" @{ title = '' } $A.Token
Check 'judul kosong -> 400' ($r.Status -eq 400 -and $r.Err.details.title)
Check 'judul hanya spasi -> 400' ((Call POST "/projects/$P/tasks" @{ title = '    ' } $A.Token).Status -eq 400)
Check 'judul > 200 karakter -> 400' ((Call POST "/projects/$P/tasks" @{ title = ('x' * 201) } $A.Token).Status -eq 400)
Check 'prioritas tidak valid -> 400' ((Call POST "/projects/$P/tasks" @{ title = 'x'; priority = 'kritis' } $A.Token).Status -eq 400)
Check 'status tidak valid -> 400' ((Call POST "/projects/$P/tasks" @{ title = 'x'; status = 'selesai' } $A.Token).Status -eq 400)
Check '6 label -> 400' ((Call POST "/projects/$P/tasks" @{ title = 'x'; labels = @('a', 'b', 'c', 'd', 'e', 'f') } $A.Token).Status -eq 400)
Check 'label > 30 karakter -> 400' ((Call POST "/projects/$P/tasks" @{ title = 'x'; labels = @('x' * 31) } $A.Token).Status -eq 400)
Check 'label kosong -> 400' ((Call POST "/projects/$P/tasks" @{ title = 'x'; labels = @(' ') } $A.Token).Status -eq 400)
Check 'format tanggal salah -> 400' ((Call POST "/projects/$P/tasks" @{ title = 'x'; due_date = '10-12-2026' } $A.Token).Status -eq 400)
Check 'tanggal tidak ada (30 Feb) -> 400' ((Call POST "/projects/$P/tasks" @{ title = 'x'; due_date = '2026-02-30' } $A.Token).Status -eq 400)
$r = Call POST "/projects/$P/tasks" @{ title = 'x'; start_date = '2026-12-10'; due_date = '2026-12-01' } $A.Token
Check 'deadline sebelum tanggal mulai -> 400' ($r.Status -eq 400 -and $r.Err.details.due_date)
$r = Call POST "/projects/$P/tasks" @{ title = 'x'; assignee_id = $C.Id } $A.Token
Check 'assign ke non-anggota -> 400' ($r.Status -eq 400 -and $r.Err.details.assignee_id)
Check 'assignee bukan UUID -> 400' ((Call POST "/projects/$P/tasks" @{ title = 'x'; assignee_id = 'abc' } $A.Token).Status -eq 400)
$r = Call POST "/projects/$P/tasks" "{`"title`":`"nul\u0000byte`"}" $A.Token
Check 'karakter NUL di judul -> 400 (bukan 500)' ($r.Status -eq 400)
Check 'body bukan JSON -> 400' ((Call POST "/projects/$P/tasks" '{rusak' $A.Token).Status -eq 400)
$emoji = [char]::ConvertFromUtf32(0x1F680)
$r = Call POST "/projects/$P/tasks" @{ title = "Judul $emoji"; labels = @("a,b", 'say "hi"', 'back\slash', '{x}') } $A.Token
Check 'emoji & karakter khusus pada judul/label tersimpan utuh' ($r.Status -eq 201 -and $r.Data.title -eq "Judul $emoji" -and (@($r.Data.labels) -join '|') -ceq 'a,b|say "hi"|back\slash|{x}')
$T5 = $r.Data

# --- Hak akses: non-anggota 404 ---
Check 'non-anggota lihat daftar -> 404' ((Call GET "/projects/$P/tasks" $null $C.Token).Status -eq 404)
Check 'non-anggota buat tugas -> 404' ((Call POST "/projects/$P/tasks" @{ title = 'x' } $C.Token).Status -eq 404)
Check 'non-anggota GET tugas -> 404' ((Call GET "/tasks/$($T1.id)" $null $C.Token).Status -eq 404)
Check 'non-anggota PATCH tugas -> 404' ((Call PATCH "/tasks/$($T1.id)" @{ title = 'hack' } $C.Token).Status -eq 404)
Check 'non-anggota move tugas -> 404' ((Call PATCH "/tasks/$($T1.id)/move" @{ status = 'done' } $C.Token).Status -eq 404)
Check 'non-anggota hapus tugas -> 404' ((Call DELETE "/tasks/$($T1.id)" $null $C.Token).Status -eq 404)
Check 'tanpa login -> 401' ((Call GET "/tasks/$($T1.id)").Status -eq 401)
Check 'ID tugas bukan UUID -> 404' ((Call GET '/tasks/abc' $null $A.Token).Status -eq 404)
Check 'UUID tugas tak ada -> 404' ((Call GET "/tasks/$none" $null $A.Token).Status -eq 404)

# --- Daftar & board ---
$r = Call GET "/projects/$P/tasks" $null $B.Token
Check 'member melihat daftar berpaginasi (default terbaru dulu, ada meta)' ($r.Status -eq 200 -and $r.Data.Count -eq 5 -and $r.Json.meta.total -eq 5 -and $r.Json.meta.per_page -eq 20 -and $r.Data[0].id -eq $T5.id)
$r = Call GET "/projects/$P/tasks?view=board" $null $B.Token
$cols = @($r.Data.PSObject.Properties.Name)
Check 'view=board: 4 kolom Kanban' (($cols -contains 'todo') -and ($cols -contains 'in_progress') -and ($cols -contains 'in_review') -and ($cols -contains 'done'))
Check 'view=board: kolom kosong berupa [] dan urutan posisi benar' ($r.Json.data.in_review -is [array] -and @($r.Data.in_review).Count -eq 0 -and $r.Data.todo[0].id -eq $T5.id -and $r.Data.todo[-1].id -eq $T1.id)
$g = Call GET "/tasks/$($T1.id)" $null $B.Token
Check 'detail tugas oleh member -> 200, memuat info proyek' ($g.Status -eq 200 -and $g.Data.id -eq $T1.id -and $g.Data.project.key -ceq $KEY -and $g.Data.project.name -eq 'Proyek Tugas')

# --- Edit (PATCH) ---
$r = Call PATCH "/tasks/$($T1.id)" @{ title = 'Judul baru'; priority = 'urgent'; labels = @('Design', 'design', 'UI') } $B.Token
Check 'member bisa edit: judul, prioritas, label (dedupe huruf besar/kecil)' ($r.Status -eq 200 -and $r.Data.title -eq 'Judul baru' -and $r.Data.priority -eq 'urgent' -and (@($r.Data.labels) -join ',') -ceq 'Design,UI')
Check 'PATCH body kosong -> 400' ((Call PATCH "/tasks/$($T1.id)" @{} $A.Token).Status -eq 400)
$r = Call PATCH "/tasks/$($T1.id)" @{ title = 'Judul baru' } $A.Token
Check 'PATCH tanpa perubahan nyata -> 200 (no-op)' ($r.Status -eq 200 -and $r.Data.title -eq 'Judul baru')
$r = Call PATCH "/tasks/$($T1.id)" '{"description":null,"due_date":null,"assignee_id":null}' $A.Token
Check 'null mengosongkan description & due_date' ($r.Status -eq 200 -and $null -eq $r.Data.description -and $null -eq $r.Data.due_date)
$r = Call PATCH "/tasks/$($T1.id)" @{ assignee_id = $B.Id } $A.Token
Check 'assign via PATCH' ($r.Status -eq 200 -and $r.Data.assignee.id -eq $B.Id)
$r = Call PATCH "/tasks/$($T1.id)" '{"assignee_id":null}' $A.Token
Check 'assignee_id: null melepas assignee' ($r.Status -eq 200 -and $null -eq $r.Data.assignee)
Check 'PATCH assign ke non-anggota -> 400' ((Call PATCH "/tasks/$($T1.id)" @{ assignee_id = $C.Id } $A.Token).Status -eq 400)
Check 'PATCH deadline < tanggal mulai (mulai 2026-12-01 tersimpan) -> 400' ((Call PATCH "/tasks/$($T1.id)" @{ due_date = '2026-11-01' } $A.Token).Status -eq 400)
Check 'PATCH judul kosong -> 400' ((Call PATCH "/tasks/$($T1.id)" @{ title = '' } $A.Token).Status -eq 400)
Check 'PATCH prioritas tidak valid -> 400' ((Call PATCH "/tasks/$($T1.id)" @{ priority = 'x' } $A.Token).Status -eq 400)
$r = Call PATCH "/tasks/$($T1.id)" @{ status = 'done' } $A.Token
Check 'PATCH status done -> completed_at terisi otomatis' ($r.Status -eq 200 -and $r.Data.status -eq 'done' -and $r.Data.completed_at)
$r = Call PATCH "/tasks/$($T1.id)" @{ status = 'todo' } $A.Token
Check 'keluar dari done -> completed_at dikosongkan, kartu ke paling atas kolom' ($r.Data.status -eq 'todo' -and $null -eq $r.Data.completed_at -and $r.Data.position -lt $T5.position)

# --- Move (drag & drop) ---
$r = Call PATCH "/tasks/$($T2.id)/move" @{ status = 'in_progress'; position = 5.5 } $B.Token
Check 'move ke kolom lain dengan posisi desimal' ($r.Status -eq 200 -and $r.Data.status -eq 'in_progress' -and $r.Data.position -eq 5.5)
$r = Call PATCH "/tasks/$($T3.id)/move" @{ status = 'in_progress'; position = 5.25 } $A.Token
$board = (Call GET "/projects/$P/tasks?view=board" $null $A.Token).Data
Check 'urutan dalam kolom mengikuti posisi (5.25 sebelum 5.5)' ($board.in_progress[0].id -eq $T3.id -and $board.in_progress[1].id -eq $T2.id)
$r = Call PATCH "/tasks/$($T2.id)/move" @{ status = 'in_progress'; position = 5.1 } $A.Token
$board = (Call GET "/projects/$P/tasks?view=board" $null $A.Token).Data
Check 'reorder dalam kolom yang sama tanpa ganti status' ($r.Status -eq 200 -and $board.in_progress[0].id -eq $T2.id -and $board.in_progress[1].id -eq $T3.id)
$r = Call PATCH "/tasks/$($T2.id)/move" @{ status = 'done'; position = 1 } $A.Token
Check 'move ke done -> completed_at terisi' ($r.Data.status -eq 'done' -and $r.Data.completed_at)
$r = Call PATCH "/tasks/$($T2.id)/move" @{ status = 'in_review' } $A.Token
Check 'move tanpa position ke kolom kosong -> posisi 0; keluar dari done kosongkan completed_at' ($r.Data.status -eq 'in_review' -and $null -eq $r.Data.completed_at -and $r.Data.position -eq 0)
Check 'move status tidak valid -> 400' ((Call PATCH "/tasks/$($T2.id)/move" @{ status = 'x' } $A.Token).Status -eq 400)
Check 'move tanpa status -> 400' ((Call PATCH "/tasks/$($T2.id)/move" @{ position = 1 } $A.Token).Status -eq 400)
Check 'position di luar batas (1e20) -> 400' ((Call PATCH "/tasks/$($T2.id)/move" '{"status":"todo","position":1e20}' $A.Token).Status -eq 400)
Check 'position bukan angka -> 400' ((Call PATCH "/tasks/$($T2.id)/move" '{"status":"todo","position":"atas"}' $A.Token).Status -eq 400)

# --- Penghapusan: pembuat atau owner ---
$rb = Call POST "/projects/$P/tasks" @{ title = 'Buatan B' } $B.Token
$TB = $rb.Data
Check 'member membuat tugas, kode berlanjut' ($rb.Status -eq 201 -and $TB.created_by.id -eq $B.Id)
Check 'member hapus tugas buatan orang lain -> 403' ((Call DELETE "/tasks/$($T1.id)" $null $B.Token).Status -eq 403)
Check 'member hapus tugas buatan sendiri -> 200' ((Call DELETE "/tasks/$($TB.id)" $null $B.Token).Status -eq 200)
Check 'tugas terhapus -> 404' ((Call GET "/tasks/$($TB.id)" $null $A.Token).Status -eq 404)
$rb2 = Call POST "/projects/$P/tasks" @{ title = 'Buatan B lagi' } $B.Token
Check 'owner hapus tugas buatan member -> 200' ((Call DELETE "/tasks/$($rb2.Data.id)" $null $A.Token).Status -eq 200)

# --- Nomor tugas tidak bentrok saat pembuatan paralel ---
$before = (Call GET "/projects/$P/tasks?per_page=100" $null $A.Token).Data.Count
$jobs = 1..8 | ForEach-Object {
  Start-Job -ArgumentList $Base, $P, $A.Token, $_ -ScriptBlock {
    param($base, $proj, $tok, $n)
    1..2 | ForEach-Object {
      $body = [Text.Encoding]::UTF8.GetBytes("{`"title`":`"Paralel $n-$_`"}")
      try { (Invoke-RestMethod "$base/projects/$proj/tasks" -Method POST -Headers @{ Authorization = "Bearer $tok" } -Body $body -ContentType 'application/json').data.number }
      catch { "ERR $($_.Exception.Message)" }
    }
  }
}
$nums = @($jobs | Wait-Job | Receive-Job); $jobs | Remove-Job
$ok = @($nums | Where-Object { $_ -is [int] -or $_ -is [long] })
Check '16 pembuatan paralel: semua sukses' ($ok.Count -eq 16)
Check '16 pembuatan paralel: nomor unik (tidak ada bentrok)' (@($ok | Sort-Object -Unique).Count -eq 16)
$sorted = @($ok | Sort-Object)
Check '16 pembuatan paralel: nomor berurutan tanpa celah' (($sorted[-1] - $sorted[0]) -eq 15)
Check 'jumlah tugas di database bertambah 16' ((Call GET "/projects/$P/tasks?per_page=100" $null $A.Token).Data.Count -eq ($before + 16))

# --- Statistik proyek ---
$all = (Call GET "/projects/$P/tasks?per_page=100" $null $A.Token).Data
$total = $all.Count; $done = @($all | Where-Object { $_.status -eq 'done' }).Count
$pr = (Call GET "/projects/$P" $null $A.Token).Data
Check 'proyek: task_count & done_count sesuai' ($pr.task_count -eq $total -and $pr.done_count -eq $done)
Check 'proyek: progress = done/total x 100 (dibulatkan)' ($pr.progress -eq [int][math]::Round($done * 100 / $total, [MidpointRounding]::AwayFromZero))
$lst = (Call GET '/projects' $null $A.Token).Data | Where-Object { $_.id -eq $P }
Check 'daftar proyek memuat task_count & progress' ($lst.task_count -eq $total -and $lst.progress -eq $pr.progress)

# --- Anggota dikeluarkan -> tugasnya unassigned ---
$mine = (Call GET "/projects/$P/tasks?per_page=100" $null $A.Token).Data | Where-Object { $_.assignee.id -eq $B.Id }
Check 'sebelum dikeluarkan: B punya tugas ter-assign' (@($mine).Count -ge 1)
Check 'owner mengeluarkan B -> 200' ((Call DELETE "/projects/$P/members/$($B.Id)" $null $A.Token).Status -eq 200)
$after = (Call GET "/projects/$P/tasks?per_page=100" $null $A.Token).Data
Check 'setelah dikeluarkan: tidak ada tugas ter-assign ke B (unassigned)' (@($after | Where-Object { $_.assignee.id -eq $B.Id }).Count -eq 0 -and $after.Count -eq $total)
Check 'mantan anggota tidak bisa lagi mengakses tugas -> 404' ((Call GET "/tasks/$($T3.id)" $null $B.Token).Status -eq 404)
$null = Call POST "/projects/$P/members" @{ email = $B.Email } $A.Token

# --- Proyek terarsip: tugas read-only ---
$null = Call POST "/projects/$P/archive" @{ archived = $true } $A.Token
Check 'proyek terarsip: buat tugas ditolak (400)' ((Call POST "/projects/$P/tasks" @{ title = 'x' } $A.Token).Status -eq 400)
Check 'proyek terarsip: edit tugas ditolak (400)' ((Call PATCH "/tasks/$($T1.id)" @{ title = 'x' } $A.Token).Status -eq 400)
Check 'proyek terarsip: move tugas ditolak (400)' ((Call PATCH "/tasks/$($T1.id)/move" @{ status = 'done' } $A.Token).Status -eq 400)
Check 'proyek terarsip: hapus tugas ditolak (400)' ((Call DELETE "/tasks/$($T1.id)" $null $A.Token).Status -eq 400)
Check 'proyek terarsip: tugas tetap bisa dibaca' ((Call GET "/tasks/$($T1.id)" $null $A.Token).Status -eq 200)
$null = Call POST "/projects/$P/archive" @{ archived = $false } $A.Token
Check 'setelah dipulihkan: tugas bisa diedit lagi' ((Call PATCH "/tasks/$($T1.id)" @{ title = 'Pulih' } $A.Token).Status -eq 200)

# --- Riwayat aktivitas (tabel activities) ---
if ($hasPsql) {
  $acts = @{}; Sql "SELECT action, COUNT(*) FROM activities WHERE project_id = '$P' GROUP BY action" | ForEach-Object { $k, $v = $_ -split '\|'; $acts[$k] = [int]$v }
  "INFO  activities per aksi: $(($acts.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ', ')"
  # 23 tugas dibuat, 2 dihapus: riwayat tugas terhapus ikut hilang (FK ON DELETE CASCADE), hanya task.deleted yang tersisa\n  Check 'activities: task.created tercatat untuk 21 tugas yang masih ada' ($acts['task.created'] -eq 21)
  Check 'activities: task.status_changed tercatat' ($acts['task.status_changed'] -ge 5)
  Check 'activities: task.assigned tercatat' ($acts['task.assigned'] -ge 2)
  Check 'activities: task.updated tercatat' ($acts['task.updated'] -ge 3)
  Check 'activities: task.deleted tercatat' ($acts['task.deleted'] -eq 2)
  $del = Sql "SELECT COUNT(*) FROM activities WHERE project_id = '$P' AND action = 'task.deleted' AND task_id IS NULL AND metadata ? 'code'"
  Check 'activities: catatan penghapusan tetap ada (task_id NULL) dan memuat kode tugas' ([int]$del -eq 2)
  $meta = Sql "SELECT metadata->>'from' || '>' || (metadata->>'to') FROM activities WHERE task_id = '$($T1.id)' AND action = 'task.status_changed' ORDER BY id LIMIT 1"
  Check 'activities: status_changed menyimpan dari>ke (todo>done)' ($meta -eq 'todo>done')
  $nul = Sql "SELECT COUNT(*) FROM activities WHERE project_id = '$P' AND user_id IS NULL"
  Check 'activities: setiap catatan punya pelaku' ([int]$nul -eq 0)
} else { 'SKIP  riwayat aktivitas (psql / kredensial DB tidak tersedia)' }

# --- Hapus proyek: tugas ikut terhapus (cascade) ---
$null = Call DELETE "/projects/$P" @{ confirm_name = 'Proyek Tugas' } $A.Token
Check 'proyek dihapus -> tugas tidak bisa diakses' ((Call GET "/tasks/$($T1.id)" $null $A.Token).Status -eq 404)
if ($hasPsql) {
  $left = Sql "SELECT (SELECT COUNT(*) FROM tasks WHERE project_id = '$P') + (SELECT COUNT(*) FROM activities WHERE project_id = '$P')"
  Check 'cascade: tasks & activities proyek terhapus dari database' ([int]$left -eq 0)
}

"`nHASIL: $script:pass lulus, $script:fail gagal"
if ($script:fail -gt 0) { exit 1 }
