import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

/**
 * Inicializa la sesión de Supabase y escucha cambios de auth.
 * Debe usarse una sola vez en App.tsx.
 */
export function useAuthInit() {
  const setSession = useAuthStore((s) => s.setSession)

  useEffect(() => {
    // Sesión inicial
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    // Listener de cambios (login, logout, refresh token)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [setSession])
}
