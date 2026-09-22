// Composição dos quadros do vídeo da retrospectiva (1080x1920, 9:16).
//
// Ideia central: NÃO gravar o mapa ao vivo. O MapLibre renderiza de forma assíncrona,
// então gravar em tempo real engasga no celular e não dá para controlar quadro a quadro.
// Em vez disso: renderiza o mapa UMA vez num mapa offscreen, captura o basemap e
// converte as coordenadas dos aeroportos em PIXELS (map.project). Daí em diante cada
// quadro é só desenho 2D — determinístico e barato.
import MapLibreGL from 'maplibre-gl'
import logoSrc from '../../assets/logo.png'
import { minutesToHHMM, fmtDateBR } from '../../lib/utils'
import { COLORS, FONT, loadImage, roundRect, easeOut } from './canvasKit'

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

// ── Layout do quadro ────────────────────────────────────────────────────────
// O Instagram desenha perfil/barra no topo e caixa de resposta embaixo: nada
// essencial nos ~250px de cada extremo.
export const W = 1080, H = 1920
const M = 60
const MAP_X = 60, MAP_Y = 590, MAP_W = 960, MAP_H = 810

// ── Storyboard (segundos) ───────────────────────────────────────────────────
export const T_COVER = 2      // capa
export const T_MAP_END = 12   // mapa desenhando as rotas
export const T_HL_END = 16    // destaques
export const DURATION = 20    // números finais até aqui

