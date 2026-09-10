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
  Write-Host 'The CMD will handle resume setup. No payment is required.' -ForegroundColor Yellow
  exit 20
}

function Ensure-WslUbuntu {
  $distros = Get-WslDistros
  if ($distros -notcontains $Distro) {
    Install-WslUbuntu
  }

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
  & wsl.exe -d $Distro -u root -- bash -lc $script
  if ($LASTEXITCODE -ne 0) { throw 'Linux prerequisites could not be installed.' }
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
  & wsl.exe -d $Distro -u root -- bash -lc $rootBash
  if ($LASTEXITCODE -ne 0) { throw "Runner $Role prerequisites failed." }

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
if [ -f runner.pid ] && kill -0 "$(cat runner.pid)" 2>/dev/null; then
  echo "$ROLE runner already running pid=$(cat runner.pid)"
else
  nohup ./run.sh > runner.log 2>&1 < /dev/null &
  echo $! > runner.pid
  echo "$ROLE runner started pid=$(cat runner.pid)"
fi
'@
  $userBash = $userTemplate.Replace('__ROLE__', $Role).Replace('__LABEL__', $Label).Replace('__REPO__', $Repo).Replace('__TOKEN__', $token).Replace('__NAME__', $runnerName)
  & wsl.exe -d $Distro -u $RunnerUser -- bash -lc $userBash
  if ($LASTEXITCODE -ne 0) { throw "Runner $Role registration/start failed." }
}

function Verify-RunnersOnline {
  Start-Sleep -Seconds 8
  $json = gh api "repos/$Repo/actions/runners"
  $data = $json | ConvertFrom-Json
  $required = @(
    @{ Label = $ControllerLabel; Role = 'controller' },
    @{ Label = $WorkerLabel; Role = 'worker' }
  )
  foreach ($item in $required) {
    $match = @($data.runners | Where-Object {
      $_.status -eq 'online' -and @($_.labels | ForEach-Object name) -contains $item.Label
    })
    if ($match.Count -eq 0) {
      throw "No online runner found for label $($item.Label). Check /home/$RunnerUser/actions-runner-$($item.Role)/runner.log in Ubuntu."
    }
  }
  Write-Host 'Controller and worker are ONLINE.' -ForegroundColor Green
}

function Check-RequiredSecrets {
  $required = @('FIREBASE_TOKEN','FIREBASE_OAUTH_CLIENT_ID','FIREBASE_OAUTH_CLIENT_SECRET')
  $names = @(gh api "repos/$Repo/actions/secrets" --jq '.secrets[].name')
  $missing = @($required | Where-Object { $_ -notin $names })
  if ($missing.Count -gt 0) {
    Write-Host ''
    Write-Host 'RUNNERS READY, but the chain will not start because these GitHub Secret names are missing:' -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host " - $_" }
    Write-Host 'Add them in GitHub > Settings > Secrets and variables > Actions. Never share their values.' -ForegroundColor Yellow
    return $false
  }
  Write-Host 'All three required Secret names exist. Their values were not read or printed.' -ForegroundColor Green
  return $true
}

function Trigger-And-Watch {
  Write-Host 'Starting TuTop runtime release orchestrator on main...'
  gh workflow run runtime-release-orchestrator.yml --repo $Repo --ref main
  if ($LASTEXITCODE -ne 0) { throw 'The runtime orchestrator could not be dispatched.' }
  Start-Sleep -Seconds 4
  $runId = (gh run list --repo $Repo --workflow runtime-release-orchestrator.yml --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId').Trim()
  if (-not $runId) { throw 'Could not resolve the new orchestrator run ID.' }
  Write-Host "Orchestrator run: $runId"
  Write-Host 'Progress is evidence-based: 60% -> 75% -> 85% -> 95% -> 100%.'
  gh run watch $runId --repo $Repo --exit-status
  if ($LASTEXITCODE -ne 0) {
    throw "The orchestrator stopped fail-closed. Run ID: $runId."
  }
  Write-Host 'Chain complete. PR #6 / prerelease should now contain the verified APK evidence.' -ForegroundColor Green
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

$secretsReady = Check-RequiredSecrets
if (-not $secretsReady) { exit 42 }

if ($NoTrigger) {
  Write-Host 'Setup complete. -NoTrigger was requested; no workflow was started.'
  exit 0
}

Trigger-And-Watch
