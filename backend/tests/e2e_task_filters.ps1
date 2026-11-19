# Uji end-to-end fitur 05: filter, pencarian, sort, pagination daftar tugas, dan "Tugas Saya" (/me/tasks).
# Jalankan server dulu (cd backend; go run ./cmd/api), lalu: powershell -File tests/e2e_task_filters.ps1
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
function Titles($r) { (@($r.Data | ForEach-Object { $_.title }) -join '|') }
function TitlesSorted($r) { (@($r.Data | ForEach-Object { $_.title } | Sort-Object) -join '|') }
function Enc($s) { [uri]::EscapeDataString($s) }

# --- tanggal acuan (WIB) ---
$wib = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'SE Asia Standard Time')
$today = $wib.Date
$dow = ([int]$today.DayOfWeek + 6) % 7          # Senin=0 ... Minggu=6
$weekEnd = $today.AddDays(6 - $dow)
function D($offset) { $today.AddDays($offset).ToString('yyyy-MM-dd') }
$tomorrowInWeek = ($today.AddDays(1) -le $weekEnd)
$laterOffset = (6 - $dow) + 3                    # 3 hari setelah akhir minggu

$A = NewUser 'owner'; $B = NewUser 'member'; $C = NewUser 'outsider'
Check 'setup: 3 user terdaftar & login' ($A.Token -and $B.Token -and $C.Token)
function NewProject($name) {
  $key = -join ((65..90) | Get-Random -Count 4 | ForEach-Object { [char]$_ })
  $r = Call POST /projects @{ name = $name; key = $key } $A.Token
  [pscustomobject]@{ Id = $r.Data.id; Key = $key }
}
$P = NewProject 'Proyek Filter'; $P2 = NewProject 'Proyek Dua'; $P3 = NewProject 'Proyek Tiga'
$null = Call POST "/projects/$($P.Id)/members" @{ email = $B.Email } $A.Token
$null = Call POST "/projects/$($P2.Id)/members" @{ email = $B.Email } $A.Token
function NewTask($proj, $body, $token = $A.Token) { (Call POST "/projects/$($proj.Id)/tasks" $body $token).Data }

# Tugas di proyek utama (dibuat berurutan sehingga created_at naik: t1 paling lama)
$t1 = NewTask $P @{ title = 'Login page'; priority = 'high'; due_date = (D -3); assignee_id = $B.Id }
$t2 = NewTask $P @{ title = 'Signup form'; priority = 'low'; due_date = (D 0); assignee_id = $A.Id; status = 'in_progress' }
$t3 = NewTask $P @{ title = 'Dashboard chart'; priority = 'urgent'; due_date = (D 1); assignee_id = $B.Id; status = 'in_review' }
$t4 = NewTask $P @{ title = 'API docs'; priority = 'medium' }
$t5 = NewTask $P @{ title = 'Deploy script'; priority = 'high'; due_date = (D $laterOffset); assignee_id = $B.Id; status = 'done' }
$t6 = NewTask $P @{ title = 'Fix 100% bug_report'; priority = 'low'; assignee_id = $A.Id }
$t7 = NewTask $P @{ title = 'Old done'; priority = 'medium'; due_date = (D -10); assignee_id = $A.Id; status = 'done' }
Check 'setup: 7 tugas dibuat' ($t1.code -and $t7.code -and $t7.number -eq 7)
$url = "/projects/$($P.Id)/tasks"

