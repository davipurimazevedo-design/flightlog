@echo off
title FlightLog - Testes Automatizados
echo.
echo  ==========================================
echo   FlightLog - Testes Automatizados
echo  ==========================================
echo.

cd /d "%~dp0backend"

echo Instalando pytest (se necessario)...
python -m pip install pytest httpx -q

echo.
echo Rodando testes...
echo.
python -m pytest

echo.
pause
