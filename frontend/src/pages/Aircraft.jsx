import { useEffect, useState } from 'react'
import { getAircraft, createAircraft, deleteAircraft } from '../api'
import { Plane, Trash2, PlusCircle } from 'lucide-react'

export default function Aircraft() {
  const [list, setList] = useState([])
  const [form, setForm] = useState({ registration: '', model: '' })
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const load = () => getAircraft().then(setList).catch(() => {})

  useEffect(() => { load() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await createAircraft(form)
      setForm({ registration: '', model: '' })
      setAdding(false)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao cadastrar aeronave')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Excluir esta aeronave?')) return
    await deleteAircraft(id)
    load()
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Aeronaves</h1>
          <p className="text-slate-400 text-sm mt-1">{list.length} aeronave{list.length !== 1 ? 's' : ''} cadastrada{list.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setAdding(v => !v)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <PlusCircle size={16} /> Nova Aeronave
        </button>
      </div>

      {adding && (
        <form onSubmit={handleSubmit} className="bg-[#0c1f3d] border border-white/10 rounded-xl p-5 space-y-4">
          <h2 className="text-white font-semibold">Cadastrar aeronave</h2>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Matrícula</label>
              <input
                className="w-full bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-white text-sm uppercase focus:outline-none focus:border-blue-500"
                placeholder="PR-ABC"
                value={form.registration}
                onChange={e => setForm(p => ({ ...p, registration: e.target.value.toUpperCase() }))}
                required
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Modelo</label>
              <input
                className="w-full bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="Cessna 172"
                value={form.model}
                onChange={e => setForm(p => ({ ...p, model: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              Salvar
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map(a => (
          <div key={a.id} className="bg-[#0c1f3d] border border-white/10 rounded-xl p-5 flex items-start gap-4">
            <div className="bg-blue-500/10 text-blue-400 p-2 rounded-lg">
              <Plane size={20} />
            </div>
            <div className="flex-1">
              <p className="font-mono font-bold text-white">{a.registration}</p>
              <p className="text-slate-400 text-sm">{a.model}</p>
            </div>
            <button onClick={() => handleDelete(a.id)} className="text-slate-600 hover:text-red-400 transition-colors">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      {list.length === 0 && !adding && (
        <div className="bg-[#0c1f3d] border border-white/10 rounded-xl p-12 text-center text-slate-500">
          Nenhuma aeronave cadastrada.
        </div>
      )}
    </div>
  )
}
