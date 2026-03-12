import { NavLink, useNavigate } from 'react-router-dom'
import logo from '@/assets/logo_culto.webp'
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ClipboardList,
  Users,
  Tag,
  BarChart2,
  History,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/dashboard',  label: 'Dashboard',           icon: LayoutDashboard },
  { to: '/inventario', label: 'Inventario',           icon: Package },
  { to: '/pos',        label: 'Nueva Orden',          icon: ShoppingCart },
  { to: '/ordenes',    label: 'Órdenes',              icon: ClipboardList },
  { to: '/clientes',   label: 'Clientes',             icon: Users },
  { to: '/descuentos', label: 'Descuentos',           icon: Tag },
  { to: '/analisis',   label: 'Análisis',             icon: BarChart2 },
  { to: '/historial',  label: 'Historial Inventario', icon: History },
]

export default function Sidebar() {
  const { signOut } = useAuthStore()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <>
      {/* Botón hamburguesa — mobile */}
      <button
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-black/30 text-white lg:hidden"
        onClick={() => setMobileOpen((v) => !v)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full z-40 flex flex-col',
          'w-64 bg-black/40 backdrop-blur-sm border-r border-white/10',
          'transition-transform duration-300 ease-in-out',
          // Mobile: oculto por defecto, visible cuando mobileOpen
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: siempre visible
          'lg:translate-x-0 lg:static lg:z-auto'
        )}
      >
        {/* Logo / Header */}
        <div className="px-5 py-5 border-b border-white/10 shrink-0">
          <img src={logo} alt="Culto Orquídeas" className="h-10 w-auto max-w-full mix-blend-luminosity brightness-150" />
          <p className="text-white/40 text-xs mt-2">Panel de administración</p>
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-lime text-brand-black'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )
              }
            >
              <Icon size={18} className="shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer — logout */}
        <div className="px-3 pb-5 pt-3 border-t border-white/10 shrink-0">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors w-full"
          >
            <LogOut size={18} className="shrink-0" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
    </>
  )
}
