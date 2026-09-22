// Composição dos quadros do vídeo da retrospectiva (1080x1920, 9:16).
//
// Ideia central: NÃO gravar o mapa ao vivo. O MapLibre renderiza de forma assíncrona,
// então gravar em tempo real engasga no celular e não dá para controlar quadro a quadro.
// Em vez disso o mapa é renderizado UMA vez offscreen (ver mapScene) e daí em diante
// cada quadro é só desenho 2D — determinístico e barato.
import logoSrc from '../../assets/logo.png'
import { minutesToHHMM, fmtDateBR } from '../../lib/utils'
import { COLORS, FONT, loadImage, roundRect, easeOut } from './canvasKit'
import { renderMapSnapshot, drawRouteNetwork, drawOverlayPanel } from './mapScene'

export { waitVisible } from './mapScene'

// ── Layout do quadro ────────────────────────────────────────────────────────
// O Instagram desenha perfil/barra no topo e caixa de resposta embaixo: nada
// essencial nos ~250px de cada extremo.
export const W = 1080, H = 1920
const M = 60
const MAP = { x: 60, y: 590, w: 960, h: 810 }

// ── Storyboard (segundos) ───────────────────────────────────────────────────
export const T_COVER = 2      // capa
export const T_MAP_END = 12   // mapa desenhando as rotas
export const T_HL_END = 16    // destaques
export const DURATION = 20    // números finais até aqui

/** Renderiza o mapa offscreen no tamanho da área do vídeo e carrega a logo. */
export async function prepareScene({ flights }) {
  const scene = await renderMapSnapshot({
    flights, width: MAP.w, height: MAP.h, padding: 70,
  })
  const logo = await loadImage(logoSrc).catch(() => null)
  return { ...scene, logo }
}

// ── Desenho ─────────────────────────────────────────────────────────────────

function textCenter(ctx, text, y, { size, weight = 700, color = COLORS.WHITE }) {
  ctx.fillStyle = color
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText(text, W / 2, y)
}

function drawBrand(ctx, scene) {
  if (scene.logo) ctx.drawImage(scene.logo, M, 292, 76, 76)
  ctx.textAlign = 'left'
  ctx.fillStyle = COLORS.WHITE
  ctx.font = `700 42px ${FONT}`
  ctx.fillText('FlightLog', M + 96, 334)
  ctx.fillStyle = COLORS.AMBER
  ctx.font = `600 23px ${FONT}`
  ctx.fillText('Brasil', M + 96, 366)
}

function drawCounters(ctx, { voos, minutos, nm }) {
  const cells = [
    ['VOOS', String(voos)],
    ['HORAS', minutesToHHMM(minutos)],
    ['MILHAS', `${nm.toLocaleString('pt-BR')}`],
  ]
  const cw = (W - M * 2) / 3
  cells.forEach(([label, value], i) => {
    const cx = M + cw * i + cw / 2
    ctx.textAlign = 'center'
    ctx.fillStyle = COLORS.SLATE
    ctx.font = `600 24px ${FONT}`
    ctx.fillText(label, cx, 1478)
    ctx.fillStyle = COLORS.WHITE
    ctx.font = `700 62px ${FONT}`
    ctx.fillText(value, cx, 1546)
  })
}

/** Etiqueta da data, ancorada no canto superior direito do mapa. */
function drawDateChip(ctx, text) {
  ctx.font = `700 34px ${FONT}`
  const tw = ctx.measureText(text).width
  const pad = 22, h = 58
  const x = MAP.x + MAP.w - tw - pad * 2 - 24
  const y = MAP.y + 24
  ctx.fillStyle = 'rgba(10,22,40,0.85)'
  roundRect(ctx, x, y, tw + pad * 2, h, 16)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = COLORS.AMBER
  ctx.textAlign = 'left'
  ctx.fillText(text, x + pad, y + 41)
}

/**
 * Desenha o quadro do instante `t` (segundos).
 * info: { periodLabel, pilotName, totals, summary }
 */
export function drawFrame(ctx, scene, info, t) {
  ctx.fillStyle = COLORS.BG
  ctx.fillRect(0, 0, W, H)

  // ── Capa ──
  if (t < T_COVER) {
    ctx.globalAlpha = easeOut(t / 0.6)
    if (scene.logo) ctx.drawImage(scene.logo, W / 2 - 70, 700, 140, 140)
    textCenter(ctx, 'FlightLog', 910, { size: 64 })
    textCenter(ctx, 'Brasil', 952, { size: 30, weight: 600, color: COLORS.AMBER })
    textCenter(ctx, 'RETROSPECTIVA', 1080, { size: 30, weight: 600, color: COLORS.SLATE })
    textCenter(ctx, info.periodLabel, 1180, { size: 96 })
    if (info.pilotName) {
      textCenter(ctx, info.pilotName, 1250, { size: 34, weight: 600, color: COLORS.SLATE })
    }
    ctx.globalAlpha = 1
    return
  }

  drawBrand(ctx, scene)
  ctx.textAlign = 'left'
  ctx.fillStyle = COLORS.SLATE
  ctx.font = `600 26px ${FONT}`
  ctx.fillText('RETROSPECTIVA', M, 452)
  ctx.fillStyle = COLORS.WHITE
  ctx.font = `700 88px ${FONT}`
  ctx.fillText(info.periodLabel, M, 540)

  // ── Mapa: revela durante o trecho, depois fica cheio ──
  const mapT = Math.min(1, Math.max(0, (t - T_COVER) / (T_MAP_END - T_COVER)))
  drawRouteNetwork(ctx, scene, MAP, mapT)

  const total = scene.segments.length
  const shown = Math.min(total, Math.max(0, Math.round(mapT * total)))
  const parciais = scene.segments.slice(0, shown)
  const acumulado = {
    voos: parciais.length,
    minutos: parciais.reduce((s, x) => s + x.minutes, 0),
    nm: parciais.reduce((s, x) => s + x.nm, 0),
  }

  // Data corrente: etiqueta dentro do mapa, sem ocupar uma linha inteira
  if (t < T_MAP_END && shown > 0) {
    drawDateChip(ctx, fmtDateBR(parciais[parciais.length - 1].date))
  }

  drawCounters(ctx, t < T_MAP_END ? acumulado : info.totals)

  // ── Painel sobreposto ao mapa (não deixa metade do quadro vazia) ──
  if (t >= T_MAP_END && t < T_HL_END) {
    const linhas = []
    if (info.summary.longest_flight) {
      linhas.push(['VOO MAIS LONGO', info.summary.longest_flight.route])
    }
    if (info.summary.top_route) {
      linhas.push(['ROTA MAIS FREQUENTE',
        `${info.summary.top_route.route} · ${info.summary.top_route.count}x`])
    }
    drawOverlayPanel(ctx, linhas, MAP, easeOut((t - T_MAP_END) / 0.5))
  } else if (t >= T_HL_END) {
    drawOverlayPanel(ctx, [['AEROPORTOS VISITADOS', String(info.totals.aeroportos)]],
      MAP, easeOut((t - T_HL_END) / 0.5))
  }

  // Rodapé discreto, presente o tempo todo
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(148,163,184,0.7)'
  ctx.font = `400 26px ${FONT}`
  ctx.fillText('flightlogbrasil.vercel.app', W / 2, 1640)
}
