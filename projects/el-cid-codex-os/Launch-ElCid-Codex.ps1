# Launch-ElCid-Codex.ps1
# Starts a local HTTP server for Project EL CID (el-cid-codex-os) on port 8792 (if not already running)
# and opens the Living AI Word Studio & Spanish Immersion Reader in Chrome.

$ErrorActionPreference = "SilentlyContinue"
$projectDir = "C:\Users\fixso\MGC_Command_Center\01_MGC_Site_Production\projects\el-cid-codex-os"
$port = 8792
$url = "http://127.0.0.1:$port/index.html?mode=codex"

$listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
    Start-Process -FilePath "python" -ArgumentList "-m http.server $port --bind 127.0.0.1" -WorkingDirectory $projectDir -WindowStyle Hidden
    Start-Sleep -Milliseconds 900
}

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (Test-Path $chromePath) {
    Start-Process -FilePath $chromePath -ArgumentList "--new-window --app=$url --window-size=1380,900"
} else {
    Start-Process $url
}
