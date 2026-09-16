param([ValidateSet('backend', 'frontend')][string]$Service)
$ErrorActionPreference = 'Stop'
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath (Join-Path $projectDirectory $Service)
if ($Service -eq 'backend') {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & npm.cmd run migrate
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & npm.cmd run start:dev
} else {
  & npm.cmd run dev
}
exit $LASTEXITCODE