# --- Pencarian (q) ---
Check 'q: judul (tanpa beda huruf besar/kecil)' ((Titles (Call GET "$url`?q=login" $null $A.Token)) -eq 'Login page' -and (Titles (Call GET "$url`?q=LOGIN" $null $A.Token)) -eq 'Login page')
Check 'q: potongan kata di tengah judul' ((Titles (Call GET "$url`?q=board" $null $A.Token)) -eq 'Dashboard chart')
Check 'q: kode tugas (huruf kecil)' ((Titles (Call GET "$url`?q=$($P.Key.ToLower())-4" $null $A.Token)) -eq 'API docs')
Check 'q: key proyek TIDAK mencocokkan semua tugas lewat kode (hanya judul)' (@((Call GET "$url`?q=$($P.Key.ToLower())" $null $A.Token).Data).Count -eq 0)
Check 'q: kode lengkap huruf besar (KEY-4)' ((Titles (Call GET "$url`?q=$($P.Key)-4" $null $A.Token)) -eq 'API docs')
Check 'q: karakter % dianggap literal' ((Titles (Call GET "$url`?q=$(Enc '%')" $null $A.Token)) -eq 'Fix 100% bug_report')
Check 'q: karakter _ dianggap literal' ((Titles (Call GET "$url`?q=_" $null $A.Token)) -eq 'Fix 100% bug_report')
$r = Call GET "$url`?q=zzzzz" $null $A.Token
Check 'q: tidak ada hasil -> [] dan meta.total 0' ($r.Status -eq 200 -and $r.Json.data -is [array] -and @($r.Data).Count -eq 0 -and $r.Json.meta.total -eq 0 -and $r.Json.meta.total_pages -eq 0)
$r = Call GET "$url`?q=$(Enc "'; DROP TABLE tasks; --")" $null $A.Token
Check 'q: percobaan SQL injection -> 200 tanpa hasil' ($r.Status -eq 200 -and @($r.Data).Count -eq 0)
Check 'q: tabel tasks masih utuh setelah percobaan injection' ((Call GET "$url`?per_page=100" $null $A.Token).Json.meta.total -eq 7)
Check 'q: > 100 karakter -> 400' ((Call GET "$url`?q=$('x' * 101)" $null $A.Token).Status -eq 400)

# --- Filter status & prioritas ---
Check 'status=todo' ((TitlesSorted (Call GET "$url`?status=todo" $null $A.Token)) -eq 'API docs|Fix 100% bug_report|Login page')
Check 'status multi (todo,in_progress)' ((TitlesSorted (Call GET "$url`?status=todo,in_progress" $null $A.Token)) -eq 'API docs|Fix 100% bug_report|Login page|Signup form')
Check 'status=done' ((TitlesSorted (Call GET "$url`?status=done" $null $A.Token)) -eq 'Deploy script|Old done')
$r = Call GET "$url`?status=selesai" $null $A.Token
Check 'status tidak valid -> 400 dengan details' ($r.Status -eq 400 -and $r.Err.details.status)
Check 'priority=high' ((TitlesSorted (Call GET "$url`?priority=high" $null $A.Token)) -eq 'Deploy script|Login page')
Check 'priority multi (high,urgent)' ((TitlesSorted (Call GET "$url`?priority=high,urgent" $null $A.Token)) -eq 'Dashboard chart|Deploy script|Login page')
Check 'priority tidak valid -> 400' ((Call GET "$url`?priority=kritis" $null $A.Token).Status -eq 400)

# --- Filter assignee ---
Check 'assignee=none (belum di-assign)' ((Titles (Call GET "$url`?assignee=none" $null $A.Token)) -eq 'API docs')
Check 'assignee=me' ((TitlesSorted (Call GET "$url`?assignee=me" $null $A.Token)) -eq 'Fix 100% bug_report|Old done|Signup form')
Check 'assignee=me dipetakan ke pemanggil (B melihat tugas B)' ((TitlesSorted (Call GET "$url`?assignee=me" $null $B.Token)) -eq 'Dashboard chart|Deploy script|Login page')
Check 'assignee=<uuid>' ((TitlesSorted (Call GET "$url`?assignee=$($B.Id)" $null $A.Token)) -eq 'Dashboard chart|Deploy script|Login page')
Check 'assignee=<uuid>,none (multi + belum di-assign)' ((TitlesSorted (Call GET "$url`?assignee=$($B.Id),none" $null $A.Token)) -eq 'API docs|Dashboard chart|Deploy script|Login page')
Check 'assignee tidak valid -> 400' ((Call GET "$url`?assignee=bukan-uuid" $null $A.Token).Status -eq 400)

