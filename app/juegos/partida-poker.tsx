import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Pressable,
  ActivityIndicator, useWindowDimensions, Animated as RNAnimated,
} from 'react-native'
import { Image } from 'expo-image'
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withRepeat, withSequence,
} from 'react-native-reanimated'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import {
  PartidaPoker, aplicarAccion, nuevaMano,
  mejorMano, TurnoJuego,
} from '@/lib/poker'

// ─── Mapa de imágenes (require estático, necesario para Metro) ────────────────

const CARTAS: Record<string, any> = {
  'BACK': require('../../assets/póker-assets/BACK.png'),
  'S-A':  require('../../assets/póker-assets/S-A.png'),
  'S-2':  require('../../assets/póker-assets/S-2.png'),
  'S-3':  require('../../assets/póker-assets/S-3.png'),
  'S-4':  require('../../assets/póker-assets/S-4.png'),
  'S-5':  require('../../assets/póker-assets/S-5.png'),
  'S-6':  require('../../assets/póker-assets/S-6.png'),
  'S-7':  require('../../assets/póker-assets/S-7.png'),
  'S-8':  require('../../assets/póker-assets/S-8.png'),
  'S-9':  require('../../assets/póker-assets/S-9.png'),
  'S-10': require('../../assets/póker-assets/S-10.png'),
  'S-J':  require('../../assets/póker-assets/S-J.png'),
  'S-Q':  require('../../assets/póker-assets/S-Q.png'),
  'S-K':  require('../../assets/póker-assets/S-K.png'),
  'H-A':  require('../../assets/póker-assets/H-A.png'),
  'H-2':  require('../../assets/póker-assets/H-2.png'),
  'H-3':  require('../../assets/póker-assets/H-3.png'),
  'H-4':  require('../../assets/póker-assets/H-4.png'),
  'H-5':  require('../../assets/póker-assets/H-5.png'),
  'H-6':  require('../../assets/póker-assets/H-6.png'),
  'H-7':  require('../../assets/póker-assets/H-7.png'),
  'H-8':  require('../../assets/póker-assets/H-8.png'),
  'H-9':  require('../../assets/póker-assets/H-9.png'),
  'H-10': require('../../assets/póker-assets/H-10.png'),
  'H-J':  require('../../assets/póker-assets/H-J.png'),
  'H-Q':  require('../../assets/póker-assets/H-Q.png'),
  'H-K':  require('../../assets/póker-assets/H-K.png'),
  'D-A':  require('../../assets/póker-assets/D-A.png'),
  'D-2':  require('../../assets/póker-assets/D-2.png'),
  'D-3':  require('../../assets/póker-assets/D-3.png'),
  'D-4':  require('../../assets/póker-assets/D-4.png'),
  'D-5':  require('../../assets/póker-assets/D-5.png'),
  'D-6':  require('../../assets/póker-assets/D-6.png'),
  'D-7':  require('../../assets/póker-assets/D-7.png'),
  'D-8':  require('../../assets/póker-assets/D-8.png'),
  'D-9':  require('../../assets/póker-assets/D-9.png'),
  'D-10': require('../../assets/póker-assets/D-10.png'),
  'D-J':  require('../../assets/póker-assets/D-J.png'),
  'D-Q':  require('../../assets/póker-assets/D-Q.png'),
  'D-K':  require('../../assets/póker-assets/D-K.png'),
  'C-A':  require('../../assets/póker-assets/C-A.png'),
  'C-2':  require('../../assets/póker-assets/C-2.png'),
  'C-3':  require('../../assets/póker-assets/C-3.png'),
  'C-4':  require('../../assets/póker-assets/C-4.png'),
  'C-5':  require('../../assets/póker-assets/C-5.png'),
  'C-6':  require('../../assets/póker-assets/C-6.png'),
  'C-7':  require('../../assets/póker-assets/C-7.png'),
  'C-8':  require('../../assets/póker-assets/C-8.png'),
  'C-9':  require('../../assets/póker-assets/C-9.png'),
  'C-10': require('../../assets/póker-assets/C-10.png'),
  'C-J':  require('../../assets/póker-assets/C-J.png'),
  'C-Q':  require('../../assets/póker-assets/C-Q.png'),
  'C-K':  require('../../assets/póker-assets/C-K.png'),
}

