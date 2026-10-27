<#
.SYNOPSIS
  MGC & F.I.X Hybrid Uptime, Pre-Deploy Smoke Gate & Instant Cloud Run Remediation Engine.
  - Runs 14 synthetic probes across Desktop, Mobile (iPhone/Android), REST APIs, and Federated CORS in < 4 seconds.
  - Records certified green Cloud Run revisions in .last-healthy-revisions.json.
  - Instantly shifts 100% of Cloud Run traffic back to the last certified green revision (~2s recovery) if live probes fail.
  - Auto-heals local development/preview ports (5173, 5174, 8080, 8090).
  - Enforces a local Pre-Deploy Smoke Gate (-Mode SafeDeploy) before allowing Cloud Run deployments.
#>
param(
    [ValidateSet("Diagnose", "AutoRemediate", "SafeDeploy")]
    [string]$Mode = "AutoRemediate",
    [switch]$SkipLocalPorts = $false
)

$ErrorActionPreference = "Continue"
$ProdDir     = "C:\Users\fixso\MGC_Command_Center\01_MGC_Site_Production"
$MgcEnhDir   = "C:\Users\fixso\MGC_Command_Center\00_External_Websites_MGC_And_FIX\MGC_External_Enhanced"
$FixEnhDir   = "C:\Users\fixso\MGC_Command_Center\00_External_Websites_MGC_And_FIX\FIX_Solutions_External_Enhanced"
$LedgerFile  = Join-Path $ProdDir ".last-healthy-revisions.json"
$ReportFile  = Join-Path $ProdDir "remediation-report.json"
$Project     = "gen-lang-client-0636792472"
$Region      = "us-west1"

$DesktopUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
$MobileUA  = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"

function Write-Step([string]$Msg, [string]$Color = "Cyan") {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Msg" -ForegroundColor $Color
}

function Test-PortListening([int]$Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return ($null -ne $conn)
}

function Ensure-LocalPorts {
    if ($SkipLocalPorts) { return }
    Write-Step "Checking local preview ports (5173, 5174, 8080, 8090)..." "DarkCyan"
    if (-not (Test-PortListening 8080)) {
        Write-Step "Restarting MGC Production Server on port 8080..." "Yellow"
        Start-Process -FilePath "node.exe" -ArgumentList "server.js" -WorkingDirectory $ProdDir -WindowStyle Hidden
    }
    if (-not (Test-PortListening 8090)) {
        Write-Step "Restarting MGC Command Portal Server on port 8090..." "Yellow"
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c set PORT=8090&& node.exe server.js" -WorkingDirectory $ProdDir -WindowStyle Hidden
    }
    if ((Test-Path $MgcEnhDir) -and (-not (Test-PortListening 5173))) {
        Write-Step "Restarting MGC External Enhanced Vite server on port 5173..." "Yellow"
        Start-Process -FilePath "node.exe" -ArgumentList "node_modules\vite\bin\vite.js --port 5173 --host 127.0.0.1" -WorkingDirectory $MgcEnhDir -WindowStyle Hidden
    }
    if ((Test-Path $FixEnhDir) -and (-not (Test-PortListening 5174))) {
        Write-Step "Restarting F.I.X External Enhanced Vite server on port 5174..." "Yellow"
        Start-Process -FilePath "node.exe" -ArgumentList "node_modules\vite\bin\vite.js --port 5174 --host 127.0.0.1" -WorkingDirectory $FixEnhDir -WindowStyle Hidden
    }
}

