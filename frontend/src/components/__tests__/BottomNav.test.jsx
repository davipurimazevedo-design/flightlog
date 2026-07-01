import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BottomNav from '../BottomNav'
import { useAuth } from '../../context/AuthContext'

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))

const setAuth = (over = {}) =>
  useAuth.mockReturnValue({
    authEnabled: true,
    profile: { role: 'pilot', email: 'piloto@x.z' },
    logout: vi.fn(),
    ...over,
  })

const renderNav = () => render(<MemoryRouter><BottomNav /></MemoryRouter>)

describe('BottomNav', () => {
  beforeEach(() => setAuth())

  it('mostra os atalhos principais', () => {
    renderNav()
    for (const label of ['Início', 'Logbook', 'Novo', 'Stats', 'Mais']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('abre o menu "Mais" com os links secundários', () => {
    renderNav()
    fireEvent.click(screen.getByText('Mais'))
    expect(screen.getByText('Mapa de Rotas')).toBeInTheDocument()
    expect(screen.getByText('Aeronaves')).toBeInTheDocument()
    expect(screen.getByText('Configurações')).toBeInTheDocument()
  })

  it('piloto comum NÃO vê o link de Administração', () => {
    renderNav()
    fireEvent.click(screen.getByText('Mais'))
    expect(screen.queryByText('Administração')).not.toBeInTheDocument()
  })

  it('admin vê o link de Administração', () => {
    setAuth({ profile: { role: 'admin', email: 'chefe@x.z' } })
    renderNav()
    fireEvent.click(screen.getByText('Mais'))
    expect(screen.getByText('Administração')).toBeInTheDocument()
  })

  it('mostra o email do usuário no menu "Mais"', () => {
    renderNav()
    fireEvent.click(screen.getByText('Mais'))
    expect(screen.getByText('piloto@x.z')).toBeInTheDocument()
  })
})
