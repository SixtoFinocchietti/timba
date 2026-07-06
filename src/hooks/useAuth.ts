import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useTemaStore } from '@/store/temaStore'
import { TemaApp } from '@/types'

export function useAuth() {
  const { session, usuario, cargando, setSession, setUsuario, setCargando, signOut } = useAuthStore()
  const { setTema } = useTemaStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) cargarUsuario(session.user.id)
      else setCargando(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) cargarUsuario(session.user.id)
      else {
        setUsuario(null)
        setCargando(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function cargarUsuario(userId: string) {
    const { data: existing } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', userId)
      .single()

    if (existing) {
      setUsuario(existing)
      if (existing.tema === 'claro' || existing.tema === 'oscuro') {
        setTema(existing.tema as TemaApp)
      }
      setCargando(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const email = user?.email ?? ''
    const nombre = (user?.user_metadata?.nombre as string | undefined) || email.split('@')[0]
    const { data: nuevo } = await supabase
      .from('usuarios')
      .insert({ id: userId, email, nombre })
      .select()
      .single()

    setUsuario(nuevo)
    setCargando(false)
  }

  return { session, usuario, cargando, signOut }
}
