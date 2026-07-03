import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AuthShell, { AuthInput, AuthButton } from '../components/AuthShell'

export default function ForgotPassword() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    await resetPassword(email)   // não revela se o email existe (segurança)
    setLoading(false)
    setSent(true)
  }

  if (sent) {
    return (
      <AuthShell title="Verifique seu email" footer={<Link to="/login" className="text-blue-400 hover:underline">Voltar ao login</Link>}>
        <div className="flex flex-col items-center text-center gap-3 py-2">
          <MailCheck className="text-green-400" size={40} />
          <p className="text-sm text-slate-300">
            Se existir uma conta com <strong className="text-white">{email}</strong>, enviamos um link
            para redefinir a senha.
          </p>
          <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            📬 Não achou? Verifique a <strong>caixa de spam</strong> — o email pode chegar por lá.
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Esqueci minha senha"
      subtitle="Enviaremos um link de redefinição por email"
      footer={<Link to="/login" className="text-blue-400 hover:underline">Voltar ao login</Link>}
    >
      <form onSubmit={handleSubmit}>
        <AuthInput label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
        <AuthButton type="submit" loading={loading}>Enviar link</AuthButton>
      </form>
    </AuthShell>
  )
}
