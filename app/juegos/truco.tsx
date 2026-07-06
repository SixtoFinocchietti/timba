import { useState, useEffect, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, useWindowDimensions } from 'react-native'
import { Image } from 'expo-image'
import Svg, { Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg'
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withRepeat, withDelay, withSequence,
  Easing, interpolate,
} from 'react-native-reanimated'
import { router } from 'expo-router'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { AppIcon } from '@/components/ui/AppIcon'

type Fase = 'seleccion' | 'juego'

const DURACION = 30

const PALILLOS = {
  1: require('../../assets/truco/palillos/palillos_1.png'),
  2: require('../../assets/truco/palillos/palillos_2.png'),
  3: require('../../assets/truco/palillos/palillos_3.png'),
  4: require('../../assets/truco/palillos/palillos_4.png'),
  5: require('../../assets/truco/palillos/palillos_5.png'),
} as const

// ─── victoria: colores y lógica ──────────────────────────────────────────────

const V_ORO      = '#DFC47A'
const V_ORO_OSC  = '#C9A84C'
const V_FONDO    = 'rgba(20,18,16,0.97)'
const V_CARD     = '#1E1C18'
const V_BORDE    = '#2A2520'
const V_SUAVE    = '#9A8E7E'
const V_TEXTO    = '#FBF1D6'

interface Particula {
  id: number; leftPct: number; size: number
  duration: number; delay: number; color: string; round: boolean
}

function generarConfetti(): Particula[] {
  const palette = [V_ORO, V_ORO_OSC, V_SUAVE, V_TEXTO]
  return Array.from({ length: 24 }, (_, i) => ({
    id: i,
    leftPct: Math.random() * 96,
    size: 5 + Math.round(Math.random() * 6),
    duration: 2800 + Math.random() * 2600,
    delay: Math.random() * 2400,
    color: palette[i % palette.length],
    round: Math.random() > 0.5,
  }))
}

function ParticulaConfetti({ p, screenH }: { p: Particula; screenH: number }) {
  const prog = useSharedValue(0)

  useEffect(() => {
    prog.value = withDelay(
      p.delay,
      withRepeat(withTiming(1, { duration: p.duration, easing: Easing.linear }), -1, false),
    )
  }, [])

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(prog.value, [0, 1], [-20, screenH + 40]) },
      { rotate: `${interpolate(prog.value, [0, 1], [0, 320])}deg` },
    ],
    opacity: interpolate(prog.value, [0, 0.12, 0.85, 1], [0, 1, 1, 0]),
  }))

  return (
    <Animated.View
      style={[{
        position: 'absolute',
        left: `${p.leftPct}%` as any,
        top: 0,
        width: p.size,
        height: p.size + 2,
        backgroundColor: p.color,
        borderRadius: p.round ? p.size / 2 : 2,
      }, animStyle]}
    />
  )
}

