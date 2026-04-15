import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useAuthInit } from '@/hooks/useAuth'
import { PageSkeleton } from '@/components/ui/Skeleton'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import Layout from '@/components/layout/Layout'
import LoginPage from '@/pages/LoginPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import DashboardPage from '@/pages/DashboardPage'
import InventarioPage from '@/pages/InventarioPage'
import POSPage from '@/pages/POSPage'
import OrdenesPage from '@/pages/OrdenesPage'
import ClientesPage from '@/pages/ClientesPage'
import DescuentosPage from '@/pages/DescuentosPage'
import AnalisisPage from '@/pages/AnalisisPage'
import HistorialPage from '@/pages/HistorialPage'

function AppRoutes() {
  const { initialized, session } = useAuthStore()

  // Carga inicial — Supabase verificando sesión
  if (!initialized) return <PageSkeleton />

  return (
    <Routes>
      {/* Pública */}
      <Route
        path="/login"
        element={session ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />

      {/* Públicas — recuperación de contraseña */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Protegidas — requieren sesión activa */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard"  element={<DashboardPage />} />
        <Route path="/inventario" element={<InventarioPage />} />
        <Route path="/pos"        element={<POSPage />} />
        <Route path="/ordenes"    element={<OrdenesPage />} />
        <Route path="/clientes"   element={<ClientesPage />} />
        <Route path="/descuentos" element={<DescuentosPage />} />
        <Route path="/analisis"   element={<AnalisisPage />} />
        <Route path="/historial"  element={<HistorialPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  useAuthInit()

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
