#requires -Version 5.1
<#
  Run on Windows 11 after installing Cocos Creator 3.8 and Node.js 22+.
  Runs a real web-mobile build locally and captures three Playwright images.
  No GitHub credentials, runner registration, or remote execution.
#>
[CmdletBinding()]
param(
    [string]$CreatorExe = $env:COCOS_CREATOR_EXE,
    [switch]$SkipInstall
)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $CreatorExe) {
    $CreatorExe = Read-Host 'Enter the full path to CocosCreator.exe (from Cocos Dashboard 3.8)'
}
$CreatorExe = $CreatorExe.Trim('"')
if (-not (Test-Path -LiteralPath $CreatorExe -PathType Leaf)) {
    throw 'CocosCreator.exe was not found. Install Creator 3.8 using the official Cocos Dashboard.'
}
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { throw 'Node.js not found. Install Node.js 22 or later and reopen PowerShell.' }
Push-Location $project
try {
    Write-Host '[1/4] Check scene and script references...' -ForegroundColor Cyan
    & node tools/validate-project.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Structural validation failed.' }

    Write-Host '[2/4] Build real Cocos web-mobile game...' -ForegroundColor Cyan
    $buildArgs = @(
        '--project', $project,
        '--build', 'platform=web-mobile;debug=true;buildPath=project://build;outputName=web-mobile;startScene=d09b082c-0b82-4dbb-8018-6e0e4c443f4a'
    )
    & $CreatorExe @buildArgs
    $code = $LASTEXITCODE
    if ($code -ne 0 -and $code -ne 36) { throw "Cocos CLI returned $code; check Editor logs." }
    $built = Get-ChildItem -Path ./build -Filter index.html -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $built) { throw 'No built web index.html under build/. Inspect the Cocos build log.' }

    if (-not $SkipInstall) {
        Write-Host '[3/4] Install Playwright test dependency...' -ForegroundColor Cyan
        & npm install --no-save --no-package-lock playwright@1.56.1
        if ($LASTEXITCODE -ne 0) { throw 'Playwright install failed.' }
        & npx playwright install chromium
        if ($LASTEXITCODE -ne 0) { throw 'Chromium install failed.' }
    }
    Write-Host '[4/4] Run real Chromium WebGL test and screenshot...' -ForegroundColor Cyan
    & node tools/verify-web.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Runtime test failed; see artifacts/result.json.' }
    Write-Host "PASS: see $project\artifacts\01-normal.png, 02-look.png, 03-split.png" -ForegroundColor Green
} finally {
    Pop-Location
}