# --- Filter deadline ---
Check 'due=overdue (tugas done tidak dihitung terlambat)' ((Titles (Call GET "$url`?due=overdue" $null $A.Token)) -eq 'Login page')
Check 'due=today' ((Titles (Call GET "$url`?due=today" $null $A.Token)) -eq 'Signup form')
$weekExpected = if ($tomorrowInWeek) { 'Dashboard chart|Signup form' } else { 'Signup form' }
Check "due=week (hari ini s/d Minggu, besok dalam minggu = $tomorrowInWeek)" ((TitlesSorted (Call GET "$url`?due=week" $null $A.Token)) -eq $weekExpected)
Check 'due=none (tanpa deadline)' ((TitlesSorted (Call GET "$url`?due=none" $null $A.Token)) -eq 'API docs|Fix 100% bug_report')
Check 'due multi (overdue,none) = OR' ((TitlesSorted (Call GET "$url`?due=overdue,none" $null $A.Token)) -eq 'API docs|Fix 100% bug_report|Login page')
Check 'due tidak valid -> 400' ((Call GET "$url`?due=kemarin" $null $A.Token).Status -eq 400)

# --- Kombinasi filter (AND) ---
Check 'kombinasi: status=todo + assignee=B' ((Titles (Call GET "$url`?status=todo&assignee=$($B.Id)" $null $A.Token)) -eq 'Login page')
Check 'kombinasi: priority=high + due=overdue' ((Titles (Call GET "$url`?priority=high&due=overdue" $null $A.Token)) -eq 'Login page')
Check 'kombinasi: status=done + due=overdue -> kosong' (@((Call GET "$url`?status=done&due=overdue" $null $A.Token).Data).Count -eq 0)
Check 'kombinasi: q + status' ((Titles (Call GET "$url`?q=sign&status=in_progress" $null $A.Token)) -eq 'Signup form')
$r = Call GET "$url`?status=bad&page=abc&sort=password_hash" $null $A.Token
Check 'beberapa parameter salah -> semua kesalahan dilaporkan sekaligus' ($r.Status -eq 400 -and $r.Err.details.status -and $r.Err.details.page -and $r.Err.details.sort)

# --- Sort ---
$all = "$url`?per_page=100"
Check 'sort default = terbaru dulu' ((Titles (Call GET $all $null $A.Token)) -eq 'Old done|Fix 100% bug_report|Deploy script|API docs|Dashboard chart|Signup form|Login page')
Check 'sort=-created_at sama dengan default' ((Titles (Call GET "$all&sort=-created_at" $null $A.Token)) -eq 'Old done|Fix 100% bug_report|Deploy script|API docs|Dashboard chart|Signup form|Login page')
Check 'sort=created_at (terlama dulu)' ((Titles (Call GET "$all&sort=created_at" $null $A.Token)) -eq 'Login page|Signup form|Dashboard chart|API docs|Deploy script|Fix 100% bug_report|Old done')
$r = Call GET "$all&sort=due_date" $null $A.Token
Check 'sort=due_date: terdekat dulu, tanpa deadline paling akhir' ((Titles $r) -eq 'Old done|Login page|Signup form|Dashboard chart|Deploy script|Fix 100% bug_report|API docs')
$r = Call GET "$all&sort=-due_date" $null $A.Token
Check 'sort=-due_date: terjauh dulu, tanpa deadline TETAP paling akhir' ((Titles $r) -eq 'Deploy script|Dashboard chart|Signup form|Login page|Old done|Fix 100% bug_report|API docs')
Check 'sort=priority (rendah -> urgent)' ((@((Call GET "$all&sort=priority" $null $A.Token).Data | ForEach-Object { $_.priority }) -join ',') -eq 'low,low,medium,medium,high,high,urgent')
Check 'sort=-priority (urgent -> rendah)' ((@((Call GET "$all&sort=-priority" $null $A.Token).Data | ForEach-Object { $_.priority }) -join ',') -eq 'urgent,high,high,medium,medium,low,low')
Check 'sort=title (A-Z, tanpa beda huruf besar/kecil)' ((Titles (Call GET "$all&sort=title" $null $A.Token)) -eq 'API docs|Dashboard chart|Deploy script|Fix 100% bug_report|Login page|Old done|Signup form')
Check 'sort=-title (Z-A)' ((Titles (Call GET "$all&sort=-title" $null $A.Token)) -eq 'Signup form|Old done|Login page|Fix 100% bug_report|Deploy script|Dashboard chart|API docs')
Check 'sort=code (nomor tugas)' ((@((Call GET "$all&sort=code" $null $A.Token).Data | ForEach-Object { $_.number }) -join ',') -eq '1,2,3,4,5,6,7')
Check 'sort=status (kolom Kanban)' ((@((Call GET "$all&sort=status,code" $null $A.Token).Data | ForEach-Object { $_.status }) -join ',') -eq 'todo,todo,todo,in_progress,in_review,done,done')
Check 'sort majemuk: priority,-due_date' ((Titles (Call GET "$all&sort=priority,-due_date" $null $A.Token)) -eq 'Signup form|Fix 100% bug_report|Old done|API docs|Deploy script|Login page|Dashboard chart')
Check 'sort kolom tidak dikenal (password_hash) -> 400' ((Call GET "$all&sort=password_hash" $null $A.Token).Status -eq 400)
Check 'sort percobaan SQL injection -> 400' ((Call GET "$all&sort=$(Enc 'title;DROP TABLE tasks')" $null $A.Token).Status -eq 400)
Check 'sort > 3 kolom -> 400' ((Call GET "$all&sort=title,code,status,priority" $null $A.Token).Status -eq 400)

