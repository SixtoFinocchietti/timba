import { create } from 'zustand'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Usuario } from '@/types'

interface AuthState {
  session: Session | null
  usuario: Usuario | null
  cargando: boolean
  setSession: (session: Session | null) => void
  setUsuario: (usuario: Usuario | null) => void
  setCargando: (cargando: boolean) => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  usuario: null,
  cargando: true,
  setSession: (session) => set({ session }),
  setUsuario: (usuario) => set({ usuario }),
  setCargando: (cargando) => set({ cargando }),
  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, usuario: null })
  },
}))
