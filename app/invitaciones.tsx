// Pantalla única de Invitaciones (roadmap Pool §9.2, Fase 11 paso 2):
// Timba, Truco, Blackjack, Poker y Pool son todas mensajes de chat
// (mensajes.tipo = 'invitacion_*') que hasta ahora solo se veían en el
// inbox propio de cada juego (o, para Truco/Timba, únicamente dentro del
// chat con esa persona). Esta pantalla las junta en un solo lugar con
// filtro por tipo, sin duplicar la lógica de aceptar cada una — cada rama
// de aceptarInvitacion() replica exactamente la navegación que ya usa la
// pantalla propia de ese juego (o la card del chat, para Truco/Timba).

import { useMemo, useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { AppIcon, IconName } from '@/components/ui/AppIcon'
import {
  useInvitacionesPendientes, InvitacionPendiente, CLAVE_INV_DESCARTADAS, TIPOS_INVITACION,
} from '@/hooks/useInvitacionesPendientes'

type FiltroId = 'todas' | typeof TIPOS_INVITACION[number]

const FILTROS: { id: FiltroId; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'invitacion_timba', label: 'Timba' },
  { id: 'invitacion_pool', label: 'Pool' },
  { id: 'invitacion_blackjack', label: 'Blackjack' },
  { id: 'invitacion_poker', label: 'Poker' },
  { id: 'invitacion_truco', label: 'Truco' },
]

const ICONO_POR_TIPO: Record<string, IconName> = {
  invitacion_timba: 'timba',
  invitacion_pool: 'pool',
  invitacion_blackjack: 'poker',
  invitacion_poker: 'poker',
  invitacion_truco: 'machoEspada',
}

const TITULO_POR_TIPO: Record<string, string> = {
  invitacion_timba: 'Timba',
  invitacion_pool: 'Pool',
  invitacion_blackjack: 'Blackjack',
  invitacion_poker: 'Poker',
  invitacion_truco: 'Truco',
}

function resumenDe(inv: InvitacionPendiente): string {
  let cfg: any = {}
  try { cfg = JSON.parse(inv.contenido ?? '{}') } catch {}
  switch (inv.tipo) {
    case 'invitacion_pool':
      return `${cfg.serie === 3 ? 'Mejor de 3' : 'Partida suelta'} · ${cfg.timer === 0 ? 'sin límite' : `${cfg.timer}s por tiro`}${cfg.timbaId ? ' · 🎲 con timba' : ''}`
    case 'invitacion_blackjack':
      return `${(cfg.fichas ?? 5000).toLocaleString('es-AR')} fichas · Banca rotativa`
    case 'invitacion_poker': {
      const limites: Record<string, string> = { limitadas: 'Limitadas', bote: 'Al bote', sinLimite: 'Sin límite' }
      const modos: Record<string, string> = { turno: 'Turno', vivo: 'En vivo' }
      return `${limites[cfg.limite] ?? cfg.limite ?? ''} · ${(cfg.fichas ?? 5000).toLocaleString('es-AR')} fichas · ${modos[cfg.modo] ?? cfg.modo ?? ''}`
    }
    case 'invitacion_truco':
      return cfg.conFlor ? 'Con flor' : 'Sin flor'
    case 'invitacion_timba':
      return cfg.titulo ?? 'Invitación a Timba'
    default:
      return ''
  }
}

function aceptarInvitacion(inv: InvitacionPendiente) {
  let cfg: any = {}
  try { cfg = JSON.parse(inv.contenido ?? '{}') } catch {}
  switch (inv.tipo) {
    case 'invitacion_pool':
      router.push({
        pathname: '/juegos/sala-pool',
        params: {
          amigo: cfg.hostNombre || inv.emisorNombre,
          amigoId: cfg.hostId || inv.emisor_id,
          serie: String(cfg.serie ?? 1),
          timer: String(cfg.timer ?? 45),
          modo_sala: 'invitado',
          asistenciaHost: cfg.asistenciaHost ?? 'normal',
          asistenciaInvitado: cfg.asistenciaInvitado ?? 'normal',
          ...(cfg.timbaId ? { timbaId: cfg.timbaId } : {}),
        },
      } as any)
      return
    case 'invitacion_blackjack':
      router.push({
        pathname: '/juegos/sala-blackjack',
        params: {
          amigo: cfg.hostNombre || inv.emisorNombre,
          amigoId: cfg.hostId || inv.emisor_id,
          fichas: String(cfg.fichas ?? 5000),
          corona: cfg.corona ? '1' : '0',
          coronaPct: String(cfg.coronaPct ?? 25),
          modo_sala: 'invitado',
        },
      } as any)
      return
    case 'invitacion_poker':
      router.push({
        pathname: '/juegos/sala-poker',
        params: {
          amigo: cfg.hostNombre || inv.emisorNombre,
          amigoId: cfg.hostId || inv.emisor_id,
          modo: cfg.modo ?? 'vivo',
          jugadores: String(cfg.jugadores ?? 2),
          limite: cfg.limite ?? 'sinLimite',
          fichas: String(cfg.fichas ?? 5000),
          modo_sala: 'invitado',
        },
      } as any)
      return
    case 'invitacion_truco':
      router.push('/juegos/truco-juego' as any)
      return
    case 'invitacion_timba':
      if (cfg.codigo) router.push(`/join/${cfg.codigo}` as any)
      return
  }
}

