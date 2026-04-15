import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/api'
import type { UserRole } from '@/types'

async function fetchRole(setRole: (role: UserRole | null) => void) {
  try {
    const { data } = await api.get<{ data: { role: UserRole } }>('/api/auth/me')
    setRole(data.data.role)
  } catch {
    setRole('vendedor') // fallback seguro
  }
}

/**
 * Inicializa la sesión de Supabase y escucha cambios de auth.
 * Debe usarse una sola vez en App.tsx.
 */
export function useAuthInit() {
  const setSession = useAuthStore((s) => s.setSession)
  const setRole = useAuthStore((s) => s.setRole)

  useEffect(() => {
    // Sesión inicial
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) fetchRole(setRole)
    })

    // Listener de cambios (login, logout, refresh token)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        fetchRole(setRole)
      } else {
        setRole(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [setSession, setRole])
}
