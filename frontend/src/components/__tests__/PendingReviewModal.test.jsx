import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PendingReviewModal from '../PendingReviewModal'

const flight = (id, over = {}) => ({
  id,
  origin_icao: 'SBPA',
  destination_icao: 'SBPF',
  date: '2026-06-01T00:00:00Z',
  departure_time: '2026-06-01T10:30:00Z',
  arrival_time: '2026-06-01T11:15:00Z',
  aircraft: { registration: 'AT-54' },
  ...over,
})

const renderModal = (props) =>
  render(
    <MemoryRouter>
      <PendingReviewModal onConfirm={() => {}} onDismiss={() => {}} onDismissAll={() => {}} {...props} />
    </MemoryRouter>
  )

describe('PendingReviewModal', () => {
  it('não renderiza nada sem voos pendentes', () => {
    const { container } = renderModal({ flights: [] })
    expect(container.firstChild).toBeNull()
  })

  it('mostra rota, matrícula e duração do voo', () => {
    renderModal({ flights: [flight(1)] })
    expect(screen.getByText('SBPA')).toBeInTheDocument()
    expect(screen.getByText('SBPF')).toBeInTheDocument()
    expect(screen.getByText(/AT-54/)).toBeInTheDocument()
    expect(screen.getByText(/00:45/)).toBeInTheDocument() // 10:30 → 11:15
  })

  it('confirmar chama onConfirm com o id do voo', () => {
    const onConfirm = vi.fn()
    renderModal({ flights: [flight(7)], onConfirm })
    fireEvent.click(screen.getByTitle('Confirmar'))
    expect(onConfirm).toHaveBeenCalledWith(7)
  })

  it('"Confirmar todos" confirma cada voo da lista', () => {
    const onConfirm = vi.fn()
    renderModal({ flights: [flight(1), flight(2)], onConfirm })
    fireEvent.click(screen.getByText('Confirmar todos'))
    expect(onConfirm).toHaveBeenCalledTimes(2)
    expect(onConfirm).toHaveBeenCalledWith(1)
    expect(onConfirm).toHaveBeenCalledWith(2)
  })

  it('dispensar chama onDismiss com o id', () => {
    const onDismiss = vi.fn()
    renderModal({ flights: [flight(3)], onDismiss })
    fireEvent.click(screen.getByTitle('Dispensar'))
    expect(onDismiss).toHaveBeenCalledWith(3)
  })
})
