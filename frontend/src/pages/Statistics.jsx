import { useEffect, useState } from 'react'
import { getDetailedStats, getHoursByYear } from '../api'
import StatCard from '../components/StatCard'
import { Clock, Plane, Route, TrendingUp } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, CartesianGrid, ReferenceLine,
} from 'recharts'
import { PERIODS, buildRange } from '../lib/periods'

// ── Tooltip customizado ─────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label, unit = '' }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-sm shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="text-white font-bold">{payload[0].value}{unit}</p>
    </div>
  )
}

// ── Bloco de gráfico ────────────────────────────────────────────────────────
function ChartCard({ title, children }) {
  return (
    <div className="bg-[#0c1f3d] border border-white/10 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-5">{title}</h3>
      {children}
    </div>
  )
}

// ── Helper HH:MM (fonte única em lib/utils) ─────────────────────────────────
import { hoursToHHMM as toHHMM } from '../lib/utils'

// ── Cores das barras ────────────────────────────────────────────────────────
const BAR_COLORS = ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe']

// ═══════════════════════════════════════════════════════════════════════════
export default function Statistics() {
  const [period, setPeriod]         = useState('year')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [data, setData]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [byYear, setByYear]         = useState([])   // carreira: horas por ano (independe do período)

  const fetchData = async (pid, from, to) => {
    setLoading(true)
    try {
      let params = {}
      if (pid === 'custom') {
        if (from) params.date_from = from
        if (to)   params.date_to   = to
      } else {
        params = buildRange(pid)
      }
      const res = await getDetailedStats(params)
      setData(res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (period !== 'custom') fetchData(period)
  }, [period])

  // Horas por ano da carreira — all-time, não muda com o filtro de período.
  useEffect(() => {
    getHoursByYear().then(setByYear).catch(() => setByYear([]))
  }, [])

  const applyCustom = () => fetchData('custom', customFrom, customTo)

  const inputCls = "bg-[#0a1628] border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"

  return (
    <div className="p-4 md:p-8 space-y-6">

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Estatísticas</h1>
          <p className="text-slate-400 text-sm mt-1">Análise do seu histórico de voos</p>
        </div>

        {/* Filtros de período */}
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                period === p.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}

          {period === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" className={inputCls} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
              <span className="text-slate-500 text-sm">até</span>
              <input type="date" className={inputCls} value={customTo} onChange={e => setCustomTo(e.target.value)} />
              <button
                onClick={applyCustom}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              >
                Aplicar
              </button>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-center text-slate-500 py-20">Carregando...</div>
      )}

      {!loading && data && data.summary.total_flights === 0 && (
        <div className="bg-[#0c1f3d] border border-white/10 rounded-xl p-12 text-center text-slate-500">
          Nenhum voo encontrado no período selecionado.
        </div>
      )}

      {!loading && data && data.summary.total_flights > 0 && (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
            <StatCard
              icon={Plane}
              label="Total de Voos"
              value={data.summary.total_flights}
              color="blue"
            />
            <StatCard
              icon={Clock}
              label="Horas Totais"
              value={toHHMM(data.summary.total_hours)}
              color="green"
            />
            <StatCard
              icon={Route}
              label="Milhas Náuticas"
              value={`${(data.summary.total_nm || 0).toLocaleString('pt-BR')} NM`}
              color="blue"
            />
            <StatCard
              icon={TrendingUp}
              label="Voo Mais Longo"
              value={toHHMM(data.summary.longest_flight?.hours)}
              sub={`${data.summary.longest_flight?.route} · ${data.summary.longest_flight?.date}`}
              color="purple"
            />
            <StatCard
              icon={Route}
              label="Rota Mais Frequente"
              value={data.summary.top_route?.route}
              sub={`${data.summary.top_route?.count} voo${data.summary.top_route?.count !== 1 ? 's' : ''}`}
              color="amber"
            />
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

            {/* Horas por mês */}
            <ChartCard title="Horas por Mês">
              {data.hours_by_month.length > 0 ? (() => {
                const avg = data.hours_by_month.reduce((s, m) => s + m.hours, 0) / data.hours_by_month.length
                return (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.hours_by_month} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => toHHMM(v)} width={38} />
                    <Tooltip content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-sm shadow-xl">
                          <p className="text-slate-400 mb-1">{label}</p>
                          <p className="text-white font-bold font-mono">{toHHMM(payload[0].value)}</p>
                        </div>
                      )
                    }} cursor={{ fill: '#ffffff08' }} />
                    <Bar dataKey="hours" radius={[4, 4, 0, 0]} fill="#3b82f6" />
                    <ReferenceLine y={avg} stroke="#ef4444" strokeDasharray="4 4"
                      label={{ value: `Média ${toHHMM(avg)}`, fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />
                  </BarChart>
                </ResponsiveContainer>
                )
              })() : (
                <p className="text-slate-500 text-sm text-center py-16">Sem dados</p>
              )}
            </ChartCard>

            {/* Top aeroportos */}
            <ChartCard title="Top Aeroportos">
              {data.top_airports.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={data.top_airports}
                    layout="vertical"
                    margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="icao" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={45} />
                    <Tooltip content={<CustomTooltip unit=" pousos" />} cursor={{ fill: '#ffffff08' }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {data.top_airports.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-slate-500 text-sm text-center py-16">Sem dados</p>
              )}
            </ChartCard>

            {/* Horas por aeronave — ocupa linha inteira se só 1 aeronave, senão metade */}
            <ChartCard title="Horas por Aeronave">
              {data.hours_by_aircraft.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.hours_by_aircraft} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis dataKey="registration" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => toHHMM(v)} width={38} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0].payload
                        return (
                          <div className="bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-sm shadow-xl">
                            <p className="text-slate-400 mb-1">{d.registration}</p>
                            <p className="text-xs text-slate-500 mb-1">{d.model}</p>
                            <p className="text-white font-bold font-mono">{toHHMM(d.hours)}</p>
                          </div>
                        )
                      }}
                      cursor={{ fill: '#ffffff08' }}
                    />
                    <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                      {data.hours_by_aircraft.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-slate-500 text-sm text-center py-16">Sem dados</p>
              )}
            </ChartCard>

          </div>
        </>
      )}

      {/* Horas por ano da carreira (voado + anterior) — sempre por último, independe do período */}
      {byYear.length > 0 && (
        <ChartCard title="Horas por Ano (carreira completa)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byYear} margin={{ top: 0, right: 0, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="year" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v)}h`} width={44} />
              <Tooltip
                cursor={{ fill: '#ffffff08' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <div className="bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-sm shadow-xl">
                      <p className="text-slate-400 mb-1">{label}</p>
                      {d.logged > 0 && <p className="text-blue-300 font-mono text-xs">Voado: {toHHMM(d.logged)}</p>}
                      {d.prior > 0 && <p className="text-slate-400 font-mono text-xs">Anterior: {toHHMM(d.prior)}</p>}
                      <p className="text-white font-bold font-mono mt-1">Total: {toHHMM(d.total)}</p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="logged" stackId="a" fill="#3b82f6" name="Voado" />
              <Bar dataKey="prior" stackId="a" fill="#64748b" radius={[4, 4, 0, 0]} name="Anterior" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Registrado aqui</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-500" /> Horas anteriores</span>
          </div>
        </ChartCard>
      )}
    </div>
  )
}
