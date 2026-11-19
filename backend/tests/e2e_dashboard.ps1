# Uji end-to-end fitur 07: GET /dashboard (satu endpoint berisi statistik, tugas jatuh tempo,
# proyek terbaru, dan aktivitas terbaru). Angka statistik juga dicocokkan dengan /me/tasks
# (dua jalur kode berbeda yang harus selalu sepakat).
# Jalankan server dulu (cd backend; go run ./cmd/api), lalu: powershell -File tests/e2e_dashboard.ps1
# Tanggal dihitung di zona waktu WIB (sama dengan APP_TIMEZONE default server: Asia/Jakarta).
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
function Titles($list) { (@($list | ForEach-Object { $_.title }) -join '|') }

# --- tanggal acuan (WIB) ---
$wib = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'SE Asia Standard Time')
$today = $wib.Date
$dow = ([int]$today.DayOfWeek + 6) % 7
$weekEnd = $today.AddDays(6 - $dow)
function D($offset) { $today.AddDays($offset).ToString('yyyy-MM-dd') }
$tomorrowInWeek = ($today.AddDays(1) -le $weekEnd)
$laterOffset = (6 - $dow) + 5

$A = NewUser 'owner'; $B = NewUser 'member'; $C = NewUser 'kosong'
Check 'setup: 3 user terdaftar & login' ($A.Token -and $B.Token -and $C.Token)

function NewProject($name, $token = $A.Token) {
  $key = -join ((65..90) | Get-Random -Count 4 | ForEach-Object { [char]$_ })
  $r = Call POST /projects @{ name = $name; key = $key } $token
  [pscustomobject]@{ Id = $r.Data.id; Key = $key; Name = $name }
}
function NewTask($proj, $body, $token = $A.Token) { (Call POST "/projects/$($proj.Id)/tasks" $body $token).Data }

# ===================== USER TANPA DATA =====================
$r = Call GET /dashboard $null $C.Token
$d = $r.Data
Check 'user baru: dashboard 200, nama user, tanggal & akhir minggu (WIB)' ($r.Status -eq 200 -and $d.user.name -eq 'User kosong' -and $d.today -eq (D 0) -and $d.week_end -eq $weekEnd.ToString('yyyy-MM-dd'))
Check 'user baru: semua statistik 0' ($d.stats.total_tasks -eq 0 -and $d.stats.open_tasks -eq 0 -and $d.stats.completed_tasks -eq 0 -and $d.stats.in_progress -eq 0 -and $d.stats.due_this_week -eq 0 -and $d.stats.overdue -eq 0)
Check 'user baru: semua daftar berupa [] (bukan null)' ($r.Json.data.upcoming_tasks -is [array] -and $r.Json.data.recent_projects -is [array] -and $r.Json.data.recent_activities -is [array] -and @($d.upcoming_tasks).Count -eq 0 -and @($d.recent_projects).Count -eq 0 -and @($d.recent_activities).Count -eq 0)
Check 'tanpa login -> 401' ((Call GET /dashboard).Status -eq 401)

# ===================== DATA UJI =====================
$P1 = NewProject 'Proyek Satu'; $P2 = NewProject 'Proyek Dua'; $P3 = NewProject 'Proyek Tiga'; $P4 = NewProject 'Proyek Arsip'
$Q = NewProject 'Proyek Orang Lain' $B.Token       # A bukan anggota
$null = Call POST "/projects/$($P1.Id)/members" @{ email = $B.Email } $A.Token
$null = Call POST "/projects/$($P2.Id)/members" @{ email = $B.Email } $A.Token
$null = Call POST "/projects/$($Q.Id)/members" @{ email = $A.Email } $B.Token   # lalu A jadi anggota Q
$null = Call DELETE "/projects/$($Q.Id)/members/$($A.Id)" $null $B.Token        # dan keluar lagi -> aktivitas Q tidak boleh terlihat

