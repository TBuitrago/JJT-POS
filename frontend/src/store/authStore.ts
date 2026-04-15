import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { UserRole } from '@/types'

interface AuthStore {
  user: User | null
  session: Session | null
  role: UserRole | null
  loading: boolean
  initialized: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  setSession: (session: Session | null) => void
  setRole: (role: UserRole | null) => void
  isAdmin: () => boolean
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  session: null,
  role: null,
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
    set({ user: null, session: null, role: null })
  },

  setSession: (session) => {
    set({
      session,
      user: session?.user ?? null,
      initialized: true,
    })
  },

  setRole: (role) => set({ role }),

  isAdmin: () => get().role === 'admin',
}))
