import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'

const ToastContext = createContext(null)

const ICONS = {
  success: <CheckCircle size={16} className="text-green-400 shrink-0" />,
  error:   <XCircle    size={16} className="text-red-400   shrink-0" />,
  warning: <AlertCircle size={16} className="text-amber-400 shrink-0" />,
}

const COLORS = {
  success: 'border-green-500/30 bg-green-500/10',
  error:   'border-red-500/30   bg-red-500/10',
  warning: 'border-amber-500/30 bg-amber-500/10',
}

function ToastItem({ toast, onClose }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl text-sm text-white
      backdrop-blur-sm animate-fade-in min-w-[260px] max-w-sm ${COLORS[toast.type]}`}>
      {ICONS[toast.type]}
      <span className="flex-1">{toast.message}</span>
      <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors ml-1">
        <X size={14} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remove = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const add = useCallback((message, type = 'success', duration = 3500) => {
    const id = Date.now()
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => remove(id), duration)
  }, [remove])

  return (
    <ToastContext.Provider value={add}>
      {children}

      {/* Container fixo no canto inferior direito */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-end">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