# milik A di proyek aktif
$a1 = NewTask $P1 @{ title = 'A terlambat tiga hari'; due_date = (D -3); assignee_id = $A.Id }
$a2 = NewTask $P1 @{ title = 'A hari ini'; due_date = (D 0); assignee_id = $A.Id; status = 'in_progress' }
$a3 = NewTask $P1 @{ title = 'A besok'; due_date = (D 1); assignee_id = $A.Id; status = 'in_review' }
$a4 = NewTask $P1 @{ title = 'A tanpa deadline'; assignee_id = $A.Id }
$a5 = NewTask $P1 @{ title = 'A selesai'; due_date = (D -5); assignee_id = $A.Id; status = 'done' }
$a6 = NewTask $P1 @{ title = 'A deadline jauh'; due_date = (D $laterOffset); assignee_id = $A.Id }
$a7 = NewTask $P1 @{ title = 'A dikerjakan tanpa deadline'; assignee_id = $A.Id; status = 'in_progress' }
$a8 = NewTask $P2 @{ title = 'A terlambat kemarin'; due_date = (D -1); assignee_id = $A.Id; status = 'in_progress' }
$a10 = NewTask $P2 @{ title = 'A sangat jauh'; due_date = (D ($laterOffset + 20)); assignee_id = $A.Id }
# milik orang lain / proyek tak relevan (tidak boleh dihitung untuk A)
$b1 = NewTask $P1 @{ title = 'Milik B terlambat'; due_date = (D -4); assignee_id = $B.Id }
$q1 = NewTask $Q @{ title = 'Proyek Q milik B'; due_date = (D -2); assignee_id = $B.Id } $B.Token
$un = NewTask $P2 @{ title = 'Tanpa assignee'; due_date = (D -6) }
# proyek arsip
$z1 = NewTask $P4 @{ title = 'A di proyek arsip'; due_date = (D -2); assignee_id = $A.Id }
$null = Call POST "/projects/$($P4.Id)/archive" @{ archived = $true } $A.Token
Check 'setup: tugas uji dibuat' ($a1.code -and $a10.code -and $z1.code)

# ===================== STATISTIK =====================
$r = Call GET /dashboard $null $A.Token
$d = $r.Data; $s = $d.stats
Check 'dashboard A: 200' ($r.Status -eq 200 -and $d.user.id -eq $A.Id)
Check 'stats.total_tasks = semua tugas A di proyek aktif (9 termasuk yang selesai)' ($s.total_tasks -eq 9)
Check 'stats.open_tasks = 8, completed_tasks = 1' ($s.open_tasks -eq 8 -and $s.completed_tasks -eq 1)
Check 'stats.in_progress = 3 (hanya status in_progress)' ($s.in_progress -eq 3)
Check 'stats.overdue = 2 (tugas selesai tidak dihitung; milik B, proyek arsip, & tanpa assignee tidak ikut)' ($s.overdue -eq 2)
$expWeek = if ($tomorrowInWeek) { 2 } else { 1 }
Check "stats.due_this_week = $expWeek (hari ini s/d Minggu; besok dalam minggu = $tomorrowInWeek)" ($s.due_this_week -eq $expWeek)

# konsistensi dengan /me/tasks
$mine = Call GET '/me/tasks?per_page=100' $null $A.Token
$grp = (Call GET '/me/tasks?group=due' $null $A.Token).Data
Check 'konsisten: open_tasks = /me/tasks meta.total' ($mine.Json.meta.total -eq $s.open_tasks)
Check 'konsisten: overdue = kelompok overdue di /me/tasks?group=due' (@($grp.overdue).Count -eq $s.overdue)
Check 'konsisten: due_this_week = today + this_week di /me/tasks?group=due' ((@($grp.today).Count + @($grp.this_week).Count) -eq $s.due_this_week)
Check 'konsisten: completed_tasks = /me/tasks?status=done' ((Call GET '/me/tasks?status=done' $null $A.Token).Json.meta.total -eq $s.completed_tasks)
Check 'konsisten: in_progress = /me/tasks?status=in_progress' ((Call GET '/me/tasks?status=in_progress' $null $A.Token).Json.meta.total -eq $s.in_progress)

