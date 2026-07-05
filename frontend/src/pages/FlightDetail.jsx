import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getFlight, getAirport, deleteFlight } from '../api'
import { useToast } from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import {
  Map, MapControls, MapRoute, MapMarker, MarkerContent, MarkerTooltip, MarkerLabel,
} from '@/components/ui/map'
import { Pencil, Trash2, ArrowLeft, ArrowLeftRight, Clock, Plane, MapPin, FileText, Calendar } from 'lucide-react'

import { minutesToHHMM as toHHMM, fmtDateBR, fmtTimeHHMM, flightDurationMinutes } from '../lib/utils'

function InfoCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue:   'text-blue-400   bg-blue-400/10   border-blue-400/20',
    green:  'text-green-400  bg-green-400/10  border-green-400/20',
    purple: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
    amber:  'text-amber-400  bg-amber-400/10  border-amber-400/20',
    slate:  'text-slate-400  bg-slate-400/10  border-slate-400/20',
  }
  return (
    <div className="bg-[#0c1f3d] border border-white/10 rounded-xl p-3 md:p-4 flex items-start gap-3 md:gap-4">
      <div className={`w-9 h-9 md:w-10 md:h-10 rounded-lg flex items-center justify-center border shrink-0 ${colors[color]}`}>
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-white font-semibold text-sm md:text-base font-mono break-words">{value}</p>
        {sub && <p className="text-slate-400 text-xs mt-0.5 break-words">{sub}</p>}
      </div>
    </div>
  )
}

