<#
.SYNOPSIS
    Automated Git + GitHub Desktop + Production Deployment Workflow for Milton Group Concepts LLC (miltongroupsecurity.org).
.DESCRIPTION
    1. Stages & commits any changes in C:\Users\fixso\MGC_Command_Center\01_MGC_Site_Production
    2. Pushes to GitHub (https://github.com/sideprojo/milton-group-concepts-site) which triggers GitHub Actions CI/CD
    3. Optionally deploys directly to Google Cloud Run (milton-group-concepts-llc in us-west1) if -DeployCloudRun is passed
    4. Opens GitHub Desktop pointed at the repo and opens the live site on the user's monitor via Invoke-PageHandoff.ps1
#>
param(
    [string]$CommitMessage = "Enhance MGC Site: Regulated Data Commerce, SAS ModelOps, CIPP/US & WebXR Spatial Deck",
    [switch]$OpenGitHubDesktop,
    [switch]$DeployCloudRun
)

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
$RepoPath = "C:\Users\fixso\MGC_Command_Center\01_MGC_Site_Production"
$Handoff  = "C:\Users\fixso\.gemini\config\skills\interactive_page_handoff\scripts\Invoke-PageHandoff.ps1"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " MGC SITE PRODUCTION BUILD & GIT DEPLOYMENT PIPELINE" -ForegroundColor Cyan
Write-Host " Repo: $RepoPath" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

Set-Location $RepoPath

# Stage, commit, and push to GitHub
git add -A
$status = git status --porcelain
if ($status) {
    git commit -m $CommitMessage
} else {
    Write-Host "Working tree clean. Pushing latest main to origin..." -ForegroundColor Yellow
}
git branch -M main
git push -u origin main

if ($DeployCloudRun) {
    Write-Host "Deploying to Google Cloud Run (milton-group-concepts-llc in project gen-lang-client-0636792472)..." -ForegroundColor Green
    gcloud run deploy milton-group-concepts-llc `
        --source $RepoPath `
        --project gen-lang-client-0636792472 `
        --region us-west1 `
        --allow-unauthenticated
}

if ($OpenGitHubDesktop) {
    $ghExe = "$env:LOCALAPPDATA\GitHubDesktop\GitHubDesktop.exe"
    if (Test-Path $ghExe) {
        Write-Host "Launching GitHub Desktop on $RepoPath..." -ForegroundColor Cyan
        Start-Process -FilePath $ghExe -ArgumentList "x-github-client://openRepo/$RepoPath"
    }
}

Write-Host "Opening MGC Production Site, VR Command Deck & GitHub Repo on monitor..." -ForegroundColor Green
& $Handoff `
    -Urls @(
        "file:///C:/Users/fixso/MGC_Command_Center/01_MGC_Site_Production/index.html",
        "file:///C:/Users/fixso/MGC_Command_Center/01_MGC_Site_Production/vr-command.html",
        "https://github.com/sideprojo/milton-group-concepts-site",
        "https://aistudio.google.com/apps"
    ) `
    -Browser "Chrome" `
    -ProfileDirectory "Default" `
    -ScreenshotPath "C:\Users\fixso\Downloads\LifeRec\handoff_MGC_Site_Production.png" `
    -WaitSeconds 6
