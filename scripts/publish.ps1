param([string]$Message)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $root
try {
    $branch = (& git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $branch -ne 'master') { throw 'Publish only from master. No branch is changed automatically.' }
    & npm.cmd run prepare:release
    if ($LASTEXITCODE -ne 0) { throw 'Release checks failed; nothing was staged or pushed.' }
    & git add --all
    if ($LASTEXITCODE -ne 0) { throw 'Staging failed.' }
    $staged = @(& git diff --cached --name-only)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect staged files.' }
    if ($staged | Where-Object { $_ -match '(^|/)(\.codex_tmp|output|dist|node_modules|\.env(\.[^/]*)?|cloudbaserc\.json)(/|$)' }) { throw 'A local-only file is staged. Remove it from the index before publishing.' }
    & git diff --cached --stat
    if ($staged.Count -gt 0) {
        if (-not $Message) { $Message = Read-Host 'Commit message' }
        if ([string]::IsNullOrWhiteSpace($Message)) { throw 'A commit message is required.' }
        & git commit -m $Message
        if ($LASTEXITCODE -ne 0) { throw 'Commit failed; nothing was pushed.' }
    }
    & git push origin HEAD:master
    if ($LASTEXITCODE -ne 0) { throw 'Push failed. Do not force-push; review the remote state.' }
    Write-Host 'Pushed. GitHub Actions will validate one public artifact and deploy both hosts.'
    Write-Host 'Check both deployment jobs before treating the release as live.'
} finally { Pop-Location }
