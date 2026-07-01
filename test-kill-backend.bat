@echo off
title FlightLog — Teste de Status: Derrubar Backend
echo.
echo  ==========================================
echo   Teste de Status — Encerrando o BACKEND
echo  ==========================================
echo.
echo Procurando processo na porta 8000...
echo.

powershell -NoProfile -Command ^
    "$p = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess;" ^
    "if ($p) { Write-Host ('Encerrando processo PID ' + $p + ' ...'); Stop-Process -Id $p -Force; Write-Host 'Backend encerrado.' }" ^
    "else { Write-Host 'Nenhum processo encontrado na porta 8000 (backend ja esta parado?).' }"

echo.
echo  ------------------------------------------
echo   Va ate Configuracoes no FlightLog e veja
echo   o status do Backend ficar AMARELO/VERMELHO.
echo   (o app tenta reiniciar o backend sozinho
echo    depois de alguns segundos)
echo  ------------------------------------------
echo.
pause
