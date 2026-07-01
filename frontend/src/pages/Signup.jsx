import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AuthShell, { AuthInput, AuthButton } from '../components/AuthShell'

export default function Signup() {
  const { signup } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    setLoading(true)
    const { error } = await signup(email, password)
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
        <AuthInput label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
        <AuthInput label="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
        <AuthButton type="submit" loading={loading}>Cadastrar</AuthButton>
      </form>
    </AuthShell>
  )
}
