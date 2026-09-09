param(
  [switch]$NoTrigger
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repo = 'vicmdlb-hash/TuTop'
$Distro = 'Ubuntu'
$ControllerLabel = 'tutop-zero-cost-controller'
$WorkerLabel = 'tutop-zero-cost-worker'

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Ensure-GitHubCli {
  if (Get-Command gh -ErrorAction SilentlyContinue) { return }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI (gh) no está instalado y winget no está disponible. Instala GitHub CLI y vuelve a ejecutar este script.'
  }
  Write-Host 'Instalando GitHub CLI con winget...'
  winget install --id GitHub.cli -e --source winget --accept-source-agreements --accept-package-agreements
  Refresh-Path
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    $candidate = Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe'
    if (Test-Path $candidate) {
      $env:Path = "$(Split-Path $candidate);$env:Path"
    }
  }
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'gh se instaló, pero esta consola todavía no lo detecta. Cierra PowerShell, abre uno nuevo y vuelve a ejecutar.'
  }
}

function Ensure-GitHubAuth {
  gh auth status --hostname github.com *> $null
  if ($LASTEXITCODE -eq 0) { return }
  Write-Host 'Se abrirá GitHub para autorizar esta PC. No pegues tokens ni secretos en chats.'
  gh auth login --hostname github.com --git-protocol https --web
  gh auth status --hostname github.com
}

function Ensure-WslUbuntu {
  $raw = (& wsl.exe -l -q 2>$null | Out-String).Replace([char]0, '')
  if ($LASTEXITCODE -ne 0 -or $raw -notmatch '(?m)^Ubuntu\s*$') {
    Write-Host 'Ubuntu/WSL no está listo. Intentando instalación gratuita...'
    & wsl.exe --install -d Ubuntu
    Write-Host ''
    Write-Host 'Si Windows solicita reinicio, reinicia. Después abre Ubuntu una vez, crea el usuario Linux y vuelve a ejecutar este mismo script.' -ForegroundColor Yellow
    exit 20
  }

  & wsl.exe -d $Distro -- bash -lc 'echo WSL_READY' *> $null
  if ($LASTEXITCODE -ne 0) {
    throw 'Ubuntu existe pero aún no terminó su inicialización. Abre Ubuntu una vez, crea el usuario Linux y vuelve a ejecutar.'
  }
}

function Install-LinuxPrerequisites {
  Write-Host 'Preparando dependencias Linux. Ubuntu puede pedir tu contraseña local de sudo una vez.'
  & wsl.exe -d $Distro -- bash -lc 'set -e; sudo apt-get update; sudo apt-get install -y curl git unzip zip jq ca-certificates gh'
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias Linux.' }
}

function Get-RegistrationToken {
  $token = (gh api --method POST "repos/$Repo/actions/runners/registration-token" --jq '.token').Trim()
  if (-not $token) { throw 'GitHub no devolvió el token temporal de registro del runner.' }
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
  $template = @'
set -euo pipefail
ROLE="__ROLE__"
LABEL="__LABEL__"
VERSION="__VERSION__"
REPO="__REPO__"
TOKEN="__TOKEN__"
NAME="__NAME__"
DIR="$HOME/actions-runner-$ROLE"
mkdir -p "$DIR"
cd "$DIR"

if [ ! -x ./run.sh ]; then
  rm -f actions-runner-linux-x64-*.tar.gz
  curl -fsSLO "https://github.com/actions/runner/releases/download/v${VERSION}/actions-runner-linux-x64-${VERSION}.tar.gz"
  tar xzf "actions-runner-linux-x64-${VERSION}.tar.gz"
  rm -f "actions-runner-linux-x64-${VERSION}.tar.gz"
  sudo ./bin/installdependencies.sh
fi

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

  $bash = $template.Replace('__ROLE__', $Role).Replace('__LABEL__', $Label).Replace('__VERSION__', $RunnerVersion).Replace('__REPO__', $Repo).Replace('__TOKEN__', $token).Replace('__NAME__', $runnerName)
  & wsl.exe -d $Distro -- bash -lc $bash
  if ($LASTEXITCODE -ne 0) { throw "Falló el registro/inicio del runner $Role." }
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
      throw "No aparece online ningún runner con etiqueta $($item.Label). Revisa ~/actions-runner-$($item.Role)/runner.log dentro de Ubuntu."
    }
  }
  Write-Host 'Controller y worker están ONLINE.' -ForegroundColor Green
}

function Check-RequiredSecrets {
  $required = @('FIREBASE_TOKEN','FIREBASE_OAUTH_CLIENT_ID','FIREBASE_OAUTH_CLIENT_SECRET')
  $names = @(gh api "repos/$Repo/actions/secrets" --jq '.secrets[].name')
  $missing = @($required | Where-Object { $_ -notin $names })
  if ($missing.Count -gt 0) {
    Write-Host ''
    Write-Host 'RUNNERS LISTOS, pero no se lanzará la cadena porque faltan nombres de Secrets:' -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host " - $_" }
    Write-Host 'Configúralos en GitHub > Settings > Secrets and variables > Actions. No compartas sus valores.' -ForegroundColor Yellow
    return $false
  }
  Write-Host 'Los tres Secrets requeridos existen (sus valores no fueron leídos ni impresos).' -ForegroundColor Green
  return $true
}

function Trigger-And-Watch {
  Write-Host 'Lanzando TuTop runtime release orchestrator en main...'
  gh workflow run runtime-release-orchestrator.yml --repo $Repo --ref main
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo lanzar el orquestador.' }
  Start-Sleep -Seconds 4
  $runId = (gh run list --repo $Repo --workflow runtime-release-orchestrator.yml --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId').Trim()
  if (-not $runId) { throw 'No se pudo resolver el run ID del orquestador recién lanzado.' }
  Write-Host "Run del orquestador: $runId"
  Write-Host 'La cadena actualizará 60% -> 75% -> 85% -> 95% -> 100% sólo con evidencia real.'
  gh run watch $runId --repo $Repo --exit-status
  if ($LASTEXITCODE -ne 0) {
    throw "El orquestador se detuvo fail-closed. Run ID: $runId. Pásame ese ID y revisaré el punto exacto."
  }
  Write-Host 'Cadena completada. Revisa PR #6 y el prerelease de Physical QA para el APK verificado.' -ForegroundColor Green
}

Write-Host '=== TuTop ZERO-COST runner bootstrap ===' -ForegroundColor Cyan
Write-Host 'Esta ruta usa tu propia PC como cómputo; no consume minutos de runners hospedados de GitHub.'
Ensure-GitHubCli
Ensure-GitHubAuth
Ensure-WslUbuntu
Install-LinuxPrerequisites

$runnerTag = (gh api repos/actions/runner/releases/latest --jq '.tag_name').Trim()
$runnerVersion = $runnerTag.TrimStart('v')
if (-not $runnerVersion) { throw 'No se pudo resolver la versión actual del GitHub Actions runner.' }
Write-Host "GitHub Actions runner: $runnerVersion"

Register-And-StartRunner -Role 'controller' -Label $ControllerLabel -RunnerVersion $runnerVersion
Register-And-StartRunner -Role 'worker' -Label $WorkerLabel -RunnerVersion $runnerVersion
Verify-RunnersOnline

$secretsReady = Check-RequiredSecrets
if (-not $secretsReady) { exit 42 }

if ($NoTrigger) {
  Write-Host 'Setup terminado. -NoTrigger solicitado; no se lanzó ningún workflow.'
  exit 0
}

Trigger-And-Watch