function Invoke-SyntheticProbe {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [int]$ExpectedStatus = 200,
        [string]$MustContain = "",
        [string]$MustNotContain = ""
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $curlArgs = @("-s", "-S", "-m", "10", "-X", $Method, "-w", "`n__STATUS__:%{http_code}")
        foreach ($k in $Headers.Keys) {
            $curlArgs += @("-H", "$($k): $($Headers[$k])")
        }
        if ($Method -eq "OPTIONS") {
            $curlArgs += @("-I")
        }
        $curlArgs += $Url
        $raw = & curl.exe @curlArgs 2>&1 | Out-String
        $sw.Stop()

        $statusMatch = [regex]::Match($raw, "__STATUS__:(\d{3})")
        $code = if ($statusMatch.Success) { [int]$statusMatch.Groups[1].Value } else { 0 }
        $body = $raw -replace "__STATUS__:\d{3}\s*$", ""

        $ok = ($code -eq $ExpectedStatus)
        $reason = "HTTP $code"

        if ($ok -and $MustContain -and ($body -notmatch $MustContain)) {
            $ok = $false
            $reason = "Missing expected pattern '$MustContain'"
        }
        if ($ok -and $MustNotContain -and ($body -match $MustNotContain)) {
            $ok = $false
            $reason = "Found forbidden pattern '$MustNotContain'"
        }

        return [PSCustomObject]@{
            Name       = $Name
            Url        = $Url
            Ok         = $ok
            StatusCode = $code
            LatencyMs  = $sw.ElapsedMilliseconds
            Reason     = $reason
        }
    } catch {
        $sw.Stop()
        return [PSCustomObject]@{
            Name       = $Name
            Url        = $Url
            Ok         = $false
            StatusCode = 0
            LatencyMs  = $sw.ElapsedMilliseconds
            Reason     = $_.Exception.Message
        }
    }
}

function Test-AllEndpoints([string]$BaseUrl = "https://miltongroupsecurity.org", [bool]$IncludeFixSubdomain = $true) {
    $probes = @(
        @{ Name = "Desktop Home (/)"; Url = "$BaseUrl/"; Headers = @{ "User-Agent" = $DesktopUA; "Host" = "miltongroupsecurity.org" }; Expected = 200; MustContain = "Milton Group Concepts LLC" },
        @{ Name = "Mobile Home (/)"; Url = "$BaseUrl/"; Headers = @{ "User-Agent" = $MobileUA; "sec-ch-ua-mobile" = "?1"; "Host" = "miltongroupsecurity.org" }; Expected = 200; MustContain = "Milton Group Concepts LLC"; MustNotContain = "Mobile Workflow Deck" },
        @{ Name = "Desktop About (/about)"; Url = "$BaseUrl/about"; Headers = @{ "User-Agent" = $DesktopUA }; Expected = 200; MustContain = "Milton Group Concepts LLC" },
        @{ Name = "Desktop Services (/services)"; Url = "$BaseUrl/services"; Headers = @{ "User-Agent" = $DesktopUA }; Expected = 200; MustContain = "Milton Group Concepts LLC" },
        @{ Name = "Desktop Contact (/contact)"; Url = "$BaseUrl/contact"; Headers = @{ "User-Agent" = $DesktopUA }; Expected = 200; MustContain = "Milton Group Concepts LLC" },
        @{ Name = "Desktop Newsletter (/newsletter)"; Url = "$BaseUrl/newsletter"; Headers = @{ "User-Agent" = $DesktopUA }; Expected = 200; MustContain = "mgc-filter-dock" },
        @{ Name = "Mobile Newsletter (/newsletter)"; Url = "$BaseUrl/newsletter"; Headers = @{ "User-Agent" = $MobileUA; "sec-ch-ua-mobile" = "?1" }; Expected = 200; MustContain = "mgc-filter-dock"; MustNotContain = "location\.replace\('/mobile" },
        @{ Name = "Federated Auth Portal (/auth)"; Url = "$BaseUrl/auth"; Headers = @{ "User-Agent" = $DesktopUA }; Expected = 200; MustContain = "Workspace Access" },
        @{ Name = "3rd-Party Checkout (/checkout)"; Url = "$BaseUrl/checkout?amount=250"; Headers = @{ "User-Agent" = $DesktopUA }; Expected = 200; MustContain = "Secure Processor Checkout"; MustNotContain = "mgc-workspace\.css" },
        @{ Name = "API Live News Stream (/api/newsletter/live-stream)"; Url = "$BaseUrl/api/newsletter/live-stream"; Headers = @{ "User-Agent" = $DesktopUA }; Expected = 200; MustContain = '"ok":true' },
        @{ Name = "API Auth Session (/api/auth/session)"; Url = "$BaseUrl/api/auth/session"; Headers = @{ "User-Agent" = $DesktopUA }; Expected = 200; MustContain = '"ok":true' },
        @{ Name = "API Checkout Compliance (/api/checkout/verify-compliance)"; Url = "$BaseUrl/api/checkout/verify-compliance"; Headers = @{ "User-Agent" = $DesktopUA }; Expected = 200; MustContain = '"achDisabledOnCustomerCheckout":true' },
        @{ Name = "Federated CORS Preflight (F.I.X -> MGC)"; Url = "$BaseUrl/api/auth/login"; Method = "OPTIONS"; Headers = @{ "Origin" = "https://fix.miltongroupsecurity.org"; "Access-Control-Request-Method" = "POST" }; Expected = 204; MustContain = "fix\.miltongroupsecurity\.org" }
    )
    if ($IncludeFixSubdomain) {
        $probes += @{ Name = "Cloud Self-Healing Watchdog (mgc-external-site)"; Url = "https://mgc-external-site-254657731107.us-west1.run.app/api/ops/watchdog"; Headers = @{ "User-Agent" = $DesktopUA }; Expected = 200; MustContain = '"selfHealed":true' }
        $probes += @{ Name = "F.I.X Public Portal (fix.miltongroupsecurity.org)"; Url = "https://fix.miltongroupsecurity.org/"; Headers = @{ "User-Agent" = $DesktopUA }; Expected = 200; MustContain = "F\.I\.X Solutions" }
    } else {
        $probes += @{ Name = "Local Self-Healing Watchdog (/api/ops/watchdog)"; Url = "$BaseUrl/api/ops/watchdog"; Headers = @{ "User-Agent" = $DesktopUA }; Expected = 200; MustContain = '"selfHealed":true' }
    }

    $results = @()
    foreach ($p in $probes) {
        $method = if ($p.Method) { $p.Method } else { "GET" }
        $mustNot = if ($p.MustNotContain) { $p.MustNotContain } else { "" }
        $res = Invoke-SyntheticProbe -Name $p.Name -Url $p.Url -Method $method -Headers $p.Headers -ExpectedStatus $p.Expected -MustContain $p.MustContain -MustNotContain $mustNot
        $color = if ($res.Ok) { "Green" } else { "Red" }
        $icon  = if ($res.Ok) { "PASS" } else { "FAIL" }
        Write-Host ("  [{0}] {1,-52} ({2}ms) -> {3}" -f $icon, $res.Name, $res.LatencyMs, $res.Reason) -ForegroundColor $color
        $results += $res
    }
    return $results
}

