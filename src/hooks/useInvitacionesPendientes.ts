// Hook compartido para invitaciones a jugar (roadmap Pool §9, "camino
// incremental"): Blackjack, Poker y Pool tenían cada uno su propia
// cargarInvitaciones() casi idéntica (mismo patrón de query, mismo
// .limit(5), mismo corte de 48h client-side). Esto extrae esa lógica sin
// tocar la UI de ningún juego — cada pantalla sigue renderizando sus propias
// cards y parseando su propio `contenido`, solo deja de reimplementar la
// query + el realtime + la resolución de nombres.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

export interface InvitacionPendiente {
  id: string
  emisor_id: string
  contenido: string
  created_at: string
  emisorNombre: string
}

const VENTANA_DEFAULT_MS = 48 * 60 * 60 * 1000
const LIMITE_DEFAULT = 5

export function useInvitacionesPendientes(
  tipo: string,
  opciones?: { ventanaMs?: number; limite?: number },
): { invitaciones: InvitacionPendiente[]; recargar: () => void } {
  const { usuario } = useAuthStore()
  const ventanaMs = opciones?.ventanaMs ?? VENTANA_DEFAULT_MS
  const limite = opciones?.limite ?? LIMITE_DEFAULT
  const [invitaciones, setInvitaciones] = useState<InvitacionPendiente[]>([])

  const cargar = useCallback(async () => {
    if (!usuario?.id) return
    const desde = new Date(Date.now() - ventanaMs).toISOString()
    const { data: msgs } = await supabase
      .from('mensajes')
      .select('id, emisor_id, contenido, created_at')
      .eq('receptor_id', usuario.id)
      .eq('tipo', tipo)
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(limite)

    if (!msgs?.length) { setInvitaciones([]); return }

    const emisorIds = [...new Set((msgs as any[]).map((m: any) => m.emisor_id))]
    const { data: users } = await supabase
      .from('usuarios_publicos')
      .select('id, nombre')
      .in('id', emisorIds)

    const nameMap: Record<string, string> = Object.fromEntries(
      (users ?? []).map((u: any) => [u.id, u.nombre])
    )
    setInvitaciones((msgs as any[]).map((m: any) => ({
      ...m,
      emisorNombre: nameMap[m.emisor_id] ?? 'Amigo',
    })))
  }, [usuario?.id, tipo, ventanaMs, limite])

  useEffect(() => {
    if (!usuario?.id) return
    cargar()
    const canal = supabase
      .channel(`invitaciones-${tipo}-${usuario.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensajes',
        filter: `receptor_id=eq.${usuario.id}`,
      }, (payload: any) => {
        if (payload.new?.tipo === tipo) cargar()
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [usuario?.id, tipo, cargar])

  return { invitaciones, recargar: cargar }
}