const TABLE = require('../../assets/póker-assets/table.png')

// ─── Componente Carta ─────────────────────────────────────────────────────────

function CartaImg({ carta, w = 64, h = 90, boca = true }: {
  carta: string; w?: number; h?: number; boca?: boolean
}) {
  const src = boca ? (CARTAS[carta] ?? CARTAS['BACK']) : CARTAS['BACK']
  return (
    <Image
      source={src}
      style={{ width: w, height: h, borderRadius: 6 }}
      contentFit="contain"
    />
  )
}

// ─── Pantalla de resultado ────────────────────────────────────────────────────

function OverlayResultado({
  partida, rolLocal, onNuevaMano, onSalir,
}: {
  partida: PartidaPoker
  rolLocal: TurnoJuego
  onNuevaMano: () => void
  onSalir: () => void
}) {
  const gane  = partida.ganador === rolLocal
  const empate = partida.ganador === 'empate'
  // Partida terminada: alguien quedó sin fichas después de repartir el bote
  const terminada = partida.fichas_host === 0 || partida.fichas_invitado === 0
  const titulo = terminada
    ? (gane ? '¡Ganaste la partida! 🏆' : 'Perdiste la partida')
    : empate ? '¡Empate!' : gane ? '¡Ganaste! 🏆' : 'Perdiste'
  const manoHost = partida.manos_mostradas
    ? mejorMano([...partida.cartas_host, ...partida.comunitarias])
    : null
  const manoInv = partida.manos_mostradas
    ? mejorMano([...partida.cartas_invitado, ...partida.comunitarias])
    : null

  const misCartas = rolLocal === 'host' ? partida.cartas_host : partida.cartas_invitado
  const susCartas = rolLocal === 'host' ? partida.cartas_invitado : partida.cartas_host
  const miMano    = rolLocal === 'host' ? manoHost : manoInv
  const suMano    = rolLocal === 'host' ? manoInv : manoHost

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade">
      <View style={ov.overlay}>
        <View style={ov.card}>
          <Text style={[ov.titulo, { color: gane ? '#C9A84C' : empate ? '#F5F2EC' : '#9A8E7E' }]}>
            {titulo}
          </Text>

          {partida.manos_mostradas && (
            <View style={ov.manosWrap}>
              <View style={ov.manoRow}>
                <Text style={ov.manoLabel}>Tus cartas</Text>
                <View style={ov.cartasRow}>
                  {misCartas.map((c, i) => <CartaImg key={i} carta={c} w={50} h={70} boca />)}
                </View>
                {miMano && <Text style={ov.manoNombre}>{miMano.nombre}</Text>}
              </View>
              <View style={ov.divisor} />
              <View style={ov.manoRow}>
                <Text style={ov.manoLabel}>Sus cartas</Text>
                <View style={ov.cartasRow}>
                  {susCartas.map((c, i) => <CartaImg key={i} carta={c} w={50} h={70} boca />)}
                </View>
                {suMano && <Text style={[ov.manoNombre, { color: '#9A8E7E' }]}>{suMano.nombre}</Text>}
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[ov.btn, { backgroundColor: '#C9A84C' }]}
            onPress={onNuevaMano}
            activeOpacity={0.85}
          >
            <Text style={[ov.btnTxt, { color: '#141210' }]}>
              {terminada ? 'Revancha' : 'Nueva mano'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ov.btn, { backgroundColor: '#272420', marginTop: 8 }]}
            onPress={onSalir}
            activeOpacity={0.8}
          >
            <Text style={[ov.btnTxt, { color: '#9A8E7E' }]}>Salir</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const ov = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:       { width: '100%', borderRadius: 24, padding: 24, borderWidth: 1, backgroundColor: '#1E1C18', borderColor: '#2A2520' },
  titulo:     { fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 20 },
  manosWrap:  { gap: 16, marginBottom: 24 },
  manoRow:    { alignItems: 'center', gap: 8 },
  manoLabel:  { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, color: '#9A8E7E' },
  cartasRow:  { flexDirection: 'row', gap: 8 },
  manoNombre: { fontSize: 15, fontWeight: '700', color: '#C9A84C' },
  divisor:    { height: 1, backgroundColor: '#2A2520' },
  btn:        { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnTxt:     { fontSize: 16, fontWeight: '700' },
})

