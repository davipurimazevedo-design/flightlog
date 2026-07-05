# Flight Logbook — Instruções para o Claude

## Versionamento
- A versão fica em `frontend/src/version.js` (constante `APP_VERSION`, **fonte única**)
- **Atualizar a versão a cada mudança feita**, seguindo SemVer:
  - Bug fix / ajuste pequeno → PATCH (ex: v2.0.0 → v2.0.1)
  - Nova funcionalidade → MINOR (ex: v2.0.0 → v2.1.0)
  - Redesign / mudança estrutural grande → MAJOR (ex: v2.0.0 → v3.0.0)
- Versão atual: **v2.8.3**

## Deploy (nuvem) — web app
- Frontend na **Vercel**, backend FastAPI no **Render**, banco+auth no **Supabase** (Postgres).
- **`git push` na branch `master` → deploy automático** na Vercel e no Render (~1-2 min). Não há mais instalador/Electron.
- Front: `https://flightlog-five.vercel.app` · API: `https://flightlog-api-owav.onrender.com`
- Guia de variáveis/deploy: `DEPLOY.md`. Auth valida JWT do Supabase via JWKS (ES256); `AUTH_ENABLED` liga quando `SUPABASE_URL` está setada.

## Preferências de trabalho (Davi)
- **Mudanças visuais/alinhamento**: SEMPRE pedir referência visual (print, mockup,
  ou descrição precisa tipo "alinhe o final do X com a letra Y de Z") ANTES de
  implementar. Evita ciclos de tentativa-e-erro em CSS/posicionamento — já
  aconteceu de precisar de 3 iterações até acertar o alinhamento da versão no Sidebar.
- **Antes de agir em algo subjetivo/ambíguo**: perguntar primeiro. Preferência
  explícita do usuário ("me pergunte antes de tomar ação").
- **Limpeza periódica**: ao final de blocos grandes de trabalho, verificar e remover
  `__pycache__`, venvs quebradas, arquivos temporários/estranhos (ex: stray files
  criados por bugs em scripts .bat).
- **Scripts de teste manuais**: o usuário gosta de `.bat` simples para simular
  cenários (ex: `test-kill-backend.bat`, `test-kill-bot.bat`) — preferir essa
  abordagem prática a setups de teste pesados quando o objetivo é validação manual rápida.
- **Explicações**: quando pedir para explicar algo "como se fosse pra alguém que
  nunca viu", usar analogias, diagramas ASCII e fluxos passo-a-passo em vez de
  jargão técnico direto.

## Stack
- **Backend**: Python / FastAPI / SQLAlchemy — SQLite em dev local, **Postgres (Supabase)** na nuvem
- **Auth**: Supabase Auth (JWT ES256 via JWKS); multi-usuário, dados isolados por `owner_id` (aircraft/flights); airports compartilhados
- **Frontend**: React 18 + Vite 5 + Tailwind CSS v3 (não usar v4)
- **Mapa**: MapLibre + CARTO (sem API key)
- **Gráficos**: Recharts
- **Aeroportos**: GeoAISWEB WFS API (DECEA) com cache local — usar `verify=False` no httpx

## Regras de exibição
- Datas: formato `DD/MM/AAAA` — usar `.slice()` no ISO string, nunca `new Date()` para evitar bug de timezone
- Horários: sempre em Zulu (UTC) `HH:MMZ` — usar `.slice(11,16)` no ISO string
- Horas de voo: sempre em `HH:MM` (não decimal) — usar helper `toHHMM()`

## Banco de dados
- Tabelas: `aircraft`, `airports`, `flights` (plural)
- Rota `ROTA`: voo que cruza meia-noite — o import script faz merge automático (SBXX→ROTA + ROTA→SBZZ = SBXX→SBZZ)

## Como rodar (dev local)
- Backend: dentro de `backend/`, `python -m uvicorn main:app --reload --port 8000` (sem env → SQLite local, auth desligada)
- Frontend: `npm run dev` dentro de `frontend/`
- Testes: `python -m pytest` dentro de `backend/`
- Import de planilha: `python importar_voos.py "caminho/para/arquivo.xlsx"`
- Migração local→nuvem: `python backend/migrate_to_cloud.py` (requer `backend/.env` com `DATABASE_URL` do Supabase)
