// Geração do MP4 da retrospectiva.
//
// Dois codificadores, com queda automática entre eles:
//  1. WebCodecs (VideoEncoder) + mp4-muxer — codifica quadro a quadro, mais rápido que
//     tempo real e sempre MP4/H.264.
//  2. MediaRecorder — no iPhone o Safari grava MP4 nativamente (iOS 14.5+) e é o
//     caminho mais confiável lá.
//
// Lição aprendida em produção: no iPhone o WebCodecs aceitava a configuração no
// isConfigSupported() e SÓ ENTÃO estourava "Encoding task failed" no meio da
// codificação. Por isso agora fazemos um teste real de 2 quadros antes de commitar,
// e qualquer falha cai para o próximo candidato em vez de derrubar tudo.
import { W, H, DURATION, drawFrame, waitVisible } from './videoRenderer'

const FPS = 30
const BITRATE = 5_000_000        // ~12 MB em 20s: cabe no limite do WhatsApp

// Candidatos de codec, do mais capaz para o mais compatível. O NÍVEL importa:
// 42001f = Baseline 3.1, que oficialmente só vai até 1280x720 — para 1080x1920
// é preciso nível 4.0 (…0028). O Chrome tolera o nível errado; o Safari não.
const CODECS = [
  'avc1.640028',   // High 4.0
  'avc1.4d0028',   // Main 4.0
  'avc1.420028',   // Baseline 4.0
  'avc1.42001f',   // Baseline 3.1 — serve para 720x1280
]

const MP4_MIMES = [
  'video/mp4;codecs=avc1.420028',
  'video/mp4;codecs=avc1',
  'video/mp4',
]

const hasWebCodecs = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
const hasMediaRecorderMp4 = () =>
  typeof MediaRecorder !== 'undefined' && MP4_MIMES.some(m => MediaRecorder.isTypeSupported(m))

/** Só para decidir se mostramos o botão de vídeo. */
export async function detectEncoder() {
  if (hasWebCodecs() || hasMediaRecorderMp4()) return true
  return false
}

async function pickCodec(width, height) {
  for (const codec of CODECS) {
    try {
      const sup = await VideoEncoder.isConfigSupported({
        codec, width, height, bitrate: BITRATE, framerate: FPS,
      })
      if (sup?.supported) return codec
    } catch { /* tenta o próximo */ }
  }
  return null
}

/**
 * Teste real: configura o encoder e manda 2 quadros. O isConfigSupported() do Safari
 * aprova configurações que depois falham, então só confiamos no que de fato encodou.
 */
async function probeWebCodecs(config) {
  let failed = false
  let encoder
  try {
    encoder = new VideoEncoder({ output: () => {}, error: () => { failed = true } })
    encoder.configure(config)
    const canvas = document.createElement('canvas')
    canvas.width = config.width
    canvas.height = config.height
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#0a1628'
    ctx.fillRect(0, 0, config.width, config.height)
    for (let i = 0; i < 2; i++) {
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1e6) / FPS),
        duration: Math.round(1e6 / FPS),
      })
      encoder.encode(frame, { keyFrame: i === 0 })
      frame.close()
    }
    await encoder.flush()
    return !failed
  } catch {
    return false
  } finally {
    try { encoder?.close() } catch { /* ignora */ }
  }
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

async function encodeWithWebCodecs({ scene, info, onProgress, width, height, codec, signal }) {
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
  encoder.configure({ codec, width, height, bitrate: BITRATE, framerate: FPS })

  const { canvas, ctx } = makeCanvas(width, height)
  const totalFrames = Math.round(DURATION * FPS)

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (encodeError) throw encodeError
      if (signal?.aborted) throw new Error('cancelado')

      drawFrame(ctx, scene, info, i / FPS)
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1e6) / FPS),
        duration: Math.round(1e6 / FPS),
      })
      encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 })
      frame.close()

      if (i % 5 === 0) {
        onProgress?.(i / totalFrames)
        while (encoder.encodeQueueSize > 20 && !encodeError) {
          await new Promise(r => setTimeout(r, 4))
        }
        await new Promise(r => setTimeout(r, 0))
      }
    }
    await encoder.flush()
    if (encodeError) throw encodeError
  } finally {
    try { encoder.state !== 'closed' && encoder.close() } catch { /* ignora */ }
  }

  muxer.finalize()
  onProgress?.(1)
  return new Blob([muxer.target.buffer], { type: 'video/mp4' })
}

