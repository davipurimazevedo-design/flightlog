// Card PNG da retrospectiva, desenhado num <canvas> 2D.
//
// O mapa é renderizado offscreen no tamanho exato do card (ver mapScene): antes
// usávamos uma foto do mapa da tela, e num iPhone (tela estreita) o recorte para a
// faixa larga do card cortava as rotas.
import logoSrc from '../../assets/logo.png'
import { minutesToHHMM } from '../../lib/utils'
import { COLORS, FONT, loadImage, roundRect } from './canvasKit'
import { renderMapSnapshot, drawRouteNetwork } from './mapScene'

const W = 1080, H = 1350          // retrato 4:5 — o mais alto que o Instagram aceita no feed
const M = 72

// Retângulo do mapa: o snapshot é renderizado exatamente neste tamanho.
const MAP = { x: M, y: 404, w: W - M * 2, h: 500 }

/**
 * Monta o card e devolve um Blob PNG.
 * stats: { voos, minutos, nm, aeroportos, longest, topRoute }
 * flights: a timeline do período (o card renderiza o mapa no tamanho dele)
 * scene:   opcional — cena de mapa já renderizada, para reaproveitar/testar
 */
export async function buildRetroCard({ periodLabel, pilotName, stats, flights, scene }) {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')

  ctx.fillStyle = COLORS.BG
  ctx.fillRect(0, 0, W, H)

  // ── Cabeçalho: logo + marca ────────────────────────────────────────────────
  try {
    const logo = await loadImage(logoSrc)
    ctx.drawImage(logo, M, 64, 76, 76)
  } catch { /* sem logo o card continua válido */ }
  ctx.textAlign = 'left'
  ctx.fillStyle = COLORS.WHITE
  ctx.font = `700 40px ${FONT}`
  ctx.fillText('FlightLog', M + 96, 100)
  ctx.fillStyle = COLORS.AMBER
  ctx.font = `600 22px ${FONT}`
  ctx.fillText('Brasil', M + 96, 130)

  // ── Título ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = COLORS.SLATE
  ctx.font = `600 30px ${FONT}`
  ctx.fillText('RETROSPECTIVA', M, 232)
  ctx.fillStyle = COLORS.WHITE
  ctx.font = `700 92px ${FONT}`
  ctx.fillText(periodLabel, M, 326)
  // Nome do piloto fica aqui em cima: no rodapé colidia com os destaques.
  if (pilotName) {
    ctx.fillStyle = COLORS.SLATE
    ctx.font = `600 28px ${FONT}`
    ctx.fillText(pilotName, M, 372)
  }

  // ── Mapa com a malha do período ────────────────────────────────────────────
  const mapa = scene || (flights?.length
    ? await renderMapSnapshot({ flights, width: MAP.w, height: MAP.h, padding: 56 })
    : null)
  if (mapa) {
    drawRouteNetwork(ctx, mapa, MAP, 1)
  } else {
    ctx.fillStyle = COLORS.CARD
    roundRect(ctx, MAP.x, MAP.y, MAP.w, MAP.h, 28)
    ctx.fill()
  }

  // ── Destaques: uma linha cada, para não roubar área do mapa ────────────────
  const destaques = []
  if (stats.longest) destaques.push(['VOO MAIS LONGO', stats.longest])
  if (stats.topRoute) destaques.push(['ROTA MAIS FREQUENTE', stats.topRoute])
  destaques.forEach(([label, value], i) => {
    const y = 956 + i * 48
    ctx.textAlign = 'left'
    ctx.fillStyle = COLORS.SLATE
    ctx.font = `600 20px ${FONT}`
    ctx.fillText(label, M, y)
    ctx.textAlign = 'right'
    ctx.fillStyle = COLORS.BLUE
    ctx.font = `700 30px ${FONT}`
    ctx.fillText(value, W - M, y)
  })

  // ── Números principais (2x2) ───────────────────────────────────────────────
  const cells = [
    ['VOOS', String(stats.voos)],
    ['HORAS VOADAS', minutesToHHMM(stats.minutos)],
    ['MILHAS NÁUTICAS', `${stats.nm.toLocaleString('pt-BR')} NM`],
    ['AEROPORTOS', String(stats.aeroportos)],
  ]
  const gridY = 1044
  const cellW = (W - M * 2 - 24) / 2
  const cellH = 110
  ctx.textAlign = 'left'
  cells.forEach(([label, value], i) => {
    const x = M + (i % 2) * (cellW + 24)
    const y = gridY + Math.floor(i / 2) * (cellH + 16)
    ctx.fillStyle = COLORS.CARD
    roundRect(ctx, x, y, cellW, cellH, 20)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = COLORS.SLATE
    ctx.font = `600 21px ${FONT}`
    ctx.fillText(label, x + 26, y + 42)
    ctx.fillStyle = COLORS.WHITE
    ctx.font = `700 50px ${FONT}`
    ctx.fillText(value, x + 26, y + 94)
  })

  // ── Rodapé ─────────────────────────────────────────────────────────────────
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(148,163,184,0.7)'
  ctx.font = `400 22px ${FONT}`
  ctx.fillText('flightlogbrasil.vercel.app', W - M, 1322)

  return new Promise((resolve) => c.toBlob(resolve, 'image/png'))
}

export { downloadBlob } from './canvasKit'
