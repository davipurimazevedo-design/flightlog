@echo off
title FlightLog — Teste de Status: Derrubar Bot do Telegram
echo.
echo  ==========================================
echo   Teste de Status — Encerrando o BOT
echo  ==========================================
echo.
echo Procurando processo do bot.py (Telegram)...
echo.

powershell -NoProfile -Command ^
    "$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*bot.py*' };" ^
    "if ($procs) { $procs | ForEach-Object { Write-Host ('Encerrando processo PID ' + $_.ProcessId + ' ...'); Stop-Process -Id $_.ProcessId -Force }; Write-Host 'Bot encerrado.' }" ^
    "else { Write-Host 'Nenhum processo do bot encontrado (ja esta parado?).' }"

echo.
echo  ------------------------------------------
echo   Va ate Configuracoes no FlightLog e veja
echo   o status do Bot ficar VERMELHO (parado).
echo   Obs: o app NAO reinicia o bot sozinho —
echo   feche e abra o FlightLog para reiniciar.
echo  ------------------------------------------
echo.
pause
