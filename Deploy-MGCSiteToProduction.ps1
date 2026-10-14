<#
.SYNOPSIS
    Automated Git + GitHub Desktop Sync Workflow for MGC INTERNAL PORTALS ONLY.
.DESCRIPTION
    IMPORTANT: This script ONLY pushes your Internal Onboarded Portals to GitHub Pages
    (https://github.com/sideprojo/milton-group-concepts-site -> https://sideprojo.github.io/milton-group-concepts-site/onboarding-portal.html).
    It NEVER touches or overwrites your External Public Websites on Google Cloud Run (miltongroupsecurity.org or F.I.X Solutions LLC).
#>
param(
    [string]$CommitMessage = "Sync MGC Internal Onboarded Portals (Data Commerce, LangGraph Studio, 3D Earth, VR Deck)",
    [switch]$OpenGitHubDesktop
)

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
$RepoPath = "C:\Users\fixso\MGC_Command_Center\01_MGC_Site_Production"
$Handoff  = "C:\Users\fixso\.gemini\config\skills\interactive_page_handoff\scripts\Invoke-PageHandoff.ps1"

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " MGC INTERNAL PORTALS — GIT & GITHUB DESKTOP SYNC (EXTERNAL SITES SAFE)" -ForegroundColor Cyan
Write-Host " Internal Repo: $RepoPath" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

Set-Location $RepoPath
git add -A
$status = git status --porcelain
if ($status) {
    git commit -m $CommitMessage
}
git branch -M main
gh auth setup-git 2>$null
git push -u origin main

if ($OpenGitHubDesktop) {
    $ghExe = "$env:LOCALAPPDATA\GitHubDesktop\GitHubDesktop.exe"
    if (Test-Path $ghExe) {
        Start-Process -FilePath $ghExe -ArgumentList "x-github-client://openRepo/$RepoPath"
    }
}

& $Handoff `
    -Urls @(
        "file:///C:/Users/fixso/MGC_Command_Center/01_MGC_Site_Production/onboarding-portal.html",
        "file:///C:/Users/fixso/MGC_Command_Center/01_MGC_Site_Production/index.html?mode=viewer"
    ) `
    -Browser "Chrome" `
    -ProfileDirectory "Default" `
    -ScreenshotPath "C:\Users\fixso\Downloads\LifeRec\handoff_Internal_Portals_Sync.png" `
    -WaitSeconds 5