# --- Pagination ---
$r = Call GET "$url`?per_page=3&sort=code" $null $A.Token
Check 'pagination: halaman 1 berisi 3 + meta lengkap' ($r.Status -eq 200 -and @($r.Data).Count -eq 3 -and $r.Json.meta.page -eq 1 -and $r.Json.meta.per_page -eq 3 -and $r.Json.meta.total -eq 7 -and $r.Json.meta.total_pages -eq 3)
$r = Call GET "$url`?per_page=3&page=3&sort=code" $null $A.Token
Check 'pagination: halaman terakhir berisi sisa (1)' (@($r.Data).Count -eq 1 -and $r.Data[0].number -eq 7)
$r = Call GET "$url`?per_page=3&page=4" $null $A.Token
Check 'pagination: halaman melewati batas -> [] dengan meta tetap benar' ($r.Status -eq 200 -and @($r.Data).Count -eq 0 -and $r.Json.meta.total -eq 7 -and $r.Json.meta.total_pages -eq 3)
foreach ($sortKey in 'code', 'due_date', 'priority', 'title', '-created_at') {
  $ids = @(); foreach ($pg in 1..4) { $ids += @((Call GET "$url`?per_page=2&page=$pg&sort=$sortKey" $null $A.Token).Data | ForEach-Object { $_.id }) }
  Check "pagination stabil: sort=$sortKey -> 7 id unik di semua halaman (tanpa duplikat/hilang)" ($ids.Count -eq 7 -and @($ids | Sort-Object -Unique).Count -eq 7)
}
foreach ($bad in 'per_page=0', 'per_page=101', 'per_page=abc', 'page=0', 'page=-1', 'page=abc', 'page=1.5') {
  Check "pagination: $bad -> 400" ((Call GET "$url`?$bad" $null $A.Token).Status -eq 400)
}
Check 'pagination: per_page=100 (maksimum) diterima' ((Call GET "$url`?per_page=100" $null $A.Token).Status -eq 200)

