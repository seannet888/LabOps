param(
  [switch]$ResetMockData
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan
  & $Command
}

function Start-DevWindow {
  param(
    [string]$Title,
    [string]$Command
  )

  $escapedRoot = $repoRoot.Replace("'", "''")
  $escapedCommand = $Command.Replace("'", "''")
  Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location '$escapedRoot'; $escapedCommand"
  )
}

function Stop-PortProcess {
  param(
    [int]$Port
  )

  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $processIds) {
    if ($processId -and $processId -ne $PID) {
      Write-Host "Stopping existing process on port $Port (PID $processId)."
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }
}

Invoke-Step "Install npm dependencies if needed" {
  if (-not (Test-Path "node_modules")) {
    npm install
  } else {
    Write-Host "node_modules exists, skipping npm install."
  }
}

Invoke-Step "Start local PostgreSQL Docker container" {
  npm run db:dev:up
}

Invoke-Step "Deploy Prisma migrations" {
  npm run prisma:migrate:deploy
}

Invoke-Step "Stop existing dev servers on ports 3000 and 5173" {
  Stop-PortProcess 3000
  Stop-PortProcess 5173
}

if ($ResetMockData) {
  Invoke-Step "Reset local dev DB and seed mock data" {
    npm run db:dev:reset
    npm run db:seed:mock
  }
} else {
  Invoke-Step "Bootstrap admin account without resetting data" {
    npm run db:bootstrap
  }
}

Invoke-Step "Start API and Web dev servers" {
  Start-DevWindow "LabOps API :3000" "npm run api:dev"
  Start-DevWindow "LabOps Web :5173" "npm run web:dev -- --host 127.0.0.1"
}

Write-Host ""
Write-Host "LabOps is starting." -ForegroundColor Green
Write-Host "API: http://127.0.0.1:3000/api/v1/me"
Write-Host "Web: http://127.0.0.1:5173"
Write-Host ""
Write-Host "Default admin login:"
Write-Host "  username: admin"
Write-Host "  password: admin-dev-password"
Write-Host ""
Write-Host "To reset and reseed mock data next time:"
Write-Host "  powershell -ExecutionPolicy Bypass -File .\start-dev.ps1 -ResetMockData"