function PantallaVictoria({
  equipo, propios, rival,
  onNueva, onCerrar,
}: {
  equipo: string; propios: number; rival: number
  onNueva: () => void; onCerrar: () => void
}) {
  const rivalNombre = equipo === 'Nos' ? 'Ellos' : 'Nos'
  const confetti = useMemo(generarConfetti, [])
  const { height: SH } = useWindowDimensions()

  const cardOp = useSharedValue(0)
  const cardTY = useSharedValue(28)
  const cardSc = useSharedValue(0.96)
  const glowOp = useSharedValue(0.55)
  const ringSc = useSharedValue(0.7)
  const ringOp = useSharedValue(0.9)

  useEffect(() => {
    cardOp.value = withTiming(1, { duration: 480 })
    cardTY.value = withTiming(0, { duration: 480, easing: Easing.out(Easing.cubic) })
    cardSc.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) })
    glowOp.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 2250 }),
        withTiming(0.55, { duration: 2250 }),
      ), -1, false,
    )
    ringSc.value = withRepeat(withTiming(1.9, { duration: 2200, easing: Easing.out(Easing.cubic) }), -1, false)
    ringOp.value = withRepeat(withTiming(0, { duration: 2200, easing: Easing.out(Easing.cubic) }), -1, false)
  }, [])

  const cardStyle   = useAnimatedStyle(() => ({
    opacity: cardOp.value,
    transform: [{ translateY: cardTY.value }, { scale: cardSc.value }],
  }))
  const glowStyle   = useAnimatedStyle(() => ({ opacity: glowOp.value }))
  const ringStyle   = useAnimatedStyle(() => ({
    transform: [{ scale: ringSc.value }],
    opacity: ringOp.value,
  }))

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade">
      <View style={ev.overlay}>
        {/* Glow ambiental con radial gradient */}
        <Animated.View style={[ev.glow, glowStyle]} pointerEvents="none">
          <Svg width={560} height={560}>
            <Defs>
              <RadialGradient id="rglow" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0%"   stopColor={V_ORO_OSC} stopOpacity={0.5} />
                <Stop offset="55%"  stopColor={V_ORO_OSC} stopOpacity={0.1} />
                <Stop offset="100%" stopColor={V_ORO_OSC} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={280} cy={280} rx={280} ry={280} fill="url(#rglow)" />
          </Svg>
        </Animated.View>

        {/* Confetti */}
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
          {confetti.map(p => <ParticulaConfetti key={p.id} p={p} screenH={SH} />)}
        </View>

        {/* Card */}
        <Animated.View style={[ev.card, cardStyle]}>
          {/* Badge */}
          <View style={ev.badgeRow}>
            <View style={ev.badgeIcono}>
              <Animated.View style={[ev.badgeRing, ringStyle]} />
              <AppIcon name="ganadas" size={22} color={V_CARD} />
            </View>
            <Text style={ev.badgeTexto}>Partida terminada</Text>
          </View>

          <Text style={ev.titulo}>¡Ganó {equipo}!</Text>
          <Text style={ev.subtitulo}>{equipo} llegó a {propios} puntos</Text>

          {/* Marcador */}
          <View style={ev.scoreStrip}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={ev.scoreNum}>{propios}</Text>
              <Text style={ev.scoreLbl}>{equipo}</Text>
            </View>
            <View style={{ width: 1, backgroundColor: V_BORDE }} />
            <View style={{ flex: 1, alignItems: 'center', opacity: 0.55 }}>
              <Text style={[ev.scoreNum, { color: V_SUAVE }]}>{rival}</Text>
              <Text style={ev.scoreLbl}>{rivalNombre}</Text>
            </View>
          </View>

          <TouchableOpacity style={ev.btnNueva} onPress={onNueva} activeOpacity={0.85}>
            <Text style={ev.btnNuevaTexto}>Nueva partida</Text>
          </TouchableOpacity>
          <TouchableOpacity style={ev.btnCerrar} onPress={onCerrar} activeOpacity={0.8}>
            <Text style={ev.btnCerrarTexto}>Cerrar</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  )
}

const ev = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: V_FONDO,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20,
  },
  glow: {
    position: 'absolute', top: -160, alignSelf: 'center',
    width: 560, height: 560,
  },
  card: {
    width: '100%', maxWidth: 380,
    backgroundColor: V_CARD, borderWidth: 1, borderColor: V_BORDE,
    borderRadius: 26, padding: 30, paddingBottom: 24,
  },
  badgeRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  badgeIcono: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: V_ORO,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: V_ORO, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 18,
    elevation: 12,
  },
  badgeRing: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 14, borderWidth: 2, borderColor: 'rgba(223,196,122,0.5)',
  },
  badgeTexto: { fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', color: V_SUAVE },
  titulo:    { fontSize: 38, fontWeight: '800', color: V_ORO, letterSpacing: -1, marginBottom: 6 },
  subtitulo: { fontSize: 15, fontWeight: '500', color: V_SUAVE, marginBottom: 24 },
  scoreStrip: {
    flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 24,
    backgroundColor: '#272420', borderWidth: 1, borderColor: V_BORDE, borderRadius: 16,
  },
  scoreNum: { fontSize: 34, fontWeight: '800', color: V_ORO, lineHeight: 40 },
  scoreLbl: { marginTop: 4, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: V_SUAVE },
  btnNueva: {
    backgroundColor: V_ORO, borderRadius: 15, height: 54,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
    shadowColor: V_ORO, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.65, shadowRadius: 24, elevation: 10,
  },
  btnNuevaTexto: { fontSize: 15, fontWeight: '700', color: V_CARD, letterSpacing: 0.5 },
  btnCerrar: {
    borderWidth: 1, borderColor: V_BORDE, borderRadius: 15,
    height: 54, alignItems: 'center', justifyContent: 'center',
  },
  btnCerrarTexto: { fontSize: 15, fontWeight: '600', color: V_SUAVE, letterSpacing: 0.5 },
})

