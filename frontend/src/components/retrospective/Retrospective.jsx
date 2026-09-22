import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  X, Play, Pause, ChevronLeft, ChevronRight, Download,
  Plane, Clock, Route as RouteIcon, MapPin, Sparkles, RotateCcw,
} from 'lucide-react'
import { Map as MapCanvas, MapArc, MapMarker, MarkerContent, useMap } from '../ui/map'
import { getFlightsTimeline, getDetailedStats, getHoursByYear } from '../../api'
import { buildYearRange, buildMonthRange, MONTH_LABELS } from '../../lib/periods'
import { minutesToHHMM, hoursToHHMM, fmtDateBR } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import { buildRetroCard, downloadBlob } from './retroCard'

const MAP = 1, HIGHLIGHTS = 2, PLACES = 3, CARD = 4
const LAST = CARD

/** Camada do mapa: arcos que crescem + pontos dos aeroportos + câmera que acompanha. */
function RetroMapLayer({ arcs, airports, onMapReady }) {
  const { map, isLoaded } = useMap()
  const fittedRef = useRef(null)

  useEffect(() => {
    if (isLoaded && map) onMapReady(map)
  }, [isLoaded, map, onMapReady])

  // Enquadra o que já foi revelado — o mapa vai "abrindo" conforme o período avança.
  useEffect(() => {
    if (!isLoaded || !map || airports.length === 0) return
    let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90
    for (const a of airports) {
      minLng = Math.min(minLng, a.lng); maxLng = Math.max(maxLng, a.lng)
      minLat = Math.min(minLat, a.lat); maxLat = Math.max(maxLat, a.lat)
    }
    // Só re-enquadra quando os limites mudam de verdade (evita a câmera tremendo a cada voo)
    const key = [minLng, minLat, maxLng, maxLat].map(v => v.toFixed(1)).join(',')
    if (fittedRef.current === key) return
    fittedRef.current = key
    try {
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]],
        { padding: 80, duration: 900, maxZoom: 7 })
    } catch { /* bounds degenerados: ignora */ }
  }, [isLoaded, map, airports])

  return (
    <>
      <MapArc
        data={arcs}
        interactive={false}
        curvature={0.18}
        paint={{ 'line-color': '#3b82f6', 'line-width': 2, 'line-opacity': 0.85 }}
      />
      {airports.map(a => (
        <MapMarker key={a.icao} longitude={a.lng} latitude={a.lat}>
          <MarkerContent><div className="size-1.5 rounded-full bg-amber-400" /></MarkerContent>
        </MapMarker>
      ))}
    </>
  )
}

function Counter({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="p-1.5 rounded-lg bg-blue-500/15 text-blue-400 shrink-0"><Icon size={16} /></div>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-400 uppercase tracking-wider leading-none">{label}</p>
        <p className="text-lg font-bold text-white font-mono leading-tight">{value}</p>
      </div>
    </div>
  )
}

