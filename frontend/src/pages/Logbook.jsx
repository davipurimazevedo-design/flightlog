import { useEffect, useState, useCallback } from 'react'
import { getFlights, countFlights, deleteFlight, getAircraft } from '../api'
import { Trash2, Pencil, ChevronUp, ChevronDown, ChevronsUpDown, Search, X, FileDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import logoSrc from '../assets/logo.png'
import { useDebounce } from '../hooks/useDebounce'
import { useToast } from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'

const PAGE_SIZE = 20

const toHHMM = (totalMinutes) => {
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const mm = String(totalMinutes % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

function SortIcon({ col, sortBy, sortDir }) {
  if (sortBy !== col) return <ChevronsUpDown size={12} className="inline ml-1 text-slate-600" />
  return sortDir === 'asc'
    ? <ChevronUp size={12} className="inline ml-1 text-blue-400" />
    : <ChevronDown size={12} className="inline ml-1 text-blue-400" />
}

export default function Logbook() {
  const navigate = useNavigate()
  const toast = useToast()
  const [confirmId, setConfirmId] = useState(null) // id do voo a excluir

  // ── Filtros ──────────────────────────────────────────────────────────────
  const [search, setSearch]             = useState('')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [aircraftId, setAircraftId]     = useState('')
  const [aircraftList, setAircraftList] = useState([])

  // Debounce: só dispara a busca 400ms após parar de digitar
  const debouncedSearch = useDebounce(search, 400)

  // ── Ordenação ─────────────────────────────────────────────────────────────
  const [sortBy, setSortBy]   = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  // ── Paginação ─────────────────────────────────────────────────────────────
  const [page, setPage]                 = useState(1)
  const [totalFlights, setTotalFlights] = useState(0)
  const [totalMinutes, setTotalMinutes] = useState(0)

  // ── Dados ─────────────────────────────────────────────────────────────────
  const [flights, setFlights] = useState([])
  const [loading, setLoading] = useState(true)

  const totalPages = Math.max(1, Math.ceil(totalFlights / PAGE_SIZE))

  // ── Params de filtro — usa debouncedSearch para evitar chamadas a cada tecla ──
  const buildParams = useCallback(() => {
    const p = {}
    if (debouncedSearch.trim()) p.search      = debouncedSearch.trim()
    if (aircraftId)             p.aircraft_id = aircraftId
    if (dateFrom)               p.date_from   = dateFrom
    if (dateTo)                 p.date_to     = dateTo
    return p
  }, [debouncedSearch, aircraftId, dateFrom, dateTo])

  // ── Carrega contagem + horas totais ───────────────────────────────────────
  const loadCount = useCallback(() => {
    countFlights(buildParams())
      .then(d => { setTotalFlights(d.total); setTotalMinutes(d.total_minutes) })
      .catch(() => {})
  }, [buildParams])

  // ── Carrega voos da página ─────────────────────────────────────────────────
  const loadPage = useCallback((pg) => {
    setLoading(true)
    const params = {
      ...buildParams(),
      skip: (pg - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
      sort_by:  sortBy,
      sort_dir: sortDir,
    }
    getFlights(params)
      .then(setFlights)
      .catch(() => setFlights([]))
      .finally(() => setLoading(false))
  }, [buildParams, sortBy, sortDir])

  // ── Efeitos ────────────────────────────────────────────────────────────────
  useEffect(() => {
    getAircraft().then(setAircraftList).catch(() => {})
  }, [])

  useEffect(() => {
    setPage(1)
    loadCount()
  }, [loadCount])

  useEffect(() => {
    loadPage(page)
  }, [page, loadPage])

  // ── Exportar PDF ───────────────────────────────────────────────────────────
  const exportPDF = async () => {
    // Busca TODOS os voos com os filtros ativos (sem paginação)
    const allFlights = await getFlights({ ...buildParams(), skip: 0, limit: 9999, sort_by: sortBy, sort_dir: sortDir })

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()   // 210mm
    const pageH = doc.internal.pageSize.getHeight()  // 297mm
    const margin = 14
    const now = new Date()
    const dateStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`

    // ── Cabeçalho ──────────────────────────────────────────────────────────
    const headerH = 28
    doc.setFillColor(12, 31, 61)
    doc.rect(0, 0, pageW, headerH, 'F')

    // Logo (18x18mm, centrada verticalmente no cabeçalho)
    try {
      doc.addImage(logoSrc, 'PNG', margin, 5, 18, 18)
    } catch {}

    // Título e subtítulo ao lado da logo
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(255, 255, 255)
    doc.text('FLIGHT LOGBOOK', margin + 22, 14)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text('Diário de Bordo Digital · Davi Purim', margin + 22, 21)

    // Data de geração + totais no canto direito
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text(`${totalFlights} voos  ·  ${toHHMM(totalMinutes)}`, pageW - margin, 13, { align: 'right' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(148, 163, 184)
    doc.text(`Gerado em ${dateStr}`, pageW - margin, 20, { align: 'right' })

    // Filtros ativos
    const filterParts = []
    if (search)     filterParts.push(`ICAO: ${search}`)
    if (dateFrom)   filterParts.push(`De: ${dateFrom}`)
    if (dateTo)     filterParts.push(`Até: ${dateTo}`)
    if (aircraftId) {
      const ac = aircraftList.find(a => String(a.id) === String(aircraftId))
      if (ac) filterParts.push(`Aeronave: ${ac.registration}`)
    }
    if (filterParts.length) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(7)
      doc.setTextColor(100, 160, 220)
      doc.text(`Filtros: ${filterParts.join('  |  ')}`, pageW - margin, 26, { align: 'right' })
    }

    // ── Tabela ─────────────────────────────────────────────────────────────
    // Larguras ajustadas para A4 retrato (182mm utilizáveis)
    const rows = allFlights.map(f => {
      const diffMin = Math.round((new Date(f.arrival_time) - new Date(f.departure_time)) / 60000)
      return [
        `${f.date.slice(8,10)}/${f.date.slice(5,7)}/${f.date.slice(0,4)}`,
        `${f.origin_icao} → ${f.destination_icao}`,
        f.aircraft.registration,
        f.aircraft.model,
        `${f.departure_time.slice(11,16)}Z`,
        `${f.arrival_time.slice(11,16)}Z`,
        toHHMM(diffMin),
      ]
    })

    autoTable(doc, {
      startY: headerH + 4,
      margin: { left: margin, right: margin },
      head: [['Data', 'Rota', 'Matrícula', 'Modelo', 'Decolagem', 'Pouso', 'Tempo']],
      body: rows,
      foot: [['', `Total: ${totalFlights} voo${totalFlights !== 1 ? 's' : ''}`, '', '', '', '', toHHMM(totalMinutes)]],

      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 2.5,
        textColor: [220, 230, 240],
        fillColor: [10, 22, 40],
        lineColor: [30, 50, 80],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [30, 64, 120],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      footStyles: {
        fillColor: [20, 40, 80],
        textColor: [150, 200, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: [14, 28, 52],
      },
      columnStyles: {
        0: { cellWidth: 22 },  // Data
        1: { cellWidth: 38 },  // Rota
        2: { cellWidth: 22 },  // Matrícula
        3: { cellWidth: 32 },  // Modelo
        4: { cellWidth: 20 },  // Decolagem
        5: { cellWidth: 20 },  // Pouso
        6: { cellWidth: 28, fontStyle: 'bold', textColor: [100, 200, 255] }, // Tempo
      },
      didDrawPage: (data) => {
        // Rodapé de página
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(100, 100, 120)
        doc.text(
          `Página ${data.pageNumber} de ${doc.internal.getNumberOfPages()}`,
          pageW / 2, pageH - 6,
          { align: 'center' }
        )
      },
    })

    const fname = `logbook_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.pdf`
    doc.save(fname)
  }

  // ── Ações ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    await deleteFlight(confirmId)
    setConfirmId(null)
    toast('Voo excluído.', 'warning')
    loadCount()
    loadPage(page)
  }

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
    setPage(1)
  }

  const clearFilters = () => {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setAircraftId('')
    setPage(1)
  }

  const hasFilters = search || dateFrom || dateTo || aircraftId

  const inputCls = "bg-[#0a1628] border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
  const thCls = "px-5 py-3 text-left cursor-pointer select-none hover:text-white transition-colors whitespace-nowrap"

  return (
    <div className="p-8 space-y-5">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Logbook</h1>
          <p className="text-slate-400 text-sm mt-1">
            {totalFlights} voo{totalFlights !== 1 ? 's' : ''} · Total {toHHMM(totalMinutes)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportPDF}
            disabled={totalFlights === 0}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <FileDown size={15} /> Exportar PDF
          </button>
          <button
            onClick={() => navigate('/new-flight')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            + Novo Voo
          </button>
        </div>
      </div>

      {/* Barra de filtros */}
      <div className="bg-[#0c1f3d] border border-white/10 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-end">

          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-slate-400 mb-1 block">Origem / Destino</label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Ex: SBBR"
                value={search}
                onChange={e => setSearch(e.target.value.toUpperCase())}
                maxLength={4}
                className={`${inputCls} pl-8 w-full`}
              />
            </div>
          </div>

          <div className="flex-1 min-w-[130px]">
            <label className="text-xs text-slate-400 mb-1 block">Data início</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className={`${inputCls} w-full`}
            />
          </div>

          <div className="flex-1 min-w-[130px]">
            <label className="text-xs text-slate-400 mb-1 block">Data fim</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className={`${inputCls} w-full`}
            />
          </div>

          <div className="flex-1 min-w-[160px]">
            <label className="text-xs text-slate-400 mb-1 block">Aeronave</label>
            <select
              value={aircraftId}
              onChange={e => setAircraftId(e.target.value)}
              className={`${inputCls} w-full`}
            >
              <option value="">Todas</option>
              {aircraftList.map(ac => (
                <option key={ac.id} value={ac.id}>{ac.registration} — {ac.model}</option>
              ))}
            </select>
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors self-end"
            >
              <X size={12} /> Limpar
            </button>
          )}
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="text-center text-slate-500 py-20">Carregando...</div>
      ) : flights.length === 0 ? (
        <div className="bg-[#0c1f3d] border border-white/10 rounded-xl p-12 text-center text-slate-500">
          {hasFilters ? 'Nenhum voo encontrado com os filtros selecionados.' : 'Nenhum voo registrado ainda.'}
        </div>
      ) : (
        <div className="bg-[#0c1f3d] border border-white/10 rounded-xl overflow-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-white/10 text-slate-400 text-xs uppercase tracking-wider">
                <th className={thCls} onClick={() => handleSort('date')}>
                  Data <SortIcon col="date" sortBy={sortBy} sortDir={sortDir} />
                </th>
                <th className={thCls} onClick={() => handleSort('origin')}>
                  Rota <SortIcon col="origin" sortBy={sortBy} sortDir={sortDir} />
                </th>
                <th className="px-5 py-3 text-left">Aeronave</th>
                <th className={thCls} onClick={() => handleSort('departure')}>
                  Decolagem <SortIcon col="departure" sortBy={sortBy} sortDir={sortDir} />
                </th>
                <th className={thCls} onClick={() => handleSort('arrival')}>
                  Pouso <SortIcon col="arrival" sortBy={sortBy} sortDir={sortDir} />
                </th>
                <th className="px-5 py-3 text-left">Tempo de Voo</th>
                <th className="px-5 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody>
              {flights.map(f => {
                const diffMin = Math.round((new Date(f.arrival_time) - new Date(f.departure_time)) / 60000)
                const depZ = f.departure_time.slice(11, 16)
                const arrZ = f.arrival_time.slice(11, 16)
                return (
                  <tr
                    key={f.id}
                    onClick={() => navigate(`/flight/${f.id}`)}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3 text-slate-300 whitespace-nowrap">
                      {f.date.slice(8,10)}/{f.date.slice(5,7)}/{f.date.slice(0,4)}
                    </td>
                    <td className="px-5 py-3 font-mono whitespace-nowrap">
                      <span className="text-blue-300">{f.origin_icao}</span>
                      <span className="text-slate-500 mx-1">→</span>
                      <span className="text-blue-300">{f.destination_icao}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-300">{f.aircraft.registration}</td>
                    <td className="px-5 py-3 text-slate-400 font-mono text-xs">{depZ}Z</td>
                    <td className="px-5 py-3 text-slate-400 font-mono text-xs">{arrZ}Z</td>
                    <td className="px-5 py-3 text-white font-semibold font-mono">{toHHMM(diffMin)}</td>
                    <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/edit-flight/${f.id}`)}
                          className="text-slate-400 hover:text-blue-400 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmId(f.id)}
                          className="text-slate-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>

            {/* Rodapé com totais */}
            <tfoot>
              <tr className="border-t border-white/10 bg-white/5 text-xs text-slate-400 font-medium">
                <td className="px-5 py-2" colSpan={5}>
                  Total ({totalFlights} voo{totalFlights !== 1 ? 's' : ''})
                </td>
                <td className="px-5 py-2 font-mono text-white font-semibold">{toHHMM(totalMinutes)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      <ConfirmModal
        open={confirmId !== null}
        title="Excluir voo"
        message="Esta ação não pode ser desfeita. Deseja continuar?"
        onConfirm={handleDelete}
        onCancel={() => setConfirmId(null)}
      />

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Página {page} de {totalPages} · {flights.length} de {totalFlights} voos
          </span>
          <div className="flex gap-1.5">
            <button onClick={() => setPage(1)} disabled={page === 1}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">«</button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">‹</button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4))
              const pg = start + i
              return (
                <button key={pg} onClick={() => setPage(pg)}
                  className={`px-2.5 py-1.5 rounded-lg transition-colors ${
                    pg === page ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}>{pg}</button>
              )
            })}

            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">›</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">»</button>
          </div>
        </div>
      )}
    </div>
  )
}