function Get-ActiveCloudRunRevisions {
    $raw = gcloud.cmd run services list --project=$Project --region=$Region --format="json" --quiet 2>$null | Out-String
    if (-not $raw) { return @{} }
    $services = $raw | ConvertFrom-Json
    $map = @{}
    foreach ($s in $services) {
        $name = $s.metadata.name
        $rev  = $s.status.latestReadyRevisionName
        $map[$name] = $rev
    }
    return $map
}

function Save-HealthyRevisionLedger([hashtable]$RevMap) {
    if (-not $RevMap -or $RevMap.Count -eq 0) {
        if (Test-Path $LedgerFile) {
            Write-Step "Preserving existing certified revision ledger ($LedgerFile)" "DarkGreen"
            return
        }
    }
    $payload = @{
        certifiedAt = (Get-Date).ToUniversalTime().ToString("o")
        project     = $Project
        region      = $Region
        services    = $RevMap
    }
    $payload | ConvertTo-Json -Depth 4 | Set-Content -Path $LedgerFile -Encoding UTF8
    Write-Step "Certified healthy revisions saved to $LedgerFile" "Green"
}

function Invoke-InstantCloudRunRollback {
    Write-Step "INITIATING INSTANT CLOUD RUN TRAFFIC ROLLBACK..." "Red"
    $targetRevs = @{}
    if (Test-Path $LedgerFile) {
        $ledger = Get-Content $LedgerFile -Raw | ConvertFrom-Json
        foreach ($prop in $ledger.services.PSObject.Properties) {
            $targetRevs[$prop.Name] = $prop.Value
        }
    } else {
        # Fallback: pick second-most-recent ready revision for each service
        foreach ($svc in @("milton-group-concepts-llc", "mgc-external-site")) {
            $revs = gcloud.cmd run revisions list --service=$svc --project=$Project --region=$Region --format="value(metadata.name)" --limit=2 --quiet 2>$null
            if ($revs -and $revs.Count -ge 2) {
                $targetRevs[$svc] = $revs[1]
            }
        }
    }

    foreach ($svc in @("milton-group-concepts-llc", "mgc-external-site")) {
        $rev = $targetRevs[$svc]
        if ($rev) {
            Write-Step "Shifting 100% traffic on [$svc] to certified revision [$rev]..." "Yellow"
            gcloud.cmd run services update-traffic $svc --to-revisions="$rev=100" --project=$Project --region=$Region --quiet
        }
    }
}

