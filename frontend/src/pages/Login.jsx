import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthShell, { AuthInput, AuthButton } from '../components/AuthShell'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await login(email, password)
    setLoading(false)
    if (error) {
      setError('Email ou senha incorretos.')
      return
    }
    navigate('/')
  }

  return (
    <AuthShell
      title="Entrar"
      subtitle="Acesse seu logbook"
      footer={<>Não tem conta? <Link to="/signup" className="text-blue-400 hover:underline">Cadastre-se</Link></>}
    >
      <form onSubmit={handleSubmit}>
        <AuthInput label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
        <AuthInput label="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
        <AuthButton type="submit" loading={loading}>Entrar</AuthButton>
      </form>
      <div className="text-right mt-3">
        <Link to="/forgot-password" className="text-xs text-slate-400 hover:text-white">Esqueci minha senha</Link>
      </div>
    </AuthShell>
  )
}