export default function Invitaciones() {
  const c = useColores()
  const es = makeEstilos(c)
  const [filtro, setFiltro] = useState<FiltroId>('todas')
  const { invitaciones } = useInvitacionesPendientes([...TIPOS_INVITACION], { limite: 30 })
  const [descartadas, setDescartadas] = useState<Set<string>>(new Set())

  useEffect(() => {
    AsyncStorage.getItem(CLAVE_INV_DESCARTADAS).then(v => {
      if (v) { try { setDescartadas(new Set(JSON.parse(v))) } catch {} }
    })
  }, [])

  function descartar(id: string) {
    setDescartadas(prev => {
      const next = new Set(prev)
      next.add(id)
      AsyncStorage.setItem(CLAVE_INV_DESCARTADAS, JSON.stringify([...next]))
      return next
    })
  }

  const visibles = useMemo(
    () => invitaciones.filter(inv => !descartadas.has(inv.id) && (filtro === 'todas' || inv.tipo === filtro)),
    [invitaciones, descartadas, filtro],
  )

  return (
    <View style={es.contenedor}>
      <View style={es.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={es.btnVolver}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={es.btnVolverTexto}>←</Text>
        </TouchableOpacity>
        <Text style={es.titulo}>Invitaciones</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        horizontal
        data={FILTROS}
        keyExtractor={f => f.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={es.filtros}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[es.filtro, { backgroundColor: c.fondoCard, borderColor: filtro === item.id ? c.primario : c.borde }]}
            onPress={() => setFiltro(item.id)}
            activeOpacity={0.8}
          >
            <Text style={[es.filtroTexto, { color: filtro === item.id ? c.primario : c.textoSuave }]}>{item.label}</Text>
          </TouchableOpacity>
        )}
      />

      <FlatList
        data={visibles}
        keyExtractor={inv => inv.id}
        contentContainerStyle={es.lista}
        renderItem={({ item }) => (
          <View style={[es.card, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
            <AppIcon name={ICONO_POR_TIPO[item.tipo] ?? 'juegos'} size={26} color={c.primario} />
            <View style={{ flex: 1 }}>
              <Text style={[es.cardTitulo, { color: c.texto }]} numberOfLines={1}>
                {TITULO_POR_TIPO[item.tipo] ?? item.tipo} · {item.emisorNombre}
              </Text>
              <Text style={[es.cardDetalle, { color: c.textoSuave }]} numberOfLines={1}>{resumenDe(item)}</Text>
            </View>
            <TouchableOpacity
              style={[es.botonAceptar, { backgroundColor: c.primario }]}
              onPress={() => aceptarInvitacion(item)}
              activeOpacity={0.8}
            >
              <Text style={[es.botonAceptarTexto, { color: c.fondo }]}>
                {item.tipo === 'invitacion_timba' ? 'Unirse' : 'Jugar'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => descartar(item.id)} activeOpacity={0.7} hitSlop={10}>
              <AppIcon name="xCirculo" size={20} color={c.textoSuave} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={es.vacio}>
            <AppIcon name="juegos" size={40} color={c.textoSuave} />
            <Text style={[es.vacioTexto, { color: c.textoSuave }]}>No tenés invitaciones pendientes</Text>
          </View>
        }
      />
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: c.fondo },
    topBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16,
    },
    btnVolver: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    btnVolverTexto: { color: c.primario, fontSize: 24, fontWeight: '600' },
    titulo: { color: c.texto, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
    filtros: { paddingHorizontal: 20, gap: 8, paddingBottom: 12 },
    filtro: { borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 8 },
    filtroTexto: { fontSize: 13, fontWeight: '700' },
    lista: { paddingHorizontal: 20, paddingBottom: 40, gap: 10 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderRadius: 16, borderWidth: 1, padding: 14,
    },
    cardTitulo: { fontSize: 14, fontWeight: '700' },
    cardDetalle: { fontSize: 12, marginTop: 2 },
    botonAceptar: { borderRadius: 11, paddingVertical: 9, paddingHorizontal: 14 },
    botonAceptarTexto: { fontSize: 13, fontWeight: '700' },
    vacio: { alignItems: 'center', gap: 10, paddingTop: 80 },
    vacioTexto: { fontSize: 14 },
  })
}
