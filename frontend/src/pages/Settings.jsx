import { useEffect, useState } from 'react'
import { Database, Download, Upload, Info, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useToast } from '../components/Toast'

const isElectron = typeof window !== 'undefined' && !!window.flightlog?.isElectron

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

// ── Botão de ação ────────────────────────────────────────────────────────────
function ActionButton({ onClick, disabled, variant = 'primary', icon: Icon, children, loading }) {
  const base = 'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const styles = {
    primary:   'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10',
    danger:    'bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/20',
  }
  return (
    <button className={`${base} ${styles[variant]}`} onClick={onClick} disabled={disabled || loading}>
      {loading
        ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        : Icon && <Icon size={15} />
      }
      {children}
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
export default function Settings() {
  const { addToast } = useToast()
  const [dbPath, setDbPath] = useState('')
  const [loadingBackup, setLoadingBackup] = useState(false)
  const [loadingRestore, setLoadingRestore] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)

  useEffect(() => {
    if (isElectron) {
      window.flightlog.getDbPath().then(p => setDbPath(p || ''))
    }
  }, [])

  // ── Backup ──────────────────────────────────────────────────────────────
  const handleBackup = async () => {
    if (!isElectron) return
    setLoadingBackup(true)
    try {
      const result = await window.flightlog.backup()
      if (result.cancelled) return
      if (result.success) {
        addToast(`Backup salvo com sucesso!`, 'success')
      } else {
        addToast(`Erro ao criar backup: ${result.error}`, 'error')
      }
    } catch (err) {
      addToast(`Erro inesperado: ${err.message}`, 'error')
    } finally {
      setLoadingBackup(false)
    }
  }

  // ── Restore ─────────────────────────────────────────────────────────────
  const handleRestoreConfirmed = async () => {
    setShowRestoreConfirm(false)
    setLoadingRestore(true)
    try {
      const result = await window.flightlog.restore()
      if (result.cancelled) return
      if (result.success) {
        addToast('Banco restaurado! Recarregando...', 'success')
        setTimeout(() => window.location.reload(), 1200)
      } else {
        addToast(`Erro ao restaurar: ${result.error}`, 'error')
      }
    } catch (err) {
      addToast(`Erro inesperado: ${err.message}`, 'error')
    } finally {
      setLoadingRestore(false)
    }
  }

  return (
    <div className="p-8 space-y-6 max-w-2xl">

      <div>
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-slate-400 text-sm mt-1">Gerenciamento do app e dos seus dados</p>
      </div>

      {/* ── Banco de Dados ─────────────────────────────────────────────── */}
      <SectionCard icon={Database} title="Banco de Dados">

        {/* Caminho do arquivo */}
        {isElectron && dbPath && (
          <div className="mb-5">
            <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Arquivo atual</p>
            <p className="text-xs text-slate-400 font-mono bg-black/30 rounded-lg px-3 py-2 break-all border border-white/5">
              {dbPath}
            </p>
          </div>
        )}

        {/* Ações */}
        {isElectron ? (
          <div className="flex flex-wrap gap-3">
            <ActionButton
              icon={Download}
              onClick={handleBackup}
              loading={loadingBackup}
              variant="primary"
            >
              Criar backup
            </ActionButton>

            <ActionButton
              icon={Upload}
              onClick={() => setShowRestoreConfirm(true)}
              loading={loadingRestore}
              variant="secondary"
            >
              Restaurar backup
            </ActionButton>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Backup e restore disponíveis apenas no app desktop.
          </p>
        )}

        <p className="text-xs text-slate-600 mt-4 leading-relaxed">
          O backup cria uma cópia do banco SQLite com todos os voos e aeronaves.<br />
          Para recuperar voos antigos, clique em <strong className="text-slate-500">Restaurar backup</strong> e selecione o arquivo <code className="text-slate-400">logbook.db</code>.
        </p>
      </SectionCard>

      {/* ── Sobre ──────────────────────────────────────────────────────── */}
      <SectionCard icon={Info} title="Sobre">
        <div className="space-y-2">
          <Row label="Versão" value={window.flightlog?.version ?? '—'} />
          <Row label="Plataforma" value={window.flightlog?.platform ?? (isElectron ? '—' : 'Web')} />
          <Row label="Modo" value={isElectron ? 'App Desktop (Electron)' : 'Navegador Web'} />
          <Row label="Criado por" value="Davi Purim" />
        </div>
      </SectionCard>

      {/* ── Modal de confirmação de restore ───────────────────────────── */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0c1f3d] border border-white/10 rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={20} className="text-amber-400 shrink-0" />
              <h3 className="text-white font-semibold">Restaurar backup</h3>
            </div>
            <p className="text-sm text-slate-400 mb-6">
              O banco atual será substituído pelo arquivo selecionado.
              Todos os voos não incluídos no backup serão perdidos.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRestoreConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <ActionButton
                icon={Upload}
                onClick={handleRestoreConfirmed}
                variant="danger"
              >
                Selecionar arquivo
              </ActionButton>
            </div>
          </div>
        </div>
      )}
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
