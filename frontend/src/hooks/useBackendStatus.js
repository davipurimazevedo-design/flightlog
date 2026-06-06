import { useState, useEffect } from 'react'

const HEALTH_URL = 'http://127.0.0.1:8000/health'
const INTERVAL_MS = 10_000   // verifica a cada 10 segundos
const TIMEOUT_MS  = 2_000    // considera offline se não responder em 2s

/**
 * Retorna o status atual do backend:
 *   'checking'  — verificação inicial ou em andamento
 *   'online'    — /health respondeu 200
 *   'offline'   — sem resposta ou erro
 */
export function useBackendStatus() {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let timer = null
    let cancelled = false

    async function check() {
      try {
        const controller = new AbortController()
        const id = setTimeout(() => controller.abort(), TIMEOUT_MS)
        const res = await fetch(HEALTH_URL, { signal: controller.signal })
        clearTimeout(id)
        if (!cancelled) setStatus(res.ok ? 'online' : 'offline')
      } catch {
        if (!cancelled) setStatus('offline')
      } finally {
        if (!cancelled) timer = setTimeout(check, INTERVAL_MS)
      }
    }

    check()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [])

  return status
}
