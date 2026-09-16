$ErrorActionPreference = 'Stop'
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
  (Join-Path $PSScriptRoot 'family-graph-dev.ps1'), [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
# Load function definitions only: never execute application or database actions.
$ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false) |
  ForEach-Object { . ([scriptblock]::Create($_.Extent.Text)) }
$runner = Join-Path $PSScriptRoot 'run-service.ps1'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script:processes = @{}
function Get-CimInstance {
  param($ClassName, $Filter, $ErrorAction)
  $script:processes[[int]($Filter -replace '^ProcessId = ', '')]
}
function Assert-Result { param($Condition, $Message) if (-not $Condition) { throw $Message } }
$script:processes[100] = [pscustomobject]@{
  ProcessId = 100; ParentProcessId = 0; Name = 'powershell.exe'; CreationDate = 1
  CommandLine = 'powershell.exe -File "' + $runner + '" -Service backend'
}
$script:processes[101] = [pscustomobject]@{
  ProcessId = 101; ParentProcessId = 100; Name = 'node.exe'; CreationDate = 2; CommandLine = 'node app.js'
}
Assert-Result (Test-ServiceProcess 100 backend) 'Managed runner rejected'
Assert-Result (Test-ServiceProcess 101 backend) 'Managed child rejected'
Assert-Result (-not (Test-ServiceProcess 101 frontend)) 'Wrong service accepted'
Assert-Result (-not (Test-ServiceProcess 999 backend)) 'Missing process accepted'
$script:processes[100].CreationDate = 3
Assert-Result (-not (Test-ServiceProcess 101 backend)) 'Reused parent PID accepted'
$script:processes[100].CreationDate = 1
$script:processes[100].CommandLine = 'powershell.exe -File "C:\another-project\run-service.ps1" -Service backend'
Assert-Result (-not (Test-ServiceProcess 101 backend)) 'Foreign project accepted'
function Get-ListeningProcessIds { param($Port) @(101) }
$rejected = $false
try { Assert-ServicePort -Name Backend -Port 9058 } catch { $rejected = $true }
Assert-Result $rejected 'Foreign listener not rejected'
$rejected = $false
try { Assert-ServiceStopped -Name Backend -Port 9058 } catch { $rejected = $true }
Assert-Result $rejected 'Occupied port not rejected'
Write-Host 'Process safety checks passed (8 cases); no real processes or databases changed.'