// ─── Modal de Raise ───────────────────────────────────────────────────────────

function ModalRaise({
  visible, apuestaActual, misChips, apuestaFaseLocal,
  onConfirmar, onCancelar,
}: {
  visible: boolean; apuestaActual: number; misChips: number; apuestaFaseLocal: number
  onConfirmar: (monto: number) => void; onCancelar: () => void
}) {
  const minRaise = Math.max(apuestaActual * 2, apuestaActual + 50)
  const allIn    = apuestaFaseLocal + misChips

  const opciones = [...new Set([minRaise, Math.round(apuestaActual * 3), allIn])]
    .filter(x => x > apuestaActual && x <= allIn)
    .sort((a, b) => a - b)

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancelar}>
      <Pressable style={mr.backdrop} onPress={onCancelar}>
        <Pressable style={mr.card} onPress={e => e.stopPropagation()}>
          <Text style={mr.titulo}>Subir apuesta</Text>
          {opciones.map(o => (
            <TouchableOpacity
              key={o}
              style={mr.opcion}
              onPress={() => onConfirmar(o)}
              activeOpacity={0.8}
            >
              <Text style={mr.opcionTexto}>
                {o === allIn ? 'All-in  ' : ''}{o.toLocaleString('es-AR')} fichas
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={onCancelar} activeOpacity={0.7} style={mr.cancelar}>
            <Text style={{ color: '#9A8E7E', fontSize: 15 }}>Cancelar</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const mr = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  card:        { width: 300, borderRadius: 20, padding: 24, gap: 12, backgroundColor: '#1A1815' },
  titulo:      { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 4, color: '#F5F2EC' },
  opcion:      { height: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', borderColor: '#2A2520' },
  opcionTexto: { fontSize: 16, fontWeight: '700', color: '#C9A84C' },
  cancelar:    { alignItems: 'center', paddingTop: 4 },
})

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function PartidaPokerScreen() {
  const { width: W, height: H } = useWindowDimensions()
  const { usuario } = useAuthStore()
  const { partidaId } = useLocalSearchParams<{ partidaId: string }>()
  const myId = usuario?.id ?? ''

  // Tamaños de carta — definidos aquí para usarlos en animaciones y layout
  const CARD_W = Math.min(68, W * 0.15)
  const CARD_H = Math.round(CARD_W * 1.4)
  const COM_W  = Math.min(54, W * 0.12)
  const COM_H  = Math.round(COM_W * 1.4)
  // Posición del mazo: debajo de las cartas del rival, encima del centro
  const DECK_TOP = Math.max(248, Math.round(110 + 52 + 12 + CARD_H + 14))

  const [partida, setPartida]               = useState<PartidaPoker | null>(null)
  const [cargando, setCargando]             = useState(true)
  const [enviando, setEnviando]             = useState(false)
  const [showRaise, setShowRaise]           = useState(false)
  const [nombreRival, setNombreRival]       = useState('Rival')
  const [rivalNombreInicial, setRivalNombreInicial] = useState('?')
  const [ultimaAccionRival, setUltimaAccionRival]   = useState<string | null>(null)

  // Estado previo de la partida para comparar en el handler de Realtime
  const prevPartidaRef = useRef<PartidaPoker | null>(null)

  // Animaciones de reparto — 5 valores por slot comunitario
  const cardAnims = useRef(
    [0, 1, 2, 3, 4].map(() => ({
      tx:      new RNAnimated.Value(0),
      ty:      new RNAnimated.Value(0),
      scaleX:  new RNAnimated.Value(1),
      opacity: new RNAnimated.Value(0),
    }))
  ).current
  const [flipState, setFlipState]           = useState([false, false, false, false, false])
  const [animatingCards, setAnimatingCards] = useState([false, false, false, false, false])

  // Ref con dimensiones actuales para evitar closures obsoletas en Realtime
  const layoutRef = useRef({ W, H, COM_W, COM_H, DECK_TOP })
  layoutRef.current = { W, H, COM_W, COM_H, DECK_TOP }

  // Parpadeo del indicador de turno rival
  const blink = useSharedValue(1)
  const blinkStyle = useAnimatedStyle(() => ({ opacity: blink.value }))
  useEffect(() => {
    blink.value = withRepeat(
      withSequence(withTiming(0.3, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1, false,
    )
  }, [])

  const rolLocal = useCallback((): TurnoJuego | null => {
    if (!partida) return null
    return partida.host_id === myId ? 'host' : 'invitado'
  }, [partida, myId])

  const esMiTurno = partida?.turno === rolLocal()

  // ── Carga inicial ──────────────────────────────────────────────────────────

  async function cargar() {
    if (!partidaId) return
    const { data } = await supabase
      .from('partidas_poker')
      .select('*')
      .eq('id', partidaId)
      .single()
    if (data) {
      prevPartidaRef.current = data as PartidaPoker
      setPartida(data as PartidaPoker)
    }
    setCargando(false)
  }

  async function cargarRival(rivalId: string) {
    const { data } = await supabase
      .from('usuarios_publicos')
      .select('nombre')
      .eq('id', rivalId)
      .single()
    if (data?.nombre) {
      setNombreRival(data.nombre)
      setRivalNombreInicial(data.nombre.charAt(0).toUpperCase())
    }
  }

  useEffect(() => { cargar() }, [partidaId])

  useEffect(() => {
    if (!partida) return
    const rivalId = partida.host_id === myId ? partida.invitado_id : partida.host_id
    cargarRival(rivalId)
  }, [partida?.id])

  // ── Detección de acción rival ──────────────────────────────────────────────

  function detectarAccionRival(prev: PartidaPoker, nueva: PartidaPoker, rol: TurnoJuego) {
    const rival: TurnoJuego = rol === 'host' ? 'invitado' : 'host'

    // Nueva mano empezó → limpiar
    if (prev.ganador !== null && nueva.ganador === null) {
      setUltimaAccionRival(null)
      return
    }

    // Rival hizo fold → yo gano
    if (nueva.ganador === rol && prev.ganador === null) {
      setUltimaAccionRival('Fold')
      return
    }

    // Fase avanzó (ambos actuaron) → limpiar
    if (nueva.fase !== prev.fase) {
      setUltimaAccionRival(null)
      return
    }

    // El turno pasó del rival a mí → el rival acaba de actuar
    if (prev.turno === rival && nueva.turno === rol) {
      const prevAp = rival === 'host' ? prev.apuesta_fase_host : prev.apuesta_fase_invitado
      const newAp  = rival === 'host' ? nueva.apuesta_fase_host : nueva.apuesta_fase_invitado

      if (newAp > prevAp) {
        if (nueva.apuesta_actual > prev.apuesta_actual) {
          setUltimaAccionRival(`Raise → ${nueva.apuesta_actual.toLocaleString('es-AR')}`)
        } else {
          setUltimaAccionRival(`Call ${(newAp - prevAp).toLocaleString('es-AR')}`)
        }
      } else {
        setUltimaAccionRival('Check')
      }
    }
  }

  // ── Animación de reparto de cartas comunitarias ────────────────────────────

  function triggerDealAnimation(prevLen: number, comunitarias: string[]) {
    const { W: lW, H: lH, COM_W: lCW, COM_H: lCH, DECK_TOP: lDT } = layoutRef.current
    const totalWidth = 5 * lCW + 4 * 8
    const startX     = (lW - totalWidth) / 2

    // Esquina superior-izquierda del mazo (origen de la carta animada)
    const deckLeft = lW / 2 - lCW / 2
    const deckTop  = lDT

    // Esquina superior-izquierda del slot destino
    const slotTop = lH / 2 - lCH / 2

    for (let idx = prevLen; idx < comunitarias.length; idx++) {
      const delay    = (idx - prevLen) * 200
      const slotLeft = startX + idx * (lCW + 8)
      const tx = slotLeft - deckLeft
      const ty = slotTop  - deckTop

      const anim = cardAnims[idx]
      anim.tx.setValue(0)
      anim.ty.setValue(0)
      anim.scaleX.setValue(1)
      anim.opacity.setValue(1)

      const i = idx   // capturar índice para el callback
      setFlipState(p => { const n = [...p]; n[i] = false; return n })
      setAnimatingCards(p => { const n = [...p]; n[i] = true; return n })

      RNAnimated.sequence([
        RNAnimated.delay(delay),
        // Volar desde el mazo hasta el slot
        RNAnimated.parallel([
          RNAnimated.timing(anim.tx, { toValue: tx, duration: 380, useNativeDriver: true }),
          RNAnimated.timing(anim.ty, { toValue: ty, duration: 380, useNativeDriver: true }),
        ]),
        // Primera mitad del flip (colapsar)
        RNAnimated.timing(anim.scaleX, { toValue: 0, duration: 110, useNativeDriver: true }),
      ]).start(() => {
        // En el punto medio: mostrar la cara de la carta
        setFlipState(p => { const n = [...p]; n[i] = true; return n })
        // Segunda mitad del flip (expandir)
        RNAnimated.timing(anim.scaleX, { toValue: 1, duration: 110, useNativeDriver: true }).start(() => {
          anim.opacity.setValue(0)
          setAnimatingCards(p => { const n = [...p]; n[i] = false; return n })
        })
      })
    }
  }

  // ── Realtime ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!partidaId) return
    const canal = supabase
      .channel(`partida-poker-${partidaId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'partidas_poker',
        filter: `id=eq.${partidaId}`,
      }, payload => {
        const nueva     = payload.new as PartidaPoker
        const prev      = prevPartidaRef.current
        const rolActual: TurnoJuego = nueva.host_id === myId ? 'host' : 'invitado'

        if (prev) {
          detectarAccionRival(prev, nueva, rolActual)
          if (nueva.comunitarias.length > prev.comunitarias.length) {
            triggerDealAnimation(prev.comunitarias.length, nueva.comunitarias)
          }
        }

        prevPartidaRef.current = nueva
        setPartida(nueva)
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [partidaId])

  // ── Acciones del jugador ───────────────────────────────────────────────────

  async function accion(tipo: 'check' | 'call' | 'fold' | 'raise', subirA?: number) {
    if (!partida || !esMiTurno || enviando) return
    const rol = rolLocal()
    if (!rol) return
    setEnviando(true)
    const delta = aplicarAccion(partida, rol, tipo, subirA)
    await supabase
      .from('partidas_poker')
      .update({ ...delta, updated_at: new Date().toISOString() })
      .eq('id', partida.id)
    setEnviando(false)
  }

  async function handleNuevaMano() {
    if (!partida) return
    // Si alguien quedó sin fichas la partida terminó: la revancha arranca de cero
    const terminada = partida.fichas_host === 0 || partida.fichas_invitado === 0
    const fichasH = terminada ? partida.fichas_iniciales : partida.fichas_host
    const fichasI = terminada ? partida.fichas_iniciales : partida.fichas_invitado
    // Los blinds rotan: el que fue SB pasa a ser BB
    const estado = nuevaMano(fichasH, fichasI, !partida.sb_es_host)
    await supabase
      .from('partidas_poker')
      .update({ ...estado, updated_at: new Date().toISOString() })
      .eq('id', partida.id)
  }

  // ── Render guards ──────────────────────────────────────────────────────────

  if (cargando || !partida) {
    return (
      <View style={{ flex: 1, backgroundColor: '#141210', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#C9A84C" size="large" />
      </View>
    )
  }

  const rol = rolLocal()
  if (!rol) {
    return (
      <View style={{ flex: 1, backgroundColor: '#141210', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#9A8E7E' }}>No sos participante de esta partida.</Text>
      </View>
    )
  }

  const misCartas        = rol === 'host' ? partida.cartas_host     : partida.cartas_invitado
  const susCartas        = rol === 'host' ? partida.cartas_invitado  : partida.cartas_host
  const misChips         = rol === 'host' ? partida.fichas_host      : partida.fichas_invitado
  const susChips         = rol === 'host' ? partida.fichas_invitado  : partida.fichas_host
  const miApuestaFase    = rol === 'host' ? partida.apuesta_fase_host      : partida.apuesta_fase_invitado
  const rivalApuestaFase = rol === 'host' ? partida.apuesta_fase_invitado  : partida.apuesta_fase_host
  const mostrarRival     = partida.manos_mostradas
  const hayGanador       = partida.ganador !== null

  const puedoCheck = esMiTurno && miApuestaFase === partida.apuesta_actual
  const callMonto  = partida.apuesta_actual - miApuestaFase

  const fasesDescrip: Record<string, string> = {
    pre_flop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown',
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Mesa de fondo */}
      <Image source={TABLE} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />

      {/* Header */}
      <View style={es.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={12}>
          <Text style={es.volver}>‹</Text>
        </TouchableOpacity>
        <View style={es.headerCenter}>
          <Text style={es.headerTitulo}>Sala de Póker</Text>
          <Text style={es.headerFase}>{fasesDescrip[partida.fase]}</Text>
        </View>
        <View style={es.boteChip}>
          <Text style={es.boteLabel}>Bote</Text>
          <Text style={es.boteNum}>{partida.bote.toLocaleString('es-AR')}</Text>
        </View>
      </View>

      {/* ── Zona rival (arriba) ── */}
      <View style={es.zonaRival}>
        <View style={es.jugadorInfo}>
          <View style={[es.avatar, { backgroundColor: '#2d3a3a' }]}>
            <Text style={[es.avatarTxt, { color: '#7fb8b8' }]}>{rivalNombreInicial}</Text>
          </View>
          <View>
            <Text style={es.jugadorNombre}>{nombreRival}</Text>
            <Text style={es.jugadorChips}>{susChips.toLocaleString('es-AR')} fichas</Text>
            {rivalApuestaFase > 0 && (
              <Text style={es.apuestaFase}>{rivalApuestaFase.toLocaleString('es-AR')} en mesa</Text>
            )}
          </View>
          {!esMiTurno && partida.fase !== 'showdown' && partida.ganador === null && (
            <Animated.View style={[es.turnoTag, blinkStyle]}>
              <Text style={es.turnoTagTxt}>Su turno</Text>
            </Animated.View>
          )}
        </View>

        {/* Última acción del rival — aparece entre el avatar y sus cartas */}
        {ultimaAccionRival && (
          <View style={es.accionBadge}>
            <Text style={es.accionBadgeTxt}>{ultimaAccionRival}</Text>
          </View>
        )}

        {/* Cartas del rival (boca abajo hasta showdown) */}
        <View style={es.cartasRow}>
          {(susCartas.length ? susCartas : ['BACK', 'BACK']).map((carta, i) => (
            <CartaImg key={i} carta={carta} w={CARD_W} h={CARD_H} boca={mostrarRival} />
          ))}
        </View>
      </View>

      {/* ── Mazo del dealer (pila de dorsos entre rival y centro) ── */}
      <View style={[es.mzoDeck, { top: DECK_TOP }]}>
        <View style={{ width: COM_W + 8, height: COM_H + 8, position: 'relative' }}>
          <Image
            source={CARTAS['BACK']}
            style={{ position: 'absolute', width: COM_W, height: COM_H, borderRadius: 5, top: 6, left: 6, opacity: 0.5 }}
            contentFit="contain"
          />
          <Image
            source={CARTAS['BACK']}
            style={{ position: 'absolute', width: COM_W, height: COM_H, borderRadius: 5, top: 3, left: 3, opacity: 0.72 }}
            contentFit="contain"
          />
          <Image
            source={CARTAS['BACK']}
            style={{ position: 'absolute', width: COM_W, height: COM_H, borderRadius: 5, top: 0, left: 0 }}
            contentFit="contain"
          />
        </View>
        <Text style={es.mzoCuenta}>{partida.mazo.length}</Text>
      </View>

      {/* ── Cartas comunitarias (centradas verticalmente) ── */}
      <View style={es.comunitarias}>
        {[0, 1, 2, 3, 4].map(i => {
          const carta    = partida.comunitarias[i]
          const revelada = carta !== undefined
          const mostrar  =
            (partida.fase === 'flop'  && i <= 2) ||
            (partida.fase === 'turn'  && i <= 3) ||
            (partida.fase === 'river' && i <= 4) ||
            partida.fase === 'showdown'
          return (
            <View
              key={i}
              style={[
                es.comSlot,
                { width: COM_W, height: COM_H, borderColor: revelada ? '#C9A84C55' : '#2A2520' },
              ]}
            >
              {/* Ocultar el slot mientras la carta vuela hacia él */}
              {revelada && mostrar && !animatingCards[i] ? (
                <CartaImg carta={carta} w={COM_W} h={COM_H} boca />
              ) : (
                <Text style={es.comSlotTxt}>?</Text>
              )}
            </View>
          )
        })}
      </View>

      {/* ── Overlay: cartas en vuelo ── */}
      {[0, 1, 2, 3, 4].map(i => {
        if (!animatingCards[i]) return null
        const carta    = partida.comunitarias[i]
        const deckLeft = W / 2 - COM_W / 2
        return (
          <RNAnimated.View
            key={`anim-${i}`}
            style={{
              position: 'absolute',
              left: deckLeft,
              top: DECK_TOP,
              width: COM_W,
              height: COM_H,
              zIndex: 20,
              opacity: cardAnims[i].opacity,
              transform: [
                { translateX: cardAnims[i].tx },
                { translateY: cardAnims[i].ty },
                { scaleX: cardAnims[i].scaleX },
              ],
            }}
          >
            <Image
              source={
                flipState[i] && carta
                  ? (CARTAS[carta] ?? CARTAS['BACK'])
                  : CARTAS['BACK']
              }
              style={{ width: COM_W, height: COM_H, borderRadius: 6 }}
              contentFit="contain"
            />
          </RNAnimated.View>
        )
      })}

      {/* ── Zona propia (abajo) ── */}
      <View style={es.zonaPropia}>
        <View style={es.cartasRow}>
          {misCartas.map((carta, i) => (
            <CartaImg key={i} carta={carta} w={CARD_W} h={CARD_H} boca />
          ))}
        </View>
        <View style={[es.jugadorInfo, { justifyContent: 'flex-end' }]}>
          {esMiTurno && partida.fase !== 'showdown' && partida.ganador === null && (
            <View style={es.turnoTag}>
              <Text style={es.turnoTagTxt}>Tu turno</Text>
            </View>
          )}
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={es.jugadorNombre}>{usuario?.nombre ?? 'Tú'}</Text>
            <Text style={es.jugadorChips}>{misChips.toLocaleString('es-AR')} fichas</Text>
            {miApuestaFase > 0 && (
              <Text style={[es.apuestaFase, { textAlign: 'right' }]}>
                {miApuestaFase.toLocaleString('es-AR')} en mesa
              </Text>
            )}
          </View>
          <View style={[es.avatar, { backgroundColor: '#C9A84C' }]}>
            <Text style={[es.avatarTxt, { color: '#141210' }]}>
              {(usuario?.nombre ?? '?').charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Botones de acción */}
        {partida.ganador === null && partida.fase !== 'showdown' && (
          <View style={es.acciones}>
            <TouchableOpacity
              style={[es.accionBtn, { backgroundColor: '#E05252', opacity: esMiTurno && !enviando ? 1 : 0.35 }]}
              onPress={() => accion('fold')}
              disabled={!esMiTurno || enviando}
              activeOpacity={0.8}
            >
              <Text style={es.accionTxt}>Fold</Text>
            </TouchableOpacity>

            {puedoCheck ? (
              <TouchableOpacity
                style={[es.accionBtn, { backgroundColor: '#5ABF8A', opacity: !enviando ? 1 : 0.35 }]}
                onPress={() => accion('check')}
                disabled={enviando}
                activeOpacity={0.8}
              >
                <Text style={es.accionTxt}>Check</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[es.accionBtn, { backgroundColor: '#5ABF8A', opacity: esMiTurno && !enviando ? 1 : 0.35 }]}
                onPress={() => accion('call')}
                disabled={!esMiTurno || enviando}
                activeOpacity={0.8}
              >
                <Text style={es.accionTxt}>
                  Call {callMonto > 0 ? callMonto.toLocaleString('es-AR') : ''}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[es.accionBtn, { backgroundColor: '#C9A84C', opacity: esMiTurno && !enviando ? 1 : 0.35 }]}
              onPress={() => setShowRaise(true)}
              disabled={!esMiTurno || enviando}
              activeOpacity={0.8}
            >
              <Text style={[es.accionTxt, { color: '#141210' }]}>Raise</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Overlay de resultado (fold o showdown) */}
      {hayGanador && (
        <OverlayResultado
          partida={partida}
          rolLocal={rol}
          onNuevaMano={handleNuevaMano}
          onSalir={() => router.back()}
        />
      )}

      {/* Modal de raise */}
      <ModalRaise
        visible={showRaise}
        apuestaActual={partida.apuesta_actual}
        misChips={misChips}
        apuestaFaseLocal={miApuestaFase}
        onConfirmar={monto => { setShowRaise(false); accion('raise', monto) }}
        onCancelar={() => setShowRaise(false)}
      />
    </View>
  )
}

const es = StyleSheet.create({
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 20, paddingBottom: 10,
  },
  volver:       { color: '#C9A84C', fontSize: 32, fontWeight: '700', lineHeight: 36 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitulo: { color: '#F5F2EC', fontSize: 16, fontWeight: '700' },
  headerFase:   { color: '#9A8E7E', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  boteChip:     { alignItems: 'flex-end' },
  boteLabel:    { color: '#9A8E7E', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  boteNum:      { color: '#C9A84C', fontSize: 16, fontWeight: '800' },

  zonaRival: {
    position: 'absolute', top: 110, left: 0, right: 0,
    alignItems: 'center', gap: 8,
  },
  zonaPropia: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    alignItems: 'center', paddingBottom: 36, gap: 10,
  },

  jugadorInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20,
  },
  avatar:       { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:    { fontSize: 16, fontWeight: '700' },
  jugadorNombre: { color: '#F5F2EC', fontSize: 14, fontWeight: '700' },
  jugadorChips:  { color: '#9A8E7E', fontSize: 12, fontWeight: '500' },
  apuestaFase:   { color: '#C9A84C', fontSize: 11, fontWeight: '700' },

  turnoTag:    { backgroundColor: '#C9A84C', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  turnoTagTxt: { color: '#141210', fontSize: 11, fontWeight: '800' },

  accionBadge: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.4)',
  },
  accionBadgeTxt: { color: '#DFC47A', fontSize: 13, fontWeight: '700' },

  cartasRow: { flexDirection: 'row', gap: 8 },

  mzoDeck:   { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 4 },
  mzoCuenta: { color: '#6b6257', fontSize: 10, fontWeight: '600' },

  comunitarias: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    gap: 8,
  },
  comSlot: {
    borderRadius: 6, borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  comSlotTxt: { color: '#6b6257', fontSize: 18, fontWeight: '700' },

  acciones:  { flexDirection: 'row', gap: 10, paddingHorizontal: 20 },
  accionBtn: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  accionTxt: { color: '#F5F2EC', fontSize: 14, fontWeight: '800' },
})
