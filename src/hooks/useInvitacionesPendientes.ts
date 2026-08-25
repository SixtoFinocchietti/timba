// Hook compartido para invitaciones a jugar (roadmap Pool §9, "camino
// incremental"): Blackjack, Poker y Pool tenían cada uno su propia
// cargarInvitaciones() casi idéntica (mismo patrón de query, mismo
// .limit(5), mismo corte de 48h client-side). Esto extrae esa lógica sin
// tocar la UI de ningún juego — cada pantalla sigue renderizando sus propias
// cards y parseando su propio `contenido`, solo deja de reimplementar la
// query + el realtime + la resolución de nombres.
//
// Fase 11 paso 2: la expiración ya no se calcula acá (48h/10min mágicos
// repetidos por pantalla) — mensajes.expira_en la calcula un trigger en la
// base, una sola vez, según el tipo (migración 026). Acá solo se filtra por
// ella. `tipo` acepta un array para la pantalla única de Invitaciones, que
// necesita traer varios tipos de una sola vez.

import { useState, useEffect, useCallback, useMemo, useId } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

export interface InvitacionPendiente {
  id: string
  emisor_id: string
  tipo: string
  contenido: string
  created_at: string
  emisorNombre: string
}

const LIMITE_DEFAULT = 5

// clave compartida de "descartadas" — el id de mensaje es único en toda la
// tabla, así que un descarte hecho desde la pantalla única de Invitaciones
// o desde el inbox propio de un juego (hoy solo Pool tiene uno) es el mismo dato
export const CLAVE_INV_DESCARTADAS = '@timba:invitaciones_descartadas'

// los 5 tipos de invitación que existen hoy (mensajes_tipo_check) — central
// acá para que la pantalla única y el badge del Drawer no lo dupliquen
export const TIPOS_INVITACION = [
  'invitacion_timba', 'invitacion_pool', 'invitacion_blackjack', 'invitacion_poker', 'invitacion_truco',
] as const

export function useInvitacionesPendientes(
  tipo: string | string[],
  opciones?: { limite?: number },
): { invitaciones: InvitacionPendiente[]; recargar: () => void } {
  const { usuario } = useAuthStore()
  const limite = opciones?.limite ?? LIMITE_DEFAULT
  const [invitaciones, setInvitaciones] = useState<InvitacionPendiente[]>([])
  const tiposKey = Array.isArray(tipo) ? tipo.join(',') : tipo
  const tipos = useMemo(() => tiposKey.split(','), [tiposKey])
  // id único por instancia del hook: el Drawer (badge, siempre montado) y una
  // pantalla como app/invitaciones.tsx pueden pedir los mismos tipos al mismo
  // tiempo, lo que arma el mismo nombre de canal realtime — sin esto, la
  // segunda instancia reutiliza el canal ya suscripto de la primera y
  // .on() explota con "cannot add postgres_changes callbacks ... after
  // subscribe()" (bug real reportado en el celular, ago 2026).
  const idInstancia = useId()

  const cargar = useCallback(async () => {
    if (!usuario?.id) return
    const ahora = new Date().toISOString()
    const { data: msgs } = await supabase
      .from('mensajes')
      .select('id, emisor_id, tipo, contenido, created_at')
      .eq('receptor_id', usuario.id)
      .in('tipo', tipos)
      .gt('expira_en', ahora)
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
  }, [usuario?.id, tiposKey, limite])

  useEffect(() => {
    if (!usuario?.id) return
    cargar()
    const canal = supabase
      .channel(`invitaciones-${tiposKey}-${usuario.id}-${idInstancia}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensajes',
        filter: `receptor_id=eq.${usuario.id}`,
      }, (payload: any) => {
        if (tipos.includes(payload.new?.tipo)) cargar()
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [usuario?.id, tiposKey, cargar])

  return { invitaciones, recargar: cargar }
}