export default function Retrospective({ open, onClose }) {
  const { profile } = useAuth()
  const now = new Date()

  const [mode, setMode] = useState('year')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [years, setYears] = useState([])

  const [slide, setSlide] = useState(MAP)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)       // { flights, skipped, summary }

  const [revealed, setRevealed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [saving, setSaving] = useState(false)

  const mapRef = useRef(null)
  const handleMapReady = useCallback((m) => { mapRef.current = m }, [])

  const range = useMemo(
    () => (mode === 'year' ? buildYearRange(year) : buildMonthRange(year, month)),
    [mode, year, month],
  )
  const periodLabel = mode === 'year' ? String(year) : `${MONTH_LABELS[month - 1]} ${year}`

  // Anos com voo (para o seletor)
  useEffect(() => {
    if (!open) return
    getHoursByYear()
      .then(rows => {
        const ys = rows.map(r => r.year).sort((a, b) => b - a)
        setYears(ys)
        if (ys.length && !ys.includes(year)) setYear(ys[0])
      })
      .catch(() => setYears([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Esc fecha; trava o scroll do fundo
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  const start = async () => {
    setLoading(true); setError('')
    try {
      const [tl, st] = await Promise.all([getFlightsTimeline(range), getDetailedStats(range)])
      const flights = tl.flights || []
      setData({ flights, skipped: tl.skipped_no_airport || 0, summary: st.summary || {} })
      setSlide(MAP)
      if (reducedMotion) { setRevealed(flights.length); setPlaying(false) }
      else { setRevealed(0); setPlaying(flights.length > 0) }
    } catch {
      setError('Não consegui carregar os dados do período. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const total = data?.flights.length ?? 0

  // Motor da animação: revela voo a voo, ~11s no total (com piso/teto por voo)
  useEffect(() => {
    if (!playing || !total) return
    const perFlight = Math.max(80, Math.min(400, 11000 / total))
    let last = performance.now()
    let acc = 0
    let raf
    const tick = (t) => {
      acc += t - last
      last = t
      if (acc >= perFlight) {
        const steps = Math.floor(acc / perFlight)
        acc -= steps * perFlight
        setRevealed(r => Math.min(total, r + steps))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, total])

  useEffect(() => { if (total && revealed >= total) setPlaying(false) }, [revealed, total])

  const shown = useMemo(
    () => (data ? data.flights.slice(0, revealed) : []),
    [data, revealed],
  )

  const counters = useMemo(() => ({
    voos: shown.length,
    minutos: shown.reduce((s, f) => s + (f.minutes || 0), 0),
    nm: shown.reduce((s, f) => s + (f.nm || 0), 0),
  }), [shown])

  // Arcos: descarta voo local (origem == destino), que viraria um arco degenerado.
  // O ponto do aeroporto logo abaixo já mostra que ele foi visitado.
  const arcs = useMemo(() => shown
    .map((f, i) => ({
      id: f.id ?? i,
      from: [f.origin.lng, f.origin.lat],
      to: [f.destination.lng, f.destination.lat],
    }))
    .filter(a => a.from[0] !== a.to[0] || a.from[1] !== a.to[1]),
  [shown])

  const airports = useMemo(() => {
    const seen = new globalThis.Map()
    for (const f of shown) {
      seen.set(f.origin.icao, f.origin)
      seen.set(f.destination.icao, f.destination)
    }
    return [...seen.values()]
  }, [shown])

  const aircraftCount = useMemo(() => {
    const regs = new Set(shown.map(f => f.aircraft?.registration).filter(Boolean))
    return regs.size
  }, [shown])

  const currentDate = shown.length ? fmtDateBR(shown[shown.length - 1].date) : ''

  const summary = data?.summary ?? {}

  const handleDownload = async () => {
    setSaving(true)
    try {
      // Captura o mapa AGORA: depender de um efeito com timeout era frágil (ref não
      // dispara re-render, então a captura podia nunca rodar e o card saía sem mapa).
      let shot = null
      try { shot = mapRef.current?.getCanvas().toDataURL('image/png') ?? null } catch { shot = null }

      const blob = await buildRetroCard({
        periodLabel,
        pilotName: profile?.full_name || '',
        mapShot: shot,
        stats: {
          voos: total,
          minutos: data.flights.reduce((s, f) => s + (f.minutes || 0), 0),
          nm: data.flights.reduce((s, f) => s + (f.nm || 0), 0),
          aeroportos: airports.length,
          aeronaves: aircraftCount,
          longest: summary.longest_flight
            ? `${summary.longest_flight.route} · ${hoursToHHMM(summary.longest_flight.hours)}`
            : '',
          topRoute: summary.top_route
            ? `${summary.top_route.route} · ${summary.top_route.count}x`
            : '',
        },
      })
      if (blob) {
        const slug = periodLabel.replace(/\s+/g, '-').toLowerCase()
        downloadBlob(blob, `flightlog-retrospectiva-${slug}.png`)
      }
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setData(null); setSlide(MAP); setRevealed(0); setPlaying(false)
  }

  if (!open) return null

  const progress = total ? Math.round((revealed / total) * 100) : 0
  const firstName = profile?.full_name?.trim().split(' ')[0]

  return (
    // z-[60]: acima do PendingReviewModal (z-50), senão os dois brigam pela tela
    <div className="fixed inset-0 z-[60] bg-[#0a1628] flex flex-col">

      {/* Barra superior */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={18} className="text-amber-400 shrink-0" />
          <span className="text-white font-semibold truncate">
            Retrospectiva {data ? `· ${periodLabel}` : ''}
          </span>
        </div>
        <button onClick={onClose} aria-label="Fechar"
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* ── Capa: escolha do período ─────────────────────────────────────── */}
      {!data && (
        <div className="flex-1 overflow-y-auto flex items-center justify-center p-6">
          <div className="w-full max-w-md text-center">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Plane size={30} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-1">
              {firstName ? `Sua retrospectiva, ${firstName}` : 'Sua retrospectiva'}
            </h2>
            <p className="text-slate-400 text-sm mb-7">
              Assista suas rotas sendo desenhadas na ordem em que você voou.
            </p>

            <div className="flex gap-2 justify-center mb-4">
              {[['year', 'Ano'], ['month', 'Mês']].map(([id, label]) => (
                <button key={id} onClick={() => setMode(id)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    mode === id ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex gap-2 justify-center mb-7">
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                {(years.length ? years : [now.getFullYear()]).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              {mode === 'month' && (
                <select value={month} onChange={e => setMonth(Number(e.target.value))}
                  className="bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                  {MONTH_LABELS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              )}
            </div>

            {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

            <button onClick={start} disabled={loading}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">
              <Play size={16} /> {loading ? 'Carregando...' : 'Assistir'}
            </button>
          </div>
        </div>
      )}

      {/* ── Período sem voos ─────────────────────────────────────────────── */}
      {data && total === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <p className="text-slate-300 mb-2">
            Nenhum voo registrado em <strong className="text-white">{periodLabel}</strong>.
          </p>
          <p className="text-slate-500 text-sm mb-6">Escolha outro período para ver sua retrospectiva.</p>
          <button onClick={reset}
            className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 px-4 py-2 rounded-lg text-sm transition-colors">
            <ChevronLeft size={16} /> Escolher período
          </button>
        </div>
      )}

      {/* ── Experiência ──────────────────────────────────────────────────── */}
      {data && total > 0 && (
        <div className="flex-1 relative min-h-0">
          {/* Mapa de fundo. preserveDrawingBuffer é necessário para capturar o PNG. */}
          <div className="absolute inset-0">
            {/* canvasContextAttributes: no MapLibre v5 o preserveDrawingBuffer saiu do
                nível raiz e mora aqui. Sem ele, getCanvas().toDataURL() volta preto. */}
            <MapCanvas theme="dark" center={[-47.9, -15.8]} zoom={3.2}
              canvasContextAttributes={{ preserveDrawingBuffer: true }}
              className="h-full w-full">
              <RetroMapLayer arcs={arcs} airports={airports} onMapReady={handleMapReady} />
            </MapCanvas>
          </div>

          {/* Contadores */}
          <div className="absolute top-3 left-3 right-3 bg-[#0c1f3d]/90 backdrop-blur
                          border border-white/10 rounded-xl px-4 py-3
                          flex flex-wrap items-center gap-x-6 gap-y-3 pointer-events-none">
            <Counter icon={Plane} label="Voos" value={counters.voos} />
            <Counter icon={Clock} label="Horas" value={minutesToHHMM(counters.minutos)} />
            <Counter icon={RouteIcon} label="Milhas" value={`${counters.nm.toLocaleString('pt-BR')} NM`} />
            {currentDate && (
              <div className="ml-auto text-right">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider leading-none">Data</p>
                <p className="text-lg font-bold text-amber-400 font-mono leading-tight">{currentDate}</p>
              </div>
            )}
          </div>

          {/* Painel do slide */}
          {slide > MAP && (
            <div className="absolute inset-x-3 bottom-20 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[520px]
                            bg-[#0c1f3d]/95 backdrop-blur border border-white/10 rounded-2xl p-6 shadow-2xl">
              {slide === HIGHLIGHTS && (
                <>
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Destaques</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Voo mais longo</p>
                      {summary.longest_flight ? (
                        <p className="text-white font-bold text-lg">
                          {summary.longest_flight.route}
                          <span className="text-blue-300 font-mono ml-2">{hoursToHHMM(summary.longest_flight.hours)}</span>
                          <span className="text-slate-500 text-sm ml-2">{summary.longest_flight.date}</span>
                        </p>
                      ) : <p className="text-slate-500 text-sm">—</p>}
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Rota mais frequente</p>
                      {summary.top_route ? (
                        <p className="text-white font-bold text-lg">
                          {summary.top_route.route}
                          <span className="text-blue-300 ml-2">{summary.top_route.count}x</span>
                        </p>
                      ) : <p className="text-slate-500 text-sm">—</p>}
                    </div>
                  </div>
                </>
              )}

              {slide === PLACES && (
                <>
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Por onde você passou</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400"><MapPin size={18} /></div>
                      <div>
                        <p className="text-2xl font-bold text-white">{airports.length}</p>
                        <p className="text-xs text-slate-500">aeroportos</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400"><Plane size={18} /></div>
                      <div>
                        <p className="text-2xl font-bold text-white">{aircraftCount}</p>
                        <p className="text-xs text-slate-500">aeronaves</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-4">
                    {`${counters.nm.toLocaleString('pt-BR')} NM percorridas em ${minutesToHHMM(counters.minutos)} de voo.`}
                  </p>
                </>
              )}

              {slide === CARD && (
                <>
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    {periodLabel} em números
                  </h3>
                  <p className="text-slate-400 text-sm mb-5">
                    {`${total} voos · ${minutesToHHMM(counters.minutos)} · ${counters.nm.toLocaleString('pt-BR')} NM`}
                  </p>
                  {mode === 'month' && (
                    <p className="text-xs text-slate-500 mb-4">
                      A retrospectiva de mês considera só os voos registrados — horas anteriores
                      são lançadas por ano.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={handleDownload} disabled={saving}
                      className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
                      <Download size={16} /> {saving ? 'Gerando...' : 'Baixar card PNG'}
                    </button>
                    <button onClick={reset}
                      className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 px-4 py-2.5 rounded-lg text-sm transition-colors">
                      <RotateCcw size={15} /> Outro período
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Controles */}
          <div className="absolute bottom-0 inset-x-0 px-4 py-3 bg-[#0a1628]/90 backdrop-blur border-t border-white/10">
            {slide === MAP && (
              <div className="h-1 rounded-full bg-white/10 mb-3 overflow-hidden">
                <div className="h-full bg-blue-500 transition-[width] duration-200" style={{ width: `${progress}%` }} />
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <button onClick={() => setSlide(s => Math.max(MAP, s - 1))} disabled={slide === MAP}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
                aria-label="Anterior">
                <ChevronLeft size={20} />
              </button>

              {slide === MAP ? (
                revealed >= total ? (
                  <button onClick={() => { setRevealed(0); setPlaying(true) }}
                    className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 px-4 py-2 rounded-lg text-sm transition-colors">
                    <RotateCcw size={15} /> Repetir
                  </button>
                ) : (
                  <button onClick={() => setPlaying(p => !p)}
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    {playing ? <Pause size={15} /> : <Play size={15} />} {playing ? 'Pausar' : 'Continuar'}
                  </button>
                )
              ) : (
                <div className="flex gap-1.5">
                  {[MAP, HIGHLIGHTS, PLACES, CARD].map(s => (
                    <span key={s} className={`w-1.5 h-1.5 rounded-full ${s === slide ? 'bg-blue-400' : 'bg-white/20'}`} />
                  ))}
                </div>
              )}

              <button
                onClick={() => { setPlaying(false); setRevealed(total); setSlide(s => Math.min(LAST, s + 1)) }}
                disabled={slide === LAST}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
                aria-label="Próximo">
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
