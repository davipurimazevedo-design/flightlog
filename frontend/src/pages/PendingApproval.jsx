import { Clock, Ban, RefreshCw, LogOut } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import AuthShell, { AuthButton } from '../components/AuthShell'

/** Mostrada quando a conta está 'pending' (aguardando aprovação) ou 'disabled'. */
export default function PendingApproval({ status }) {
  const { logout, refreshProfile } = useAuth()
  const [checking, setChecking] = useState(false)

  const disabled = status === 'disabled'

  const recheck = async () => {
    setChecking(true)
    await refreshProfile()
    setChecking(false)
  }

  return (
    <AuthShell title={disabled ? 'Conta desativada' : 'Aguardando aprovação'}>
      <div className="flex flex-col items-center text-center gap-4 py-2">
        {disabled
          ? <Ban className="text-red-400" size={40} />
          : <Clock className="text-amber-400" size={40} />}
        <p className="text-sm text-slate-300">
          {disabled
            ? 'Sua conta foi desativada por um administrador. Fale com o responsável para reativá-la.'
            : 'Sua conta foi criada e está aguardando a aprovação de um administrador. Você receberá acesso assim que for liberada.'}
        </p>

        <div className="w-full space-y-2 mt-2">
          {!disabled && (
            <AuthButton onClick={recheck} loading={checking}>
              <RefreshCw size={15} /> Já fui aprovado
            </AuthButton>
          )}
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 text-sm text-slate-400
                       hover:text-white px-4 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <LogOut size={15} /> Sair
          </button>
        </div>
      </div>
    </AuthShell>
  )
}