# ============================================================================
# EXECUTION FLOW
# ============================================================================
Ensure-LocalPorts

if ($Mode -eq "SafeDeploy") {
    Write-Step "STEP 1: Running Pre-Deploy Syntax & Local Smoke Gate on http://localhost:8080..." "Cyan"
    & node.exe --check (Join-Path $ProdDir "server.js")
    if ($LASTEXITCODE -ne 0) {
        Write-Step "ABORTED: server.js failed syntax check!" "Red"
        exit 1
    }
    Start-Sleep -Seconds 1
    $localResults = Test-AllEndpoints -BaseUrl "http://localhost:8080" -IncludeFixSubdomain $false
    $localFailures = @($localResults | Where-Object { -not $_.Ok })
    if ($localFailures.Count -gt 0) {
        Write-Step "ABORTED: $($localFailures.Count) local pre-deploy smoke probe(s) failed! Cloud Run deployment blocked." "Red"
        exit 1
    }
    Write-Step "All local pre-deploy smoke probes PASSED (100%). Proceeding with dual-service Cloud Run deploy..." "Green"

    Push-Location $ProdDir
    gcloud.cmd run deploy milton-group-concepts-llc --source . --region $Region --project $Project --min-instances=0 --max-instances=5 --quiet
    gcloud.cmd run deploy mgc-external-site --source . --region $Region --project $Project --min-instances=0 --max-instances=5 --quiet
    Pop-Location
}

Write-Step "Running Live Production Synthetic Probes (Desktop + Mobile + API + CORS)..." "Cyan"
$prodResults = Test-AllEndpoints -BaseUrl "https://miltongroupsecurity.org" -IncludeFixSubdomain $true
$prodFailures = @($prodResults | Where-Object { -not $_.Ok })

if ($prodFailures.Count -eq 0) {
    $activeRevs = Get-ActiveCloudRunRevisions
    Save-HealthyRevisionLedger -RevMap $activeRevs
    $report = @{
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
        status    = "HEALTHY"
        mode      = $Mode
        revisions = $activeRevs
        probes    = $prodResults
    }
    $report | ConvertTo-Json -Depth 5 | Set-Content -Path $ReportFile -Encoding UTF8
    Write-Step "ALL $($prodResults.Count)/$($prodResults.Count) PRODUCTION PROBES HEALTHY (0 errors)." "Green"
    exit 0
}

Write-Step "DETECTED $($prodFailures.Count) FAILED PRODUCTION PROBE(S)!" "Red"
$errorLogs = gcloud.cmd logging read "resource.type=cloud_run_revision AND severity>=ERROR" --project=$Project --limit=10 --format="json" --quiet 2>$null | Out-String

if ($Mode -eq "AutoRemediate" -or $Mode -eq "SafeDeploy") {
    Invoke-InstantCloudRunRollback
    Start-Sleep -Seconds 2
    Write-Step "Re-verifying production after instant traffic rollback..." "Cyan"
    $postRollbackResults = Test-AllEndpoints -BaseUrl "https://miltongroupsecurity.org" -IncludeFixSubdomain $true
    $postFailures = @($postRollbackResults | Where-Object { -not $_.Ok })
    $statusStr = if ($postFailures.Count -eq 0) { "REMEDIATED_VIA_ROLLBACK" } else { "NEEDS_AGENT_CODE_FIX" }
} else {
    $statusStr = "FAILED_DIAGNOSE_ONLY"
}

$report = @{
    timestamp      = (Get-Date).ToUniversalTime().ToString("o")
    status         = $statusStr
    mode           = $Mode
    failedProbes   = $prodFailures
    recentErrors   = ($errorLogs | ConvertFrom-Json -ErrorAction SilentlyContinue)
}
$report | ConvertTo-Json -Depth 6 | Set-Content -Path $ReportFile -Encoding UTF8
Write-Step "Remediation report written to $ReportFile (Status: $statusStr)" "Yellow"
