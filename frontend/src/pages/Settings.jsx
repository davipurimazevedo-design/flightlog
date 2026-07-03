import { useState } from 'react'
import { Info, User, LogOut, BookMarked, Save } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { updateMe } from '../api'
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

// decimal (ex: 12.5) → { h: 12, m: 30 }
const toHM = (decimal) => {
  const total = Math.round((decimal || 0) * 60)
  return { h: Math.floor(total / 60), m: total % 60 }
}

// ═══════════════════════════════════════════════════════════════════════════
export default function Settings() {
  const { profile, authEnabled, logout, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const init = toHM(profile?.prior_hours)
  const [h, setH] = useState(String(init.h))
  const [m, setM] = useState(String(init.m))
  const [saving, setSaving] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const savePriorHours = async () => {
    const hours = Math.max(0, parseInt(h || '0', 10)) + Math.min(59, Math.max(0, parseInt(m || '0', 10))) / 60
    setSaving(true)
    try {
      await updateMe({ prior_hours: hours })
      await refreshProfile()
      toast('Horas anteriores salvas!', 'success')
    } catch {
      toast('Não consegui salvar. Tente novamente.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-slate-400 text-sm mt-1">Sua conta e informações do app</p>
      </div>

      {/* ── Conta ──────────────────────────────────────────────────────── */}
      {authEnabled && profile && (
        <SectionCard icon={User} title="Conta">
          <div className="space-y-2 mb-5">
            <Row label="Email" value={profile.email} />
            <Row label="Perfil" value={profile.role === 'admin' ? 'Administrador' : 'Piloto'} />
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

      {/* ── Meu logbook (horas anteriores) ─────────────────────────────── */}
      {authEnabled && profile && (
        <SectionCard icon={BookMarked} title="Meu logbook">
          <label className="text-xs text-slate-400 mb-2 block">
            Horas de voo anteriores (de logbooks antigos)
          </label>
          <div className="flex items-end gap-3">
            <div>
              <span className="text-[10px] text-slate-500 block mb-1">Horas</span>
              <input
                type="number" min="0" inputMode="numeric"
                value={h} onChange={e => setH(e.target.value)}
                className="w-24 bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
            <span className="text-slate-500 pb-2 font-mono text-lg">:</span>
            <div>
              <span className="text-[10px] text-slate-500 block mb-1">Minutos</span>
              <input
                type="number" min="0" max="59" inputMode="numeric"
                value={m} onChange={e => setM(e.target.value)}
                className="w-24 bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={savePriorHours}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
            >
              <Save size={15} /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
          <p className="text-xs text-slate-600 mt-4 leading-relaxed">
            Essas horas somam ao total do Dashboard, para refletir sua carreira completa —
            não apenas os voos registrados aqui.
          </p>
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
