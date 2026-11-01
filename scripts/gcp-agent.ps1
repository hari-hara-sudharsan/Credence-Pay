# Runs the Credence agent service on a Google Cloud VM with a reserved static IP,
# so HSP Operations only have to allowlist one address, once.
#
#   powershell -ExecutionPolicy Bypass -File scripts\gcp-agent.ps1 create   # reserve static IP + create VM (once)
#   powershell -ExecutionPolicy Bypass -File scripts\gcp-agent.ps1 deploy   # upload agent/ (incl. .env) and (re)start services
#   powershell -ExecutionPolicy Bypass -File scripts\gcp-agent.ps1 ip       # prove the VM's outbound IPv4 = the static IP
#   powershell -ExecutionPolicy Bypass -File scripts\gcp-agent.ps1 tunnel   # forward localhost:8000/8001 to the VM (keep open)
#   powershell -ExecutionPolicy Bypass -File scripts\gcp-agent.ps1 status   # service status + HSP reachability from the VM
#   powershell -ExecutionPolicy Bypass -File scripts\gcp-agent.ps1 logs
#   powershell -ExecutionPolicy Bypass -File scripts\gcp-agent.ps1 stop     # stop the VM (static IP is kept, still billed while unattached)
#
# The agent API is NOT exposed to the internet: uvicorn binds 127.0.0.1 on the VM and you reach it
# through the SSH tunnel, so the web console keeps using http://localhost:8000 unchanged.
# Stop the local 8000/8001 processes before opening the tunnel.
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("create", "deploy", "ip", "tunnel", "status", "logs", "stop")]
    [string]$Action,
    [string]$Project = $env:GCP_PROJECT,
    [string]$Zone = "asia-south1-a",
    [string]$Name = "credence-agent",
    [string]$MachineType = "e2-small"
)
$ErrorActionPreference = "Stop"
if (-not $Project) { $Project = (gcloud config get-value project 2>$null) }
if (-not $Project) { throw "Set a project: -Project <id> or `$env:GCP_PROJECT" }
$Region = $Zone.Substring(0, $Zone.LastIndexOf("-"))
$IpName = "$Name-ip"
$root = Split-Path -Parent $PSScriptRoot
$g = @("--project", $Project)
$z = @("--zone", $Zone)

function Remote([string]$cmd) { gcloud compute ssh $Name @g @z --command $cmd }
function StaticIp { gcloud compute addresses describe $IpName @g --region $Region --format "value(address)" }

switch ($Action) {
    "create" {
        gcloud services enable compute.googleapis.com @g
        $existing = gcloud compute addresses list @g --filter "name=$IpName" --format "value(address)"
        if (-not $existing) { gcloud compute addresses create $IpName @g --region $Region --network-tier PREMIUM }
        $ip = StaticIp
        gcloud compute instances create $Name @g @z --machine-type $MachineType `
            --image-family ubuntu-2404-lts-amd64 --image-project ubuntu-os-cloud --boot-disk-size 20GB `
            --address $ip --network-tier PREMIUM `
            --metadata startup-script="#!/bin/bash
apt-get update -y && apt-get install -y python3-venv python3-pip"
        Write-Host ""
        Write-Host "Static IPv4 for HSP Operations to allowlist: $ip" -ForegroundColor Green
        Write-Host "Next: wait ~1 minute, then run 'deploy'."
    }
    "deploy" {
        if (-not (Test-Path "$root\agent\.env")) { throw "agent\.env is missing" }
        $tgz = Join-Path $env:TEMP "credence-agent.tgz"
        if (Test-Path $tgz) { Remove-Item $tgz -Force }
        # agent/ including .env (wallet keys) and data/; never the local venv or caches.
        tar.exe -czf $tgz -C $root --exclude "agent/.venv" --exclude "__pycache__" --exclude ".pytest_cache" agent
        gcloud compute scp $tgz "${Name}:/tmp/credence-agent.tgz" @g @z
        Remove-Item $tgz -Force
        $setup = @'
set -e
sudo mkdir -p /opt/credence && sudo chown $USER /opt/credence
if [ -d /opt/credence/agent/data ]; then cp -r /opt/credence/agent/data /tmp/credence-data-backup; fi
tar -xzf /tmp/credence-agent.tgz -C /opt/credence && rm /tmp/credence-agent.tgz
chmod 600 /opt/credence/agent/.env
cd /opt/credence/agent
dpkg -s python3-venv >/dev/null 2>&1 || { sudo apt-get -o DPkg::Lock::Timeout=300 update -y && sudo apt-get -o DPkg::Lock::Timeout=300 install -y python3-venv python3-pip; }
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip && .venv/bin/pip install -q -r requirements.txt
unit() {  # name port extra-env
sudo tee /etc/systemd/system/$1.service >/dev/null <<EOF
[Unit]
Description=Credence $1
After=network-online.target
[Service]
User=$USER
WorkingDirectory=/opt/credence/agent
Environment=$3
ExecStart=/opt/credence/agent/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port $2
Restart=always
[Install]
WantedBy=multi-user.target
EOF
}
unit credence-risk-agent 8001 PUBLIC_BASE_URL=http://localhost:8001
unit credence-agent-api 8000 MERCHANT_AGENT_URL=http://localhost:8001
sudo systemctl daemon-reload
sudo systemctl enable --now credence-risk-agent credence-agent-api
sudo systemctl restart credence-risk-agent credence-agent-api
sleep 4
curl -s -o /dev/null -w "agent api /health: %{http_code}\n" http://127.0.0.1:8000/health
'@
        Remote ($setup -replace "`r", "")
    }
    "ip" {
        $ip = StaticIp
        $egress = (Remote "curl -4 -s https://api.ipify.org").Trim()
        Write-Host "reserved static IP : $ip"
        Write-Host "VM outbound IPv4   : $egress"
        if ($egress -eq $ip) { Write-Host "MATCH: allowlist $ip with HSP Operations." -ForegroundColor Green }
        else { Write-Host "MISMATCH: do not send this to HSP yet." -ForegroundColor Red }
    }
    "tunnel" {
        Write-Host "Forwarding localhost:8000 and :8001 to $Name. Keep this window open. Ctrl+C to close."
        gcloud compute ssh $Name @g @z -- -N -L 8000:127.0.0.1:8000 -L 8001:127.0.0.1:8001
    }
    "status" {
        Remote "systemctl --no-pager --lines 0 status credence-risk-agent credence-agent-api | grep -E 'service|Active'; echo; curl -s http://127.0.0.1:8000/hsp/status; echo"
    }
    "logs" { Remote "sudo journalctl -u credence-agent-api -u credence-risk-agent -n 80 --no-pager" }
    "stop" { gcloud compute instances stop $Name @g @z }
}
