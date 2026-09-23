// Helpers de desenho em canvas 2D compartilhados pelo card PNG e pelo vídeo.
// Ficavam privados no retroCard.js; subiram para cá quando o vídeo passou a
// precisar da mesma paleta, das mesmas fontes e do mesmo recorte de imagem.

export const COLORS = {
  BG:    '#0a1628',   // fundo da app
  CARD:  '#0c1f3d',   // superfície de card
  BLUE:  '#3b82f6',   // rotas / destaque
  AMBER: '#fbbf24',   // acento da marca "Brasil"
  SLATE: '#94a3b8',   // texto secundário
  WHITE: '#ffffff',
}

export const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export function roundRect(ctx, x, y, w, h, r) {
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
export function drawCover(ctx, img, x, y, w, h, zoom = 1) {
  const scale = Math.max(w / img.width, h / img.height) * zoom
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

/** Dispara o download do blob (anexa ao DOM antes do clique — necessário no Firefox). */
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

/** Milhas náuticas → quilômetros (1 NM = 1,852 km). */
export const nmToKm = (nm) => Math.round((nm || 0) * 1.852)

/** Interpolação suave usada nas transições entre trechos do vídeo. */
export const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)

/** Fade de entrada/saída de um trecho: devolve 0..1. */
export function fadeIn(t, dur = 0.4) {
  return easeOut(t / dur)
}
