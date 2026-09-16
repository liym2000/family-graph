param(
  [ValidateSet("start", "stop", "status", "restart-backend")]
  [string]$Action = "status"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BackendDir = Join-Path $ProjectRoot "backend"
$FrontendDir = Join-Path $ProjectRoot "frontend"
$BackendPidFile = Join-Path $ProjectRoot ".family-graph-backend.pid"
$FrontendPidFile = Join-Path $ProjectRoot ".family-graph-frontend.pid"
$BackendPort = 9058
$FrontendPort = 9056
$BackendUrl = "http://127.0.0.1:$BackendPort"
$FrontendUrl = "http://127.0.0.1:$FrontendPort"
$HealthUrl = "$BackendUrl/api/health"
$BackendStartupTimeoutSeconds = 45
$FrontendStartupTimeoutSeconds = 30

function Get-ListeningProcessIds {
  param([int]$Port)

  try {
    return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      Select-Object -ExpandProperty OwningProcess -Unique |
      Where-Object { $_ -and $_ -gt 0 })
  } catch {
    $matches = netstat -ano -p tcp |
      Select-String -Pattern "[:.]$Port\s+.*LISTENING\s+(\d+)$"
    return @($matches | ForEach-Object { [int]$_.Matches[0].Groups[1].Value } | Select-Object -Unique)
  }
}

function Get-ProcessLabel {
  param([int]$ProcessId)

  try {
    $process = Get-Process -Id $ProcessId -ErrorAction Stop
    return "$($process.ProcessName)($ProcessId)"
  } catch {
    return "pid:$ProcessId"
  }
}

function Get-ProcessStopOrder {
  param([int[]]$ProcessIds)

  $seen = [System.Collections.Generic.HashSet[int]]::new()
  $ordered = [System.Collections.Generic.List[int]]::new()

  function Add-WithChildren {
    param([int]$CurrentProcessId)

    if (-not $seen.Add($CurrentProcessId)) {
      return
    }

    try {
      $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $CurrentProcessId" -ErrorAction Stop)
    } catch {
      $children = @()
    }

    foreach ($child in $children) {
      Add-WithChildren -CurrentProcessId ([int]$child.ProcessId)
    }

    $null = $ordered.Add($CurrentProcessId)
  }

  foreach ($processId in $ProcessIds) {
    Add-WithChildren -CurrentProcessId $processId
  }

  return @($ordered)
}

function Save-ManagedProcessId {
  param(
    [string]$Path,
    [System.Diagnostics.Process]$Process
  )

  Set-Content -LiteralPath $Path -Value $Process.Id -Encoding ascii
}

function Get-ManagedProcessId {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return 0
  }

  $value = (Get-Content -LiteralPath $Path -Raw).Trim()
  $processId = 0
  if (-not [int]::TryParse($value, [ref]$processId)) {
    Remove-Item -LiteralPath $Path -Force
    return 0
  }

  return $processId
}

function Stop-ManagedProcessTree {
  param(
    [string]$Name,
    [int]$Port,
    [string]$PidFile
  )

  $processId = Get-ManagedProcessId -Path $PidFile
  if ($processId -gt 0 -and (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
    if (-not (Test-ServiceProcess -ProcessId $processId -Service $Name.ToLowerInvariant())) {
      throw "Cannot verify managed $Name pid:$processId belongs to this project; refusing to stop it."
    }
    Write-Host "Stopping managed $Name process tree (root pid:$processId)..."
    $stopOrder = @(Get-ProcessStopOrder -ProcessIds @($processId))
    foreach ($stopProcessId in $stopOrder) {
      Stop-ProcessIfPresent -Name $Name -Port $Port -ProcessId $stopProcessId
    }
  }

  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

function Stop-ProcessIfPresent {
  param(
    [string]$Name,
    [int]$Port,
    [int]$ProcessId
  )

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) {
    Write-Host "$Name pid:$ProcessId on port $($Port): already exited" -ForegroundColor Yellow
    return
  }

  $label = Get-ProcessLabel -ProcessId $ProcessId
  Write-Host "Stopping $Name $label on port $Port..."
  try {
    Stop-Process -Id $ProcessId -Force -ErrorAction Stop
  } catch {
    if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
      throw
    }
    Write-Host "$Name pid:$ProcessId on port $($Port): already exited" -ForegroundColor Yellow
  }
}

function Write-PortStatus {
  param(
    [string]$Name,
    [int]$Port
  )

  $processIds = @(Get-ListeningProcessIds -Port $Port)
  if ($processIds.Count -eq 0) {
    Write-Host "$Name port ${Port}: stopped" -ForegroundColor Yellow
    return
  }

  $labels = $processIds | ForEach-Object { Get-ProcessLabel -ProcessId $_ }
  Write-Host "$Name port ${Port}: running [$($labels -join ', ')]" -ForegroundColor Green
}

