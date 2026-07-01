import { useState, useEffect, useRef } from 'react'
import { getPendingReview } from '../api'

const POLL_INTERVAL = 30_000 // 30 segundos

/**
 * Faz polling dos voos pendentes de revisão (registrados via Telegram).
 * Retorna a lista atual e funções para confirmar/dispensar.
 */
export function usePendingFlights() {
  const [pending, setPending] = useState([])
  // IDs já dispensados localmente — não devem reaparecer no próximo poll,
  // mesmo que o backend ainda os retorne (dispensar não marca como revisado).
  const dismissedIds = useRef(new Set())

  useEffect(() => {
    let cancelled = false
    let timer = null

    async function poll() {
      try {
        const flights = await getPendingReview()
        if (cancelled) return
        // Sempre reflete o estado atual da API, exceto o que foi dispensado.
        // Quando todos forem confirmados/dispensados, a lista esvazia e o modal fecha.
        setPending(flights.filter(f => !dismissedIds.current.has(f.id)))
      } catch {
        // silencioso — backend pode estar offline momentaneamente
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL)
      }
    }

    poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [])

  const dismiss = (id) => {
    dismissedIds.current.add(id)
    setPending(prev => prev.filter(f => f.id !== id))
  }

  const dismissAll = () => {
    pending.forEach(f => dismissedIds.current.add(f.id))
    setPending([])
  }

  return { pending, setPending, dismiss, dismissAll }
}