const once = (map, ev, ms = 20000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout esperando "${ev}" do mapa`)), ms)
  map.once(ev, () => { clearTimeout(timer); resolve() })
})

/**
 * Renderiza o mapa offscreen no tamanho da área do vídeo, captura o basemap e
 * projeta os aeroportos em pixels. Devolve { basemap, logo, segments, points }.
 */
export async function prepareScene({ flights }) {
  const host = document.createElement('div')
  host.style.cssText =
    `position:fixed;left:-10000px;top:0;width:${MAP_W}px;height:${MAP_H}px;pointer-events:none;`
  document.body.appendChild(host)

  let map
  try {
    map = new MapLibreGL.Map({
      container: host,
      style: DARK_STYLE,
      center: [-47.9, -15.8],
      zoom: 3,
      interactive: false,
      attributionControl: false,
      // Sem isto o toDataURL volta preto (no MapLibre v5 a flag mora aqui).
      canvasContextAttributes: { preserveDrawingBuffer: true },
    })
    await once(map, 'load')

    // Enquadra todos os aeroportos do período
    let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90
    for (const f of flights) {
      for (const p of [f.origin, f.destination]) {
        minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng)
        minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat)
      }
    }
    try {
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]],
        { padding: 70, duration: 0, maxZoom: 7 })
    } catch { /* um aeroporto só: mantém centro/zoom padrão */ }
    await once(map, 'idle')

    const basemap = await loadImage(map.getCanvas().toDataURL('image/png'))

    // project() devolve pixels CSS do canvas — as mesmas unidades da área do mapa.
    const points = {}
    const put = (p) => {
      if (points[p.icao]) return
      const { x, y } = map.project([p.lng, p.lat])
      points[p.icao] = { x, y }
    }
    for (const f of flights) { put(f.origin); put(f.destination) }

    const segments = flights.map(f => ({
      from: points[f.origin.icao],
      to: points[f.destination.icao],
      local: f.origin.icao === f.destination.icao,
      date: f.date,
      minutes: f.minutes || 0,
      nm: f.nm || 0,
      origin: f.origin.icao,
      destination: f.destination.icao,
    }))

    const logo = await loadImage(logoSrc).catch(() => null)
    return { basemap, logo, points, segments }
  } finally {
    try { map?.remove() } catch { /* ignora */ }
    host.remove()
  }
}

// ── Desenho ─────────────────────────────────────────────────────────────────

function textCenter(ctx, text, y, { size, weight = 700, color = COLORS.WHITE }) {
  ctx.fillStyle = color
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText(text, W / 2, y)
}

function drawBrand(ctx, scene, alpha = 1) {
  ctx.globalAlpha = alpha
  if (scene.logo) ctx.drawImage(scene.logo, M, 292, 76, 76)
  ctx.textAlign = 'left'
  ctx.fillStyle = COLORS.WHITE
  ctx.font = `700 42px ${FONT}`
  ctx.fillText('FlightLog', M + 96, 334)
  ctx.fillStyle = COLORS.AMBER
  ctx.font = `600 23px ${FONT}`
  ctx.fillText('Brasil', M + 96, 366)
  ctx.globalAlpha = 1
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

/** Desenha o mapa com as rotas reveladas até `progress` (0..1). */
function drawMap(ctx, scene, progress) {
  ctx.save()
  roundRect(ctx, MAP_X, MAP_Y, MAP_W, MAP_H, 28)
  ctx.clip()
  ctx.fillStyle = COLORS.CARD
  ctx.fillRect(MAP_X, MAP_Y, MAP_W, MAP_H)
  ctx.drawImage(scene.basemap, MAP_X, MAP_Y, MAP_W, MAP_H)

  const total = scene.segments.length
  const exact = progress * total
  const done = Math.floor(exact)
  const partial = exact - done

  ctx.lineCap = 'round'
  ctx.strokeStyle = COLORS.BLUE
  ctx.lineWidth = 2.5
  ctx.globalAlpha = 0.9

  const seg = (s, frac) => {
    if (s.local || !s.from || !s.to) return
    const x1 = MAP_X + s.from.x, y1 = MAP_Y + s.from.y
    const x2 = MAP_X + s.to.x,   y2 = MAP_Y + s.to.y
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x1 + (x2 - x1) * frac, y1 + (y2 - y1) * frac)
    ctx.stroke()
  }
  for (let i = 0; i < done && i < total; i++) seg(scene.segments[i], 1)
  if (done < total) seg(scene.segments[done], easeOut(partial))

  // Pontos dos aeroportos já visitados
  ctx.globalAlpha = 1
  ctx.fillStyle = '#fcd34d'
  const vistos = new Set()
  for (let i = 0; i <= Math.min(done, total - 1); i++) {
    const s = scene.segments[i]
    vistos.add(s.origin); vistos.add(s.destination)
  }
  for (const icao of vistos) {
    const p = scene.points[icao]
    if (!p) continue
    ctx.beginPath()
    ctx.arc(MAP_X + p.x, MAP_Y + p.y, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 2
  roundRect(ctx, MAP_X, MAP_Y, MAP_W, MAP_H, 28)
  ctx.stroke()
}

/** Etiqueta da data, ancorada no canto superior direito do mapa. */
function drawDateChip(ctx, text) {
  ctx.font = `700 34px ${FONT}`
  const tw = ctx.measureText(text).width
  const pad = 22, h = 58
  const x = MAP_X + MAP_W - tw - pad * 2 - 24
  const y = MAP_Y + 24
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

/** Painel translúcido sobre a parte de baixo do mapa. */
function drawOverlayPanel(ctx, linhas, alpha) {
  const x = MAP_X + 40, w = MAP_W - 80
  const h = 40 + linhas.length * 120
  const y = MAP_Y + MAP_H - h - 36
  ctx.globalAlpha = alpha
  ctx.fillStyle = 'rgba(12,31,61,0.92)'
  roundRect(ctx, x, y, w, h, 24)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 2
  ctx.stroke()
  linhas.forEach(([label, value], i) => {
    const ly = y + 52 + i * 120
    ctx.textAlign = 'center'
    ctx.fillStyle = COLORS.SLATE
    ctx.font = `600 24px ${FONT}`
    ctx.fillText(label, W / 2, ly)
    ctx.fillStyle = COLORS.BLUE
    ctx.font = `700 44px ${FONT}`
    ctx.fillText(value, W / 2, ly + 56)
  })
  ctx.globalAlpha = 1
}

/**
 * Desenha o quadro do instante `t` (segundos).
 * info: { periodLabel, pilotName, totals, summary, segments }
 */
export function drawFrame(ctx, scene, info, t) {
  ctx.fillStyle = COLORS.BG
  ctx.fillRect(0, 0, W, H)

  // ── Capa ──
  if (t < T_COVER) {
    const a = easeOut(t / 0.6)
    ctx.globalAlpha = a
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

  // ── Mapa: progresso durante o trecho, depois fica cheio ──
  const mapT = Math.min(1, Math.max(0, (t - T_COVER) / (T_MAP_END - T_COVER)))
  drawMap(ctx, scene, mapT)

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
    if (linhas.length) drawOverlayPanel(ctx, linhas, easeOut((t - T_MAP_END) / 0.5))
  } else if (t >= T_HL_END) {
    drawOverlayPanel(ctx, [
      ['AEROPORTOS VISITADOS', String(info.totals.aeroportos)],
    ], easeOut((t - T_HL_END) / 0.5))
  }

  // Rodapé discreto, presente o tempo todo
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(148,163,184,0.7)'
  ctx.font = `400 26px ${FONT}`
  ctx.fillText('flightlogbrasil.vercel.app', W / 2, 1640)
}
