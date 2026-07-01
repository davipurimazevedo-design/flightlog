import { useEffect, useState } from 'react'
import { getStats, getFlights } from '../api'
import StatCard from '../components/StatCard'
import { Clock, Plane, MapPin } from 'lucide-react'

const toHHMM = (decimalHours) => {
  const totalMin = Math.round(decimalHours * 60)
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0')
  const mm = String(totalMin % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [recent, setRecent] = useState([])

  useEffect(() => {
    getStats().then(setStats).catch(() => {})
    getFlights({ limit: 5 }).then(setRecent).catch(() => {})
  }, [])

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Resumo do seu histórico de voos</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Total de Voos" value={stats.total_flights} icon={Plane} color="blue" />
          <StatCard label="Horas Totais" value={toHHMM(stats.total_block_hours)} icon={Clock} color="green" />
          <StatCard label="Aeroportos Visitados" value={stats.unique_airports} icon={MapPin} color="purple" />
          <StatCard label="Aeronaves Utilizadas" value={stats.unique_aircraft} icon={Plane} color="amber" />
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Voos Recentes</h2>
        {recent.length === 0 ? (
          <div className="bg-[#0c1f3d] border border-white/10 rounded-xl p-8 text-center text-slate-500">
            Nenhum voo registrado ainda. <a href="/new-flight" className="text-blue-400 hover:underline">Registre o primeiro!</a>
          </div>
        ) : (
          <div className="bg-[#0c1f3d] border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 text-xs uppercase">
                  <th className="px-3 md:px-5 py-3 text-left">Data</th>
                  <th className="px-3 md:px-5 py-3 text-left">Rota</th>
                  <th className="px-3 md:px-5 py-3 text-left">Aeronave</th>
                  <th className="px-3 md:px-5 py-3 text-left hidden sm:table-cell">Tempo de Voo</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(f => {
                  const block = toHHMM((new Date(f.arrival_time) - new Date(f.departure_time)) / 3600000)
                  return (
                    <tr key={f.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-3 md:px-5 py-3 text-slate-300">
                        {f.date.slice(8,10)}/{f.date.slice(5,7)}/{f.date.slice(0,4)}
                      </td>
                      <td className="px-3 md:px-5 py-3">
                        <span className="font-mono text-blue-300">{f.origin_icao}</span>
                        <span className="text-slate-500 mx-1">→</span>
                        <span className="font-mono text-blue-300">{f.destination_icao}</span>
                      </td>
                      <td className="px-3 md:px-5 py-3 text-slate-300">{f.aircraft.registration}</td>
                      <td className="px-3 md:px-5 py-3 text-slate-300 font-mono hidden sm:table-cell">{block}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
