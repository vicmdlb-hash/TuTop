param(
  [switch]$NoTrigger
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repo = 'vicmdlb-hash/TuTop'
$Distro = 'Ubuntu'
$RunnerUser = 'tutoprunner'
$ControllerLabel = 'tutop-zero-cost-controller'
$WorkerLabel = 'tutop-zero-cost-worker'

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Invoke-WslQuiet {
  param([Parameter(Mandatory=$true)][string[]]$Arguments)
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = (& wsl.exe @Arguments 2>&1 | Out-String)
    $code = $LASTEXITCODE
  } catch {
    $output = $_.Exception.Message
    $code = 1
  } finally {
    $ErrorActionPreference = $old
  }
  [pscustomobject]@{ Code = $code; Output = $output }
}

function Invoke-WslBashScript {
  param(
    [Parameter(Mandatory=$true)][string]$User,
    [Parameter(Mandatory=$true)][string]$Script
  )
  $normalized = $Script.Replace("`r`n", "`n").Replace("`r", "`n")
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($normalized))
  & wsl.exe -d $Distro -u $User -- bash -lc "echo '$encoded' | base64 -d | bash"
  return $LASTEXITCODE
}

function Ensure-GitHubCli {
  if (Get-Command gh -ErrorAction SilentlyContinue) { return }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI is missing and winget is unavailable.'
  }
  Write-Host 'Installing GitHub CLI with winget...'
  winget install --id GitHub.cli -e --source winget --accept-source-agreements --accept-package-agreements
  Refresh-Path
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    $candidate = Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe'
    if (Test-Path $candidate) { $env:Path = "$(Split-Path $candidate);$env:Path" }
  }
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI was installed but is not visible in this console yet. Re-run the CMD.'
  }
}

function Ensure-GitHubAuth {
  gh auth status --hostname github.com *> $null
  if ($LASTEXITCODE -eq 0) { return }
  Write-Host 'GitHub will open in your browser. Approve this PC. Never paste tokens into chats.'
  gh auth login --hostname github.com --git-protocol https --web
  if ($LASTEXITCODE -ne 0) { throw 'GitHub authentication did not complete.' }
  gh auth status --hostname github.com
}

