import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PendingApproval from '../pages/PendingApproval'

function FullScreen({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#060f1e] text-slate-400">
      {children}
    </div>
  )
}

const Spinner = () => (
  <FullScreen>
    <span className="w-6 h-6 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin" />
  </FullScreen>
)

/**
 * Portão de acesso ao app. Sem auth (desktop/dev) libera direto.
 * Com auth: exige sessão + conta ativa; senão manda pro login ou tela de espera.
 */
export function Protected({ children }) {
  const { authEnabled, loading, session, profile } = useAuth()

  if (!authEnabled) return children
  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <Spinner />
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