function Test-CommandAvailable {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Assert-ProjectReady {
  param([switch]$BackendOnly)
  Test-CommandAvailable -Name "node"
  Test-CommandAvailable -Name "npm"

  if (-not (Test-Path -LiteralPath (Join-Path $BackendDir "node_modules"))) {
    throw "Backend dependencies are missing. Run 'npm ci' in $BackendDir first."
  }

  if (-not $BackendOnly -and -not (Test-Path -LiteralPath (Join-Path $FrontendDir "node_modules"))) {
    throw "Frontend dependencies are missing. Run 'npm ci' in $FrontendDir first."
  }

  if (-not (Test-Path -LiteralPath (Join-Path $BackendDir ".env"))) {
    throw "Backend .env is missing. Copy backend\.env.example to backend\.env and configure SQLite settings."
  }
}

function Test-BackendHealth {
  try {
    $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Wait-BackendHealth {
  param([int]$TimeoutSeconds = $BackendStartupTimeoutSeconds)

  Write-Host "Waiting for backend API: $HealthUrl"
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-BackendHealth) {
      Write-Host "Backend API check passed." -ForegroundColor Green
      return
    }
    Start-Sleep -Milliseconds 500
  }

  throw "Backend did not become healthy within $TimeoutSeconds seconds. Check data/backend.log, data/backend-error.log and PostgreSQL connection."
}

function Test-FrontendReady {
  try {
    $response = Invoke-WebRequest -Uri $FrontendUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Wait-FrontendReady {
  param([int]$TimeoutSeconds = $FrontendStartupTimeoutSeconds)

  Write-Host "Waiting for frontend: $FrontendUrl"
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-FrontendReady) {
      Write-Host "Frontend check passed." -ForegroundColor Green
      return
    }
    Start-Sleep -Milliseconds 500
  }

  throw "Frontend did not become ready within $TimeoutSeconds seconds. Check data/frontend.log and data/frontend-error.log."
}

function Start-Backend {
  Assert-ServicePort -Name 'Backend' -Port $BackendPort
  Invoke-ProjectDatabase -DatabaseAction start
  $backendProcessIds = @(Get-ListeningProcessIds -Port $BackendPort)
  if ($backendProcessIds.Count -gt 0) {
    Write-Host "Backend already running on $BackendPort." -ForegroundColor Yellow
  } else {
    Write-Host "Starting backend on $BackendPort..."
    Remove-Item -LiteralPath $BackendPidFile -Force -ErrorAction SilentlyContinue
    $backendProcess = Start-Process powershell.exe -WorkingDirectory $BackendDir -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", ('"' + (Join-Path $PSScriptRoot 'run-service.ps1') + '"'), '-Service', 'backend'
    ) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $ProjectRoot 'data/backend.log') -RedirectStandardError (Join-Path $ProjectRoot 'data/backend-error.log') -PassThru
    Save-ManagedProcessId -Path $BackendPidFile -Process $backendProcess
  }

  Wait-BackendHealth
}

function Start-FamilyGraph {
  Assert-ProjectReady
  Assert-ServicePort -Name 'Frontend' -Port $FrontendPort
  Start-Backend

  $frontendProcessIds = @(Get-ListeningProcessIds -Port $FrontendPort)
  if ($frontendProcessIds.Count -gt 0) {
    Write-Host "Frontend already running on $FrontendPort." -ForegroundColor Yellow
  } else {
    Write-Host "Starting frontend on $FrontendPort..."
    Remove-Item -LiteralPath $FrontendPidFile -Force -ErrorAction SilentlyContinue
    $frontendProcess = Start-Process powershell.exe -WorkingDirectory $FrontendDir -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", ('"' + (Join-Path $PSScriptRoot 'run-service.ps1') + '"'), '-Service', 'frontend'
    ) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $ProjectRoot 'data/frontend.log') -RedirectStandardError (Join-Path $ProjectRoot 'data/frontend-error.log') -PassThru
    Save-ManagedProcessId -Path $FrontendPidFile -Process $frontendProcess
  }

  Wait-FrontendReady

  Write-Host "Frontend URL: $FrontendUrl"
  Write-Host "Backend API: $BackendUrl/api"
}

