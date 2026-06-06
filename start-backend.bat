@echo off
cd /d "%~dp0backend"
echo Instalando dependencias...
pip install -r requirements.txt
echo.
echo Iniciando backend na porta 8000...
python -m uvicorn main:app --port 8000