// ─── preload + marcas ─────────────────────────────────────────────────────────

// Preloads all 5 palillos images silently when the game starts so swaps are instant.
function PreloadPalillos() {
  return (
    <View style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }} pointerEvents="none">
      {([1, 2, 3, 4, 5] as const).map(n => (
        <Image key={n} source={PALILLOS[n]} style={{ width: 1, height: 1 }} contentFit="fill" />
      ))}
    </View>
  )
}

// Cada imagen muestra el estado acumulado (1=izq, 2=izq+sup, ..., 5=cuadrado completo+diagonal).
// Se renderiza una sola imagen por cuadrado.
function CuadradoMarca({ marcas, sq }: { marcas: number; sq: number }) {
  return (
    <Image
      source={PALILLOS[marcas as keyof typeof PALILLOS]}
      style={{ width: sq, height: sq }}
      contentFit="fill"
      transition={80}
    />
  )
}

// Muestra las marcas en una columna vertical, divididas en dos secciones de 15 pts.
function MarcasPalillos({ puntos, bordeColor, sq }: {
  puntos: number
  bordeColor: string
  sq: number
}) {
  const gruposCompletos = Math.floor(puntos / 5)
  const resto = puntos % 5
  const marks: number[] = []
  for (let i = 0; i < gruposCompletos; i++) marks.push(5)
  if (resto > 0) marks.push(resto)

  const seccion1 = marks.slice(0, 3)
  const seccion2 = marks.slice(3, 6)

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, flexDirection: 'column', gap: 4, padding: 4, alignItems: 'center', justifyContent: 'flex-start' }}>
        {seccion1.map((m, i) => <CuadradoMarca key={i} marcas={m} sq={sq} />)}
      </View>
      <View style={{ height: 1, backgroundColor: bordeColor }} />
      <View style={{ flex: 1, flexDirection: 'column', gap: 4, padding: 4, alignItems: 'center', justifyContent: 'flex-start' }}>
        {seccion2.map((m, i) => <CuadradoMarca key={i} marcas={m} sq={sq} />)}
      </View>
    </View>
  )
}