function Get-WslDistros {
  if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { return @() }
  $result = Invoke-WslQuiet -Arguments @('-l','-q')
  if ($result.Code -ne 0) { return @() }
  $clean = $result.Output.Replace([string][char]0, '')
  return @($clean -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Test-UbuntuReady {
  $result = Invoke-WslQuiet -Arguments @('-d',$Distro,'-u','root','--','bash','-lc','echo WSL_READY')
  return ($result.Code -eq 0 -and $result.Output -match 'WSL_READY')
}

function Install-WslUbuntu {
  if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    throw 'wsl.exe is unavailable. This Windows version may not support the automatic WSL installer.'
  }

  Write-Host 'WSL/Ubuntu is not installed. Starting the free Microsoft WSL installation...' -ForegroundColor Yellow
  $result = Invoke-WslQuiet -Arguments @('--install','-d',$Distro,'--no-launch')
  if ($result.Code -ne 0) {
    Write-Host 'Normal WSL install did not complete. Trying Microsoft web-download fallback...' -ForegroundColor Yellow
    $fallback = Invoke-WslQuiet -Arguments @('--install','--web-download','-d',$Distro,'--no-launch')
    if ($fallback.Code -ne 0) {
      Write-Host $fallback.Output
      throw 'Automatic WSL installation failed.'
    }
  }

  Start-Sleep -Seconds 3
  if (Test-UbuntuReady) {
    Write-Host 'WSL/Ubuntu became ready without a reboot.' -ForegroundColor Green
    return
  }

  Write-Host ''
  Write-Host 'WSL was installed/enabled but Windows must restart before TuTop can continue.' -ForegroundColor Yellow
  exit 20
}

function Ensure-WslUbuntu {
  $distros = Get-WslDistros
  if ($distros -notcontains $Distro) { Install-WslUbuntu }
  if (-not (Test-UbuntuReady)) {
    Write-Host 'Ubuntu exists but cannot start yet. A Windows restart is required.' -ForegroundColor Yellow
    exit 20
  }
  Write-Host 'WSL/Ubuntu is ready.' -ForegroundColor Green
}

function Install-LinuxPrerequisites {
  Write-Host 'Preparing Linux prerequisites as root (no Linux password needed)...'
  $script = @'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl git unzip zip jq ca-certificates gh tar gzip
if ! id -u tutoprunner >/dev/null 2>&1; then
  useradd -m -s /bin/bash tutoprunner
fi
mkdir -p /home/tutoprunner
chown -R tutoprunner:tutoprunner /home/tutoprunner
'@
  $code = Invoke-WslBashScript -User 'root' -Script $script
  if ($code -ne 0) { throw 'Linux prerequisites could not be installed.' }
}

function Get-RegistrationToken {
  $token = (gh api --method POST "repos/$Repo/actions/runners/registration-token" --jq '.token').Trim()
  if (-not $token) { throw 'GitHub did not return a temporary runner registration token.' }
  return $token
}

function Register-And-StartRunner {
  param(
    [Parameter(Mandatory=$true)][string]$Role,
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][string]$RunnerVersion
  )

  $token = Get-RegistrationToken
  $safeComputer = ($env:COMPUTERNAME -replace '[^A-Za-z0-9_.-]', '-')
  $runnerName = "tutop-$Role-$safeComputer"

  $rootTemplate = @'
set -euo pipefail
ROLE="__ROLE__"
VERSION="__VERSION__"
USER_NAME="tutoprunner"
DIR="/home/${USER_NAME}/actions-runner-${ROLE}"
mkdir -p "$DIR"
cd "$DIR"
if [ ! -x ./run.sh ]; then
  rm -f actions-runner-linux-x64-*.tar.gz
  curl -fsSLO "https://github.com/actions/runner/releases/download/v${VERSION}/actions-runner-linux-x64-${VERSION}.tar.gz"
  tar xzf "actions-runner-linux-x64-${VERSION}.tar.gz"
  rm -f "actions-runner-linux-x64-${VERSION}.tar.gz"
  ./bin/installdependencies.sh
fi
chown -R "${USER_NAME}:${USER_NAME}" "$DIR"
'@
  $rootBash = $rootTemplate.Replace('__ROLE__', $Role).Replace('__VERSION__', $RunnerVersion)
  $rootCode = Invoke-WslBashScript -User 'root' -Script $rootBash
  if ($rootCode -ne 0) { throw "Runner $Role prerequisites failed." }

  $userTemplate = @'
set -euo pipefail
ROLE="__ROLE__"
LABEL="__LABEL__"
REPO="__REPO__"
TOKEN="__TOKEN__"
NAME="__NAME__"
DIR="$HOME/actions-runner-$ROLE"
cd "$DIR"
if [ ! -f .runner ]; then
  ./config.sh --unattended --replace --url "https://github.com/${REPO}" --token "$TOKEN" --name "$NAME" --labels "$LABEL" --work _work
fi
if [ -f runner.pid ]; then
  OLD_PID="$(cat runner.pid 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    pkill -TERM -P "$OLD_PID" 2>/dev/null || true
    kill "$OLD_PID" 2>/dev/null || true
    sleep 2
  fi
fi
pkill -f "$DIR/bin/Runner.Listener" 2>/dev/null || true
rm -f runner.pid
nohup ./run.sh > runner.log 2>&1 < /dev/null &
echo $! > runner.pid
sleep 2
if ! kill -0 "$(cat runner.pid)" 2>/dev/null; then
  echo "$ROLE runner exited immediately" >&2
  tail -n 80 runner.log >&2 || true
  exit 46
fi
echo "$ROLE runner started cleanly pid=$(cat runner.pid)"
'@
  $userBash = $userTemplate.Replace('__ROLE__', $Role).Replace('__LABEL__', $Label).Replace('__REPO__', $Repo).Replace('__TOKEN__', $token).Replace('__NAME__', $runnerName)
  $userCode = Invoke-WslBashScript -User $RunnerUser -Script $userBash
  if ($userCode -ne 0) { throw "Runner $Role registration/start failed." }
}

