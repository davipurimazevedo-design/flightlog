import { Info, User, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { APP_VERSION } from '../version'

// ── Card de seção ────────────────────────────────────────────────────────────
function SectionCard({ icon: Icon, title, children }) {
  return (
    <div className="bg-[#0c1f3d] border border-white/10 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-5">
        <Icon size={18} className="text-blue-400" />
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm text-slate-300 font-mono">{value}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
export default function Settings() {
  const { profile, authEnabled, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-slate-400 text-sm mt-1">Sua conta e informações do app</p>
      </div>

      {/* ── Conta ──────────────────────────────────────────────────────── */}
      {authEnabled && profile && (
        <SectionCard icon={User} title="Conta">
          <div className="space-y-2 mb-5">
            <Row label="Email" value={profile.email} />
            <Row
              label="Perfil"
              value={profile.role === 'admin' ? 'Administrador' : 'Piloto'}
            />
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                       bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/20 transition-colors"
          >
            <LogOut size={15} />
            Sair da conta
          </button>
        </SectionCard>
      )}

      {/* ── Sobre ──────────────────────────────────────────────────────── */}
      <SectionCard icon={Info} title="Sobre">
        <div className="space-y-2">
          <Row label="Versão" value={`v${APP_VERSION}`} />
          <Row label="Plataforma" value="Web" />
          <Row label="Criado por" value="Davi Purim" />
        </div>
      </SectionCard>
    </div>
  )
}
