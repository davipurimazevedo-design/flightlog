import { useState } from 'react'
import { Info, User, LogOut, BookMarked, Save, Plus, Trash2, ShieldCheck, Download } from 'lucide-react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { updateMe, exportMyData, deleteMyAccount } from '../api'
import ConfirmModal from '../components/ConfirmModal'
import { minutesToHHMM } from '../lib/utils'
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

// mapa {ano: horasDecimais} → linhas [{ year, h, m }] ordenadas por ano desc
const mapToRows = (map = {}) =>
  Object.entries(map)
    .sort((a, b) => b[0] - a[0])
    .map(([year, dec]) => {
      const total = Math.round((dec || 0) * 60)
      return { year, h: String(Math.floor(total / 60)), m: String(total % 60) }
    })

// ═══════════════════════════════════════════════════════════════════════════
export default function Settings() {
  const { profile, authEnabled, logout, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [rows, setRows] = useState(() => mapToRows(profile?.prior_hours_by_year))
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const data = await exportMyData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `flightlog-meus-dados-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast('Dados exportados!', 'success')
    } catch {
      toast('Não consegui exportar seus dados. Tente novamente.', 'error')
    } finally {
      setExporting(false)
    }
  }

  const handleDeleteAccount = async () => {
    setConfirmDelete(false)
    setDeleting(true)
    try {
      await deleteMyAccount()
      toast('Sua conta foi excluída.', 'warning')
      await logout()
      navigate('/login')
    } catch {
      toast('Não consegui excluir a conta. Tente novamente.', 'error')
      setDeleting(false)
    }
  }

  const addRow = () => setRows(r => [...r, { year: String(new Date().getFullYear() - 1), h: '0', m: '0' }])
  const removeRow = (i) => setRows(r => r.filter((_, idx) => idx !== i))
  const setField = (i, key, val) => setRows(r => r.map((row, idx) => idx === i ? { ...row, [key]: val } : row))

  // total decimal de todas as linhas → HH:MM
  const totalDecimal = rows.reduce((s, r) =>
    s + Math.max(0, parseInt(r.h || '0', 10)) + Math.min(59, Math.max(0, parseInt(r.m || '0', 10))) / 60, 0)

  const save = async () => {
    // Monta o mapa {ano: horasDecimais}, ignorando anos repetidos/ inválidos (backend também sanitiza)
    const map = {}
    for (const r of rows) {
      const year = String(r.year).trim()
      if (!/^\d{4}$/.test(year)) continue
      const dec = Math.max(0, parseInt(r.h || '0', 10)) + Math.min(59, Math.max(0, parseInt(r.m || '0', 10))) / 60
      if (dec > 0) map[year] = Math.round(dec * 100) / 100
    }
    setSaving(true)
    try {
      await updateMe({ prior_hours_by_year: map })
      await refreshProfile()
      toast('Horas anteriores salvas!', 'success')
    } catch {
      toast('Não consegui salvar. Tente novamente.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "bg-[#0a1628] border border-white/10 rounded-lg px-2 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500 text-center"

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

      {/* ── Meu logbook (horas anteriores por ano) ─────────────────────── */}
      {authEnabled && profile && (
        <SectionCard icon={BookMarked} title="Horas anteriores (por ano)">
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            Lance suas horas de logbooks antigos, ano a ano. Elas somam ao total do Dashboard
            e aparecem no gráfico <strong className="text-slate-400">Horas por Ano</strong> das Estatísticas.
          </p>

          {rows.length > 0 && (
            <div className="space-y-2 mb-3">
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[10px] text-slate-500 uppercase tracking-wide px-1">
                <span>Ano</span><span className="text-center">Horas</span><span className="text-center">Min</span><span />
              </div>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                  <input type="number" inputMode="numeric" placeholder="2020"
                    value={r.year} onChange={e => setField(i, 'year', e.target.value)}
                    className={inputCls} />
                  <input type="number" min="0" inputMode="numeric"
                    value={r.h} onChange={e => setField(i, 'h', e.target.value)}
                    className={inputCls} />
                  <input type="number" min="0" max="59" inputMode="numeric"
                    value={r.m} onChange={e => setField(i, 'm', e.target.value)}
                    className={inputCls} />
                  <button onClick={() => removeRow(i)} className="p-2 text-slate-500 hover:text-red-400 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
            <button onClick={addRow}
              className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
              <Plus size={15} /> Adicionar ano
            </button>
            <span className="text-xs text-slate-500 font-mono">
              Total: <span className="text-slate-300">{minutesToHHMM(totalDecimal * 60)}</span>
            </span>
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
          >
            <Save size={15} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </SectionCard>
      )}

      {/* ── Privacidade & Dados (LGPD) ─────────────────────────────────── */}
      {authEnabled && profile && (
        <SectionCard icon={ShieldCheck} title="Privacidade & Dados">
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            Seus dados são seus. Baixe uma cópia completa quando quiser ou apague sua conta em definitivo.
          </p>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                       bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 transition-colors disabled:opacity-50"
          >
            <Download size={15} /> {exporting ? 'Exportando...' : 'Exportar meus dados'}
          </button>

          <div className="flex gap-4 mt-4 text-xs">
            <Link to="/privacidade" className="text-blue-400 hover:underline">Política de Privacidade</Link>
            <Link to="/termos" className="text-blue-400 hover:underline">Termos de Uso</Link>
          </div>

          {/* Zona de perigo */}
          <div className="mt-6 pt-5 border-t border-red-500/10">
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                         bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/20 transition-colors disabled:opacity-50"
            >
              <Trash2 size={15} /> {deleting ? 'Excluindo...' : 'Excluir minha conta'}
            </button>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Remove permanentemente sua conta, aeronaves e voos. Esta ação não pode ser desfeita.
            </p>
          </div>
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

      <ConfirmModal
        open={confirmDelete}
        title="Excluir minha conta"
        message="Isso remove PERMANENTEMENTE sua conta, todas as aeronaves e todos os voos registrados. Esta ação não pode ser desfeita. Se quiser guardar uma cópia, exporte seus dados antes."
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