function Verify-RunnersOnline {
  $required = @($ControllerLabel, $WorkerLabel)
  for ($attempt = 1; $attempt -le 8; $attempt++) {
    Start-Sleep -Seconds 5
    $json = gh api "repos/$Repo/actions/runners"
    if ($LASTEXITCODE -ne 0) { continue }
    $data = $json | ConvertFrom-Json
    $onlineLabels = @($data.runners | Where-Object { $_.status -eq 'online' } | ForEach-Object { $_.labels | ForEach-Object name })
    $missing = @($required | Where-Object { $_ -notin $onlineLabels })
    if ($missing.Count -eq 0) {
      Write-Host 'Controller and worker are ONLINE.' -ForegroundColor Green
      return
    }
    Write-Host "Waiting for GitHub runner connection ($attempt/8): $($missing -join ', ')" -ForegroundColor Yellow
  }

  foreach ($role in @('controller','worker')) {
    Write-Host "--- $role runner.log ---" -ForegroundColor Yellow
    & wsl.exe -d $Distro -u $RunnerUser -- bash -lc "tail -n 80 /home/$RunnerUser/actions-runner-$role/runner.log 2>/dev/null || true"
  }
  throw 'Controller/worker did not reach ONLINE status in GitHub after clean restart.'
}

function Check-FirebaseCredentialPath {
  $required = @('FIREBASE_TOKEN','FIREBASE_OAUTH_CLIENT_ID','FIREBASE_OAUTH_CLIENT_SECRET')
  $names = @(gh api "repos/$Repo/actions/secrets" --jq '.secrets[].name' 2>$null)
  if ($LASTEXITCODE -eq 0) {
    $missing = @($required | Where-Object { $_ -notin $names })
    if ($missing.Count -eq 0) {
      Write-Host 'Managed Firebase Secret names are present. Values were not read.' -ForegroundColor Green
      return $true
    }
  }

  $adc = Invoke-WslQuiet -Arguments @('-d',$Distro,'-u',$RunnerUser,'--','bash','-lc','gcloud auth application-default print-access-token >/dev/null 2>&1')
  if ($adc.Code -eq 0) {
    Write-Host 'Local Google ADC is available for the self-hosted runners.' -ForegroundColor Green
    return $true
  }

  Write-Host 'No usable Firebase credential path found: managed Secrets incomplete and local ADC unavailable.' -ForegroundColor Yellow
  return $false
}

function Trigger-And-Watch {
  Write-Host 'Starting TuTop runtime release orchestrator on main...'
  gh workflow run runtime-release-orchestrator.yml --repo $Repo --ref main
  if ($LASTEXITCODE -ne 0) { throw 'The runtime orchestrator could not be dispatched.' }
  Start-Sleep -Seconds 5
  $runId = (gh run list --repo $Repo --workflow runtime-release-orchestrator.yml --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId').Trim()
  if (-not $runId) { throw 'Could not resolve the new orchestrator run ID.' }
  Write-Host "Orchestrator run: $runId"
  Write-Host 'Progress is evidence-based: 60% -> 75% -> 85% -> 95% -> 100%.'
  gh run watch $runId --repo $Repo --exit-status
  if ($LASTEXITCODE -ne 0) { throw "The orchestrator stopped fail-closed. Run ID: $runId." }
  Write-Host 'Chain complete. PR #6 / prerelease should now contain verified APK evidence.' -ForegroundColor Green
}

Write-Host '=== TuTop ZERO-COST runner bootstrap ===' -ForegroundColor Cyan
Write-Host 'Your own PC supplies compute; hosted GitHub runner minutes are not used.'
Ensure-GitHubCli
Ensure-GitHubAuth
Ensure-WslUbuntu
Install-LinuxPrerequisites

$runnerTag = (gh api repos/actions/runner/releases/latest --jq '.tag_name').Trim()
$runnerVersion = $runnerTag.TrimStart('v')
if (-not $runnerVersion) { throw 'Could not resolve the current GitHub Actions runner version.' }
Write-Host "GitHub Actions runner: $runnerVersion"

Register-And-StartRunner -Role 'controller' -Label $ControllerLabel -RunnerVersion $runnerVersion
Register-And-StartRunner -Role 'worker' -Label $WorkerLabel -RunnerVersion $runnerVersion
Verify-RunnersOnline

if (-not (Check-FirebaseCredentialPath)) { exit 42 }

if ($NoTrigger) {
  Write-Host 'Setup complete. -NoTrigger was requested; no workflow was started.'
  exit 0
}

Trigger-And-Watch
