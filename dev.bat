@echo off
title FlightLog — Modo Dev
echo.
echo  ==========================================
echo   FlightLog — Modo Desenvolvimento
echo  ==========================================
echo.
echo  Iniciando backend, Vite e Electron...
echo  Feche esta janela para encerrar tudo.
echo.

set ROOT=%~dp0

:: Backend Python — /D define o diretório de trabalho sem aspas aninhadas
start "FlightLog Backend" /D "%ROOT%backend" cmd /k "python -m uvicorn main:app --port 8000 --host 127.0.0.1 --reload"

:: Vite dev server
start "FlightLog Vite" /D "%ROOT%frontend" cmd /k "npm run dev"

:: Aguarda Vite iniciar (pode demorar um pouco na primeira vez)
echo  Aguardando Vite iniciar...
timeout /t 6 /nobreak >nul

:: Abre Electron apontando para o Vite (porta 5173)
cd /d "%ROOT%"
set VITE_DEV=1
npx electron .

echo.
echo  Electron encerrado.
pause
