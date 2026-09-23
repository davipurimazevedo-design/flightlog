# Backlog — FlightLog Brasil

Ideias e dívidas que saíram de conversas mas ainda não viraram código.
Antes, isso vivia só no histórico do chat — que some. Aqui fica.

Quando um item for feito, tire daqui e (se valer) registre no `CHANGELOG` do commit.

---

## Retrospectiva

- [ ] **Comparar com o ano anterior** — "+38h e +12 voos que em 2025" no vídeo e no card.
  Precisa de backend: hoje `/flights/timeline` e `/flights/detailed-stats` recebem um
  período só. Ou o front pede dois períodos, ou a rota passa a devolver o anterior junto.
- [ ] **Retrospectiva por aeronave** — "PR-XXX: 42h em 18 voos". Dá para derivar da própria
  timeline, que já traz `aircraft` em cada voo; falta desenhar a tela.
- [ ] **Áudio/música no vídeo** — o item mais caro da lista. O caminho WebCodecs exige muxar
  uma trilha AAC junto do H.264, e trilha própria tem questão de direitos autorais.
  Só encarar se o vídeo virar algo central.

## Performance

- [ ] **`GROUP BY` nas estatísticas** — `/flights/stats` e `/flights/detailed-stats` carregam
  os voos e agregam em Python. Funciona bem na escala de hoje; com alguns milhares de voos
  por piloto vale empurrar a soma para o banco.
  Cuidado de dialeto já conhecido: no Postgres `SUM(EXTRACT(epoch ...))` devolve `Decimal`,
  e `Decimal + float` estoura — ver `_seconds_to_hours()` em `backend/routers/flights.py`.

## Observabilidade

- [ ] **Ligar o repositório do GitHub ao Sentry** — hoje o stack trace chega sem link para o
  código. Com a integração, cada linha vira link para o arquivo no commit certo.

## Marca

- [ ] **Variações da logo** — versões monocromática, horizontal e favicon dedicado.
  As atuais estão em `frontend/src/assets/`.

---

## Feito (para não reabrir por engano)

- Sentry + UptimeRobot em produção (v2.9.x)
- Lote de UX/branding: "Brasil" com B maiúsculo, saudação pelo nome, IFR padrão,
  linha de média no gráfico de horas (v2.10.0)
- Retrospectiva animada, card PNG e vídeo MP4 9:16 (v2.11.0 → v2.12.x)
- CORS nas respostas de erro 500/429 e suíte rodando também no Postgres no CI
- "Voltas ao mundo" no card e no vídeo (v2.13.0)
