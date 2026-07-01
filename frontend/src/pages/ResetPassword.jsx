import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthShell, { AuthInput, AuthButton } from '../components/AuthShell'

/**
 * Aberta pelo link do email de reset. O Supabase já coloca uma sessão de recuperação
 * ativa quando o usuário chega aqui, então basta chamar updateUser({ password }).
 */
export default function ResetPassword() {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    setLoading(true)
    const { error } = await updatePassword(password)
    setLoading(false)
    if (error) {
      setError('Não foi possível alterar a senha. O link pode ter expirado.')
      return
    }
    navigate('/')
  }

  return (
    <AuthShell title="Nova senha" subtitle="Defina uma nova senha para sua conta">
      <form onSubmit={handleSubmit}>
        <AuthInput label="Nova senha" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
        <AuthButton type="submit" loading={loading}>Salvar senha</AuthButton>
      </form>
    </AuthShell>
  )
}
