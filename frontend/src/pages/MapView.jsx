import { useEffect, useState, useRef } from 'react'
import {
  Map,
  MapControls,
  MapRoute,
  MapMarker,
  MarkerContent,
  MarkerTooltip,
  MarkerLabel,
  useMap,
} from '@/components/ui/map'
import { getMapRoutes } from '../api'

const toHHMM = (totalMinutes) => {
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const mm = String(totalMinutes % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Componente interno ao <Map> que escuta o mousemove nativo do MapLibre.
 * Detecta quando o cursor saiu de todas as camadas de rota e limpa o hover.
 */
function RouteHoverCleaner({ layerIds, onClear }) {
  const { map, isLoaded } = useMap()

  useEffect(() => {
    if (!map || !isLoaded || layerIds.length === 0) return

    const handleMove = (e) => {
      const activeLayers = layerIds.filter(id => map.getLayer(id))
      if (activeLayers.length === 0) return
      const features = map.queryRenderedFeatures(e.point, { layers: activeLayers })
      if (features.length === 0) onClear()
    }

    map.on('mousemove', handleMove)
    return () => map.off('mousemove', handleMove)
  }, [map, isLoaded, layerIds.join(',')])

  return null
}

export default function MapView() {
  const [routes, setRoutes]     = useState([])
  const [hovered, setHovered]   = useState(null)
  const [mousePos, setMousePos] = useState(null)
  const containerRef = useRef(null)

  useEffect(() => {
    getMapRoutes().then(setRoutes).catch(() => {})
  }, [])

  // Aeroportos únicos para markers
  const airports = {}
  routes.forEach(r => {
    airports[r.origin.icao]      = r.origin
    airports[r.destination.icao] = r.destination
  })
  const airportList = Object.values(airports)

  // IDs das camadas de rota (usados pelo RouteHoverCleaner)
  const layerIds = routes.map((_, i) => `route-layer-r${i}`)

  return (
    <div className="p-8 flex flex-col gap-4 h-screen">
      <div>
        <h1 className="text-2xl font-bold text-white">Mapa de Rotas</h1>
        <p className="text-slate-400 text-sm mt-1">
          {routes.length} rota{routes.length !== 1 ? 's' : ''} única{routes.length !== 1 ? 's' : ''} voada{routes.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div
        ref={containerRef}
        className="flex-1 rounded-xl overflow-hidden border border-white/10 min-h-[500px] relative"
        onMouseMove={e => {
          const rect = containerRef.current.getBoundingClientRect()
          setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
        }}
        onMouseLeave={() => { setHovered(null); setMousePos(null) }}
      >
        {/* Tooltip flutuante — pointer-events:none para não interferir no mapa */}
        {hovered && mousePos && (
          <div
            className="absolute z-20 bg-[#0a1628] border border-white/15 rounded-xl px-4 py-3 shadow-2xl text-sm pointer-events-none min-w-[200px]"
            style={{ left: mousePos.x + 16, top: mousePos.y + 16 }}
          >
            {/* Sentidos da rota */}
            {(hovered.directions?.length > 0 ? hovered.directions : [{
              origin_icao:      hovered.origin?.icao,
              destination_icao: hovered.destination?.icao,
              count:            hovered.count,
              total_minutes:    hovered.total_minutes,
              aircraft:         hovered.aircraft ?? [],
            }]).map((dir, i) => (
              <div key={i} className={i > 0 ? 'mt-3 pt-3 border-t border-white/10' : ''}>
                <p className="font-mono font-bold text-blue-300 mb-1.5">
                  {dir.origin_icao}
                  <span className="text-slate-500 mx-1">→</span>
                  {dir.destination_icao}
                </p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between gap-6">
                    <span className="text-slate-400">Voos</span>
                    <span className="font-semibold text-white">{dir.count}</span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span className="text-slate-400">Tempo total</span>
                    <span className="font-semibold text-white font-mono">{toHHMM(dir.total_minutes ?? 0)}</span>
                  </div>
                  {(dir.aircraft ?? []).length > 0 && (
                    <div className="flex justify-between gap-6">
                      <span className="text-slate-400">Aeronave{dir.aircraft.length > 1 ? 's' : ''}</span>
                      <span className="font-semibold text-white">{dir.aircraft.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <Map theme="dark" center={[-47.9, -15.8]} zoom={3.5} className="h-full w-full">
          <MapControls position="top-right" showZoom showCompass />

          {/* Limpa o hover quando o cursor sai de todas as rotas */}
          <RouteHoverCleaner layerIds={layerIds} onClear={() => setHovered(null)} />

          {/* Rotas */}
          {routes.map((route, i) => {
            const isHovered = hovered?.origin?.icao === route.origin.icao &&
                              hovered?.destination?.icao === route.destination.icao
            const baseWidth = route.count > 1 ? 2 + Math.min(route.count, 6) : 2
            return (
              <MapRoute
                key={i}
                id={`r${i}`}
                coordinates={[
                  [route.origin.lng, route.origin.lat],
                  [route.destination.lng, route.destination.lat],
                ]}
                color={isHovered ? '#60a5fa' : '#3b82f6'}
                width={isHovered ? baseWidth + 2 : baseWidth}
                opacity={isHovered ? 1 : 0.7}
                onMouseEnter={() => setHovered(route)}
              />
            )
          })}

          {/* Marcadores nos aeroportos */}
          {airportList.map(ap => (
            <MapMarker key={ap.icao} longitude={ap.lng} latitude={ap.lat}>
              <MarkerContent>
                <div className="size-1.5 rounded-full bg-blue-400" />
              </MarkerContent>
              <MarkerTooltip>
                <span className="font-mono font-bold">{ap.icao}</span>
                <br />
                <span className="text-[10px] opacity-80">{ap.name}</span>
              </MarkerTooltip>
              <MarkerLabel position="bottom">
                <span className="font-mono text-[9px] text-blue-300 bg-black/60 px-1 rounded">
                  {ap.icao}
                </span>
              </MarkerLabel>
            </MapMarker>
          ))}
        </Map>
      </div>
    </div>
  )
}