export default function Truco() {
  const [fase, setFase] = useState<Fase>('seleccion')
  const [conTimba, setConTimba] = useState(false)
  const [puntos, setPuntos] = useState<[number, number]>([0, 0])
  const [victoria, setVictoria] = useState<{ equipo: string; propios: number; rival: number } | null>(null)
  const c = useColores()
  const es = makeEstilos(c)

  // SQ medido desde la altura real del área de marcas (onLayout en el JSX)
  const { width: ww } = useWindowDimensions()
  const [marksH, setMarksH] = useState(0)
  const cardContentW = Math.floor((ww - 36) / 2 - 52 - 8)
  const sectionContentH = marksH / 2 - 0.5 - 8   // mitad − divisor − padding
  const SQ = Math.max(40, Math.floor(Math.min(
    marksH > 0 ? (sectionContentH - 8) / 3 : 70,  // fallback hasta primer onLayout
    cardContentW
  )))

  useEffect(() => {
    if (fase !== 'juego' || victoria) return
    const idx = puntos.findIndex(p => p >= DURACION)
    if (idx === -1) return
    setVictoria({
      equipo: idx === 0 ? 'Nos' : 'Ellos',
      propios: puntos[idx],
      rival: puntos[1 - idx],
    })
  }, [puntos, fase, victoria])

  function seleccionar(ct: boolean) {
    setConTimba(ct)
    setFase('juego')
  }

  function sumar(equipo: 0 | 1) {
    if (victoria) return
    setPuntos(prev => {
      const nuevo: [number, number] = [prev[0], prev[1]]
      nuevo[equipo] = Math.min(DURACION, prev[equipo] + 1)
      return nuevo
    })
  }

  function restar(equipo: 0 | 1) {
    if (victoria) return
    setPuntos(prev => {
      const nuevo: [number, number] = [prev[0], prev[1]]
      nuevo[equipo] = Math.max(0, prev[equipo] - 1)
      return nuevo
    })
  }

  function confirmarReinicio() {
    Alert.alert('Nuevo partido', '¿Reiniciar ambos contadores a 0?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Reiniciar', style: 'destructive', onPress: () => { setPuntos([0, 0]); setVictoria(null) } },
    ])
  }

  function abrirTimba() {
    router.push({
      pathname: '/timba/nueva',
      params: { tituloPreset: 'Partida de Truco', opcionesPreset: 'Nos,Ellos', opcionesBloqueadas: 'true' },
    } as any)
  }

  if (fase === 'seleccion') {
    return (
      <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
        <TouchableOpacity onPress={() => router.back()} style={es.volverFase1} activeOpacity={0.7}>
          <Text style={[es.volverTexto, { color: c.primario }]}>‹ Volver</Text>
        </TouchableOpacity>
        <View style={es.seleccion}>
          <AppIcon name="machoEspada" size={64} />
          <Text style={[es.trucoTitulo, { color: c.texto }]}>Truco</Text>
          <Text style={[es.pregunta, { color: c.texto }]}>¿Con timba?</Text>
          <View style={es.opciones}>
            <TouchableOpacity style={[es.opcionBtn, { backgroundColor: c.primario }]} onPress={() => seleccionar(true)} activeOpacity={0.8}>
              <Text style={[es.opcionTexto, { color: c.fondo }]}>Sí</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[es.opcionBtn, { backgroundColor: c.fondoCard, borderColor: c.borde, borderWidth: 1 }]} onPress={() => seleccionar(false)} activeOpacity={0.8}>
              <Text style={[es.opcionTexto, { color: c.texto }]}>No</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      {victoria && (
        <PantallaVictoria
          equipo={victoria.equipo}
          propios={victoria.propios}
          rival={victoria.rival}
          onNueva={() => { setVictoria(null); setPuntos([0, 0]) }}
          onCerrar={() => setVictoria(null)}
        />
      )}
      <PreloadPalillos />

      {/* Header */}
      <View style={es.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={{ minWidth: 70 }}>
          <Text style={[es.volverTexto, { color: c.primario }]}>‹ Volver</Text>
        </TouchableOpacity>
        <Text style={[es.titulo, { color: c.texto }]}>Anotador</Text>
        {conTimba ? (
          <TouchableOpacity style={[es.timbaBtn, { backgroundColor: c.primario }]} onPress={abrirTimba} activeOpacity={0.8}>
            <AppIcon name="timba" size={18} color={c.fondo} />
          </TouchableOpacity>
        ) : (
          <View style={{ minWidth: 70 }} />
        )}
      </View>

      {/* Contadores: columna entera = zona táctil */}
      <View style={es.contadores}>
        {/* NOS — toda la columna izquierda es táctil */}
        <TouchableOpacity style={es.columna} onPress={() => sumar(0)} activeOpacity={0.4}>
          <View style={[es.botonesLateral, { paddingLeft: 10 }]}>
            <TouchableOpacity style={[es.btnLateral, { borderColor: c.borde, backgroundColor: c.fondoCard }]} onPress={() => sumar(0)} activeOpacity={0.7}>
              <Text style={[es.btnLateralTexto, { color: c.texto }]}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[es.btnLateral, { borderColor: c.borde, backgroundColor: c.fondoCard }]} onPress={() => restar(0)} activeOpacity={0.7}>
              <Text style={[es.btnLateralTexto, { color: c.texto }]}>−</Text>
            </TouchableOpacity>
          </View>
          <View style={es.contador}>
            <View style={es.contadorHeader}>
              <Text style={[es.contadorLabel, { color: c.textoSuave }]}>NOS</Text>
              <Text style={[es.contadorNumero, { color: c.textoSuave }]}>{puntos[0]}</Text>
            </View>
            <View style={{ height: 1, backgroundColor: c.borde }} />
            <View style={{ flex: 1 }} onLayout={e => setMarksH(e.nativeEvent.layout.height)}>
              <MarcasPalillos puntos={puntos[0]} bordeColor={c.borde} sq={SQ} />
            </View>
          </View>
        </TouchableOpacity>

        {/* Divisor central */}
        <View style={{ width: 1, backgroundColor: c.borde }} />

        {/* ELLOS — toda la columna derecha es táctil */}
        <TouchableOpacity style={[es.columna, es.columnaInvertida]} onPress={() => sumar(1)} activeOpacity={0.4}>
          <View style={[es.botonesLateral, { paddingRight: 10 }]}>
            <TouchableOpacity style={[es.btnLateral, { borderColor: c.borde, backgroundColor: c.fondoCard }]} onPress={() => sumar(1)} activeOpacity={0.7}>
              <Text style={[es.btnLateralTexto, { color: c.texto }]}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[es.btnLateral, { borderColor: c.borde, backgroundColor: c.fondoCard }]} onPress={() => restar(1)} activeOpacity={0.7}>
              <Text style={[es.btnLateralTexto, { color: c.texto }]}>−</Text>
            </TouchableOpacity>
          </View>
          <View style={es.contador}>
            <View style={es.contadorHeader}>
              <Text style={[es.contadorLabel, { color: c.textoSuave }]}>ELLOS</Text>
              <Text style={[es.contadorNumero, { color: c.textoSuave }]}>{puntos[1]}</Text>
            </View>
            <View style={{ height: 1, backgroundColor: c.borde }} />
            <MarcasPalillos puntos={puntos[1]} bordeColor={c.borde} sq={SQ} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Nuevo partido */}
      <View style={es.bottomArea}>
        <TouchableOpacity
          style={[es.nuevaPartidaBtn, { backgroundColor: c.fondoCard, borderColor: c.borde }]}
          onPress={confirmarReinicio}
          activeOpacity={0.8}
        >
          <Text style={[es.nuevaPartidaTexto, { color: c.texto }]}>Nuevo partido</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1 },
    volverFase1: { position: 'absolute', top: 56, left: 24, zIndex: 10 },
    volverTexto: { fontSize: 18, fontWeight: '700' },
    seleccion: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
