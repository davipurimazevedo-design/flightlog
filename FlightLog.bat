@echo off
title FlightLog Launcher
cd /d "%~dp0"

echo.
echo  ==========================================
echo     FlightLog v1.3.2 — Iniciando...
echo  ==========================================
echo.

:: ── Verifica se o frontend já foi buildado ──────────────────────────────────
if not exist "frontend\dist\index.html" (
    echo  [1/2] Build do frontend nao encontrado. Construindo...
    cd frontend
    call npm install --silent
    call npm run build
    cd ..
    echo  [1/2] Build concluido!
) else (
    echo  [1/2] Frontend ja buildado. OK
)

:: ── Instala dependencias do backend (se necessario) ─────────────────────────
echo  [2/2] Verificando dependencias do backend...
cd backend
pip install -r requirements.txt -q
cd ..

:: ── Inicia o backend em janela minimizada ────────────────────────────────────
echo.
echo  Iniciando servidor...
start /min "FlightLog Backend" cmd /k "cd /d "%~dp0backend" && python -m uvicorn main:app --port 8000"

:: ── Aguarda o servidor subir ─────────────────────────────────────────────────
echo  Aguardando servidor... (3 segundos)
timeout /t 3 /nobreak > nul

:: ── Abre o browser ───────────────────────────────────────────────────────────
echo  Abrindo FlightLog no navegador...
start http://localhost:8000

echo.
echo  FlightLog rodando em http://localhost:8000
echo  Para encerrar, feche a janela "FlightLog Backend" minimizada na barra de tarefas.
echo.
timeout /t 5 /nobreak > nul
exit
