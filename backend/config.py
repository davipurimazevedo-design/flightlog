"""
Configuração central lida de variáveis de ambiente.

- Em dev/desktop: sem nenhuma variável setada → AUTH_ENABLED=False, endpoints abertos
  (comportamento atual, para não quebrar o app desktop nem os testes).
- Na nuvem: setar as variáveis do Supabase → auth passa a ser exigida.
"""
import os

try:
    # Em dev, carrega backend/.env se existir (facilita testar localmente).
    from dotenv import load_dotenv
    from pathlib import Path
    load_dotenv(Path(__file__).parent / ".env")
except Exception:
    pass

# URL do projeto Supabase, ex: https://xxxx.supabase.co
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")

# Chave pública (anon) — usada nas chamadas à Auth API do Supabase.
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

# Chave service_role (SECRETA, só backend) — necessária para operações de admin
# em auth.users (listar, deletar, resetar senha).
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Segredo HS256 legado do Supabase (aba "Legacy JWT Secret"). OPCIONAL: só valida
# tokens antigos HS256. Os tokens atuais são ES256, verificados via JWKS (SUPABASE_URL).
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")

# Domínios liberados no CORS (separados por vírgula). Vazio = libera tudo (dev/desktop).
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]

# Auth liga quando há um projeto Supabase configurado. A validação ES256 usa o
# JWKS derivado da SUPABASE_URL, então não depende mais do JWT secret legado.
AUTH_ENABLED = bool(SUPABASE_URL)