# --- Board + filter ---
$r = Call GET "$url`?view=board&assignee=$($B.Id)&per_page=1" $null $A.Token
$cols = $r.Data
Check 'board + filter: hanya tugas yang cocok per kolom, per_page diabaikan, tanpa meta' ($r.Status -eq 200 -and $null -eq $r.Json.meta -and (@($cols.todo | ForEach-Object { $_.title }) -join '|') -eq 'Login page' -and (@($cols.in_review | ForEach-Object { $_.title }) -join '|') -eq 'Dashboard chart' -and (@($cols.done | ForEach-Object { $_.title }) -join '|') -eq 'Deploy script' -and @($cols.in_progress).Count -eq 0)
$r = Call GET "$url`?view=board" $null $A.Token
Check 'board tanpa filter: 7 tugas di 4 kolom' ((@($r.Data.todo).Count + @($r.Data.in_progress).Count + @($r.Data.in_review).Count + @($r.Data.done).Count) -eq 7)
Check 'view tidak valid -> 400' ((Call GET "$url`?view=grid" $null $A.Token).Status -eq 400)

# --- Hak akses ---
Check 'non-anggota + filter -> 404 (tidak bocor)' ((Call GET "$url`?q=login&status=todo" $null $C.Token).Status -eq 404)
Check 'member boleh memfilter' ((Call GET "$url`?q=login" $null $B.Token).Status -eq 200)
Check 'tanpa login -> 401' ((Call GET "$url`?q=login").Status -eq 401)

# ===================== TUGAS SAYA (/me/tasks) =====================
$u1 = NewTask $P2 @{ title = 'B di proyek dua'; priority = 'medium'; due_date = (D 0); assignee_id = $B.Id }
$u2 = NewTask $P2 @{ title = 'B selesai di proyek dua'; priority = 'low'; assignee_id = $B.Id; status = 'done' }
$u3 = NewTask $P2 @{ title = 'Milik A di proyek dua'; priority = 'low'; assignee_id = $A.Id }
$w1 = NewTask $P3 @{ title = 'Hanya A di proyek tiga'; priority = 'high'; due_date = (D -1); assignee_id = $A.Id }
$w2 = NewTask $P3 @{ title = 'Tanpa assignee proyek tiga'; priority = 'high' }

Check '/me/tasks tanpa login -> 401' ((Call GET '/me/tasks').Status -eq 401)
$r = Call GET '/me/tasks' $null $B.Token
Check '/me/tasks (B): lintas proyek, done dikecualikan, urut deadline lalu prioritas' ($r.Status -eq 200 -and (Titles $r) -eq 'Login page|B di proyek dua|Dashboard chart' -and $r.Json.meta.total -eq 3)
Check '/me/tasks: setiap tugas memuat info proyek (lintas proyek)' ((@($r.Data | ForEach-Object { $_.project.key }) | Sort-Object -Unique).Count -eq 2 -and $r.Data[0].project.name)
Check '/me/tasks (B): tidak memuat tugas orang lain / proyek yang bukan miliknya' ((Titles $r) -notmatch 'Milik A|Hanya A|Tanpa assignee')
$r = Call GET '/me/tasks?group=due' $null $B.Token
$g = $r.Data
$expThisWeek = if ($tomorrowInWeek) { 'Dashboard chart' } else { '' }
$expLater = if ($tomorrowInWeek) { '' } else { 'Dashboard chart' }
Check '/me/tasks?group=due: terlambat / hari ini / minggu ini / nanti / tanpa deadline' ($r.Status -eq 200 -and (@($g.overdue | ForEach-Object { $_.title }) -join '|') -eq 'Login page' -and (@($g.today | ForEach-Object { $_.title }) -join '|') -eq 'B di proyek dua' -and (@($g.this_week | ForEach-Object { $_.title }) -join '|') -eq $expThisWeek -and (@($g.later | ForEach-Object { $_.title }) -join '|') -eq $expLater -and @($g.no_deadline).Count -eq 0)
Check '/me/tasks?group=due: kelompok kosong berupa [] (bukan null)' ($r.Json.data.no_deadline -is [array] -and $null -eq $r.Json.meta)
$r = Call GET '/me/tasks?include_done=true' $null $B.Token
Check '/me/tasks?include_done=true menyertakan tugas selesai' ((TitlesSorted $r) -eq 'B di proyek dua|B selesai di proyek dua|Dashboard chart|Deploy script|Login page')
Check '/me/tasks?status=done (status eksplisit) menampilkan yang selesai' ((TitlesSorted (Call GET '/me/tasks?status=done' $null $B.Token)) -eq 'B selesai di proyek dua|Deploy script')
Check '/me/tasks: filter q' ((Titles (Call GET '/me/tasks?q=login' $null $B.Token)) -eq 'Login page')
Check '/me/tasks: filter priority' ((Titles (Call GET '/me/tasks?priority=urgent' $null $B.Token)) -eq 'Dashboard chart')
Check '/me/tasks: filter due=today' ((Titles (Call GET '/me/tasks?due=today' $null $B.Token)) -eq 'B di proyek dua')
Check '/me/tasks: sort=title' ((Titles (Call GET '/me/tasks?sort=title' $null $B.Token)) -eq 'B di proyek dua|Dashboard chart|Login page')
$r = Call GET '/me/tasks?per_page=2' $null $B.Token
Check '/me/tasks: pagination (per_page=2 -> total 3, 2 halaman)' (@($r.Data).Count -eq 2 -and $r.Json.meta.total -eq 3 -and $r.Json.meta.total_pages -eq 2)
Check '/me/tasks: parameter assignee diabaikan (selalu milik saya)' ((TitlesSorted (Call GET "/me/tasks?assignee=$($A.Id)" $null $B.Token)) -eq 'B di proyek dua|Dashboard chart|Login page')
Check '/me/tasks?group=minggu -> 400' ((Call GET '/me/tasks?group=minggu' $null $B.Token).Status -eq 400)
Check '/me/tasks?include_done=mungkin -> 400' ((Call GET '/me/tasks?include_done=mungkin' $null $B.Token).Status -eq 400)
Check '/me/tasks?sort=password_hash -> 400' ((Call GET '/me/tasks?sort=password_hash' $null $B.Token).Status -eq 400)