async function encodeWithMediaRecorder({ scene, info, onProgress, width, height, signal }) {
  const mime = MP4_MIMES.find(m => MediaRecorder.isTypeSupported(m))
  if (!mime) throw new Error('MediaRecorder sem suporte a MP4')

  // A gravação é em tempo real e depende de requestAnimationFrame, que o navegador
  // pausa em aba oculta (tela bloqueada). Espera voltar em vez de gravar nada.
  await waitVisible()

  const { canvas, ctx } = makeCanvas(width, height)
  drawFrame(ctx, scene, info, 0)   // evita um primeiro quadro preto

  const stream = canvas.captureStream(FPS)
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: BITRATE })
  const chunks = []
  let recError = null
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }
  rec.onerror = (e) => { recError = e?.error || new Error('falha na gravação') }
  const stopped = new Promise((resolve) => { rec.onstop = resolve })
  rec.start()

  // Aqui a animação roda em TEMPO REAL — é o preço do fallback.
  await new Promise((resolve, reject) => {
    const t0 = performance.now()
    // Cão de guarda: se o rAF parar (app foi para segundo plano no meio), falha com
    // mensagem em vez de deixar a barra de progresso parada para sempre.
    const watchdog = setTimeout(
      () => reject(new Error('a gravação travou — mantenha o app aberto na tela')),
      (DURATION + 20) * 1000,
    )
    const fim = (fn, arg) => { clearTimeout(watchdog); fn(arg) }
    const tick = () => {
      if (recError) return fim(reject, recError)
      if (signal?.aborted) return fim(reject, new Error('cancelado'))
      const t = (performance.now() - t0) / 1000
      if (t >= DURATION) return fim(resolve)
      drawFrame(ctx, scene, info, t)
      onProgress?.(t / DURATION)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  rec.stop()
  await stopped
  stream.getTracks().forEach(t => t.stop())
  if (recError) throw recError
  if (!chunks.length) throw new Error('gravação vazia')
  onProgress?.(1)
  return new Blob(chunks, { type: 'video/mp4' })
}

/**
 * Gera o MP4 tentando, em ordem: WebCodecs 1080 → MediaRecorder 1080 →
 * MediaRecorder 720. Devolve { blob, encoder, width, height }.
 */
export async function renderVideo({ scene, info, onProgress, signal, onStage }) {
  const tentativas = []

  if (hasWebCodecs()) {
    const codec = await pickCodec(W, H)
    if (codec) tentativas.push({ kind: 'webcodecs', width: W, height: H, codec })
  }
  if (hasMediaRecorderMp4()) {
    tentativas.push({ kind: 'mediarecorder', width: W, height: H })
    tentativas.push({ kind: 'mediarecorder', width: 720, height: 1280 })
  }
  if (hasWebCodecs()) {
    const codec720 = await pickCodec(720, 1280)
    if (codec720) tentativas.push({ kind: 'webcodecs', width: 720, height: 1280, codec: codec720 })
  }

  if (!tentativas.length) {
    throw new Error('Este navegador não consegue gerar MP4. Use o card PNG.')
  }

  let ultimoErro = null
  for (const t of tentativas) {
    try {
      onStage?.(t.kind)
      if (t.kind === 'webcodecs') {
        // Teste real antes de gastar 20s: o Safari aprova e depois falha.
        const ok = await probeWebCodecs({
          codec: t.codec, width: t.width, height: t.height, bitrate: BITRATE, framerate: FPS,
        })
        if (!ok) throw new Error(`WebCodecs reprovado no teste (${t.codec})`)
        const blob = await encodeWithWebCodecs({ ...t, scene, info, onProgress, signal })
        return { blob, encoder: t.kind, width: t.width, height: t.height }
      }
      const blob = await encodeWithMediaRecorder({ ...t, scene, info, onProgress, signal })
      return { blob, encoder: t.kind, width: t.width, height: t.height }
    } catch (e) {
      if (signal?.aborted) throw e
      ultimoErro = e
      onProgress?.(0)
      // segue para o próximo candidato
    }
  }

  throw new Error(
    `Não consegui gerar o vídeo neste aparelho (${ultimoErro?.message || 'erro desconhecido'}). ` +
    'O card PNG continua disponível.',
  )
}
