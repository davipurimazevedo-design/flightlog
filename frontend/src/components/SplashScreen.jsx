import { useEffect, useState } from 'react'
import { APP_VERSION } from '../version'

/**
 * Splash de carregamento — herdada do app desktop (Electron).
 * Mostrada pelo portão de auth enquanto a sessão/perfil carregam.
 * As mensagens evoluem com o tempo: o backend no plano free "dorme" e
 * pode levar ~30s pra acordar — melhor avisar do que deixar no vácuo.
 */
const STAGES = [
  { after: 0,     text: 'Carregando...' },
  { after: 4000,  text: 'Conectando ao servidor...' },
  { after: 10000, text: 'O servidor está acordando — pode levar até 30 segundos...' },
  { after: 25000, text: 'Quase lá, obrigado pela paciência...' },
]

export default function SplashScreen() {
  const [msg, setMsg] = useState(STAGES[0].text)

  useEffect(() => {
    const timers = STAGES.slice(1).map(s => setTimeout(() => setMsg(s.text), s.after))
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a1628] p-4">
      <div className="relative w-[420px] max-w-full overflow-hidden rounded-2xl border border-white/10 bg-[#060f1e] px-8 pt-10 pb-12 flex flex-col items-center">

        {/* Brilho sutil no topo */}
        <div
          className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-32"
          style={{ background: 'radial-gradient(ellipse, rgba(96,165,250,0.12) 0%, transparent 70%)' }}
        />

        {/* Avião animado na trilha */}
        <div className="relative w-[280px] max-w-full h-[60px] mb-1">
          <div
            className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px"
            style={{ background: 'linear-gradient(to right, transparent, rgba(96,165,250,0.2), transparent)' }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 opacity-0"
            style={{ animation: 'splash-fly 2.8s ease-in-out infinite' }}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-9 h-9"
              style={{ fill: '#60a5fa', filter: 'drop-shadow(0 0 8px rgba(96,165,250,0.6))' }}
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
            </svg>
          </div>
        </div>

        {/* Marca */}
        <div className="mb-6 flex flex-col items-center">
          <div className="flex flex-col items-end">
            <div className="text-[26px] font-bold text-white tracking-wide leading-tight">FlightLog</div>
            <div className="text-[13px] font-semibold text-amber-400 leading-none -mt-0.5">brasil</div>
          </div>
          <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
            Diário de Bordo Digital
          </div>
        </div>

        {/* Status + barra de progresso */}
        <div className="w-[280px] max-w-full">
          <p
            key={msg}
            className="mb-2 min-h-[16px] text-center text-xs text-slate-500"
            style={{ animation: 'splash-fade 0.4s ease-in' }}
          >
            {msg}
          </p>
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full w-2/5 rounded-full"
              style={{
                background: 'linear-gradient(to right, transparent, #3b82f6, #60a5fa, transparent)',
                animation: 'splash-slide 1.6s ease-in-out infinite',
              }}
            />
          </div>
        </div>

        {/* Versão */}
        <div className="absolute bottom-3.5 right-4 text-[10px] tracking-wider text-white/10">
          v{APP_VERSION}
        </div>
      </div>
    </div>
  )
}