function Test-ServiceProcess {
  param([int]$ProcessId, [string]$Service)

  $runner = [regex]::Escape((Join-Path $ProjectRoot 'scripts\run-service.ps1'))
  $seen = [System.Collections.Generic.HashSet[int]]::new()
  while ($ProcessId -gt 0 -and $seen.Add($ProcessId)) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
    if (-not $process) { return $false }
    if ($process.Name -ieq 'powershell.exe' -and
        $process.CommandLine -match ('(?i)-File\s+"' + $runner + '"\s+-Service\s+' + [regex]::Escape($Service) + '(?:\s|$)')) {
      return $true
    }
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.ParentProcessId)" -ErrorAction Stop
    if (-not $parent -or $parent.CreationDate -gt $process.CreationDate) { return $false }
    $ProcessId = [int]$parent.ProcessId
  }
  return $false
}

function Assert-ServicePort {
  param(
    [string]$Name,
    [int]$Port
  )

  foreach ($processId in @(Get-ListeningProcessIds -Port $Port)) {
    if (-not (Test-ServiceProcess -ProcessId $processId -Service $Name.ToLowerInvariant())) {
      throw "$Name port $Port is occupied by an unverified process (pid:$processId). Stop it manually before continuing."
    }
  }
}

function Assert-ServiceStopped {
  param([string]$Name, [int]$Port)
  if (@(Get-ListeningProcessIds -Port $Port).Count -gt 0) {
    throw "$Name port $Port is still occupied; refusing to continue."
  }
}

function Restart-Backend {
  Assert-ProjectReady -BackendOnly
  Assert-ServicePort -Name 'Backend' -Port $BackendPort
  Stop-ManagedProcessTree -Name "Backend" -Port $BackendPort -PidFile $BackendPidFile
  Start-Sleep -Milliseconds 500
  Assert-ServiceStopped -Name 'Backend' -Port $BackendPort
  Start-Backend

  Write-Host ""
  Write-PortStatus -Name "Backend" -Port $BackendPort
  Write-PortStatus -Name "Frontend" -Port $FrontendPort
  Write-Host "Backend API: $BackendUrl/api"
}

function Stop-Application {
  Assert-ServicePort -Name 'Backend' -Port $BackendPort
  Assert-ServicePort -Name 'Frontend' -Port $FrontendPort
  Stop-ManagedProcessTree -Name "Backend" -Port $BackendPort -PidFile $BackendPidFile
  Stop-ManagedProcessTree -Name "Frontend" -Port $FrontendPort -PidFile $FrontendPidFile
  Start-Sleep -Milliseconds 500
  Assert-ServiceStopped -Name 'Backend' -Port $BackendPort
  Assert-ServiceStopped -Name 'Frontend' -Port $FrontendPort
}

function Invoke-ProjectDatabase {
  param([string]$DatabaseAction)
  if (-not (Test-Path -LiteralPath (Join-Path $BackendDir 'dist/config.js'))) {
    Push-Location -LiteralPath $BackendDir
    try {
      & npm.cmd run build
      if ($LASTEXITCODE -ne 0) { throw 'Backend build failed.' }
    } finally { Pop-Location }
  }
  & node (Join-Path $BackendDir 'scripts/sqlite-database.js') $DatabaseAction
  if ($LASTEXITCODE -ne 0) { throw "Project database $DatabaseAction failed. Check the SQLite file and schema." }
}

function Stop-FamilyGraph {
  Stop-Application
  Invoke-ProjectDatabase -DatabaseAction stop
}

function Write-FamilyGraphStatus {
  & node (Join-Path $BackendDir 'scripts/sqlite-database.js') status
  $databaseExitCode = $LASTEXITCODE
  Write-PortStatus -Name "Backend" -Port $BackendPort
  Write-PortStatus -Name "Frontend" -Port $FrontendPort

  if (Test-BackendHealth) {
    Write-Host "Backend API check: healthy" -ForegroundColor Green
  } else {
    Write-Host "Backend API check: unavailable" -ForegroundColor Yellow
  }

  Write-Host ""
  Write-Host "Frontend URL: $FrontendUrl"
  Write-Host "Backend API: $BackendUrl/api"
  if ($databaseExitCode -ne 0) { throw 'Project database status check failed.' }
}

switch ($Action) {
  "start" {
    Start-FamilyGraph
    Write-Host ""
    Write-PortStatus -Name "Backend" -Port $BackendPort
    Write-PortStatus -Name "Frontend" -Port $FrontendPort
  }
  "stop" {
    Stop-FamilyGraph
    Write-Host ""
    Write-PortStatus -Name "Backend" -Port $BackendPort
    Write-PortStatus -Name "Frontend" -Port $FrontendPort
  }
  "status" {
    Write-FamilyGraphStatus
  }
  "restart-backend" {
    Restart-Backend
  }
}
