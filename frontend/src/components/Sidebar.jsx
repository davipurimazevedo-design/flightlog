import { NavLink } from 'react-router-dom'
import { LayoutDashboard, BookOpen, Map, Plane, PlusCircle, BarChart2, Settings } from 'lucide-react'
import { useBackendStatus } from '../hooks/useBackendStatus'

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/logbook', label: 'Logbook', icon: BookOpen },
  { to: '/map', label: 'Mapa de Rotas', icon: Map },
  { to: '/statistics', label: 'Estatísticas', icon: BarChart2 },
  { to: '/aircraft', label: 'Aeronaves', icon: Plane },
  { to: '/new-flight', label: 'Novo Voo', icon: PlusCircle },
]

const bottomLinks = [
  { to: '/settings', label: 'Configurações', icon: Settings },
]

const STATUS_CONFIG = {
  online:   { color: 'bg-green-500',  label: 'Backend online' },
  offline:  { color: 'bg-red-500',    label: 'Backend offline' },
  checking: { color: 'bg-yellow-400', label: 'Verificando...' },
}

export default function Sidebar() {
  const backendStatus = useBackendStatus()
  const { color, label } = STATUS_CONFIG[backendStatus]

  return (
    <aside className="w-56 h-screen sticky top-0 bg-[#0c1f3d] border-r border-white/10 flex flex-col py-6 px-3 shrink-0 overflow-y-auto">
      <div className="flex items-center gap-2 px-3 mb-8">
        <Plane className="text-blue-400" size={22} />
        <span className="text-white font-bold text-lg tracking-wide">FlightLog</span>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
              ${isActive
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-1 mt-2 border-t border-white/5 pt-2">
        {bottomLinks.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
              ${isActive
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </div>

      <div className="px-3 mt-3 text-xs text-slate-600 space-y-1">
        <div className="flex items-center gap-2" title={label}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${color} ${backendStatus === 'checking' ? 'animate-pulse' : ''}`} />
          <span>{label}</span>
        </div>
        <div>v1.9.3</div>
        <div>Criado por Davi Purim</div>
      </div>
    </aside>
  )
}
