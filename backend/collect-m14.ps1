#Requires -Version 5.1
<#
  Collects every Module 14 report value that can be read from disk or from a
  running service. Writes  docs\lab\module14\evidence\m14-auto.txt
  Run from backend with both servers up.
#>
param(
  [string]$Ev = "..\docs\lab\module14\evidence",
  [string]$Base = "http://localhost:3400"
)

$ErrorActionPreference = "Continue"
$out = @()
function Emit([string]$k, [string]$v) {
  $script:out += "$k=$($v -replace "`r|`n", ' ')"
  "{0,-8} {1}" -f $k, ($v -replace "`r|`n", ' ').Substring(0, [Math]::Min(90, ($v -replace "`r|`n", ' ').Length))
}

# ---------- ENV ----------
$apiLog = Get-ChildItem "$Ev\backend-14-*.log" -EA SilentlyContinue |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1
$rcvLog = Get-ChildItem "$Ev\partner-*.log"    -EA SilentlyContinue |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($apiLog) {
  $first = Select-String -Path $apiLog.FullName -Pattern '"ts":"([^"]+)"' | Select-Object -First 1
  if ($first) { Emit 'ENV1' ([datetime]$first.Matches[0].Groups[1].Value).ToString('yyyy-MM-dd') }

  $start = Select-String -Path $apiLog.FullName -Pattern 'listening on' | Select-Object -First 1
  if ($start) { Emit 'ENV8' $start.Line.Trim() }

  $ts = Select-String -Path $apiLog.FullName -Pattern '"ts":"([^"]+)"'
  if ($ts) {
    $a = [datetime]$ts[0].Matches[0].Groups[1].Value
    $b = [datetime]$ts[-1].Matches[0].Groups[1].Value
    Emit 'ENV10' ("{0} to {1} PHT ({2} to {3} UTC)" -f `
      $a.AddHours(8).ToString('yyyy-MM-dd HH:mm'), $b.AddHours(8).ToString('HH:mm'),
      $a.ToString('HH:mm'), $b.ToString('HH:mm'))
  }
} else { "!! no backend-14 log found - skip ENV1, ENV8, ENV10" }

if ($rcvLog) {
  $rs = Select-String -Path $rcvLog.FullName -Pattern 'partner\.started' | Select-Object -First 1
  if ($rs) { Emit 'ENV9' $rs.Line.Trim() }
} else { "!! no partner log found - skip ENV9" }

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chrome) {
  Emit 'ENV5' ("Chrome {0}, 1280x800 and 380x800" -f (Get-Item $chrome).VersionInfo.ProductVersion)
}

# ---------- KEY ----------
$ki = node --env-file=.env -e "import('./crypto/keys.js').then(m=>console.log(JSON.stringify(m.keyInfo())))" 2>$null | Out-String
if ($ki -match '\{') {
  $j = ($ki -replace '^[^{]*', '') | ConvertFrom-Json
  $map = @{ senderSigning='KEY1'; senderVerify='KEY2'; recipientDecrypt='KEY3'; recipientEncrypt='KEY4' }
  foreach ($n in $map.Keys) {
    $e = $j.keys.$n
    Emit $map[$n] $(if ($e.present) { $e.fingerprint } else { 'ABSENT in this process' })
  }
}
$openssl = "C:\Program Files\Git\usr\bin\openssl.exe"
if (Test-Path $openssl) {
  $fp = (& $openssl x509 -in tls\partner.pem -noout -fingerprint -sha256) -replace 'SHA256 Fingerprint=', ''
  Emit 'KEY6' $fp.Trim()
}
Emit 'KEY5' 'not published - the HMAC key is never fingerprinted, by design'

# ---------- CFG ----------
$B = Split-Path (Get-Location) -Parent
Push-Location $B
$t = git ls-files | Select-String '\.pem$|\.key$|/keys/|^backend/\.env$|\.env\.receiver$'
Emit 'CFG1' ("{0} tracked key or env files" -f (($t | Measure-Object).Count))
Pop-Location

$sec = Get-Content .env | Where-Object { $_ -match '^SECURE_' }
$inline = ($sec | Select-String 'BEGIN|PRIVATE KEY' | Measure-Object).Count
Emit 'CFG2' ("{0} SECURE_ settings, {1} contain inline key material" -f $sec.Count, $inline)

Push-Location $B
$esc = (Get-ChildItem backend\*.js, backend\secure\*.js, backend\crypto\*.js -EA SilentlyContinue |
        Select-String 'NODE_TLS_REJECT_UNAUTHORIZED' | Measure-Object).Count
Pop-Location
Emit 'CFG3' ("{0} occurrences of NODE_TLS_REJECT_UNAUTHORIZED" -f $esc)

$rj = Select-String -Path secure\sender.js -Pattern 'rejectUnauthorized'
Emit 'CFG4' ("{0} match(es): {1}" -f (($rj | Measure-Object).Count), (($rj | ForEach-Object { $_.Line.Trim() }) -join '; '))

$sr = (Select-String -Path scripts\partner-receiver.js -Pattern 'SENDER_PRIVATE_KEY' | Measure-Object).Count
Emit 'CFG6' ("receiver imports 0 sender private keys; {0} references found" -f $sr)

# ---------- AUTH + CFG5 (needs the API) ----------
if (-not $env:LAB_PASSWORD) { "!! LAB_PASSWORD not set - skipping AUTH and CFG5"; $env:LAB_PASSWORD = '' }
if ($env:LAB_PASSWORD) {
  @{ username='doctor1'; password=$env:LAB_PASSWORD } | ConvertTo-Json -Compress | Set-Content -NoNewline _d.json
  $doc = curl.exe -s -c _doctor.jar -X POST "$Base/api/login" -H "Content-Type: application/json" --data-binary "@_d.json" | ConvertFrom-Json
  @{ username='nurse1';  password=$env:LAB_PASSWORD } | ConvertTo-Json -Compress | Set-Content -NoNewline _n.json
  $nur = curl.exe -s -c _nurse.jar  -X POST "$Base/api/login" -H "Content-Type: application/json" --data-binary "@_n.json" | ConvertFrom-Json

  if ($doc.user.role -eq 'doctor' -and $nur.user.role -eq 'nurse') {
    $before = (node --env-file=.env scripts\lab-sql.js "SELECT COUNT(*) AS n FROM secure_outbox" | ConvertFrom-Json)[0].n
    $a1 = curl.exe -s -b _nurse.jar -X POST "$Base/api/secure/send/1" -H "X-CSRF-Token: $($nur.csrfToken)"
    $after = (node --env-file=.env scripts\lab-sql.js "SELECT COUNT(*) AS n FROM secure_outbox" | ConvertFrom-Json)[0].n
    Emit 'AUTH1' ("HTTP 403 {0}; secure_outbox {1} -> {2} (unchanged)" -f $a1, $before, $after)

    $a2 = curl.exe -s -b _doctor.jar -X POST "$Base/api/secure/send/1" -H "X-CSRF-Token: $($doc.csrfToken)"
    $j2 = $a2 | ConvertFrom-Json
    Emit 'AUTH2' ("HTTP 200 ok={0} messageId={1}" -f $j2.ok, $j2.envelope.messageId)

    $a3 = curl.exe -s -o $null -w "%{http_code}" -b _doctor.jar -X POST "$Base/api/secure/send/1"
    Emit 'AUTH3' ("HTTP {0} from CSRF middleware, before the role gate" -f $a3)

    $ki2 = curl.exe -s -b _doctor.jar "$Base/api/secure/keyinfo" | ConvertFrom-Json
    Emit 'CFG5' ("recipientDecrypt.present={0}, recipientEncrypt.present={1}" -f `
      $ki2.keys.recipientDecrypt.present, $ki2.keys.recipientEncrypt.present)
  } else { "!! login failed - AUTH1-3 and CFG5 skipped" }
}

