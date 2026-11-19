# Menjalankan instance server untuk tes (biner bin\api.exe) dengan environment tertentu.
# Dipakai oleh e2e_ops.ps1 dan e2e_signature.ps1 agar tidak mengganggu server development di 6990.

function Start-Api($name, $port, $vars, $hostName = 'localhost') {
  $root = Split-Path $PSScriptRoot -Parent | Split-Path -Parent
  $exe = Join-Path $root 'bin\api.exe'
  if (-not (Test-Path $exe)) { throw "bin\api.exe tidak ada. Jalankan: cd backend; go build -o bin/api.exe ./cmd/api" }
  $saved = @{}
  $all = @{ PORT = "$port" } + $vars
  foreach ($k in $all.Keys) { $saved[$k] = [Environment]::GetEnvironmentVariable($k, 'Process'); [Environment]::SetEnvironmentVariable($k, $all[$k], 'Process') }
  try {
    $out = Join-Path $script:logDir "$name.out.log"; $err = Join-Path $script:logDir "$name.err.log"
    $p = Start-Process -FilePath $exe -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
  } finally { foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k], 'Process') } }
  [pscustomobject]@{ Name = $name; Port = $port; Proc = $p; Base = "http://${hostName}:$port/api/v1"; Out = $out; Err = $err }
}

function Wait-Healthy($s) {
  foreach ($i in 1..40) {
    if ($s.Proc.HasExited) { return $false }
    try { if ((Invoke-WebRequest "$($s.Base)/health" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { return $true } } catch {}
    Start-Sleep -Milliseconds 400
  }
  $false
}

function Stop-Api($s) { if ($s -and $s.Proc -and -not $s.Proc.HasExited) { Stop-Process -Id $s.Proc.Id -Force -ErrorAction SilentlyContinue } }