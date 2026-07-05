import { useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

/**
 * Mostrada quando há sessão válida mas o perfil não carregou (backend dormindo,
 * blip de rede, CORS). Antes o app ficava preso na splash para sempre — aqui o
 * usuário tem um "Tentar novamente" e uma saída ("Sair da conta").
 */
export default function ProfileLoadError({ onRetry }) {
  const { logout } = useAuth()
  const [retrying, setRetrying] = useState(false)

  const handleRetry = async () => {
    setRetrying(true)
    try {
      await onRetry()   // sucesso → contexto atualiza e este componente desmonta
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a1628] p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#060f1e] px-8 py-10 flex flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-400/10">
          <AlertTriangle className="text-amber-400" size={24} />
        </div>
        <h1 className="text-lg font-semibold text-white">Não consegui carregar seu perfil</h1>
        <p className="mt-2 text-sm text-slate-400">
          O servidor pode estar acordando ou houve uma falha de conexão. Tente novamente em alguns segundos.
        </p>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="mt-6 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700
                     disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium
                     px-4 py-2.5 rounded-lg transition-colors"
        >
          {retrying
            ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <RefreshCw size={16} />}
          {retrying ? 'Tentando...' : 'Tentar novamente'}
        </button>
        <button
          onClick={logout}
          className="mt-3 text-xs text-slate-500 hover:text-white transition-colors"
        >
          Sair da conta
        </button>
      </div>
    </div>
  )
}
