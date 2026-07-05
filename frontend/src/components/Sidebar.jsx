import { NavLink } from 'react-router-dom'
import { LayoutDashboard, BookOpen, Map, Plane, PlusCircle, BarChart2, Settings, Shield, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { APP_VERSION } from '../version'

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/logbook', label: 'Logbook', icon: BookOpen },
  { to: '/map', label: 'Mapa de Rotas', icon: Map },
  { to: '/statistics', label: 'Estatísticas', icon: BarChart2 },
  { to: '/aircraft', label: 'Aeronaves', icon: Plane },
  { to: '/new-flight', label: 'Novo Voo', icon: PlusCircle },
]

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
  ${isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`

export default function Sidebar() {
  const { authEnabled, profile, logout } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const bottomLinks = [
    ...(isAdmin ? [{ to: '/admin', label: 'Administração', icon: Shield }] : []),
    { to: '/settings', label: 'Configurações', icon: Settings },
  ]

  return (
    <aside className="hidden md:flex w-56 h-screen sticky top-0 bg-[#0c1f3d] border-r border-white/10 flex-col py-6 px-3 shrink-0 overflow-y-auto">
      <div className="px-3 mb-8 flex items-center gap-2">
        <Plane className="text-blue-400" size={22} />
        <div className="flex flex-col items-end">
          <span className="text-white font-bold text-lg tracking-wide leading-tight">FlightLog</span>
          <span className="text-[9px] font-semibold text-amber-400 leading-tight -mt-0.5">brasil</span>
          <span className="text-[11px] text-slate-500 font-mono leading-tight">v{APP_VERSION}</span>
        </div>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={linkClass}>
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-1 mt-2 border-t border-white/5 pt-2">
        {bottomLinks.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClass}>
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </div>

      {authEnabled && profile ? (
        <div className="px-3 mt-3 border-t border-white/5 pt-3">
          <div className="text-xs text-slate-400 truncate" title={profile.email}>{profile.email}</div>
          <button
            onClick={logout}
            className="mt-2 flex items-center gap-2 text-xs text-slate-500 hover:text-white transition-colors"
          >
            <LogOut size={13} /> Sair
          </button>
        </div>
      ) : (
        <div className="px-3 mt-3 text-xs text-slate-600">
          <div>Criado por Davi Purim</div>
        </div>
      )}
    </aside>
  )
}
