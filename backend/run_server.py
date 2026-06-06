"""Entry point para o executável PyInstaller — inicia o uvicorn."""
import multiprocessing
multiprocessing.freeze_support()  # necessário para PyInstaller no Windows

# Importa o app diretamente (não como string) para o PyInstaller incluir tudo
from main import app
import uvicorn

if __name__ == '__main__':
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="warning",
    )
