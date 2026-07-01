import { useEffect, useState, useCallback } from 'react'
import { Shield, CheckCircle2, Ban, ArrowUpCircle, KeyRound, Trash2, RefreshCw } from 'lucide-react'
import { useToast } from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import { useAuth } from '../context/AuthContext'
import {
  adminListUsers, adminApprove, adminDisable, adminPromote,
  adminResetPassword, adminDeleteUser,
} from '../api'

const STATUS_BADGE = {
  active:   { label: 'Ativo',    cls: 'bg-green-500/15 text-green-400' },
  pending:  { label: 'Pendente', cls: 'bg-amber-500/15 text-amber-400' },
  disabled: { label: 'Desativado', cls: 'bg-red-500/15 text-red-400' },
}

function IconBtn({ onClick, title, color = 'text-slate-400', children }) {
  return (
    <button onClick={onClick} title={title}
      className={`p-1.5 rounded-lg ${color} hover:bg-white/10 transition-colors`}>
      {children}
    </button>
  )
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function Admin() {
  const { addToast } = useToast()
  const { profile } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(null)   // usuário a remover

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setUsers(await adminListUsers())
    } catch {
      addToast('Não foi possível carregar os usuários.', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  const run = async (fn, okMsg) => {
    try {
      await fn()
      addToast(okMsg, 'success')
      await load()
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Ação falhou.', 'error')
    }
  }

  const doDelete = async () => {
    const u = confirmDelete
    setConfirmDelete(null)
    await run(() => adminDeleteUser(u.id), `${u.email} removido.`)
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield size={22} className="text-blue-400" /> Administração
          </h1>
          <p className="text-slate-400 text-sm mt-1">Gerencie os pilotos com acesso ao sistema</p>
        </div>
        <IconBtn onClick={load} title="Recarregar" color="text-slate-300"><RefreshCw size={18} /></IconBtn>
      </div>

      <div className="bg-[#0c1f3d] border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-white/10">
              <th className="px-5 py-3 font-medium">Piloto</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Papel</th>
              <th className="px-3 py-3 font-medium">Último login</th>
              <th className="px-3 py-3 font-medium text-center">Voos</th>
              <th className="px-5 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">Carregando…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">Nenhum usuário.</td></tr>
            ) : users.map(u => {
              const badge = STATUS_BADGE[u.status] || STATUS_BADGE.pending
              const isSelf = u.id === profile?.id
              return (
                <tr key={u.id} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <div className="text-slate-200">{u.full_name || u.email}</div>
                    {u.full_name && <div className="text-xs text-slate-500">{u.email}</div>}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-medium ${u.role === 'admin' ? 'text-blue-400' : 'text-slate-400'}`}>
                      {u.role === 'admin' ? 'Admin' : 'Piloto'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-400 font-mono text-xs">{fmtDate(u.last_sign_in_at)}</td>
                  <td className="px-3 py-3 text-center text-slate-300 font-mono">{u.flight_count}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {u.status === 'pending' && (
                        <IconBtn onClick={() => run(() => adminApprove(u.id), `${u.email} aprovado.`)}
                          title="Aprovar" color="text-green-400"><CheckCircle2 size={16} /></IconBtn>
                      )}
                      {u.status === 'active' && !isSelf && (
                        <IconBtn onClick={() => run(() => adminDisable(u.id), `${u.email} desativado.`)}
                          title="Desativar" color="text-amber-400"><Ban size={16} /></IconBtn>
                      )}
                      {u.role !== 'admin' && (
                        <IconBtn onClick={() => run(() => adminPromote(u.id), `${u.email} promovido a admin.`)}
                          title="Promover a admin" color="text-blue-400"><ArrowUpCircle size={16} /></IconBtn>
                      )}
                      <IconBtn onClick={() => run(() => adminResetPassword(u.id), `Email de reset enviado para ${u.email}.`)}
                        title="Resetar senha"><KeyRound size={16} /></IconBtn>
                      {!isSelf && (
                        <IconBtn onClick={() => setConfirmDelete(u)}
                          title="Remover" color="text-red-400"><Trash2 size={16} /></IconBtn>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={!!confirmDelete}
        title="Remover piloto"
        message={confirmDelete ? `Remover ${confirmDelete.email}? Todos os voos e aeronaves dele serão apagados. Esta ação não pode ser desfeita.` : ''}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