export default function FlightDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [flight, setFlight]     = useState(null)
  const [origin, setOrigin]     = useState(null)
  const [dest, setDest]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const f = await getFlight(id)
        setFlight(f)
        const [orig, dst] = await Promise.all([
          getAirport(f.origin_icao).catch(() => null),
          getAirport(f.destination_icao).catch(() => null),
        ])
        setOrigin(orig)
        setDest(dst)
      } catch {
        navigate('/logbook')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const handleDelete = async () => {
    await deleteFlight(id)
    toast('Voo excluído.', 'warning')
    navigate('/logbook')
  }

  // "Registrar volta": abre o form com a rota INVERTIDA, mesma aeronave e data,
  // decolagem = pouso da ida (turnaround). O piloto só ajusta os horários.
  const handleReturnLeg = () => {
    const arrHHMM = fmtTimeHHMM(flight.arrival_time)
    navigate('/new-flight', {
      state: {
        prefill: {
          date: flight.date.slice(0, 10),
          origin_icao: flight.destination_icao,
          destination_icao: flight.origin_icao,
          aircraft_id: String(flight.aircraft_id),
          departure_time: arrHHMM,
          arrival_time: arrHHMM,
        },
      },
    })
  }

  if (loading) {
    return <div className="p-8 text-slate-500 text-center py-20">Carregando...</div>
  }

  if (!flight) return null

  const diffMin   = flightDurationMinutes(flight.departure_time, flight.arrival_time)
  const depZ      = fmtTimeHHMM(flight.departure_time)
  const arrZ      = fmtTimeHHMM(flight.arrival_time)
  const dateStr   = fmtDateBR(flight.date)

  // Centro do mapa entre os dois aeroportos
  const hasMap = origin && dest && origin.latitude && dest.latitude
  const mapCenter = hasMap
    ? [(origin.longitude + dest.longitude) / 2, (origin.latitude + dest.latitude) / 2]
    : [-47.9, -15.8]

  // Zoom adaptado à distância
  const mapZoom = hasMap ? 4 : 3.5

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl">

      {/* Botão voltar */}
      <button
        onClick={() => navigate('/logbook')}
        className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
      >
        <ArrowLeft size={16} /> Voltar ao Logbook
      </button>

      {/* Cabeçalho */}
      <div className="bg-[#0c1f3d] border border-white/10 rounded-2xl p-5 md:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            {/* Rota principal */}
            <div className="flex items-center gap-2 md:gap-3 mb-1">
              <span className="text-2xl md:text-4xl font-bold font-mono text-blue-300">{flight.origin_icao}</span>
              <span className="text-slate-500 text-lg md:text-2xl">→</span>
              <span className="text-2xl md:text-4xl font-bold font-mono text-blue-300">{flight.destination_icao}</span>
            </div>
            {/* Nomes dos aeroportos */}
            <p className="text-slate-400 text-sm">
              {origin?.name || flight.origin_icao}
              <span className="mx-2 text-slate-600">·</span>
              {dest?.name || flight.destination_icao}
            </p>
            <p className="text-slate-500 text-xs mt-1">{dateStr}</p>
            {/* Badges: função, regras, período */}
            <div className="flex flex-wrap gap-2 mt-3">
              {flight.role && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300">
                  {flight.role}
                </span>
              )}
              {flight.flight_rules && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300">
                  {flight.flight_rules}
                </span>
              )}
              {flight.day_night && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">
                  {flight.day_night === 'NIGHT' ? 'Noturno' : 'Diurno'}
                </span>
              )}
            </div>
          </div>

          {/* Ações */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleReturnLeg}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-400 text-sm font-medium transition-colors"
              title="Criar o voo de volta com a rota invertida"
            >
              <ArrowLeftRight size={14} /> Registrar volta
            </button>
            <button
              onClick={() => navigate(`/edit-flight/${id}`)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              <Pencil size={14} /> Editar
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-slate-400 hover:text-red-400 text-sm font-medium transition-colors"
            >
              <Trash2 size={14} /> Excluir
            </button>
          </div>
        </div>
      </div>

      {/* Cards de informação */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <InfoCard
          icon={Calendar}
          label="Data"
          value={dateStr}
          color="slate"
        />
        <InfoCard
          icon={Clock}
          label="Decolagem (UTC)"
          value={`${depZ}Z`}
          sub={origin?.city || ''}
          color="blue"
        />
        <InfoCard
          icon={Clock}
          label="Pouso (UTC)"
          value={`${arrZ}Z`}
          sub={dest?.city || ''}
          color="green"
        />
        <InfoCard
          icon={Clock}
          label="Tempo de Voo"
          value={toHHMM(diffMin)}
          color="purple"
        />
        <InfoCard
          icon={Plane}
          label="Aeronave"
          value={flight.aircraft.registration}
          sub={flight.aircraft.model}
          color="amber"
        />
        <InfoCard
          icon={MapPin}
          label="Rota"
          value={`${flight.origin_icao} → ${flight.destination_icao}`}
          sub={hasMap ? `${calcDistNm(origin, dest).toLocaleString('pt-BR')} NM (aprox.)` : ''}
          color="slate"
        />
      </div>

      {/* Observações */}
      {flight.remarks && (
        <div className="bg-[#0c1f3d] border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={14} className="text-slate-400" />
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Observações</h3>
          </div>
          <p className="text-slate-300 text-sm leading-relaxed">{flight.remarks}</p>
        </div>
      )}

      {/* Mini-mapa */}
      {hasMap && (
        <div className="bg-[#0c1f3d] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Rota no Mapa</h3>
          </div>
          <div style={{ height: 320 }}>
            <Map theme="dark" center={mapCenter} zoom={mapZoom} className="h-full w-full">
              <MapControls position="top-right" showZoom showCompass />

              {/* Linha da rota */}
              <MapRoute
                coordinates={[
                  [origin.longitude, origin.latitude],
                  [dest.longitude, dest.latitude],
                ]}
                color="#3b82f6"
                width={2.5}
                opacity={0.9}
              />

              {/* Marcador origem */}
              <MapMarker longitude={origin.longitude} latitude={origin.latitude}>
                <MarkerContent>
                  <div className="size-2.5 rounded-full bg-green-400 ring-2 ring-green-400/30" />
                </MarkerContent>
                <MarkerTooltip>
                  <span className="font-mono font-bold">{origin.icao}</span>
                  <br />
                  <span className="text-[10px] opacity-80">{origin.name}</span>
                </MarkerTooltip>
                <MarkerLabel position="bottom">
                  <span className="font-mono text-[9px] text-green-300 bg-black/70 px-1 rounded">{origin.icao}</span>
                </MarkerLabel>
              </MapMarker>

              {/* Marcador destino */}
              <MapMarker longitude={dest.longitude} latitude={dest.latitude}>
                <MarkerContent>
                  <div className="size-2.5 rounded-full bg-red-400 ring-2 ring-red-400/30" />
                </MarkerContent>
                <MarkerTooltip>
                  <span className="font-mono font-bold">{dest.icao}</span>
                  <br />
                  <span className="text-[10px] opacity-80">{dest.name}</span>
                </MarkerTooltip>
                <MarkerLabel position="bottom">
                  <span className="font-mono text-[9px] text-red-300 bg-black/70 px-1 rounded">{dest.icao}</span>
                </MarkerLabel>
              </MapMarker>
            </Map>
          </div>
        </div>
      )}

      {/* Modal de confirmação */}
      <ConfirmModal
        open={confirmOpen}
        title="Excluir voo"
        message={`Excluir o voo ${flight.origin_icao} → ${flight.destination_icao} de ${dateStr}? Esta ação não pode ser desfeita.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

// Distância aproximada em milhas náuticas (fórmula de Haversine)
function calcDistNm(orig, dest) {
  const R_NM = 3440.065 // raio da Terra em NM
  const dLat = deg2rad(dest.latitude  - orig.latitude)
  const dLon = deg2rad(dest.longitude - orig.longitude)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(orig.latitude)) * Math.cos(deg2rad(dest.latitude)) *
    Math.sin(dLon / 2) ** 2
  return Math.round(R_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}
function deg2rad(d) { return d * (Math.PI / 180) }
