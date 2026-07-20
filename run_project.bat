@echo off
setlocal EnableDelayedExpansion
title ProjectGrapher AI - Lanzador

set "DEFAULT_BACKEND_PORT=8080"
set "DEFAULT_FRONTEND_PORT=3000"
set "DEFAULT_BACKEND_HOST=127.0.0.1"
set "BACKEND_LABEL=Python/FastAPI"

set "PYTHON_BIN=python"
if exist ".venv\Scripts\python.exe" set "PYTHON_BIN=.venv\Scripts\python.exe"

set "BACKEND_PORT=%DEFAULT_BACKEND_PORT%"
set "FRONTEND_PORT=%DEFAULT_FRONTEND_PORT%"
set "BACKEND_HOST=%DEFAULT_BACKEND_HOST%"
set "BACKEND_RUNNING="

for /l %%P in (%DEFAULT_BACKEND_PORT%,1,8095) do (
  set "CANDIDATE_PORT=%%P"
  call :check_backend
  if defined BACKEND_RUNNING goto :backend_ready
  if not defined PORT_IN_USE (
    set "BACKEND_PORT=%%P"
    goto :launch_backend
  )
)

echo No se encontro un puerto backend disponible entre %DEFAULT_BACKEND_PORT% y 8095.
exit /b 1

:check_backend
set "PORT_IN_USE="
set "PORT_COUNT=0"
set "HEALTH_RESULT="
for /f %%R in ('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort !CANDIDATE_PORT! -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"') do set "PORT_COUNT=%%R"
if not "!PORT_COUNT!"=="0" (
  set "PORT_IN_USE=1"
  for /f "delims=" %%R in ('powershell -NoProfile -Command "try { $response = Invoke-RestMethod -Uri 'http://%BACKEND_HOST%:!CANDIDATE_PORT!/health' -TimeoutSec 2; if ($response.backend -eq '%BACKEND_LABEL%') { 'PROJECTGRAPHER_OK' } } catch { '' }"') do set "HEALTH_RESULT=%%R"
  if "!HEALTH_RESULT!"=="PROJECTGRAPHER_OK" (
    set "BACKEND_PORT=!CANDIDATE_PORT!"
    set "BACKEND_RUNNING=1"
  )
)
exit /b 0

:launch_backend
echo ==========================================
echo    Lanzando ProjectGrapher AI
echo ==========================================
echo.
echo [1/2] Iniciando Backend de Python en el puerto %BACKEND_PORT%...
start "ProjectGrapher Backend" cmd /k "set PORT=%BACKEND_PORT% && %PYTHON_BIN% main.py"
timeout /t 3 /nobreak > nul
goto :start_frontend

:backend_ready
echo ==========================================
echo    Lanzando ProjectGrapher AI
echo ==========================================
echo.
echo [1/2] Backend ProjectGrapher ya activo en %BACKEND_HOST%:%BACKEND_PORT%.

:start_frontend
echo [2/2] Iniciando Frontend de React...
echo.
echo ------------------------------------------
echo URL esperada: http://localhost:%FRONTEND_PORT%
echo API esperada: http://%BACKEND_HOST%:%BACKEND_PORT%
echo ------------------------------------------
echo.

set "PORT=%BACKEND_PORT%"
set "VITE_API_URL=http://%BACKEND_HOST%:%BACKEND_PORT%"
set "VITE_API_HOST=%BACKEND_HOST%"
set "VITE_FRONTEND_PORT=%FRONTEND_PORT%"

npm run dev
