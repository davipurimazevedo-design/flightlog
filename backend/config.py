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

# Segredo HS256 do JWT do Supabase (Settings > API > JWT Settings) — valida os tokens.
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")

# Domínios liberados no CORS (separados por vírgula). Vazio = libera tudo (dev/desktop).
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]

# Auth só é exigida quando há segredo de JWT configurado.
AUTH_ENABLED = bool(SUPABASE_JWT_SECRET)
