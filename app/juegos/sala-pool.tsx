// Sala de espera del Pool online (patrón sala-blackjack.tsx):
// ambos anuncian presencia en un canal; el host ve cuando el invitado se une
// y arranca la partida (INSERT en partidas_pool); el invitado escucha ese
// INSERT filtrado por su id y navega solo.

import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { AppIcon } from '@/components/ui/AppIcon'
import { estadoInicialOnline } from '@/lib/pool/online'

function nuevaSeed(): number {
  return (Date.now() ^ (Math.random() * 0x7fffffff)) | 0
}

export default function SalaPool() {
  const c = useColores()
  const es = makeEstilos(c)
  const { usuario } = useAuthStore()

  const params = useLocalSearchParams<{
    amigo: string
    amigoId: string
    serie: string
    timer: string
    modo_sala: string
  }>()

  const amigoNombre = params.amigo ?? 'Amigo'
  const serie = params.serie === '3' ? 3 : 1
  const timer = [0, 30, 45, 60].includes(parseInt(params.timer ?? '45', 10))
    ? (parseInt(params.timer ?? '45', 10) as 0 | 30 | 45 | 60)
    : 45
  const esInvitado = params.modo_sala === 'invitado'

  const [amigoUnido, setAmigoUnido] = useState(esInvitado)
  const [creando, setCreando] = useState(false)
  const [reenviando, setReenviando] = useState(false)

  const subtitulo = `${serie === 3 ? 'Mejor de 3' : 'Partida suelta'} · ${timer === 0 ? 'Sin límite de tiempo' : `${timer}s por tiro`}`

  // Presencia: el host detecta cuando el invitado aparece
  useEffect(() => {
    if (!usuario?.id || !params.amigoId) return
    const roomKey = [usuario.id, params.amigoId].sort().join('_')
    const canal = supabase.channel(`sala-pool-${roomKey}`)

    canal
      .on('presence', { event: 'sync' }, () => {
        if (esInvitado) return
        const state = canal.presenceState<{ rol: string }>()
        const hayInvitado = Object.values(state).some(ps =>
          (ps as any[]).some((p: { rol: string }) => p.rol === 'invitado')
        )
        if (hayInvitado) setAmigoUnido(true)
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await canal.track({ rol: esInvitado ? 'invitado' : 'host' })
        }
      })

    return () => { supabase.removeChannel(canal) }
  }, [usuario?.id, params.amigoId, esInvitado])

  // Invitado: escucha el INSERT en partidas_pool y navega al juego
  useEffect(() => {
    if (!esInvitado || !usuario?.id) return
    const canal = supabase
      .channel('sala-pool-inicio')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'partidas_pool',
        filter: `invitado_id=eq.${usuario.id}`,
      }, payload => {
        router.replace({
          pathname: '/juegos/partida-pool',
          params: { modo: 'online', partidaId: payload.new.id },
        } as any)
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [esInvitado, usuario?.id])

  async function reenviarInvitacion() {
    if (!usuario?.id || !params.amigoId || reenviando) return
    setReenviando(true)
    const contenido = JSON.stringify({
      serie,
      timer,
      hostId: usuario.id,
      hostNombre: usuario?.nombre ?? '',
    })
    await supabase.from('mensajes').insert({
      emisor_id: usuario.id,
      receptor_id: params.amigoId,
      tipo: 'invitacion_pool',
      contenido,
    })
    setReenviando(false)
  }

  async function empezarPartida() {
    if (!usuario?.id || !params.amigoId || creando) return
    setCreando(true)
    const config = estadoInicialOnline(serie, timer, nuevaSeed())
    const { data, error } = await supabase
      .from('partidas_pool')
      .insert({
        host_id: usuario.id,
        invitado_id: params.amigoId,
        ...config,
      })
      .select('id')
      .single()
    setCreando(false)
    if (error || !data) return
    router.replace({
      pathname: '/juegos/partida-pool',
      params: { modo: 'online', partidaId: data.id },
    } as any)
  }

  const tuNombre = usuario?.nombre ?? 'Vos'

  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <View style={es.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={12}>
          <Text style={[es.volver, { color: c.primario }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[es.tituloHeader, { color: c.texto }]}>Mesa de Pool</Text>
        <View style={{ width: 18 }} />
      </View>
      <Text style={[es.subtitulo, { color: c.textoSuave }]}>{subtitulo}</Text>

      <View style={es.centro}>
        <AppIcon name="pool" size={56} color={c.primario} />

        <View style={es.jugadores}>
          <View style={[es.jugador, { backgroundColor: c.fondoCard, borderColor: c.primario }]}>
            <Text style={[es.jugadorInicial, { color: c.primario }]}>{tuNombre.charAt(0).toUpperCase()}</Text>
            <Text style={[es.jugadorNombre, { color: c.texto }]} numberOfLines={1}>{tuNombre}</Text>
            <Text style={[es.jugadorEstado, { color: c.exito }]}>listo</Text>
          </View>
          <Text style={[es.vs, { color: c.textoSuave }]}>VS</Text>
          <View style={[es.jugador, { backgroundColor: c.fondoCard, borderColor: amigoUnido ? c.primario : c.borde }]}>
            <Text style={[es.jugadorInicial, { color: amigoUnido ? c.primario : c.textoSuave }]}>
              {amigoNombre.charAt(0).toUpperCase()}
            </Text>
            <Text style={[es.jugadorNombre, { color: c.texto }]} numberOfLines={1}>{amigoNombre}</Text>
            {amigoUnido ? (
              <Text style={[es.jugadorEstado, { color: c.exito }]}>en la sala</Text>
            ) : (
              <ActivityIndicator size="small" color={c.textoSuave} />
            )}
          </View>
        </View>

        {esInvitado ? (
          <Text style={[es.esperando, { color: c.textoSuave }]}>
            Esperando a que {amigoNombre} empiece la partida…
          </Text>
        ) : amigoUnido ? (
          <TouchableOpacity
            style={[es.botonPrincipal, { backgroundColor: c.primario }]}
            onPress={empezarPartida}
            activeOpacity={0.85}
            disabled={creando}
          >
            {creando
              ? <ActivityIndicator color={c.fondo} />
              : <Text style={[es.botonPrincipalTexto, { color: c.fondo }]}>Empezar partida</Text>}
          </TouchableOpacity>
        ) : (
          <>
            <Text style={[es.esperando, { color: c.textoSuave }]}>
              Esperando a que {amigoNombre} acepte la invitación…
            </Text>
            <TouchableOpacity
              style={[es.botonSecundario, { borderColor: c.borde }]}
              onPress={reenviarInvitacion}
              activeOpacity={0.8}
              disabled={reenviando}
            >
              <Text style={[es.botonSecundarioTexto, { color: c.textoSuave }]}>
                {reenviando ? 'Enviando…' : 'Reenviar invitación'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1 },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 54, paddingBottom: 4,
    },
    volver: { fontSize: 26, fontWeight: '700', width: 18 },
    tituloHeader: { fontSize: 18, fontWeight: '800' },
    subtitulo: { fontSize: 13, textAlign: 'center', marginTop: 2 },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28, paddingHorizontal: 24 },
    jugadores: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    jugador: {
      width: 120, borderWidth: 1.5, borderRadius: 18,
      alignItems: 'center', paddingVertical: 18, gap: 6,
    },
    jugadorInicial: { fontSize: 30, fontWeight: '800' },
    jugadorNombre: { fontSize: 14, fontWeight: '700', paddingHorizontal: 8 },
    jugadorEstado: { fontSize: 11, fontWeight: '700' },
    vs: { fontSize: 14, fontWeight: '800' },
    esperando: { fontSize: 13, textAlign: 'center' },
    botonPrincipal: {
      borderRadius: 16, paddingVertical: 16, paddingHorizontal: 48,
      minWidth: 220, alignItems: 'center',
    },
    botonPrincipalTexto: { fontSize: 16, fontWeight: '800' },
    botonSecundario: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20 },
    botonSecundarioTexto: { fontSize: 13, fontWeight: '700' },
  })
}
