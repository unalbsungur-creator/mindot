<#
.SYNOPSIS
  MINDOT — restore test of one encrypted weekly backup (security pack 2b, item 6).

.DESCRIPTION
  Downloads one backup from the private R2 bucket (with your own Wrangler
  login), asks for the age private key with hidden input, decrypts it inside a
  throwaway container, restores it into a throwaway PostgreSQL 18 container and
  prints only table names and row counts. Afterwards the containers, the
  downloaded file and the decrypted dump are deleted.

  The private key is never written to the disk: it goes from the hidden prompt
  through a pipe into the container's in-memory /secret (tmpfs), which
  disappears with the container.

  Run from the repository root (needs Docker Desktop and the repo's wrangler):
    powershell -ExecutionPolicy Bypass -File ops\backup\restore-test.ps1 -ObjectKey weekly/mindot-prod-2026-11-16T0217Z.dump.age

  -LocalFile <path> uses an already-downloaded .age file instead (it is not deleted).
#>
param(
  [string]$ObjectKey,
  [string]$LocalFile,
  [string]$Bucket = "mindot-db-backups",
  # Normally left out: you are prompted. Only for automated checks of this script.
  [System.Security.SecureString]$Identity
)

$ErrorActionPreference = "Stop"
if (-not $ObjectKey -and -not $LocalFile) { throw "Give -ObjectKey (from the backup run's summary) or -LocalFile." }

$suffix = [guid]::NewGuid().ToString("N").Substring(0, 8)
$work = Join-Path $env:TEMP "mindot-restore-$suffix"
$dbContainer = "mindot-restore-db-$suffix"
New-Item -ItemType Directory -Path $work | Out-Null
$plain = $null

function Invoke-Native([string]$What, [scriptblock]$Block) {
  & $Block
  if ($LASTEXITCODE -ne 0) { throw "$What failed (exit $LASTEXITCODE)." }
}

try {
  Write-Host "1/5  Yedek dosyası hazırlanıyor..."
  if ($LocalFile) {
    Copy-Item -LiteralPath $LocalFile -Destination (Join-Path $work "backup.age")
  } else {
    Invoke-Native "Download" { npx --no-install wrangler r2 object get "$Bucket/$ObjectKey" --file (Join-Path $work "backup.age") --remote | Out-Null }
  }

  Write-Host "2/5  age gizli anahtarı isteniyor (yazdıkların ekranda görünmez)."
  if (-not $Identity) { $Identity = Read-Host "AGE-SECRET-KEY-1... anahtarını gir" -AsSecureString }
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Identity)
  try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if ($plain -notmatch '^AGE-SECRET-KEY-1[0-9A-Z]{58}$') { throw "Bu bir age gizli anahtarına benzemiyor (AGE-SECRET-KEY-1 ile başlamalı)." }

  Write-Host "3/5  Şifre çözülüyor (geçici kapsayıcıda)..."
  # The key reaches the container on stdin and lives only in its RAM-backed /secret.
  # It is ASCII: never let PowerShell prefix the pipe with a UTF-8 BOM, and drop
  # any CR/BOM bytes on the way in all the same.
  $OutputEncoding = New-Object System.Text.ASCIIEncoding
  Invoke-Native "Decrypt" {
    $plain | docker run --rm -i --tmpfs /secret:rw,size=1m,mode=700 -v "${work}:/work" alpine:3.20 sh -c `
      "apk add --no-cache age >/dev/null 2>&1 && tr -d '\r\357\273\277' > /secret/id && age --decrypt --identity /secret/id --output /work/backup.dump /work/backup.age"
  }
  $plain = $null

  Write-Host "4/5  Geçici PostgreSQL 18'e geri yükleniyor..."
  $pgPassword = [guid]::NewGuid().ToString("N")
  Invoke-Native "Start PostgreSQL" { docker run -d --name $dbContainer -e "POSTGRES_PASSWORD=$pgPassword" -v "${work}:/work" postgres:18 | Out-Null }
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    docker exec $dbContainer pg_isready -U postgres -q 2>$null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw "PostgreSQL did not start." }
  Invoke-Native "Create database" { docker exec $dbContainer psql -U postgres -q -c "create database restore_test" | Out-Null }
  # --exit-on-error: any failed object fails the test instead of being skipped silently.
  Invoke-Native "pg_restore" { docker exec $dbContainer pg_restore -U postgres -d restore_test --no-owner --no-privileges --exit-on-error /work/backup.dump }

  Write-Host "5/5  Tablo ve satır sayıları:"
  $query = @"
select format('%s %s', tablename, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', schemaname, tablename), false, true, '')))[1]::text)
from pg_tables where schemaname = 'public' order by tablename
"@
  Invoke-Native "Count rows" { docker exec $dbContainer psql -U postgres -d restore_test -At -c $query }
  Write-Host ""
  Write-Host "GERİ YÜKLEME TESTİ BAŞARILI — bu sayıları Claude'a gönder (içerik yok, yalnızca sayılar)."
}
finally {
  $plain = $null
  [GC]::Collect()
  docker rm -f $dbContainer 2>$null | Out-Null
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Geçici kapsayıcı, indirilen dosya ve çözülmüş döküm silindi."
}
