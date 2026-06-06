@echo off
title FlightLog — Gerar Instalador
echo.
echo  ======================================
echo   FlightLog — Gerando instalador .exe
echo  ======================================
echo.

:: ── 1. Backend: empacotar com PyInstaller ───────────────────────────────────
echo [1/4] Empacotando backend Python...
cd /d "%~dp0backend"

pip install pyinstaller -q
python -m PyInstaller --onefile --name flightlog-backend --distpath dist --workpath build --specpath build ^
    --hidden-import uvicorn.logging ^
    --hidden-import uvicorn.loops ^
    --hidden-import uvicorn.loops.auto ^
    --hidden-import uvicorn.protocols ^
    --hidden-import uvicorn.protocols.http ^
    --hidden-import uvicorn.protocols.http.auto ^
    --hidden-import uvicorn.protocols.websockets ^
    --hidden-import uvicorn.protocols.websockets.auto ^
    --hidden-import uvicorn.lifespan ^
    --hidden-import uvicorn.lifespan.on ^
    --hidden-import uvicorn.lifespan.off ^
    --collect-all fastapi ^
    --collect-all sqlalchemy ^
    --collect-all pydantic ^
    --collect-all httpx ^
    run_server.py

if not exist "dist\flightlog-backend.exe" (
    echo ERRO: falha ao empacotar o backend.
    pause
    exit /b 1
)
echo    Backend empacotado com sucesso.

:: ── 2. Frontend: build React ─────────────────────────────────────────────────
echo [2/4] Compilando frontend React...
cd /d "%~dp0frontend"
call npm install --silent
call npm run build

if not exist "dist\index.html" (
    echo ERRO: falha ao compilar o frontend.
    pause
    exit /b 1
)
echo    Frontend compilado com sucesso.

:: ── 3. Electron: gerar instalador ───────────────────────────────────────────
echo [3/4] Gerando instalador Electron...
cd /d "%~dp0"
call npm install --silent
set CSC_IDENTITY_AUTO_DISCOVERY=false
set WIN_CSC_LINK=
call npm run dist -- --win

:: ── 4. Resultado ─────────────────────────────────────────────────────────────
echo [4/4] Pronto!
echo.
if exist "dist-electron\FlightLog Setup*.exe" (
    echo  Instalador gerado em:
    for %%f in ("dist-electron\FlightLog Setup*.exe") do echo    %%f
) else (
    echo  Verifique a pasta dist-electron\
)
echo.
pause
