@echo off
title FlightLog — Build Rapido (sem reempacotar backend)
echo.
echo  Compilando frontend e gerando instalador (backend ja empacotado)...
echo.

:: Frontend
cd /d "%~dp0frontend"
call npm run build
if not exist "dist\index.html" (
    echo ERRO: falha ao compilar o frontend.
    pause & exit /b 1
)

:: Instalador Electron
cd /d "%~dp0"
set CSC_IDENTITY_AUTO_DISCOVERY=false
set WIN_CSC_LINK=
call npx electron-builder --win

echo.
if exist "dist-electron\FlightLog Setup*.exe" (
    for %%f in ("dist-electron\FlightLog Setup*.exe") do echo Instalador: %%f
) else (
    echo Verifique dist-electron\
)
echo.
pause