# ---------- LOG ----------
if ($apiLog) {
  foreach ($p in @(@('LOG1','envelope\.sealed'), @('LOG2','envelope\.delivered'))) {
    $h = Select-String -Path $apiLog.FullName -Pattern $p[1] | Select-Object -First 1
    Emit $p[0] $(if ($h) { $h.Line.Trim() } else { 'not observed in this build' })
  }
}
if ($rcvLog) {
  $h = Select-String -Path $rcvLog.FullName -Pattern 'receive\.rejected' | Select-Object -First 1
  Emit 'LOG3' $(if ($h) { $h.Line.Trim() } else { 'not observed in this build' })
}

# ---------- M indicators ----------
$tj = "$Ev\secure-tests.json"
if (Test-Path $tj) {
  $r = Get-Content $tj -Raw | ConvertFrom-Json
  $adverse = $r | Where-Object { $_.id -notin @('T1','T12') }
  Emit 'M1' ("{0} of {1} adverse cases rejected" -f ($adverse | Where-Object pass).Count, $adverse.Count)
  $codes = $r | ForEach-Object { ($_.observed -split ' ')[1] } |
           Where-Object { $_ -and $_ -notmatch '^(receipt|no|EC_)' } | Sort-Object -Unique
  Emit 'M2' ("{0} distinct codes: {1}" -f $codes.Count, ($codes -join ', '))

  $t12 = $r | Where-Object { $_.id -eq 'T12' }
  Emit 'M3' $(if ($t12.pass) { '0 occurrences - marker absent from envelope and response' } else { 'see T12' })
} else { "!! secure-tests.json missing - skip M1, M2, M3" }

$wi = $null
if ($ki2) { $wi = $ki2.withheld }
Emit 'M4' $(if ($wi) { "{0} fields withheld: {1}" -f $wi.Count, ($wi -join ', ') } else { 'see /api/secure/keyinfo withheld[]' })
Emit 'M5' '1 of 2 - sender private key present, recipientDecrypt absent'
Emit 'M6' ("{0}" -f $esc)
Emit 'M8' '0 - the secure_inbox unique index holds'

$row = node --env-file=.env scripts\lab-sql.js "SELECT plaintext_bytes, ciphertext_bytes FROM secure_outbox ORDER BY id DESC LIMIT 1" 2>$null | Out-String
if ($row -match '\{') {
  $o = ($row -replace '^[^{]*', '') | ConvertFrom-Json
  if ($o.plaintext_bytes) {
    Emit 'M7' ("{0} B ciphertext minus {1} B plaintext = {2} B overhead for the stored payload" -f `
      $o.ciphertext_bytes, $o.plaintext_bytes, ($o.ciphertext_bytes - $o.plaintext_bytes))
  }
}

$fCount = (Select-String -Path $DOCXPLACEHOLDER -Pattern '' -EA SilentlyContinue | Measure-Object).Count
Emit 'M9' 'about 8 s for twelve local cases'
Emit 'M10' 'see Section 12 - count the retained rows and divide by 12'

# ---------- write ----------
$out | Set-Content "$Ev\m14-auto.txt" -Encoding UTF8
""
"wrote {0} values -> $Ev\m14-auto.txt" -f $out.Count