$r = Call GET '/me/tasks' $null $A.Token
Check '/me/tasks (A): tugas A lintas 3 proyek, done dikecualikan' ((TitlesSorted $r) -eq 'Fix 100% bug_report|Hanya A di proyek tiga|Milik A di proyek dua|Signup form')
$r = Call GET '/me/tasks' $null $C.Token
Check '/me/tasks (C, tanpa tugas) -> [] dengan meta.total 0' ($r.Status -eq 200 -and @($r.Data).Count -eq 0 -and $r.Json.meta.total -eq 0)

# Checkbox cepat "tandai selesai" lewat PATCH biasa
$null = Call PATCH "/tasks/$($t1.id)" @{ status = 'done' } $B.Token
Check 'tandai selesai -> tugas hilang dari Tugas Saya' ((Titles (Call GET '/me/tasks' $null $B.Token)) -eq 'B di proyek dua|Dashboard chart')

# Proyek terarsip dikecualikan
$null = Call POST "/projects/$($P2.Id)/archive" @{ archived = $true } $A.Token
Check 'proyek terarsip dikecualikan dari Tugas Saya' ((Titles (Call GET '/me/tasks' $null $B.Token)) -eq 'Dashboard chart')
$null = Call POST "/projects/$($P2.Id)/archive" @{ archived = $false } $A.Token
Check 'proyek dipulihkan -> tugasnya muncul lagi' ((Titles (Call GET '/me/tasks' $null $B.Token)) -eq 'B di proyek dua|Dashboard chart')

# Anggota dikeluarkan -> tidak lagi melihat tugas proyek tsb
$null = Call DELETE "/projects/$($P2.Id)/members/$($B.Id)" $null $A.Token
Check 'dikeluarkan dari proyek -> tugas proyek itu hilang dari Tugas Saya' ((Titles (Call GET '/me/tasks' $null $B.Token)) -eq 'Dashboard chart')

"`nHASIL: $script:pass lulus, $script:fail gagal"
if ($script:fail -gt 0) { exit 1 }