trucoTitulo: { fontSize: 36, fontWeight: '900', letterSpacing: -0.5 },
    pregunta: { fontSize: 26, fontWeight: '700', marginTop: 16, marginBottom: 4 },
    opciones: { width: '100%', gap: 12, marginTop: 8 },
    opcionBtn: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
    opcionTexto: { fontSize: 22, fontWeight: '800' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 12,
    },
    titulo: { fontSize: 18, fontWeight: '700' },
    timbaBtn: { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14, minWidth: 70, alignItems: 'center' },
    contadores: { flex: 1, flexDirection: 'row', paddingVertical: 4 },
    columna: { flex: 1, flexDirection: 'row', gap: 8 },
    columnaInvertida: { flexDirection: 'row-reverse' },
    botonesLateral: { justifyContent: 'center', gap: 12 },
    btnLateral: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnLateralTexto: { fontSize: 24, fontWeight: '600' },
    contador: {
      flex: 1,
      overflow: 'hidden',
    },
    contadorHeader: {
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
    },
    contadorLabel: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    contadorNumero: {
      fontSize: 13,
      fontWeight: '600',
      marginTop: 2,
    },
    bottomArea: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 },
    nuevaPartidaBtn: {
      borderRadius: 16,
      paddingVertical: 18,
      alignItems: 'center',
      borderWidth: 1,
    },
    nuevaPartidaTexto: { fontSize: 17, fontWeight: '700' },
  })
}
