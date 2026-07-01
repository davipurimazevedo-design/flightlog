import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PendingApproval from '../pages/PendingApproval'
import SplashScreen from './SplashScreen'

/**
 * Portão de acesso ao app. Sem auth (desktop/dev) libera direto.
 * Com auth: exige sessão + conta ativa; senão manda pro login ou tela de espera.
 * Enquanto sessão/perfil carregam (inclui o cold start do backend), mostra a splash.
 */
export function Protected({ children }) {
  const { authEnabled, loading, session, profile } = useAuth()

  if (!authEnabled) return children
  if (loading) return <SplashScreen />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <SplashScreen />
  if (profile.status !== 'active') return <PendingApproval status={profile.status} />
  return children
}

/** Envolve rotas só-admin. */
export function RequireAdmin({ children }) {
  const { authEnabled, profile } = useAuth()
  if (!authEnabled) return children              // dev/desktop: sem restrição
  if (profile?.role !== 'admin') return <Navigate to="/" replace />
  return children
}
