@echo off
title FlightLog — Modo Desenvolvimento
echo Iniciando FlightLog em modo dev...
cd /d "%~dp0"

:: Instala dependências Electron se necessário
if not exist "node_modules\electron" (
    echo Instalando Electron...
    npm install --silent
)

:: O Electron vai subir o backend automaticamente
npm start
