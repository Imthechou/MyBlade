#requires -Version 5.1
<#
  Start a previously registered official GitHub Actions runner in foreground.
  Intentionally does not install a Windows service or run while the PC is unattended.
  Register using GitHub Settings > Actions > Runners > New self-hosted runner;
  use --labels cocos-3.8 and decline the Windows service.
#>
[CmdletBinding()]
param(
    [string]$RunnerDirectory = 'C:\actions-runner',
    [string]$CreatorExe = $env:COCOS_CREATOR_EXE
)
$ErrorActionPreference = 'Stop'
if (-not $CreatorExe) { $CreatorExe = Read-Host 'Path to Cocos Creator 3.8 CocosCreator.exe' }
$CreatorExe = $CreatorExe.Trim('"')
if (-not (Test-Path -LiteralPath $CreatorExe -PathType Leaf)) { throw "Missing CocosCreator.exe: $CreatorExe" }
$runCmd = Join-Path $RunnerDirectory 'run.cmd'
$configFile = Join-Path $RunnerDirectory '.runner'
if (-not (Test-Path -LiteralPath $runCmd -PathType Leaf)) {
    throw 'Runner not installed. Follow the commands under GitHub Settings > Actions > Runners > New self-hosted runner.'
}
if (-not (Test-Path -LiteralPath $configFile -PathType Leaf)) {
    throw 'Runner not registered. Run the official config.cmd instructions with --labels cocos-3.8 first.'
}
$env:COCOS_CREATOR_EXE = (Resolve-Path -LiteralPath $CreatorExe).Path
Write-Host "Starting GitHub Runner with Creator: $env:COCOS_CREATOR_EXE" -ForegroundColor Cyan
Write-Host 'This console runs repository workflow code on this PC. Only run trusted branches; stop with Ctrl+C.' -ForegroundColor Yellow
Push-Location $RunnerDirectory
try { & $runCmd } finally { Pop-Location }
