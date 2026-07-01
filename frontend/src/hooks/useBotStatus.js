import { useState, useEffect } from 'react'

const INTERVAL_MS = 10_000  // verifica a cada 10 segundos

const isElectron = typeof window !== 'undefined' && !!window.flightlog?.isElectron

/**
 * Retorna o status atual do Telegram Bot (apenas no app desktop):
 *   'starting'    — processo iniciando, ainda conectando ao Telegram
 *   'running'     — bot online e fazendo polling
 *   'stopped'     — processo encerrado
 *   'unavailable' — não foi possível iniciar (sem Python, .env ou script)
 *   'unknown'     — fora do Electron / não foi possível consultar
 */
export function useBotStatus() {
  const [status, setStatus] = useState(isElectron ? 'starting' : 'unknown')

  useEffect(() => {
    if (!isElectron) return
    let timer = null
    let cancelled = false

    async function check() {
      try {
        const s = await window.flightlog.getBotStatus()
        if (!cancelled && s) setStatus(s)
      } catch {
        if (!cancelled) setStatus('unknown')
      } finally {
        if (!cancelled) timer = setTimeout(check, INTERVAL_MS)
      }
    }

    check()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [])

  return status
}
