# Starts the agent API (port 8000) and the web app (port 3000) in two windows.
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

Start-Process powershell -WorkingDirectory $agent -ArgumentList "-NoExit", "-Command", ".\.venv\Scripts\uvicorn.exe app.main:app --port 8000"
Start-Process powershell -WorkingDirectory $web -ArgumentList "-NoExit", "-Command", "npm run dev"

Write-Host "Agent API: http://localhost:8000/health"
Write-Host "Console:   http://localhost:3000/console"
