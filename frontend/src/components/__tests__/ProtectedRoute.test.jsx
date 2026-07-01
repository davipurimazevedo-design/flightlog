import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Protected, RequireAdmin } from '../ProtectedRoute'
import { useAuth } from '../../context/AuthContext'

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../pages/PendingApproval', () => ({
  default: ({ status }) => <div>PENDING_SCREEN:{status}</div>,
}))

const renderProtected = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/login" element={<div>LOGIN_PAGE</div>} />
        <Route path="/" element={<Protected><div>APP_CONTENT</div></Protected>} />
      </Routes>
    </MemoryRouter>
  )

describe('Protected', () => {
  it('sem auth configurada (dev), libera direto', () => {
    useAuth.mockReturnValue({ authEnabled: false })
    renderProtected()
    expect(screen.getByText('APP_CONTENT')).toBeInTheDocument()
  })

  it('sem sessão, redireciona pro login', () => {
    useAuth.mockReturnValue({ authEnabled: true, loading: false, session: null, profile: null })
    renderProtected()
    expect(screen.getByText('LOGIN_PAGE')).toBeInTheDocument()
  })

  it('conta pendente vê a tela de espera, não o app', () => {
    useAuth.mockReturnValue({
      authEnabled: true, loading: false,
      session: { user: {} }, profile: { status: 'pending' },
    })
    renderProtected()
    expect(screen.getByText('PENDING_SCREEN:pending')).toBeInTheDocument()
    expect(screen.queryByText('APP_CONTENT')).not.toBeInTheDocument()
  })

  it('conta ativa entra no app', () => {
    useAuth.mockReturnValue({
      authEnabled: true, loading: false,
      session: { user: {} }, profile: { status: 'active', role: 'pilot' },
    })
    renderProtected()
    expect(screen.getByText('APP_CONTENT')).toBeInTheDocument()
  })
})

describe('RequireAdmin', () => {
  const renderAdmin = () =>
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/" element={<div>HOME</div>} />
          <Route path="/admin" element={<RequireAdmin><div>ADMIN_PAGE</div></RequireAdmin>} />
        </Routes>
      </MemoryRouter>
    )

  it('piloto comum é mandado pra home', () => {
    useAuth.mockReturnValue({ authEnabled: true, profile: { role: 'pilot', status: 'active' } })
    renderAdmin()
    expect(screen.getByText('HOME')).toBeInTheDocument()
  })

  it('admin acessa a página', () => {
    useAuth.mockReturnValue({ authEnabled: true, profile: { role: 'admin', status: 'active' } })
    renderAdmin()
    expect(screen.getByText('ADMIN_PAGE')).toBeInTheDocument()
  })
})
