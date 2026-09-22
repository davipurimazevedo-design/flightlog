// Card PNG da retrospectiva, desenhado num <canvas> 2D.
// Zero dependência nova: html2canvas não captura o canvas WebGL do MapLibre de forma
// confiável, então a imagem do mapa entra via map.getCanvas().toDataURL() e o resto
// é desenhado à mão, na paleta do app.
import logoSrc from '../../assets/logo.png'
import { minutesToHHMM } from '../../lib/utils'

const W = 1080, H = 1350          // retrato 4:5 — bom para WhatsApp/Instagram
const BG = '#0a1628'
const CARD = '#0c1f3d'
const BLUE = '#3b82f6'
const AMBER = '#fbbf24'
const SLATE = '#94a3b8'

const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = reject
  img.src = src
})

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Desenha a imagem cobrindo o retângulo (object-fit: cover), com corte central.
 *  `zoom` > 1 aperta o recorte: as rotas ficam centradas pelo fitBounds, então
 *  aproximar do centro corta a sobra de oceano/borda sem perder conteúdo. */
function drawCover(ctx, img, x, y, w, h, zoom = 1) {
  const scale = Math.max(w / img.width, h / img.height) * zoom
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

/**
 * Monta o card e devolve um Blob PNG.
 * stats: { voos, minutos, nm, aeroportos, aeronaves, longest, topRoute }
 */
export async function buildRetroCard({ periodLabel, pilotName, stats, mapShot }) {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)

  const M = 72   // margem

  // ── Cabeçalho: logo + marca ────────────────────────────────────────────────
  try {
    const logo = await loadImage(logoSrc)
    ctx.drawImage(logo, M, 64, 76, 76)
  } catch {
    // sem logo o card continua válido
  }
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 40px ${FONT}`
  ctx.textAlign = 'left'
  ctx.fillText('FlightLog', M + 96, 100)
  ctx.fillStyle = AMBER
  ctx.font = `600 22px ${FONT}`
  ctx.fillText('Brasil', M + 96, 130)

  // ── Título ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = SLATE
  ctx.font = `600 30px ${FONT}`
  ctx.fillText('RETROSPECTIVA', M, 232)
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 92px ${FONT}`
  ctx.fillText(periodLabel, M, 326)

  // ── Mapa ───────────────────────────────────────────────────────────────────
  const mapY = 372, mapH = 420
  ctx.save()
  roundRect(ctx, M, mapY, W - M * 2, mapH, 28)
  ctx.clip()
  ctx.fillStyle = CARD
  ctx.fillRect(M, mapY, W - M * 2, mapH)
  if (mapShot) {
    try {
      const img = await loadImage(mapShot)
      drawCover(ctx, img, M, mapY, W - M * 2, mapH, 1.35)   // recorte mais fechado
    } catch {
      // segue sem a imagem do mapa
    }
  }
  ctx.restore()
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 2
  roundRect(ctx, M, mapY, W - M * 2, mapH, 28)
  ctx.stroke()

  // ── Números principais (2x2) ───────────────────────────────────────────────
  const cells = [
    ['VOOS', String(stats.voos)],
    ['HORAS VOADAS', minutesToHHMM(stats.minutos)],
    ['MILHAS NÁUTICAS', `${stats.nm.toLocaleString('pt-BR')} NM`],
    ['AEROPORTOS', String(stats.aeroportos)],
  ]
  const gridY = mapY + mapH + 48
  const cellW = (W - M * 2 - 24) / 2
  const cellH = 132
  cells.forEach(([label, value], i) => {
    const x = M + (i % 2) * (cellW + 24)
    const y = gridY + Math.floor(i / 2) * (cellH + 20)
    ctx.fillStyle = CARD
    roundRect(ctx, x, y, cellW, cellH, 20)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = SLATE
    ctx.font = `600 21px ${FONT}`
    ctx.fillText(label, x + 28, y + 46)
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 52px ${FONT}`
    ctx.fillText(value, x + 28, y + 106)
  })

  // ── Destaques ──────────────────────────────────────────────────────────────
  let hy = gridY + cellH * 2 + 20 + 62
  const linha = (label, valor) => {
    if (!valor) return
    ctx.fillStyle = SLATE
    ctx.font = `600 22px ${FONT}`
    ctx.fillText(label, M, hy)
    ctx.fillStyle = BLUE
    ctx.font = `700 34px ${FONT}`
    ctx.fillText(valor, M, hy + 42)
    hy += 92
  }
  linha('VOO MAIS LONGO', stats.longest)
  linha('ROTA MAIS FREQUENTE', stats.topRoute)

  // ── Rodapé ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = SLATE
  ctx.font = `600 24px ${FONT}`
  ctx.textAlign = 'left'
  if (pilotName) ctx.fillText(pilotName, M, H - 64)
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(148,163,184,0.7)'
  ctx.font = `400 22px ${FONT}`
  ctx.fillText('flightlogbrasil.vercel.app', W - M, H - 64)

  return new Promise((resolve) => c.toBlob(resolve, 'image/png'))
}

/** Dispara o download do blob (mesmo padrão usado no export de dados). */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
