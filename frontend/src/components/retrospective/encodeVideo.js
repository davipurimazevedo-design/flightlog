// Geração do MP4 da retrospectiva.
//
// Dois caminhos, escolhidos por capacidade do aparelho:
//  1. WebCodecs (VideoEncoder) + mp4-muxer — principal. Codifica quadro a quadro, mais
//     rápido que tempo real e SEMPRE em MP4/H.264. Chrome 94+, Safari iOS 16.4+.
//  2. MediaRecorder — reserva. No iPhone (iOS 14.5+) o Safari grava MP4 nativamente;
//     é o que cobre quem está abaixo do iOS 16.4.
// Se nenhum servir, devolvemos null e a tela esconde o botão de vídeo (o card PNG
// continua valendo) — melhor do que entregar um WebM que o Instagram recusa.
import { W, H, DURATION, drawFrame } from './videoRenderer'

const FPS = 30
const BITRATE = 5_000_000        // ~12 MB em 20s: cabe no limite do WhatsApp
const AVC = 'avc1.42001f'        // H.264 baseline — o perfil mais compatível

const MP4_MIMES = [
  `video/mp4;codecs=${AVC}`,
  'video/mp4;codecs=avc1',
  'video/mp4',
]

/** 'webcodecs' | 'mediarecorder' | null */
export async function detectEncoder(width = W, height = H) {
  if (typeof VideoEncoder !== 'undefined') {
    try {
      const sup = await VideoEncoder.isConfigSupported({
        codec: AVC, width, height, bitrate: BITRATE, framerate: FPS,
      })
      if (sup?.supported) return 'webcodecs'
    } catch { /* cai para o próximo */ }
  }
  if (typeof MediaRecorder !== 'undefined') {
    if (MP4_MIMES.some(m => MediaRecorder.isTypeSupported(m))) return 'mediarecorder'
  }
  return null
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  // Os quadros são desenhados sempre em 1080x1920; se a saída for menor, escala.
  const scale = width / W
  if (scale !== 1) ctx.setTransform(scale, 0, 0, scale, 0, 0)
  return { canvas, ctx }
}

async function encodeWithWebCodecs({ scene, info, onProgress, width, height, signal }) {
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: FPS },
    fastStart: 'in-memory',
  })

  let encodeError = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encodeError = e },
  })
  encoder.configure({ codec: AVC, width, height, bitrate: BITRATE, framerate: FPS })

  const { canvas, ctx } = makeCanvas(width, height)
  const totalFrames = Math.round(DURATION * FPS)

  for (let i = 0; i < totalFrames; i++) {
    if (encodeError) throw encodeError
    if (signal?.aborted) throw new Error('cancelado')

    drawFrame(ctx, scene, info, i / FPS)
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round((i * 1e6) / FPS),
      duration: Math.round(1e6 / FPS),
    })
    // Keyframe a cada 2s: ajuda o player a buscar e alguns apps a gerar a miniatura.
    encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 })
    frame.close()

    // Não deixa a fila do encoder crescer sem limite e devolve o event loop
    // para a UI (barra de progresso) respirar.
    if (i % 5 === 0) {
      onProgress?.(i / totalFrames)
      while (encoder.encodeQueueSize > 20 && !encodeError) {
        await new Promise(r => setTimeout(r, 4))
      }
      await new Promise(r => setTimeout(r, 0))
    }
  }

  await encoder.flush()
  encoder.close()
  if (encodeError) throw encodeError
  muxer.finalize()
  onProgress?.(1)
  return new Blob([muxer.target.buffer], { type: 'video/mp4' })
}

async function encodeWithMediaRecorder({ scene, info, onProgress, width, height, signal }) {
  const mime = MP4_MIMES.find(m => MediaRecorder.isTypeSupported(m))
  if (!mime) throw new Error('sem suporte a MP4 no MediaRecorder')

  const { canvas, ctx } = makeCanvas(width, height)
  // Primeiro quadro antes de começar a gravar, para não sair um frame preto.
  drawFrame(ctx, scene, info, 0)

  const stream = canvas.captureStream(FPS)
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: BITRATE })
  const chunks = []
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }
  const stopped = new Promise((resolve) => { rec.onstop = resolve })
  rec.start()

  // Aqui a animação roda em TEMPO REAL — é o preço do fallback.
  await new Promise((resolve, reject) => {
    const t0 = performance.now()
    const tick = () => {
      if (signal?.aborted) return reject(new Error('cancelado'))
      const t = (performance.now() - t0) / 1000
      if (t >= DURATION) return resolve()
      drawFrame(ctx, scene, info, t)
      onProgress?.(t / DURATION)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  rec.stop()
  await stopped
  stream.getTracks().forEach(t => t.stop())
  onProgress?.(1)
  return new Blob(chunks, { type: 'video/mp4' })
}

/**
 * Gera o MP4. Devolve { blob, encoder } ou lança.
 * `size`: 'full' (1080x1920) ou 'small' (720x1280) para aparelhos fracos.
 */
export async function renderVideo({ scene, info, onProgress, size = 'full', signal }) {
  const width = size === 'small' ? 720 : W
  const height = size === 'small' ? 1280 : H

  const kind = await detectEncoder(width, height)
  if (!kind) throw new Error('Este navegador não consegue gerar MP4.')

  const args = { scene, info, onProgress, width, height, signal }
  const blob = kind === 'webcodecs'
    ? await encodeWithWebCodecs(args)
    : await encodeWithMediaRecorder(args)

  return { blob, encoder: kind }
}
