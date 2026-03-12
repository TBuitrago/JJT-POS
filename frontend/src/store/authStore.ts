import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthStore {
  user: User | null
  session: Session | null
  loading: boolean
  initialized: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  setSession: (session: Session | null) => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  session: null,
  loading: false,
  initialized: false,

  signIn: async (email, password) => {
    set({ loading: true })
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    set({ loading: false })
    if (error) return { error: error.message }
    set({ user: data.user, session: data.session })
    return { error: null }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null })
  },

  setSession: (session) => {
    set({
      session,
      user: session?.user ?? null,
      initialized: true,
    })
  },
}))
