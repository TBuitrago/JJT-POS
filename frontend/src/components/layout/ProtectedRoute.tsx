import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { PageSkeleton } from '@/components/ui/Skeleton'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { session, initialized } = useAuthStore()

  // Mientras Supabase verifica la sesión inicial, mostramos skeleton
  if (!initialized) return <PageSkeleton />

  // Sin sesión → redirigir al login
  if (!session) return <Navigate to="/login" replace />

  return <>{children}</>
}
