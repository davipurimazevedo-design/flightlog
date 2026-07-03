import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { getAircraft, searchAirports, createFlight, updateFlight, getFlight } from '../api'
import { useDebounce } from '../hooks/useDebounce'
import { useToast } from '../components/Toast'

const todayStr = () => new Date().toISOString().slice(0, 10)
// Bug fix: usa hora UTC, não local (evita diferença de 3h para UTC-3)
const nowTime = () => new Date().toISOString().slice(11, 16)

const empty = {
  date: todayStr(),
  origin_icao: '',
  destination_icao: '',
  aircraft_id: '',
  departure_time: nowTime(),
  arrival_time: nowTime(),
  role: 'PIC',
  flight_rules: 'VFR',
  day_night: 'DAY',
  remarks: '',
}

export default function FlightForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isEdit = Boolean(id)
  const toast = useToast()

  const [form, setForm] = useState(empty)
  const [aircraft, setAircraft] = useState([])
  const [originSearch, setOriginSearch] = useState('')
  const [destSearch, setDestSearch] = useState('')
  const [originResults, setOriginResults] = useState([])
  const [destResults, setDestResults] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const debouncedOrigin = useDebounce(originSearch, 350)
  const debouncedDest   = useDebounce(destSearch, 350)

  // Busca de aeroportos com debounce aplicado
  useEffect(() => {
    if (debouncedOrigin.length >= 2) {
      searchAirports(debouncedOrigin).then(setOriginResults).catch(() => setOriginResults([]))
    } else {
      setOriginResults([])
    }
  }, [debouncedOrigin])

  useEffect(() => {
    if (debouncedDest.length >= 2) {
      searchAirports(debouncedDest).then(setDestResults).catch(() => setDestResults([]))
    } else {
      setDestResults([])
    }
  }, [debouncedDest])

  useEffect(() => {
    getAircraft().then(setAircraft).catch(() => {})

    // Pré-preenchimento vindo de "Registrar volta" (FlightDetail)
    const prefill = location.state?.prefill
    if (!isEdit && prefill) {
      setForm(p => ({ ...p, ...prefill }))
      setOriginSearch(prefill.origin_icao || '')
      setDestSearch(prefill.destination_icao || '')
    }

    if (isEdit) {
      getFlight(id).then(f => {
        // departure_time / arrival_time vêm como ISO string do backend
        const depTime = f.departure_time ? f.departure_time.slice(11, 16) : nowTime()
        const arrTime = f.arrival_time   ? f.arrival_time.slice(11, 16)  : nowTime()
        setForm({
          date: f.date.slice(0, 10),
          origin_icao: f.origin_icao,
          destination_icao: f.destination_icao,
          aircraft_id: String(f.aircraft_id),
          departure_time: depTime,
          arrival_time: arrTime,
          role: f.role || 'PIC',
          flight_rules: f.flight_rules || 'VFR',
          day_night: f.day_night || 'DAY',
          remarks: f.remarks || '',
        })
        setOriginSearch(f.origin_icao)
        setDestSearch(f.destination_icao)
      }).catch(() => {})
    }
  }, [id])

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Combina data (yyyy-MM-dd) + hora (HH:mm) em ISO UTC
      const toISO = (date, time) => new Date(`${date}T${time}:00Z`).toISOString()

      const depISO = toISO(form.date, form.departure_time)
      let arrDate = form.date

      // Bug fix: se o pouso for antes da decolagem (voo passa meia-noite), avança 1 dia
      if (form.arrival_time <= form.departure_time) {
        const next = new Date(`${form.date}T00:00:00Z`)
        next.setUTCDate(next.getUTCDate() + 1)
        arrDate = next.toISOString().slice(0, 10)
      }

      const payload = {
        date: new Date(`${form.date}T00:00:00Z`).toISOString(),
        origin_icao: form.origin_icao,
        destination_icao: form.destination_icao,
        aircraft_id: Number(form.aircraft_id),
        departure_time: depISO,
        arrival_time: toISO(arrDate, form.arrival_time),
        role: form.role,
        flight_rules: form.flight_rules,
        day_night: form.day_night,
        airborne_time: null,
        remarks: form.remarks || null,
      }

      if (isEdit) {
        await updateFlight(id, payload)
        toast('Voo atualizado com sucesso!', 'success')
      } else {
        await createFlight(payload)
        toast('Voo registrado com sucesso!', 'success')
      }
      navigate('/logbook')
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao salvar voo')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = "w-full bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
  const labelCls = "text-xs text-slate-400 mb-1 block"

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-1">{isEdit ? 'Editar Voo' : 'Novo Voo'}</h1>
      <p className="text-slate-400 text-sm mb-6">Preencha os dados do voo</p>

      {error && <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Rota */}
        <div className="bg-[#0c1f3d] border border-white/10 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Rota</h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Origem */}
            <div className="relative">
              <label className={labelCls}>Origem (ICAO)</label>
              <input
                className={inputCls + ' uppercase'}
                placeholder="SBGR"
                value={originSearch}
                onChange={e => setOriginSearch(e.target.value)}
                required
              />
              {originResults.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full bg-[#0c1f3d] border border-white/10 rounded-lg overflow-hidden text-sm">
                  {originResults.map(a => (
                    <li
                      key={a.icao}
                      className="px-3 py-2 hover:bg-white/10 cursor-pointer text-slate-200"
                      onClick={() => { set('origin_icao', a.icao); setOriginSearch(a.icao); setOriginResults([]) }}
                    >
                      <span className="font-mono text-blue-300 mr-2">{a.icao}</span>{a.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* Destino */}
            <div className="relative">
              <label className={labelCls}>Destino (ICAO)</label>
              <input
                className={inputCls + ' uppercase'}
                placeholder="SBSP"
                value={destSearch}
                onChange={e => setDestSearch(e.target.value)}
                required
              />
              {destResults.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full bg-[#0c1f3d] border border-white/10 rounded-lg overflow-hidden text-sm">
                  {destResults.map(a => (
                    <li
                      key={a.icao}
                      className="px-3 py-2 hover:bg-white/10 cursor-pointer text-slate-200"
                      onClick={() => { set('destination_icao', a.icao); setDestSearch(a.icao); setDestResults([]) }}
                    >
                      <span className="font-mono text-blue-300 mr-2">{a.icao}</span>{a.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Tempos */}
        <div className="bg-[#0c1f3d] border border-white/10 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Tempos</h2>
            {/* Preview do tempo de voo calculado */}
            {(() => {
              if (!form.departure_time || !form.arrival_time) return null
              let dep = new Date(`${form.date}T${form.departure_time}:00Z`)
              let arr = new Date(`${form.date}T${form.arrival_time}:00Z`)
              if (arr <= dep) arr = new Date(arr.getTime() + 86400000) // passa meia-noite
              const diffMin = Math.round((arr - dep) / 60000)
              if (diffMin <= 0) return null
              const hh = String(Math.floor(diffMin / 60)).padStart(2, '0')
              const mm = String(diffMin % 60).padStart(2, '0')
              return (
                <span className="text-xs text-blue-300 font-mono bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-lg">
                  ⏱ {hh}:{mm}
                </span>
              )
            })()}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className={labelCls}>Data do Voo</label>
              <input
                type="date"
                className={inputCls}
                value={form.date}
                onChange={e => set('date', e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Decolagem (UTC)</label>
              <input
                type="time"
                className={inputCls}
                value={form.departure_time}
                onChange={e => set('departure_time', e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Pouso (UTC)</label>
              <input
                type="time"
                className={inputCls}
                value={form.arrival_time}
                onChange={e => set('arrival_time', e.target.value)}
                required
              />
            </div>
          </div>
        </div>

        {/* Aeronave */}
        <div className="bg-[#0c1f3d] border border-white/10 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Aeronave</h2>
          <div>
            <label className={labelCls}>Aeronave</label>
            <select className={inputCls} value={form.aircraft_id} onChange={e => set('aircraft_id', e.target.value)} required>
              <option value="">Selecione...</option>
              {aircraft.map(a => (
                <option key={a.id} value={a.id}>{a.registration} — {a.model}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Detalhes do voo */}
        <div className="bg-[#0c1f3d] border border-white/10 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Detalhes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Função</label>
              <select className={inputCls} value={form.role} onChange={e => set('role', e.target.value)}>
                <option value="PIC">PIC (comandante)</option>
                <option value="SIC">SIC (co-piloto)</option>
                <option value="Dual">Dual (instrução)</option>
                <option value="Solo">Solo</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Regras</label>
              <select className={inputCls} value={form.flight_rules} onChange={e => set('flight_rules', e.target.value)}>
                <option value="VFR">VFR</option>
                <option value="IFR">IFR</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Período</label>
              <select className={inputCls} value={form.day_night} onChange={e => set('day_night', e.target.value)}>
                <option value="DAY">Diurno</option>
                <option value="NIGHT">Noturno</option>
              </select>
            </div>
          </div>
        </div>

        {/* Observações */}
        <div className="bg-[#0c1f3d] border border-white/10 rounded-xl p-5">
          <label className={labelCls}>Observações</label>
          <textarea
            className={inputCls + ' resize-none h-20'}
            placeholder="Anotações livres sobre o voo..."
            value={form.remarks}
            onChange={e => set('remarks', e.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? 'Salvando...' : isEdit ? 'Atualizar Voo' : 'Registrar Voo'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
