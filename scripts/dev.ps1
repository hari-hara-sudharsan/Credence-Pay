# Starts three processes in their own windows:
#   Credence Risk Agent (receiving agent, A2A server)  http://localhost:8001/.well-known/agent-card.json
#   Payment agent API (reaches 8001 only over A2A)     http://localhost:8000/health
#   Web app                                            http://localhost:3000/console
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File C:\path\to\Cre\scripts\dev.ps1
$root = Split-Path -Parent $PSScriptRoot
$agent = Join-Path $root "agent"
$web = Join-Path $root "web"

if (-not (Test-Path (Join-Path $agent ".venv"))) {
    Write-Host "Creating Python venv and installing agent dependencies..."
    python -m venv (Join-Path $agent ".venv")
    & (Join-Path $agent ".venv\Scripts\python.exe") -m pip install -q -r (Join-Path $agent "requirements.txt")
}
if (-not (Test-Path (Join-Path $web "node_modules"))) {
    Write-Host "Installing web dependencies..."
    Push-Location $web; npm install --no-audit --no-fund; Pop-Location
}
if (-not (Test-Path (Join-Path $agent ".env"))) {
    Write-Warning "agent\.env is missing. Copy .env.example to agent\.env and fill it in."
}
foreach ($port in 8000, 8001, 3000) {
    $busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($busy) { Write-Warning "Port $port is already in use (PID $($busy[0].OwningProcess)). Stop it first, or the console may talk to the wrong service." }
}

Start-Process powershell -WorkingDirectory $agent -ArgumentList "-NoExit", "-Command", "`$env:PUBLIC_BASE_URL='http://localhost:8001'; .\.venv\Scripts\uvicorn.exe app.main:app --port 8001"
Start-Process powershell -WorkingDirectory $agent -ArgumentList "-NoExit", "-Command", "`$env:MERCHANT_AGENT_URL='http://localhost:8001'; .\.venv\Scripts\uvicorn.exe app.main:app --port 8000"
Start-Process powershell -WorkingDirectory $web -ArgumentList "-NoExit", "-Command", "npm run dev"

Write-Host "Risk Agent: http://localhost:8001/.well-known/agent-card.json"
Write-Host "Agent API:  http://localhost:8000/health"
Write-Host "Console:    http://localhost:3000/console"
