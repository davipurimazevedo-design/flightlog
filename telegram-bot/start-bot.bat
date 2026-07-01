@echo off
title FlightLog Bot — Telegram
cd /d "%~dp0"

if not exist ".env" (
    echo ERRO: arquivo .env nao encontrado!
    echo Copie o .env.example para .env e preencha as chaves.
    pause
    exit /b 1
)

echo Instalando dependencias...
pip install -r requirements.txt --quiet

echo.
echo  ==========================================
echo   FlightLog Bot iniciando...
echo   Pressione Ctrl+C para encerrar.
echo  ==========================================
echo.

python bot.py
pause
