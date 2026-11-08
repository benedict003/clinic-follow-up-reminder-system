#Requires -Version 1.0
<#
  Builds the 48 Section 11 values from secure-tests.json.

  Timing comes from the harness, not from log deltas: the harness records ms per
  case, which is the only way to attribute duration to a case id. The receiver log
  is used only for corroboration, because the cases and the log lines do not
  correspond one-to-one (T18 makes three requests).

  Requires the Step 2 patch to scripts/secure-tests.js, which adds `ms` and
  `requests` to each result. Refuses to run if those fields are absent, rather
  than substituting a guess.
#>
param(
  [string]$Ev = "..\docs\lab\module14\evidence",
  [string]$Out = ".\section11-values.txt",
  [switch]$AllowFailures
)
$ErrorActionPreference = 'Stop'

# ── read the harness result ───────────────────────────────────────────────────
$jsonPath = Join-Path $Ev 'secure-tests.json'
if (-not (Test-Path $jsonPath)) { throw "missing $jsonPath - run secure-tests.js first" }
$res = @(Get-Content $jsonPath -Raw | ConvertFrom-Json)

$fails = @($res | Where-Object { -not $_.pass })
"cases      : $($res.Count)"
"passed     : $($res.Count - $fails.Count)"
"failed     : $($fails.Count)"

if ($fails.Count -gt 0 -and -not $AllowFailures) {
  throw "refusing to build values: " + (($fails | ForEach-Object { $_.id }) -join ', ') +
        " failed. Fix them, or rerun with -AllowFailures to record the failures."
}

$hasMs = @($res | Where-Object { $_.PSObject.Properties.Name -contains 'ms' })
if ($hasMs.Count -eq 0) {
  throw 'secure-tests.json has no ms field. Apply the harness patch and rerun secure-tests.js.'
}

# ── time cell per case ────────────────────────────────────────────────────────
function Get-TimeCell {
  param($Result)
  $reqs = if ($Result.PSObject.Properties.Name -contains 'requests') { [int]$Result.requests } else { 1 }
  $ms   = [int]$Result.ms

  if ($reqs -eq 0) {
    return 'no HTTP request - process inspection'
  }
  if ([string]$Result.observed -match 'DEPTH_ZERO_SELF_SIGNED_CERT') {
    return "$ms ms - TLS refused before any HTTP exchange"
  }
  $plural = if ($reqs -eq 1) { '' } else { 's' }
  return "$ms ms ($reqs request$plural)"
}

# ── receiver corroboration: count and list the codes, never index by position ──
$log = Get-ChildItem (Join-Path $Ev 'partner-*.log') -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1

$observedCodes = @()
if ($null -ne $log) {
  "receiver log : $($log.Name)"
  $observedCodes = Get-Content $log.FullName | ForEach-Object {
    try { $o = $_ | ConvertFrom-Json } catch { return }
    if ($null -ne $o -and $o.event -in @('receive.accepted', 'receive.rejected')) {
      if ($o.event -eq 'receive.accepted') { 'ACCEPTED' } else { [string]$o.code }
    }
  }
  "log events   : $($observedCodes.Count)"
} else {
  "receiver log : none found - corroboration column will be blank"
}

# ── build the values ──────────────────────────────────────────────────────────
$V = [ordered]@{}
foreach ($r in $res) {
  $n = ($r.id -replace '^T', '')
  $V["T${n}a"] = ([string]$r.observed).Trim()
  $V["T${n}t"] = Get-TimeCell -Result $r
  $V["T${n}v"] = if ($r.pass) { 'Pass' } else { 'Fail - retained' }
}

# ── preview ───────────────────────────────────────────────────────────────────
"`n--- values preview (T1-T12) ---"
foreach ($r in ($res | Where-Object { $_.id -match '^T([1-9]|1[0-2])$' })) {
  $n = ($r.id -replace '^T', '')
  "  {0,-4} {1,-46} {2}" -f $r.id, $V["T${n}a"], $V["T${n}t"]
}

"`n--- deployment cases ---"
foreach ($r in ($res | Where-Object { $_.id -match '^T1[3-8]$' })) {
  $n = ($r.id -replace '^T', '')
  "  {0,-4} {1,-46} {2}" -f $r.id, $V["T${n}a"], $V["T${n}t"]
}

# ── totals that Section 13 cites ──────────────────────────────────────────────
$timed = @($res | Where-Object { $_.PSObject.Properties.Name -contains 'requests' -and $_.requests -gt 0 })
if ($timed.Count -gt 0) {
  $net = ($timed | Measure-Object -Property ms -Sum).Sum
  $slow = $timed | Sort-Object ms -Descending | Select-Object -First 1
  $rest = $timed | Where-Object { $_.id -ne $slow.id } |
          Measure-Object -Property ms -Minimum -Maximum
  "`nsum of per-request durations : $net ms across $($timed.Count) cases"
  "slowest case                 : $($slow.id) at $($slow.ms) ms"
  "all other cases              : $($rest.Minimum) to $($rest.Maximum) ms"
}
$noHttp = @($res | Where-Object { $_.PSObject.Properties.Name -contains 'requests' -and $_.requests -eq 0 })
if ($noHttp.Count -gt 0) {
  "cases with no HTTP request   : " + (($noHttp | ForEach-Object { $_.id }) -join ', ')
}

"`nreceiver codes seen          : " + (($observedCodes | Sort-Object -Unique) -join ', ')

# ── write ─────────────────────────────────────────────────────────────────────
$lines = $V.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
Set-Content -Path $Out -Value $lines -Encoding UTF8
"`nwrote $((Resolve-Path $Out).Path)  ($($V.Count) values)"