// Sala de espera del Pool online (patrón sala-blackjack.tsx):
// ambos anuncian presencia en un canal; cuando los dos marcan "Listo" la
// partida arranca sola (feedback de juego real, jul 2026 — antes solo el
// host tenía un botón "Empezar partida" y no había forma de que el
// invitado viera las reglas de la timba/partida antes de comprometerse).

import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { AppIcon } from '@/components/ui/AppIcon'
import { estadoInicialOnline } from '@/lib/pool/online'
import { NIVELES_ASISTENCIA, NIVEL_ASISTENCIA_DEFAULT, NivelAsistencia } from '@/lib/pool/asistencia'

function nuevaSeed(): number {
  return (Date.now() ^ (Math.random() * 0x7fffffff)) | 0
}

interface TimbaResumen {
  id: string
  tipo: 'amistosa' | 'monetaria'
  opciones: string[]
  premio_descripcion: string | null
  prenda_descripcion: string | null
  monto_minimo: number | null
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
    timbaId?: string
    asistenciaHost?: string
    asistenciaInvitado?: string
  }>()

  const amigoNombre = params.amigo ?? 'Amigo'
  const serie = params.serie === '3' ? 3 : 1
  const timer = [0, 30, 45, 60].includes(parseInt(params.timer ?? '45', 10))
    ? (parseInt(params.timer ?? '45', 10) as 0 | 30 | 45 | 60)
    : 45
  const esInvitado = params.modo_sala === 'invitado'
  const tuNombre = usuario?.nombre ?? 'Vos'

  function nivelValido(v?: string): NivelAsistencia {
    return v === 'sin' || v === 'baja' || v === 'normal' || v === 'maxima' ? v : NIVEL_ASISTENCIA_DEFAULT
  }
  const asistenciaHost = nivelValido(params.asistenciaHost)
  const asistenciaInvitado = nivelValido(params.asistenciaInvitado)
  const nombreNivel = (n: NivelAsistencia) => NIVELES_ASISTENCIA.find(x => x.id === n)?.nombre ?? n

  const [amigoUnido, setAmigoUnido] = useState(esInvitado)
  const [yoListo, setYoListo] = useState(false)
  const [amigoListo, setAmigoListo] = useState(false)
  const [creando, setCreando] = useState(false)
  const [reenviando, setReenviando] = useState(false)
  const [conexionInestable, setConexionInestable] = useState(false)
  const [timba, setTimba] = useState<TimbaResumen | null>(null)
  const [saliendo, setSaliendo] = useState(false)

  const canalRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const empezandoRef = useRef(false) // evita disparar empezarPartida() dos veces

  // Timba vinculada (si la invitación traía una) — reglas visibles antes de
  // arrancar (spec: "en la sala debe dejarte ver las reglas de la timba").
  useEffect(() => {
    if (!params.timbaId) { setTimba(null); return }
    supabase.from('timbas')
      .select('id, tipo, opciones, premio_descripcion, prenda_descripcion, monto_minimo')
      .eq('id', params.timbaId)
      .single()
      .then(({ data }) => { if (data) setTimba(data as TimbaResumen) })
  }, [params.timbaId])

  // Historial de desconexiones (spec §8.3) — mismo criterio que antes
  useEffect(() => {
    if (!params.amigoId) return
    supabase
      .from('eventos_desconexion')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', params.amigoId)
      .then(({ count }) => setConexionInestable((count ?? 0) >= 3))
  }, [params.amigoId])

  // Presencia + "listo" de ambos — el mismo canal hace de sala de espera y
  // de mecanismo de cancelación (broadcast 'cancelar').
  useEffect(() => {
    if (!usuario?.id || !params.amigoId) return
    const roomKey = [usuario.id, params.amigoId].sort().join('_')
    const canal = supabase.channel(`sala-pool-${roomKey}`)
    canalRef.current = canal

    canal
      .on('presence', { event: 'sync' }, () => {
        const state = canal.presenceState<{ rol: string; listo: boolean }>()
        const otros = Object.values(state).flatMap(ps =>
          (ps as any[]).filter((p: { rol: string }) => p.rol === (esInvitado ? 'host' : 'invitado')))
        setAmigoUnido(otros.length > 0)
        setAmigoListo(otros.some((p: any) => p.listo))
      })
      .on('broadcast', { event: 'cancelar' }, ({ payload }) => {
        // La RPC admite a ambos jugadores y no depende de que el host siga
        // conectado para cancelar la Timba vinculada. Best-effort: si falla,
        // igual se sale de la sala (el otro cliente ya lo está intentando
        // también), pero se loguea para no repetir el error de R7 (fallar
        // en silencio sin que quede ningún rastro).
        if (timba) {
          supabase.rpc('cancelar_timba_pool_previa', { p_timba_id: timba.id }).then(({ error }) => {
            if (error) console.warn('cancelar_timba_pool_previa falló:', error.message)
          })
        }
        Alert.alert('Partida cancelada', `${payload?.por ?? amigoNombre} canceló antes de arrancar.`, [
          { text: 'OK', onPress: () => router.back() },
        ])
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') await canal.track({ rol: esInvitado ? 'invitado' : 'host', listo: false })
      })

    return () => { supabase.removeChannel(canal); canalRef.current = null }
  }, [usuario?.id, params.amigoId, esInvitado, timba, amigoNombre])

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

  // Host: cuando ambos están listos, arranca sola (spec: "el juego empieza
  // solo") — ref para no dispararla dos veces si el efecto vuelve a correr.
  useEffect(() => {
    if (esInvitado || !yoListo || !amigoListo || empezandoRef.current) return
    empezandoRef.current = true
    empezarPartida()
  }, [esInvitado, yoListo, amigoListo])

  async function marcarListo() {
    if (!usuario?.id || yoListo) return
    // Sin voto acá (ago 2026): cerrar_timba_juego() anota a los dos jugadores
    // atómicamente cuando la partida termina — "Listo" solo confirma
    // presencia, no toca la timba para nada.
    setYoListo(true)
    await canalRef.current?.track({ rol: esInvitado ? 'invitado' : 'host', listo: true })
  }

  async function cancelarJuego() {
    Alert.alert('Cancelar partida', '¿Seguro? Se cierra la sala para los dos.', [
      { text: 'Seguir acá', style: 'cancel' },
      {
        text: 'Cancelar partida',
        style: 'destructive',
        onPress: async () => {
          setSaliendo(true)
          await canalRef.current?.send({ type: 'broadcast', event: 'cancelar', payload: { por: tuNombre } })
          if (timba) {
            const { error } = await supabase.rpc('cancelar_timba_pool_previa', { p_timba_id: timba.id })
            if (error) console.warn('cancelar_timba_pool_previa falló:', error.message)
          }
          router.back()
        },
      },
    ])
  }

  async function reenviarInvitacion() {
    if (!usuario?.id || !params.amigoId || reenviando) return
    setReenviando(true)
    const contenido = JSON.stringify({
      serie,
      timer,
      hostId: usuario.id,
      hostNombre: usuario?.nombre ?? '',
      timbaId: params.timbaId ?? null,
      asistenciaHost,
      asistenciaInvitado,
    })
    await supabase.from('mensajes').insert({
      emisor_id: usuario.id,
      receptor_id: params.amigoId,
      tipo: 'invitacion_pool',
      contenido,
      timba_id: params.timbaId ?? null,
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
        timba_id: params.timbaId ?? null,
        asistencia_host: asistenciaHost,
        asistencia_invitado: asistenciaInvitado,
        ...config,
      })
      .select('id')
      .single()
    setCreando(false)
    if (error || !data) { empezandoRef.current = false; return }
    router.replace({
      pathname: '/juegos/partida-pool',
      params: { modo: 'online', partidaId: data.id },
    } as any)
  }

  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <View style={es.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={12}>
          <Text style={[es.volver, { color: c.primario }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[es.tituloHeader, { color: c.texto }]}>Mesa de Pool</Text>
        <View style={{ width: 18 }} />
      </View>

      <View style={es.centro}>
        <AppIcon name="pool" size={48} color={c.primario} />

        <View style={es.jugadores}>
          <View style={[es.jugador, { backgroundColor: c.fondoCard, borderColor: yoListo ? c.exito : c.primario }]}>
            <Text style={[es.jugadorInicial, { color: c.primario }]}>{tuNombre.charAt(0).toUpperCase()}</Text>
            <Text style={[es.jugadorNombre, { color: c.texto }]} numberOfLines={1}>{tuNombre}</Text>
            <Text style={[es.jugadorEstado, { color: yoListo ? c.exito : c.textoSuave }]}>{yoListo ? 'listo' : 'esperando'}</Text>
          </View>
          <Text style={[es.vs, { color: c.textoSuave }]}>VS</Text>
          <View style={[es.jugador, { backgroundColor: c.fondoCard, borderColor: amigoListo ? c.exito : amigoUnido ? c.primario : c.borde }]}>
            <Text style={[es.jugadorInicial, { color: amigoUnido ? c.primario : c.textoSuave }]}>
              {amigoNombre.charAt(0).toUpperCase()}
            </Text>
            <Text style={[es.jugadorNombre, { color: c.texto }]} numberOfLines={1}>{amigoNombre}</Text>
            {!amigoUnido ? (
              <ActivityIndicator size="small" color={c.textoSuave} />
            ) : (
              <Text style={[es.jugadorEstado, { color: amigoListo ? c.exito : c.textoSuave }]}>{amigoListo ? 'listo' : 'en la sala'}</Text>
            )}
          </View>
        </View>

        {/* Configuración de la partida — mismo peso visual que la tarjeta de
            la timba, visible para los dos (host e invitado por igual). */}
        <View style={[es.timbaCard, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AppIcon name="ajustes" size={16} color={c.textoSuave} />
            <Text style={[es.timbaTitulo, { color: c.texto }]}>Configuración de la partida</Text>
          </View>
          <Text style={[es.timbaDetalle, { color: c.texto }]}>
            {serie === 3 ? 'Mejor de 3' : 'Partida suelta'}
          </Text>
          <Text style={[es.timbaDetalle, { color: c.texto }]}>
            {timer === 0 ? 'Sin límite de tiempo por tiro' : `${timer}s por tiro`}
          </Text>
          <Text style={[es.timbaDetalle, { color: c.texto }]}>
            Asistencia: vos {nombreNivel(esInvitado ? asistenciaInvitado : asistenciaHost)} · {amigoNombre} {nombreNivel(esInvitado ? asistenciaHost : asistenciaInvitado)}
          </Text>
        </View>

        {conexionInestable && (
          <Text style={[es.avisoConexion, { color: c.advertencia }]}>
            ⚠ {amigoNombre} tuvo desconexiones seguidas en partidas recientes
          </Text>
        )}

        {timba && (
          <View style={[es.timbaCard, { backgroundColor: c.fondoCard, borderColor: c.primario }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppIcon name="timba" size={16} color={c.primario} />
              <Text style={[es.timbaTitulo, { color: c.primario }]}>Timba de esta partida</Text>
            </View>
            {timba.tipo === 'monetaria' ? (
              <Text style={[es.timbaDetalle, { color: c.texto }]}>
                El que pierde le debe ${timba.monto_minimo} al que gana.
              </Text>
            ) : (
              <>
                {timba.premio_descripcion && (
                  <Text style={[es.timbaDetalle, { color: c.texto }]}>🏆 Premio: {timba.premio_descripcion}</Text>
                )}
                {timba.prenda_descripcion && (
                  <Text style={[es.timbaDetalle, { color: c.texto }]}>💀 Prenda: {timba.prenda_descripcion}</Text>
                )}
                {!timba.premio_descripcion && !timba.prenda_descripcion && (
                  <Text style={[es.timbaDetalle, { color: c.textoSuave }]}>Sin premio ni prenda cargados — solo por orgullo.</Text>
                )}
              </>
            )}
            <Text style={[es.timbaAviso, { color: c.textoSuave }]}>
              Se resuelve sola al terminar la partida, sin que nadie tenga que proponerlo.
            </Text>
          </View>
        )}

        {esInvitado && !amigoUnido ? (
          <Text style={[es.esperando, { color: c.textoSuave }]}>
            Esperando a que {amigoNombre} empiece la partida…
          </Text>
        ) : !amigoUnido ? (
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
        ) : creando ? (
          <ActivityIndicator color={c.primario} />
        ) : (
          <View style={{ gap: 12, width: '100%', alignItems: 'center' }}>
            {!yoListo ? (
              <TouchableOpacity
                style={[es.botonPrincipal, { backgroundColor: c.primario }]}
                onPress={marcarListo}
                activeOpacity={0.85}
              >
                <Text style={[es.botonPrincipalTexto, { color: c.fondo }]}>Listo</Text>
              </TouchableOpacity>
            ) : (
              <Text style={[es.esperando, { color: c.textoSuave }]}>
                Esperando a que {amigoNombre} también esté listo…
              </Text>
            )}
            <TouchableOpacity
              style={[es.botonCancelar, { borderColor: c.error }]}
              onPress={cancelarJuego}
              activeOpacity={0.8}
              disabled={saliendo}
            >
              <Text style={[es.botonCancelarTexto, { color: c.error }]}>Cancelar juego</Text>
            </TouchableOpacity>
          </View>
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
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 24, paddingVertical: 16 },
    jugadores: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    jugador: {
      width: 120, borderWidth: 1.5, borderRadius: 18,
      alignItems: 'center', paddingVertical: 18, gap: 6,
    },
    jugadorInicial: { fontSize: 30, fontWeight: '800' },
    jugadorNombre: { fontSize: 14, fontWeight: '700', paddingHorizontal: 8 },
    jugadorEstado: { fontSize: 11, fontWeight: '700' },
    vs: { fontSize: 14, fontWeight: '800' },
    avisoConexion: { fontSize: 12, fontWeight: '600', textAlign: 'center', paddingHorizontal: 12 },
    timbaCard: { width: '100%', borderWidth: 1.5, borderRadius: 16, padding: 14, gap: 6 },
    timbaTitulo: { fontSize: 13, fontWeight: '800' },
    timbaDetalle: { fontSize: 14, fontWeight: '600' },
    timbaAviso: { fontSize: 11, marginTop: 4, lineHeight: 15 },
    esperando: { fontSize: 13, textAlign: 'center' },
    botonPrincipal: {
      borderRadius: 16, paddingVertical: 16, paddingHorizontal: 48,
      minWidth: 220, alignItems: 'center',
    },
    botonPrincipalTexto: { fontSize: 16, fontWeight: '800' },
    botonSecundario: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20 },
    botonSecundarioTexto: { fontSize: 13, fontWeight: '700' },
    botonCancelar: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20 },
    botonCancelarTexto: { fontSize: 13, fontWeight: '800' },
  })
}
