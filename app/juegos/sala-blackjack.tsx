import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { AppIcon } from '@/components/ui/AppIcon'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { estadoInicial } from '@/lib/blackjack'

function formatFichas(n: number) {
  return n.toLocaleString('es-AR')
}

export default function SalaBlackjack() {
  const c = useColores()
  const es = makeEstilos(c)
  const { usuario } = useAuthStore()

  const params = useLocalSearchParams<{
    amigo: string
    amigoId: string
    fichas: string
    modo_sala: string
  }>()

  const amigoNombre = params.amigo ?? 'Amigo'
  const fichasNum = parseInt(params.fichas ?? '5000', 10)
  const fichasLabel = formatFichas(fichasNum)

  const subtitulo = `${fichasLabel} fichas · Banca rotativa · Paga 3:2`

  const tuNombre = usuario?.nombre ?? 'tú'
  const tuInicial = tuNombre.charAt(0).toUpperCase()
  const amigoInicial = amigoNombre.charAt(0).toUpperCase()

  const esInvitado = params.modo_sala === 'invitado'
  const [amigoUnido, setAmigoUnido] = useState(esInvitado)
  const [creando, setCreando] = useState(false)
  const [reenviando, setReenviando] = useState(false)

  // Presencia: ambos anuncian que están en la sala
  // El host detecta cuando el invitado aparece y activa "mesa completa"
  useEffect(() => {
    if (!usuario?.id || !params.amigoId) return
    const roomKey = [usuario.id, params.amigoId].sort().join('_')
    const canal = supabase.channel(`sala-blackjack-${roomKey}`)

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

  // Invitado: escucha el INSERT en partidas_blackjack para navegar al juego automáticamente
  useEffect(() => {
    if (!esInvitado || !usuario?.id) return
    const canal = supabase
      .channel('sala-blackjack-inicio')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'partidas_blackjack',
        filter: `invitado_id=eq.${usuario.id}`,
      }, payload => {
        router.replace({ pathname: '/juegos/partida-blackjack', params: { partidaId: payload.new.id } } as any)
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [esInvitado, usuario?.id])

  async function reenviarInvitacion() {
    if (!usuario?.id || !params.amigoId || reenviando) return
    setReenviando(true)
    const contenido = JSON.stringify({
      fichas: fichasNum,
      hostId: usuario.id,
      hostNombre: usuario?.nombre ?? '',
    })
    await supabase.from('mensajes').insert({
      emisor_id: usuario.id,
      receptor_id: params.amigoId,
      tipo: 'invitacion_blackjack',
      contenido,
    })
    setReenviando(false)
  }

  async function empezarPartida() {
    if (!usuario?.id || !params.amigoId) return
    setCreando(true)
    const config = estadoInicial(fichasNum)
    const { data, error } = await supabase
      .from('partidas_blackjack')
      .insert({
        host_id: usuario.id,
        invitado_id: params.amigoId,
        ...config,
      })
      .select('id')
      .single()
    setCreando(false)
    if (error || !data) return
    router.replace({ pathname: '/juegos/partida-blackjack', params: { partidaId: data.id } } as any)
  }

  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <View style={es.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={12}>
          <Text style={[es.volver, { color: c.primario }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[es.tituloHeader, { color: c.texto }]}>Mesa de Blackjack</Text>
        <View style={{ width: 18 }} />
      </View>
      <Text style={[es.subtitulo, { color: c.textoSuave }]}>{subtitulo}</Text>

      {/* Mesa de Blackjack */}
      <View style={es.mesaWrap}>
        <View style={[es.mesaOval, { borderColor: c.borde }]}>
          {/* Riel dorado interior */}
          <View style={es.rielDorado} />

          {/* Centro: cartas + indicador */}
          <View style={es.centro}>
            <View style={es.cartas}>
              <View style={[es.carta, { backgroundColor: '#0d0b09', borderColor: c.borde }]} />
              <View style={[es.cartaRotada, { backgroundColor: '#0d0b09', borderColor: c.borde }]} />
            </View>
            <Text style={[es.boteLabel, { color: c.textoSuave }]}>OBJETIVO</Text>
            <Text style={[es.boteValor, { color: c.primario }]}>21</Text>

            {amigoUnido ? (
              <View style={es.badgeWrap}>
                <View style={[es.badgeCirculo, { backgroundColor: '#7BBE6E' }]}>
                  <AppIcon name="aceptar" size={16} color="#16201a" />
                </View>
                <Text style={es.badgeTexto}>¡Mesa completa!</Text>
              </View>
            ) : (
              <View style={es.badgeWrap}>
                <ActivityIndicator size={34} color={c.primario} />
                <Text style={[es.esperandoTexto, { color: c.primarioSuave }]}>Esperando a tu rival…</Text>
              </View>
            )}
          </View>

          {/* Asiento arriba: vacío o amigo */}
          <View style={es.asientoArriba}>
            {amigoUnido ? (
              <>
                <View style={[es.avatarCirculo, { backgroundColor: '#2d3a3a', borderColor: '#7BBE6E', borderWidth: 2 }]}>
                  <Text style={[es.avatarTexto, { color: '#7fb8b8' }]}>{amigoInicial}</Text>
                </View>
                <Text style={[es.asientoNombre, { color: c.texto }]}>{amigoNombre}</Text>
                <Text style={[es.asientoFichas, { color: c.textoSuave }]}>{fichasLabel}</Text>
              </>
            ) : (
              <>
                <View style={[es.asientoVacio, { borderColor: '#3a342c' }]}>
                  <Text style={[es.asientoVacioPlus, { color: '#6b6257' }]}>+</Text>
                </View>
                <Text style={[es.asientoLibre, { color: '#6b6257' }]}>Asiento libre</Text>
              </>
            )}
          </View>

          {/* Asiento abajo: tú */}
          <View style={es.asientoAbajo}>
            <View style={[es.avatarCirculo, { backgroundColor: c.primario, borderColor: c.primario, borderWidth: 2 }]}>
              <Text style={[es.avatarTexto, { color: c.fondo }]}>{tuInicial}</Text>
            </View>
            <Text style={[es.asientoNombre, { color: c.texto }]}>{tuNombre} (tú)</Text>
            <Text style={[es.asientoFichas, { color: c.textoSuave }]}>{fichasLabel}</Text>
          </View>
        </View>
      </View>

      {/* Tarjeta estado del amigo */}
      {amigoUnido ? (
        <View style={[es.amigoCard, { backgroundColor: '#1E1C18', borderColor: 'rgba(123,190,110,0.35)' }]}>
          <View style={{ position: 'relative' }}>
            <View style={[es.amigoAvatar, { backgroundColor: '#2d3a3a' }]}>
              <Text style={[es.avatarTexto, { color: '#7fb8b8' }]}>{amigoInicial}</Text>
            </View>
            <View style={es.dotVerde} />
          </View>
          <View style={es.amigoInfo}>
            <Text style={[es.amigoNombre, { color: c.texto }]}>{amigoNombre} se unió</Text>
            <Text style={[es.amigoEstado, { color: '#7BBE6E' }]}>● Listo para jugar</Text>
          </View>
        </View>
      ) : (
        <View style={[es.amigoCard, { backgroundColor: '#1E1C18', borderColor: c.borde }]}>
          <View style={{ position: 'relative' }}>
            <View style={[es.amigoAvatar, { backgroundColor: c.fondoInput }]}>
              <Text style={[es.avatarTexto, { color: c.primario }]}>{amigoInicial}</Text>
            </View>
            <View style={[es.dotPendiente, { backgroundColor: c.primario, borderColor: '#1E1C18' }]} />
          </View>
          <View style={es.amigoInfo}>
            <Text style={[es.amigoNombre, { color: c.texto }]}>{amigoNombre}</Text>
            <Text style={[es.amigoEstado, { color: c.primarioSuave }]}>Invitación enviada · esperando…</Text>
          </View>
          <TouchableOpacity
            style={[es.reenviarBtn, { borderColor: reenviando ? c.primario : c.borde }]}
            onPress={reenviarInvitacion}
            disabled={reenviando}
            activeOpacity={0.7}
          >
            <Text style={[es.reenviarTexto, { color: reenviando ? c.primario : c.textoSuave }]}>
              {reenviando ? 'Enviando…' : 'Reenviar'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Footer */}
      <View style={es.footer}>
        {amigoUnido ? (
          <TouchableOpacity
            style={[es.botonPrimario, { backgroundColor: creando ? c.fondoInput : c.primario }]}
            onPress={esInvitado ? undefined : empezarPartida}
            disabled={creando || esInvitado}
            activeOpacity={0.85}
          >
            {creando
              ? <ActivityIndicator color={c.fondo} />
              : <Text style={[es.botonTexto, { color: esInvitado ? c.textoSuave : c.fondo }]}>
                  {esInvitado ? 'Esperando al host…' : 'Empezar partida'}
                </Text>
            }
          </TouchableOpacity>
        ) : (
          <View style={[es.botonPrimario, { backgroundColor: c.fondoInput }]}>
            <Text style={[es.botonTexto, { color: c.textoSuave }]}>El juego empieza cuando se una tu amigo</Text>
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
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 10,
    },
    volver: { fontSize: 32, fontWeight: '700', lineHeight: 36, marginRight: 4 },
    tituloHeader: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700' },
    subtitulo: { textAlign: 'center', fontSize: 13, fontWeight: '500', marginBottom: 8 },
    mesaWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    mesaOval: {
      width: 260,
      height: 380,
      borderRadius: 130,
      backgroundColor: '#16201a',
      borderWidth: 8,
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    rielDorado: {
      position: 'absolute',
      top: 12, left: 12, right: 12, bottom: 12,
      borderRadius: 118,
      borderWidth: 1,
      borderColor: 'rgba(201,168,76,0.25)',
    },
    centro: { alignItems: 'center', gap: 6 },
    cartas: { flexDirection: 'row', marginBottom: 2 },
    carta: {
      width: 26, height: 36, borderRadius: 4, borderWidth: 1,
    },
    cartaRotada: {
      width: 26, height: 36, borderRadius: 4, borderWidth: 1,
      marginLeft: -10,
      transform: [{ rotate: '6deg' }],
    },
    boteLabel: {
      fontSize: 11, fontWeight: '700', letterSpacing: 1,
      textTransform: 'uppercase',
    },
    boteValor: { fontSize: 18, fontWeight: '700' },
    badgeWrap: { alignItems: 'center', gap: 8, marginTop: 6 },
    badgeCirculo: {
      width: 34, height: 34, borderRadius: 17,
      alignItems: 'center', justifyContent: 'center',
    },
    badgeTexto: { color: '#7BBE6E', fontSize: 14, fontWeight: '700' },
    esperandoTexto: { fontSize: 14, fontWeight: '600' },
    asientoArriba: {
      position: 'absolute', top: 14, left: 0, right: 0,
      alignItems: 'center', gap: 4,
    },
    asientoAbajo: {
      position: 'absolute', bottom: 14, left: 0, right: 0,
      alignItems: 'center', gap: 4,
    },
    avatarCirculo: {
      width: 46, height: 46, borderRadius: 23,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarTexto: { fontSize: 18, fontWeight: '700' },
    asientoNombre: { fontSize: 13, fontWeight: '600' },
    asientoFichas: { fontSize: 12, fontWeight: '500' },
    asientoVacio: {
      width: 46, height: 46, borderRadius: 23,
      borderWidth: 2, borderStyle: 'dashed',
      alignItems: 'center', justifyContent: 'center',
    },
    asientoVacioPlus: { fontSize: 22 },
    asientoLibre: { fontSize: 13, fontWeight: '500' },
    amigoCard: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      marginHorizontal: 24, marginBottom: 14,
      padding: 14, borderWidth: 1, borderRadius: 18,
    },
    amigoAvatar: {
      width: 42, height: 42, borderRadius: 21,
      alignItems: 'center', justifyContent: 'center',
    },
    dotVerde: {
      position: 'absolute', bottom: -1, right: -1,
      width: 13, height: 13, borderRadius: 7,
      backgroundColor: '#7BBE6E', borderWidth: 2, borderColor: '#1E1C18',
    },
    dotPendiente: {
      position: 'absolute', bottom: -1, right: -1,
      width: 13, height: 13, borderRadius: 7,
      borderWidth: 2,
    },
    amigoInfo: { flex: 1, gap: 2 },
    amigoNombre: { fontSize: 15, fontWeight: '600' },
    amigoEstado: { fontSize: 13, fontWeight: '500' },
    reenviarBtn: {
      paddingVertical: 6, paddingHorizontal: 12,
      borderWidth: 1, borderRadius: 10,
    },
    reenviarTexto: { fontSize: 13, fontWeight: '600' },
    footer: { paddingHorizontal: 24, paddingBottom: 36 },
    botonPrimario: {
      height: 58, borderRadius: 16,
      alignItems: 'center', justifyContent: 'center',
    },
    botonTexto: { fontSize: 17, fontWeight: '700', textAlign: 'center', paddingHorizontal: 12 },
  })
}
