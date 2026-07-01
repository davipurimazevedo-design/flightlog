import { Plane } from 'lucide-react'

/** Card centralizado usado nas telas de login/cadastro/senha. */
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#060f1e] p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Plane className="text-blue-400" size={26} />
          <span className="text-white font-bold text-2xl tracking-wide">FlightLog</span>
        </div>

        <div className="bg-[#0c1f3d] border border-white/10 rounded-xl shadow-2xl p-7">
          <h1 className="text-lg font-semibold text-white">{title}</h1>
          {subtitle && <p className="text-sm text-slate-400 mt-1 mb-5">{subtitle}</p>}
          {!subtitle && <div className="mb-5" />}
          {children}
        </div>

        {footer && <div className="text-center text-sm text-slate-400 mt-5">{footer}</div>}
      </div>
    </div>
  )
}

/** Input padrão das telas de auth. */
export function AuthInput({ label, ...props }) {
  return (
    <label className="block mb-4">
      <span className="text-xs text-slate-400 uppercase tracking-wide">{label}</span>
      <input
        {...props}
        className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5
                   text-white text-sm outline-none focus:border-blue-500 transition-colors"
      />
    </label>
  )
}

/** Botão primário full-width com estado de loading. */
export function AuthButton({ loading, children, ...props }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700
                 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium
                 px-4 py-2.5 rounded-lg transition-colors"
    >
      {loading && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
      {children}
    </button>
  )
}