# user lain tidak bocor
$sb = (Call GET /dashboard $null $B.Token).Data.stats
Check 'dashboard B memakai data B sendiri (bukan data A)' ($sb.total_tasks -eq 2 -and $sb.overdue -eq 2)

# ===================== TUGAS JATUH TEMPO =====================
$u = $d.upcoming_tasks
Check 'upcoming: maks. 5 tugas, urut deadline terdekat (terlambat di depan)' (@($u).Count -eq 5 -and (Titles $u) -eq 'A terlambat tiga hari|A terlambat kemarin|A hari ini|A besok|A deadline jauh')
Check 'upcoming: tugas selesai, tanpa deadline, milik orang lain, & proyek arsip tidak ikut' ((Titles $u) -notmatch 'selesai|tanpa deadline|Milik B|Tanpa assignee|arsip|sangat jauh')
Check 'upcoming: is_overdue benar (terlambat = true, lainnya false)' ($u[0].is_overdue -and $u[1].is_overdue -and -not $u[2].is_overdue -and -not $u[3].is_overdue -and -not $u[4].is_overdue)
Check 'upcoming: memuat data tugas lengkap (kode, status, prioritas, info proyek, deadline)' ($u[0].code -ceq "$($P1.Key)-1" -and $u[0].status -eq 'todo' -and $u[0].priority -eq 'medium' -and $u[0].project.key -ceq $P1.Key -and "$($u[0].due_date)" -match (D -3))
Check 'upcoming: lintas proyek (P1 dan P2 muncul)' ((@($u | ForEach-Object { $_.project.key }) | Sort-Object -Unique).Count -eq 2)

# ===================== PROYEK TERBARU =====================
$rp = $d.recent_projects
Check 'recent_projects: hanya proyek aktif A (arsip & proyek orang lain tidak ikut), terbaru dulu' ((@($rp | ForEach-Object { $_.name }) -join '|') -eq 'Proyek Tiga|Proyek Dua|Proyek Satu')
$p1d = (Call GET "/projects/$($P1.Id)" $null $A.Token).Data
$p1c = @($rp | Where-Object { $_.id -eq $P1.Id })[0]
Check 'recent_projects: progress & hitungan sama dengan detail proyek' ($p1c.progress -eq $p1d.progress -and $p1c.task_count -eq $p1d.task_count -and $p1c.done_count -eq $p1d.done_count -and $p1c.task_count -eq 8 -and $p1c.done_count -eq 1 -and $p1c.progress -eq 13)
Check 'recent_projects: memuat role, jumlah anggota, dan avatar anggota' ($p1c.my_role -eq 'owner' -and $p1c.member_count -eq 2 -and @($p1c.members_preview).Count -eq 2)
$null = Call POST "/projects/$($P1.Id)/favorite" $null $A.Token
Check 'recent_projects: proyek favorit naik ke paling atas' ((Call GET /dashboard $null $A.Token).Data.recent_projects[0].id -eq $P1.Id)
# lebih dari 6 proyek -> dibatasi 6
foreach ($i in 1..5) { $null = NewProject "Proyek Tambahan $i" }
$rp2 = (Call GET /dashboard $null $A.Token).Data.recent_projects
Check 'recent_projects: dibatasi 6 kartu walau proyek lebih banyak' (@($rp2).Count -eq 6 -and $rp2[0].id -eq $P1.Id)

