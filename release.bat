@echo off
title FlightLog — Release Rapido
echo.
echo  ==========================================
echo   FlightLog — Release Rapido
echo   (sem recompilar o backend Python)
echo  ==========================================
echo.
echo  Use quando so o frontend ou Electron mudou.
echo  Para mudancas no backend, use build.bat
echo.

set ROOT=%~dp0

choice /C SN /M "Continuar?"
if errorlevel 2 goto :fim
if errorlevel 1 goto :build

:build
echo.

:: ── FRONTEND ─────────────────────────────────────────────────────────────────
echo [1/2] Compilando frontend React...
cd /d "%ROOT%frontend"
call npm run build
if not exist "dist\index.html" (
    echo ERRO: falha ao compilar o frontend.
    pause & exit /b 1
)
echo    Frontend compilado com sucesso.

:: ── INSTALADOR ───────────────────────────────────────────────────────────────
echo [2/2] Gerando instalador...
cd /d "%ROOT%"
call npm install --silent
set CSC_IDENTITY_AUTO_DISCOVERY=false
set WIN_CSC_LINK=
call npx electron-builder --win

:: ── RESULTADO ────────────────────────────────────────────────────────────────
echo.
echo  ==========================================
if exist "%ROOT%dist-electron\FlightLog Setup*.exe" (
    echo   Instalador gerado com sucesso!
    for %%f in ("%ROOT%dist-electron\FlightLog Setup*.exe") do (
        echo   Arquivo: %%~nxf
    )
) else (
    echo   ATENCAO: instalador nao encontrado em dist-electron\
)
echo  ==========================================

:fim
echo.
pause
