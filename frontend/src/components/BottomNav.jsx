import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, BookOpen, PlusCircle, BarChart2,
  Menu, Map, Plane, Settings, ShieldCheck, LogOut, X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

// Atalhos fixos na barra (o resto vai no menu "Mais").
const tabs = [
  { to: '/', label: 'Início', icon: LayoutDashboard, end: true },
  { to: '/logbook', label: 'Logbook', icon: BookOpen },
  { to: '/new-flight', label: 'Novo', icon: PlusCircle },
  { to: '/statistics', label: 'Stats', icon: BarChart2 },
]

const moreLinks = [
  { to: '/map', label: 'Mapa de Rotas', icon: Map },
  { to: '/aircraft', label: 'Aeronaves', icon: Plane },
  { to: '/settings', label: 'Configurações', icon: Settings },
]

const tabClass = ({ isActive }) =>
  `flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[10px] font-medium transition-colors
   ${isActive ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`

const sheetLinkClass = 'flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-slate-300 hover:bg-white/5 transition-colors'

/** Navegação mobile (barra inferior + menu "Mais"). Escondida no desktop (md+). */
export default function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const { authEnabled, profile, logout } = useAuth()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'
  const close = () => setMoreOpen(false)

  const handleLogout = async () => {
    close()
    await logout()
    navigate('/login')
  }

  return (
    <>
      {/* Barra inferior — só mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch
                      bg-[#0c1f3d]/95 backdrop-blur border-t border-white/10
                      pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={tabClass}>
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[10px] font-medium text-slate-500 hover:text-slate-300"
        >
          <Menu size={20} />
          Mais
        </button>
      </nav>

      {/* Menu "Mais" (bottom sheet) */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50" onClick={close}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="absolute bottom-0 inset-x-0 bg-[#0c1f3d] border-t border-white/10 rounded-t-2xl
                       p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-300">Mais</span>
              <button onClick={close} className="text-slate-500 hover:text-white p-1">
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              {moreLinks.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} onClick={close} className={sheetLinkClass}>
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
              {isAdmin && (
                <NavLink to="/admin" onClick={close} className={sheetLinkClass}>
                  <ShieldCheck size={18} />
                  Administração
                </NavLink>
              )}
            </div>

            {authEnabled && profile && (
              <div className="mt-3 pt-3 border-t border-white/5">
                <div className="text-xs text-slate-400 truncate px-3" title={profile.email}>
                  {profile.email}
                </div>
                <button
                  onClick={handleLogout}
                  className="mt-2 flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300"
                >
                  <LogOut size={16} />
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
