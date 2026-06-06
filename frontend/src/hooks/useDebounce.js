import { useState, useEffect } from 'react'

/**
 * Retorna o valor atrasado após `delay` ms de inatividade.
 * Evita disparar requisições a cada tecla digitada.
 */
export function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
