import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import SplashScreen from '../SplashScreen'
import { APP_VERSION } from '../../version'

describe('SplashScreen', () => {
  afterEach(() => vi.useRealTimers())

  it('mostra a marca, o slogan e a versão', () => {
    render(<SplashScreen />)
    expect(screen.getByText('FlightLog')).toBeInTheDocument()
    expect(screen.getByText('Diário de Bordo Digital')).toBeInTheDocument()
    expect(screen.getByText(`v${APP_VERSION}`)).toBeInTheDocument()
  })

  it('a mensagem evolui com o tempo de espera (cold start do backend)', () => {
    vi.useFakeTimers()
    render(<SplashScreen />)
    expect(screen.getByText('Carregando...')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(4000) })
    expect(screen.getByText('Conectando ao servidor...')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(6000) })
    expect(screen.getByText(/acordando/)).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(15000) })
    expect(screen.getByText(/Quase lá/)).toBeInTheDocument()
  })
})
