// Mapa renderizado offscreen NO TAMANHO EXATO do destino + desenho da malha de rotas.
//
// Por que não reaproveitar a foto do mapa da tela: o enquadramento depende do tamanho
// do dispositivo. Num iPhone (tela estreita e alta) a foto recortada para uma faixa
// larga cortava as rotas — o usuário perdia a visão do ano inteiro. Renderizando aqui
// no tamanho final, o fitBounds garante que TUDO cabe, em qualquer aparelho.
import MapLibreGL from 'maplibre-gl'
import { COLORS, FONT, loadImage, roundRect, easeOut } from './canvasKit'

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

const once = (map, ev, ms = 25000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(
    'O mapa não carregou a tempo. Mantenha o app aberto na tela e tente de novo.',
  )), ms)
  map.once(ev, () => { clearTimeout(timer); resolve() })
})

/** Espera a aba voltar a ficar visível.
 *  O navegador suspende WebGL e requestAnimationFrame em aba oculta (tela bloqueada,
 *  app em segundo plano), e aí o mapa nunca dispara 'load'. Melhor esperar do que falhar. */
export function waitVisible(ms = 30000) {
  if (!document.hidden) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      document.removeEventListener('visibilitychange', onVis)
      clearTimeout(timer)
      resolve()
    }
    const onVis = () => { if (!document.hidden) done() }
    const timer = setTimeout(done, ms)
    document.addEventListener('visibilitychange', onVis)
  })
}

/**
 * Renderiza o basemap no tamanho pedido, enquadrando todos os aeroportos, e projeta
 * cada um em pixels dessa imagem.
 * Devolve { image, points, segments, width, height }.
 */
export async function renderMapSnapshot({ flights, width, height, padding = 60 }) {
  await waitVisible()

  const host = document.createElement('div')
  host.style.cssText =
    `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;pointer-events:none;`
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

    let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90
    for (const f of flights) {
      for (const p of [f.origin, f.destination]) {
        minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng)
        minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat)
      }
    }
    try {
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]],
        { padding, duration: 0, maxZoom: 7 })
    } catch { /* um aeroporto só: mantém centro/zoom padrão */ }
    await once(map, 'idle')

    const image = await loadImage(map.getCanvas().toDataURL('image/png'))

    // project() devolve pixels CSS — as mesmas unidades do retângulo de destino.
    const points = {}
    for (const f of flights) {
      for (const p of [f.origin, f.destination]) {
        if (points[p.icao]) continue
        const q = map.project([p.lng, p.lat])
        points[p.icao] = { x: q.x, y: q.y }
      }
    }

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

    return { image, points, segments, width, height }
  } finally {
    try { map?.remove() } catch { /* ignora */ }
    host.remove()
  }
}

/**
 * Desenha basemap + rotas + pontos dentro do retângulo, revelando até `progress` (0..1).
 * O retângulo normalmente tem o mesmo tamanho do snapshot; se não tiver, escalamos.
 */
export function drawRouteNetwork(ctx, scene, { x, y, w, h }, progress = 1) {
  const sx = w / scene.width
  const sy = h / scene.height

  ctx.save()
  roundRect(ctx, x, y, w, h, 28)
  ctx.clip()
  ctx.fillStyle = COLORS.CARD
  ctx.fillRect(x, y, w, h)
  ctx.drawImage(scene.image, x, y, w, h)

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
    const x1 = x + s.from.x * sx, y1 = y + s.from.y * sy
    const x2 = x + s.to.x * sx,   y2 = y + s.to.y * sy
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
    vistos.add(scene.segments[i].origin)
    vistos.add(scene.segments[i].destination)
  }
  for (const icao of vistos) {
    const p = scene.points[icao]
    if (!p) continue
    ctx.beginPath()
    ctx.arc(x + p.x * sx, y + p.y * sy, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 2
  roundRect(ctx, x, y, w, h, 28)
  ctx.stroke()
}

/** Painel translúcido ancorado na base do retângulo do mapa. */
export function drawOverlayPanel(ctx, linhas, rect, alpha = 1) {
  if (!linhas.length) return
  const x = rect.x + 36, w = rect.w - 72
  const h = 36 + linhas.length * 104
  const y = rect.y + rect.h - h - 30

  ctx.globalAlpha = alpha
  ctx.fillStyle = 'rgba(12,31,61,0.92)'
  roundRect(ctx, x, y, w, h, 22)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 2
  ctx.stroke()

  linhas.forEach(([label, value], i) => {
    const ly = y + 46 + i * 104
    ctx.textAlign = 'center'
    ctx.fillStyle = COLORS.SLATE
    ctx.font = `600 22px ${FONT}`
    ctx.fillText(label, rect.x + rect.w / 2, ly)
    ctx.fillStyle = COLORS.BLUE
    ctx.font = `700 40px ${FONT}`
    ctx.fillText(value, rect.x + rect.w / 2, ly + 48)
  })
  ctx.globalAlpha = 1
  ctx.textAlign = 'left'
}
