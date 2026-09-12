@echo off
setlocal EnableExtensions
set "REPO=vicmdlb-hash/TuTop"
set "WORKFLOW=runtime-release-orchestrator-091.yml"
set "TARGET_REF=feat/tutop-0.9.1-nearby-topi"

echo ============================================================
echo TuTop 0.9.1 - ZERO COST RELEASE
echo October - Staging - Android - verified APK
echo ============================================================

where gh >nul 2>&1
if errorlevel 1 (
  echo [ERROR] GitHub CLI ^(gh^) no esta disponible.
  exit /b 2
)

gh auth status >nul 2>&1
if errorlevel 1 (
  echo [ERROR] gh no tiene una sesion autenticada.
  exit /b 3
)

for /f "delims=" %%S in ('gh api repos/%REPO%/commits/%TARGET_REF% --jq ".sha"') do set "TARGET_SHA=%%S"
if not defined TARGET_SHA (
  echo [ERROR] No se pudo resolver el SHA de %TARGET_REF%.
  exit /b 4
)

echo [OK] Target feature SHA: %TARGET_SHA%
echo [INFO] Dispatching %WORKFLOW% on main...
gh workflow run %WORKFLOW% --repo %REPO% --ref main
if errorlevel 1 (
  echo [ERROR] No se pudo disparar el orquestador 0.9.1.
  exit /b 5
)

timeout /t 4 /nobreak >nul
set "RUN_ID="
for /f "delims=" %%R in ('gh run list --repo %REPO% --workflow %WORKFLOW% --branch main --event workflow_dispatch --limit 1 --json databaseId --jq ".[0].databaseId"') do set "RUN_ID=%%R"
if not defined RUN_ID (
  echo [ERROR] El workflow fue enviado pero no pude resolver su Run ID.
  exit /b 6
)

echo [OK] Orchestrator Run ID: %RUN_ID%
echo [INFO] Esperando cadena exact-SHA...
gh run watch %RUN_ID% --repo %REPO% --exit-status
if errorlevel 1 (
  echo.
  echo [BLOCKED] La cadena se detuvo fail-closed.
  echo RUN_ID=%RUN_ID%
  echo TARGET_SHA=%TARGET_SHA%
  echo Comparte solamente este Run ID en el chat para diagnosticar todos los fallos revelados.
  exit /b 7
)

echo.
echo [PASS] TuTop 0.9.1 termino la cadena de release.
echo RUN_ID=%RUN_ID%
echo TARGET_SHA=%TARGET_SHA%
echo La ejecucion contiene la copia independently verified de la APK 0.9.1.
exit /b 0
