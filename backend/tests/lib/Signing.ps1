# Tanda tangan request (HMAC-SHA256) dalam PowerShell untuk skrip e2e.
# Ini implementasi KETIGA (selain Go dan TypeScript); sengaja ditulis ulang dengan alat berbeda (.NET) dan
# tanpa membaca kode Go, agar kecocokan antar implementasi terbukti. Format: lihat backend/internal/pkg/sign/sign.go.

function ConvertTo-PctEncoded([string]$s) {
  $sb = New-Object System.Text.StringBuilder
  foreach ($b in [Text.Encoding]::UTF8.GetBytes($s)) {
    if (($b -ge 65 -and $b -le 90) -or ($b -ge 97 -and $b -le 122) -or ($b -ge 48 -and $b -le 57) -or $b -eq 45 -or $b -eq 46 -or $b -eq 95 -or $b -eq 126) { [void]$sb.Append([char]$b) }
    else { [void]$sb.Append('%' + $b.ToString('X2')) }
  }
  $sb.ToString()
}

function Get-CanonicalQuery([string]$rawQuery) {
  if ([string]::IsNullOrEmpty($rawQuery)) { return '' }
  $pairs = New-Object System.Collections.Generic.List[object]
  foreach ($part in $rawQuery.Split('&')) {
    if ($part -eq '') { continue }
    $kv = $part.Split('=', 2)
    $k = [uri]::UnescapeDataString($kv[0].Replace('+', ' '))
    $v = if ($kv.Count -gt 1) { [uri]::UnescapeDataString($kv[1].Replace('+', ' ')) } else { '' }
    $pairs.Add([pscustomobject]@{ K = (ConvertTo-PctEncoded $k); V = (ConvertTo-PctEncoded $v) })
  }
  # urut ordinal (bytewise) pada key lalu value yang sudah di-encode; Sort-Object bawaan peka budaya, jadi dibuat manual
  for ($i = 1; $i -lt $pairs.Count; $i++) {
    $cur = $pairs[$i]; $j = $i - 1
    while ($j -ge 0 -and (([string]::CompareOrdinal($pairs[$j].K, $cur.K) -gt 0) -or ([string]::CompareOrdinal($pairs[$j].K, $cur.K) -eq 0 -and [string]::CompareOrdinal($pairs[$j].V, $cur.V) -gt 0))) { $pairs[$j + 1] = $pairs[$j]; $j-- }
    $pairs[$j + 1] = $cur
  }
  ($pairs | ForEach-Object { "$($_.K)=$($_.V)" }) -join '&'
}

function ConvertFrom-Base64Url([string]$s) {
  $s = $s.Replace('-', '+').Replace('_', '/')
  switch ($s.Length % 4) { 2 { $s += '==' } 3 { $s += '=' } }
  [Convert]::FromBase64String($s)
}

function Get-Sha256Hex([byte[]]$bytes) {
  $h = [Security.Cryptography.SHA256]::Create()
  try { ($h.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '' } finally { $h.Dispose() }
}

function New-Nonce { -join ((1..16) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) }) }

# Mengembalikan hashtable header X-Timestamp / X-Nonce / X-Signature untuk request.
# -Timestamp (detik unix) dan -Nonce bisa diisi untuk menguji kedaluwarsa / replay.
function New-SignatureHeaders {
  param([string]$Method, [string]$Url, [string]$Body = '', [string]$KeyB64, [long]$Timestamp = 0, [string]$Nonce = '')
  $uri = [Uri]$Url
  if ($Timestamp -eq 0) { $Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }
  if (-not $Nonce) { $Nonce = New-Nonce }
  $canonical = @('mpo1', $Method.ToUpperInvariant(), $uri.AbsolutePath, (Get-CanonicalQuery ($uri.Query.TrimStart('?'))), (Get-Sha256Hex ([Text.Encoding]::UTF8.GetBytes($Body))), "$Timestamp", $Nonce) -join "`n"
  $hmac = New-Object Security.Cryptography.HMACSHA256 (, (ConvertFrom-Base64Url $KeyB64))
  try { $sig = ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($canonical)) | ForEach-Object { $_.ToString('x2') }) -join '' } finally { $hmac.Dispose() }
  @{ 'X-Timestamp' = "$Timestamp"; 'X-Nonce' = $Nonce; 'X-Signature' = $sig }
}