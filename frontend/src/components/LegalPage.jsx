import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { APP_VERSION } from '../version'

/** Layout simples para páginas estáticas (Privacidade, Termos) — acessíveis sem login. */
export default function LegalPage({ title, updated, children }) {
  const navigate = useNavigate()

  // "Voltar" real: retorna à página anterior (Configurações se logado, Cadastro se
  // deslogado). Fallback para /login quando a página foi aberta direto, sem histórico
  // — evita mandar um usuário logado para a tela de login (parecia um logoff).
  const handleBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[#0a1628] text-slate-300">
      <div className="max-w-3xl mx-auto px-5 py-10">
        <button onClick={handleBack} className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 mb-8">
          <ArrowLeft size={16} /> Voltar
        </button>
        <h1 className="text-2xl font-bold text-white mb-1">{title}</h1>
        {updated && <p className="text-xs text-slate-500 mb-8">Última atualização: {updated}</p>}
        <div className="space-y-6 text-sm leading-relaxed">{children}</div>
        <p className="text-xs text-slate-600 mt-12">FlightLog v{APP_VERSION}</p>
      </div>
    </div>
  )
}

/** Bloco de seção com título. */
export function LegalSection({ title, children }) {
  return (
    <section>
      <h2 className="text-white font-semibold text-base mb-2">{title}</h2>
      <div className="space-y-2 text-slate-400">{children}</div>
    </section>
  )
}
