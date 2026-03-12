import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
  return (
    <div className="min-h-screen bg-brand-green flex">
      <Sidebar />
      {/* Contenido principal */}
      <main className="flex-1 overflow-auto lg:ml-0">
        <div className="p-6 lg:p-8 pt-16 lg:pt-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
