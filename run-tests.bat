@echo off
title FlightLog - Testes Automatizados
echo.
echo  ==========================================
echo   FlightLog - Testes Automatizados
echo  ==========================================
echo.

echo [1/2] Backend (pytest)...
cd /d "%~dp0backend"
python -m pip install pytest httpx -q
python -m pytest
echo.

echo [2/2] Frontend (vitest)...
cd /d "%~dp0frontend"
call npm test

echo.
pause
