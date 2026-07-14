import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AuthShell, { AuthInput, AuthButton } from '../components/AuthShell'

export default function Signup() {
  const { signup } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Informe seu nome.')
      return
    }
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    setLoading(true)
    const { error } = await signup(email, password, name.trim())
    setLoading(false)
    if (error) {
      setError(error.message || 'Não foi possível cadastrar.')
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <AuthShell title="Cadastro recebido" footer={<Link to="/login" className="text-blue-400 hover:underline">Voltar ao login</Link>}>
        <div className="flex flex-col items-center text-center gap-3 py-2">
          <CheckCircle2 className="text-green-400" size={40} />
          <p className="text-sm text-slate-300">
            Sua conta foi criada! Aguarde a <strong className="text-white">aprovação do administrador</strong>.
            Você poderá entrar assim que sua conta for liberada.
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Criar conta"
      subtitle="Cadastre-se para registrar seus voos"
      footer={<>Já tem conta? <Link to="/login" className="text-blue-400 hover:underline">Entrar</Link></>}
    >
      <form onSubmit={handleSubmit}>
        <AuthInput label="Nome" type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus />
        <AuthInput label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <AuthInput label="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        <label className="flex items-start gap-2 mb-4 text-xs text-slate-400 leading-relaxed cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={e => setAccepted(e.target.checked)}
            className="mt-0.5 accent-blue-500 shrink-0"
          />
          <span>
            Li e aceito os{' '}
            <Link to="/termos" className="text-blue-400 hover:underline">Termos de Uso</Link> e a{' '}
            <Link to="/privacidade" className="text-blue-400 hover:underline">Política de Privacidade</Link>.
          </span>
        </label>
        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
        <AuthButton type="submit" loading={loading} disabled={!accepted}>Cadastrar</AuthButton>
      </form>
    </AuthShell>
  )
}
