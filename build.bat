@echo off
title FlightLog — Build Inteligente
echo.
echo  ==========================================
echo   FlightLog — Build Inteligente
echo  ==========================================
echo.

set ROOT=%~dp0
set MARKER=%ROOT%.last-backend-build
set BACKEND_EXE=%ROOT%backend\dist\flightlog-backend.exe
set NEED_BACKEND=0

:: ── Verifica se o backend já foi empacotado alguma vez ───────────────────────
if not exist "%BACKEND_EXE%" (
    echo [!] Backend nunca foi empacotado. Build completo necessario.
    set NEED_BACKEND=1
    goto :decide
)

:: ── Verifica se algum arquivo Python mudou desde o ultimo build ──────────────
if not exist "%MARKER%" (
    echo [!] Primeira vez — build completo.
    set NEED_BACKEND=1
    goto :decide
)

:: Compara data dos arquivos Python com o marcador
for %%f in ("%ROOT%backend\*.py" "%ROOT%backend\routers\*.py" "%ROOT%backend\requirements.txt") do (
    xcopy /D /L /Y "%%f" "%MARKER%" >nul 2>&1
    if errorlevel 1 (
        echo [!] Arquivo modificado: %%~nxf
        set NEED_BACKEND=1
    )
)

:decide
echo.
if "%NEED_BACKEND%"=="1" (
    echo [*] Mudancas no backend detectadas — Build COMPLETO
    echo     ^(empacota Python + compila React + gera instalador^)
) else (
    echo [*] Sem mudancas no backend — Build RAPIDO
    echo     ^(compila React + gera instalador^)
)
echo.
choice /C SN /M "Continuar?"
if errorlevel 2 goto :fim
if errorlevel 1 goto :build

:build
echo.

:: ── BACKEND (só se necessário) ───────────────────────────────────────────────
if "%NEED_BACKEND%"=="1" (
    echo [1/?] Empacotando backend Python...
    cd /d "%ROOT%backend"
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
        pause & exit /b 1
    )
    :: Atualiza o marcador com a data atual
    echo. > "%MARKER%"
    echo    Backend empacotado com sucesso.
)

:: ── FRONTEND ─────────────────────────────────────────────────────────────────
echo [?/?] Compilando frontend React...
cd /d "%ROOT%frontend"
call npm install --silent
call npm run build
if not exist "dist\index.html" (
    echo ERRO: falha ao compilar o frontend.
    pause & exit /b 1
)
echo    Frontend compilado com sucesso.

:: ── INSTALADOR ───────────────────────────────────────────────────────────────
echo [?/?] Deletando instaladores antigos...
cd /d "%ROOT%dist-electron"
for /f %%f in ('dir /b FlightLog-Setup-*.exe 2^>nul') do del "%%f"
for /f %%f in ('dir /b FlightLog-Setup-*.exe.blockmap 2^>nul') do del "%%f"

echo [?/?] Gerando novo instalador...
cd /d "%ROOT%"
call npm install --silent
set CSC_IDENTITY_AUTO_DISCOVERY=false
set WIN_CSC_LINK=
call npx electron-builder --win

:: ── RESULTADO ────────────────────────────────────────────────────────────────
echo.
echo  ==========================================
if exist "%ROOT%dist-electron\FlightLog-Setup-*.exe" (
    echo   Instalador gerado com sucesso!
    for %%f in ("%ROOT%dist-electron\FlightLog-Setup-*.exe") do (
        echo   Arquivo: %%~nxf
    )
) else (
    echo   ATENCAO: instalador nao encontrado em dist-electron\
)
echo  ==========================================
echo.

:fim
pause
