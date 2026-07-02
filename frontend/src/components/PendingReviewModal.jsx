import { useNavigate } from 'react-router-dom'
import { MessageCircle, CheckCircle2, Pencil, X } from 'lucide-react'
import { durationHHMM } from '../lib/utils'

export default function PendingReviewModal({ flights, onConfirm, onDismiss, onDismissAll }) {
  const navigate = useNavigate()

  if (!flights || flights.length === 0) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0c1f3d] border border-white/10 rounded-xl shadow-2xl w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
          <MessageCircle size={18} className="text-blue-400 shrink-0" />
          <div className="flex-1">
            <h2 className="text-white font-semibold">Voos registrados via Telegram</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {flights.length} {flights.length === 1 ? 'voo aguarda' : 'voos aguardam'} sua revisão
            </p>
          </div>
          <button
            onClick={onDismissAll}
            className="text-slate-500 hover:text-white transition-colors p-1"
            title="Dispensar todos"
          >
            <X size={16} />
          </button>
        </div>

        {/* Lista de voos */}
        <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
          {flights.map(f => (
            <div key={f.id} className="px-6 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-blue-300 text-sm font-medium">
                    {f.origin_icao}
                  </span>
                  <span className="text-slate-500 text-xs">→</span>
                  <span className="font-mono text-blue-300 text-sm font-medium">
                    {f.destination_icao}
                  </span>
                  <span className="text-slate-500 text-xs ml-1">
                    {durationHHMM(f.departure_time, f.arrival_time)}h
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {f.aircraft.registration} &bull;{' '}
                  {f.date.slice(8,10)}/{f.date.slice(5,7)}/{f.date.slice(0,4)} &bull;{' '}
                  {f.departure_time.slice(11,16)}Z – {f.arrival_time.slice(11,16)}Z
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => navigate(`/edit-flight/${f.id}`)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  title="Editar"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => onConfirm(f.id)}
                  className="p-1.5 rounded-lg text-green-400 hover:text-white hover:bg-green-500/20 transition-colors"
                  title="Confirmar"
                >
                  <CheckCircle2 size={14} />
                </button>
                <button
                  onClick={() => onDismiss(f.id)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                  title="Dispensar"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          <button
            onClick={onDismissAll}
            className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-1.5"
          >
            Dispensar todos
          </button>
          <button
            onClick={() => flights.forEach(f => onConfirm(f.id))}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
          >
            <CheckCircle2 size={14} />
            Confirmar todos
          </button>
        </div>
      </div>
    </div>
  )
}