# ===================== AKTIVITAS TERBARU =====================
$act = (Call GET /dashboard $null $A.Token).Data.recent_activities
Check 'recent_activities: tepat 10 (dari banyak aktivitas), terbaru dulu' (@($act).Count -eq 10 -and (@($act | ForEach-Object { $_.id }) -join ',') -eq ((@($act | ForEach-Object { $_.id }) | Sort-Object { [long]$_ } -Descending) -join ','))
Check 'recent_activities: setiap item memuat kalimat, pelaku, dan info proyek' (@($act | Where-Object { $_.message -and $_.user.name -and $_.project.key }).Count -eq 10)
$null = Call PATCH "/tasks/$($a4.id)/move" @{ status = 'in_review' } $A.Token
$null = Call POST "/tasks/$($a4.id)/comments" @{ body = 'Tes dashboard' } $B.Token
$act = (Call GET /dashboard $null $A.Token).Data.recent_activities
Check 'recent_activities: aktivitas baru langsung di paling atas (kalimat Indonesia)' ($act[0].message -ceq "User member mengomentari $($P1.Key)-4" -and $act[1].message -ceq "User owner memindahkan $($P1.Key)-4 dari To Do ke In Review")
Check 'recent_activities: tidak memuat aktivitas proyek yang bukan milik A (Q) maupun proyek arsip' (@($act | Where-Object { $_.project.key -ceq $Q.Key -or $_.project.key -ceq $P4.Key }).Count -eq 0)
# keluar dari proyek -> aktivitasnya hilang dari dashboard
$null = Call POST "/projects/$($P2.Id)/members" @{ email = $C.Email } $A.Token
$null = Call PATCH "/tasks/$($a8.id)" @{ priority = 'urgent' } $A.Token
Check 'recent_activities: aktivitas proyek yang baru saja berubah muncul' ((Call GET /dashboard $null $A.Token).Data.recent_activities[0].message -ceq "User owner mengubah $($P2.Key)-1 (prioritas)")
$dc = (Call GET /dashboard $null $C.Token).Data
Check 'anggota baru melihat aktivitas proyeknya, tidak dari proyek lain' (@($dc.recent_activities).Count -ge 1 -and @($dc.recent_activities | Where-Object { $_.project.key -ceq $P2.Key }).Count -eq @($dc.recent_activities).Count)
$null = Call DELETE "/projects/$($P2.Id)/members/$($C.Id)" $null $A.Token
Check 'keluar dari proyek -> aktivitasnya hilang dari dashboard' (@((Call GET /dashboard $null $C.Token).Data.recent_activities).Count -eq 0)

# ===================== PERUBAHAN DATA TERCERMIN =====================
$null = Call PATCH "/tasks/$($a1.id)" @{ status = 'done' } $A.Token
$r = Call GET /dashboard $null $A.Token
$s2 = $r.Data.stats
Check 'tandai tugas terlambat selesai: overdue -1, completed +1, open -1' ($s2.overdue -eq 1 -and $s2.completed_tasks -eq 2 -and $s2.open_tasks -eq 7 -and $s2.total_tasks -eq 9)
Check 'tugas yang selesai keluar dari upcoming dan tugas berikutnya naik' ((Titles $r.Data.upcoming_tasks) -eq 'A terlambat kemarin|A hari ini|A besok|A deadline jauh|A sangat jauh')
$null = Call PATCH "/tasks/$($a8.id)" '{"assignee_id":null}' $A.Token
Check 'melepas assignee: tugas hilang dari statistik A' ((Call GET /dashboard $null $A.Token).Data.stats.overdue -eq 0)
$null = Call DELETE "/tasks/$($a2.id)" $null $A.Token
Check 'menghapus tugas: total berkurang' ((Call GET /dashboard $null $A.Token).Data.stats.total_tasks -eq 7)
$null = Call POST "/projects/$($P1.Id)/archive" @{ archived = $true } $A.Token
$r = Call GET /dashboard $null $A.Token
Check 'mengarsipkan proyek: tugas, proyek, dan aktivitasnya hilang dari dashboard' ($r.Data.stats.total_tasks -eq 1 -and @($r.Data.recent_projects | Where-Object { $_.id -eq $P1.Id }).Count -eq 0 -and @($r.Data.recent_activities | Where-Object { $_.project.key -ceq $P1.Key }).Count -eq 0)
$null = Call POST "/projects/$($P1.Id)/archive" @{ archived = $false } $A.Token
Check 'memulihkan proyek: data kembali tampil' ((Call GET /dashboard $null $A.Token).Data.stats.total_tasks -eq 7)

"`nHASIL: $script:pass lulus, $script:fail gagal"
if ($script:fail -gt 0) { exit 1 }
