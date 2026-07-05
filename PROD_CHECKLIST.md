# Checklist de Produção — FlightLog

Validar antes de abrir o app para usuários públicos. Marque cada item.

## 🔐 Segurança
- [ ] **`ENVIRONMENT=production`** setada no Render (ativa guard, `/docs` off, rate limit, HSTS).
- [ ] Backend **recusa subir** sem `SUPABASE_URL`/`CORS_ORIGINS` (guard fail-fast) — testado ao menos uma vez.
- [ ] `CORS_ORIGINS` = domínio real da Vercel (sem `*`).
- [ ] `/docs`, `/redoc`, `/openapi.json` **não** acessíveis em produção.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` só no backend (nunca no frontend/repo).
- [ ] Nenhum `.env` ou `logbook.db` versionado (`git ls-files | grep -E "\.env$|logbook\.db"` vazio).
- [ ] Rate limiting ativo (429 ao exceder ~300 req/IP/min).
- [ ] Security headers presentes (X-Content-Type-Options, X-Frame-Options, CSP, HSTS, Referrer/Permissions-Policy).

## 🔑 Autenticação & autorização
- [ ] Login/cadastro/reset de senha funcionando.
- [ ] Novo usuário nasce `pending`; só entra após aprovação do admin.
- [ ] Isolamento por usuário conferido (um piloto não vê dados do outro).
- [ ] Ao menos 1 admin ativo (bootstrap via SQL feito).

## 🗄️ Banco & dados
- [ ] Migrações rodaram no boot sem erro (colunas + índice `ix_flights_owner_date`).
- [ ] Excluir aeronave com voos → 409 (não 500).
- [ ] Backup: Supabase daily ativo + um `pg_dump` manual guardado.
- [ ] Restore testado ao menos uma vez (em ambiente de teste).

## 📜 LGPD / legal
- [ ] Páginas `/privacidade` e `/termos` no ar e linkadas (cadastro + Configurações).
- [ ] Exportar meus dados (JSON) funcionando.
- [ ] Excluir minha conta funcionando (remove Supabase Auth + dados) e pedindo confirmação.
- [ ] Email de contato do controlador correto nas páginas legais.

## 📈 Observabilidade & disponibilidade
- [ ] `/health` responde 200 (e 503 se o DB cair).
- [ ] Keep-alive (GitHub Actions) ativo — sem cold start perceptível.
- [ ] (Opcional) `SENTRY_DSN` setado; erros aparecendo no Sentry.
- [ ] (Opcional) UptimeRobot monitorando `/health`.
- [ ] Erros retornam JSON padronizado com `request_id`, sem stack trace.

## 🚀 Deploy & CI
- [ ] Último push na `master` → Vercel + Render no ar, versões batendo (`version.js`).
- [ ] CI verde (pytest + vitest + build).
- [ ] Auditoria de deps (pip-audit/npm audit) revisada — sem vuln crítica pendente.

## 🧪 Fumaça (smoke) pós-deploy
- [ ] Login → criar aeronave → registrar voo → ver no logbook/estatísticas/mapa.
- [ ] Exportar dados → excluir conta (em conta de teste).
- [ ] Testar no celular (PWA instalável, layout ok).
