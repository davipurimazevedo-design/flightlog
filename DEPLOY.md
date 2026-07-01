# FlightLog — Guia de Deploy (Fase 4)

Ordem obrigatória: **Supabase → Render → Vercel → amarrar CORS → virar admin**.
Cada passo alimenta o próximo com chaves/URLs.

---

## Pré-requisito: código no GitHub

Render e Vercel puxam de um repositório Git. Se ainda não está no GitHub:

```bash
cd "flight-logbook"
git init
git add .
git commit -m "FlightLog web"
git branch -M main
git remote add origin https://github.com/davipurimazevedo-design/flightlog.git
git push -u origin main
```

> ⚠️ Confirme que existe um `.gitignore` ignorando `node_modules/`, `dist/`,
> `.env`, `venv/`, `__pycache__/`, `*.db`. Os `.env.example` PODEM ir; os `.env` reais NÃO.

---

## 1. Supabase (banco + auth)

1. Crie conta em **supabase.com** → **New project**.
   - Region: **South America (São Paulo)** (menor latência)
   - Database Password: gere uma forte e **guarde** (vai no `DATABASE_URL`)
2. Espere provisionar (~2 min).
3. **Settings → API** — copie:
   - **Project URL** → `SUPABASE_URL` e `VITE_SUPABASE_URL`
   - **anon public** → `SUPABASE_ANON_KEY` e `VITE_SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ secreta, só no backend)
4. **Settings → API → JWT Settings** — copie o **JWT Secret** → `SUPABASE_JWT_SECRET`.
   > Se o painel só mostrar "signing keys" assimétricas e nenhum "JWT Secret" (HS256),
   > **me avise** — troco a validação do `auth.py` para JWKS (é rápido).
5. **Settings → Database → Connection string → URI** — copie e troque `[YOUR-PASSWORD]`
   pela senha do passo 1 → `DATABASE_URL`. (Use a opção **Session pooler** se aparecer.)
6. **Authentication → Providers → Email**: deixe **Email** habilitado.
   - "Confirm email": pode deixar ligado (segurança extra). No plano free o envio de
     email é limitado (~3-4/hora) e pode cair no spam — se atrapalhar, desligue (a
     aprovação do admin já é o portão principal).
7. **Authentication → URL Configuration** (faça depois de ter a URL da Vercel):
   - **Site URL**: `https://SEU-APP.vercel.app`
   - **Redirect URLs**: adicione `https://SEU-APP.vercel.app/reset-password`

> Não precisa criar tabelas à mão: o backend roda `create_all` no boot e cria
> `profiles`, `aircraft`, `flights`, `airports` sozinho no Postgres do Supabase.

---

## 2. Render (backend FastAPI)

Opção A — **Blueprint** (usa o `render.yaml` já incluído):
1. Render → **New → Blueprint** → conecte o repo → ele lê o `render.yaml`.
2. Preencha as 6 variáveis (as do Supabase + `CORS_ORIGINS` — deixe a URL da Vercel
   pra depois, pode pôr um valor temporário).

Opção B — **manual** (New → Web Service):
- Root Directory: `flight-logbook/backend`
- Runtime: Python 3
- Build: `pip install -r requirements.txt`
- Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Instance: Free
- Env vars: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `CORS_ORIGINS`

Depois do deploy, anote a URL: `https://flightlog-api.onrender.com` → vai em `VITE_API_URL`.

> O tier free "dorme" após ~15 min ocioso → 1ª requisição demora ~30s. Normal.

---

## 3. Vercel (frontend React)

1. Vercel → **Add New → Project** → importe o repo.
2. Configure:
   - **Root Directory**: `flight-logbook/frontend`
   - Framework Preset: **Vite** (auto)
   - Build/Output: padrão (`npm run build` → `dist`)
3. **Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL` = a URL do Render
4. **Deploy**. Anote a URL: `https://SEU-APP.vercel.app`.

> O `vercel.json` (já incluído) redireciona todas as rotas pro `index.html` —
> sem ele, atualizar em `/logbook` ou o link de reset dariam 404.

---

## 4. Amarrar as pontas

1. **Render** → env `CORS_ORIGINS` = `https://SEU-APP.vercel.app` → **Manual Deploy / Redeploy**.
2. **Supabase** → Authentication → URL Configuration → preencha Site URL + Redirect URL
   (passo 1.7) com a URL real da Vercel.

---

## 5. Virar admin (bootstrap)

1. Abra `https://SEU-APP.vercel.app` → **Cadastre-se** com seu email
   (`davipurimazevedo@gmail.com`) → confirme o email (se ativado) → faça login.
2. Você verá **"Aguardando aprovação"** — normal (seu profile nasceu `pending`).
3. No Supabase → **SQL Editor** → rode:
   ```sql
   update profiles set role = 'admin', status = 'active'
   where email = 'davipurimazevedo@gmail.com';
   ```
4. Volte no app → **"Já fui aprovado"** → você entra como admin (link **Administração**
   aparece na sidebar). Daí você aprova os colegas por lá.

---

## 6. (Opcional) Preload de aeroportos
Os aeroportos entram sozinhos conforme você registra voos, mas dá pra pré-carregar
os principais do Brasil chamando uma vez (autenticado como admin, ou via curl):
`POST https://flightlog-api.onrender.com/airports/seed`

---

## ⚠️ Seus 82 voos atuais NÃO vão automaticamente pra nuvem
Seu logbook local (`backend/logbook.db`) fica na sua máquina. A nuvem começa vazia.
Para levar seu histórico, é preciso uma migração de dados (copiar os voos atribuindo
seu `owner_id`). Me avise quando chegar aqui que eu preparo o script de importação
apontando pro Postgres com seu ID de usuário.

---

## Checklist rápido
- [ ] Código no GitHub (com `.gitignore` correto)
- [ ] Supabase criado, 5 chaves + DATABASE_URL copiadas
- [ ] Render no ar, env preenchidas, URL anotada
- [ ] Vercel no ar, env preenchidas, URL anotada
- [ ] CORS_ORIGINS (Render) + Site/Redirect URL (Supabase) com a URL da Vercel
- [ ] Cadastro feito + SQL de admin rodado + login como admin OK
- [ ] (Opcional) `/airports/seed` chamado
- [ ] (Depois) migrar os 82 voos existentes
