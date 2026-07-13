import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ActivityIndicator, useWindowDimensions,
} from 'react-native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { CARTAS_IMG, MESA_IMG } from '@/lib/cartasAssets'
import { valorMano } from '@/lib/blackjack'
import {
  Dificultad, EstadoPractica,
  nuevaRonda, siguienteRonda, pedir, plantarse, doblar, puedeDoblar,
  RESULTADO_PRACTICA_LABELS, DIFICULTAD_LABELS,
} from '@/lib/blackjackPractica'

// ─── Carta ────────────────────────────────────────────────────────────────────

function CartaImg({ carta, w, h, boca = true }: {
  carta?: string; w: number; h: number; boca?: boolean
}) {
  const src = boca && carta ? (CARTAS_IMG[carta] ?? CARTAS_IMG['BACK']) : CARTAS_IMG['BACK']
  return <Image source={src} style={{ width: w, height: h, borderRadius: 6 }} contentFit="contain" />
}

// ─── Pantalla de elección de dificultad ───────────────────────────────────────

function Setup({ onEmpezar }: { onEmpezar: (d: Dificultad) => void }) {
  const c = useColores()
  const es = makeSetupEstilos(c)
  const [dificultad, setDificultad] = useState<Dificultad>('normal')

  const OPCIONES: { valor: Dificultad; titulo: string; desc: string }[] = [
    { valor: 'facil', titulo: 'Fácil', desc: 'El Bot juega tímido y comete errores. Ideal para arrancar.' },
    { valor: 'normal', titulo: 'Normal', desc: 'El Bot usa estrategia sólida: pide hasta 17 y dobla con 10 u 11.' },
  ]

  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <View style={es.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={12}>
          <Text style={[es.volver, { color: c.primario }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[es.titulo, { color: c.texto }]}>Práctica rápida</Text>
        <View style={{ width: 18 }} />
      </View>

      <View style={es.body}>
        <Text style={[es.subtitulo, { color: c.textoSuave }]}>
          Vos contra un Bot. Gana quien queda más cerca de 21 sin pasarse. Sin apuestas: se lleva el tanteo por rondas.
        </Text>

        <Text style={[es.seccionLabel, { color: c.textoSuave }]}>Dificultad del Bot</Text>
        <View style={{ gap: 12 }}>
          {OPCIONES.map(o => {
            const activo = dificultad === o.valor
            return (
              <TouchableOpacity
                key={o.valor}
                style={[
                  es.opcion,
                  { borderColor: activo ? c.primario : c.borde, backgroundColor: activo ? 'rgba(201,168,76,0.08)' : c.fondoCard },
                ]}
                onPress={() => setDificultad(o.valor)}
                activeOpacity={0.8}
              >
                <View style={[es.radio, { borderColor: activo ? c.primario : c.borde }]}>
                  {activo && <View style={[es.radioDot, { backgroundColor: c.primario }]} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[es.opcionTitulo, { color: c.texto }]}>{o.titulo}</Text>
                  <Text style={[es.opcionDesc, { color: c.textoSuave }]}>{o.desc}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <View style={es.footer}>
        <TouchableOpacity
          style={[es.botonPrimario, { backgroundColor: c.primario }]}
          onPress={() => onEmpezar(dificultad)}
          activeOpacity={0.85}
        >
          <Text style={[es.botonTexto, { color: c.fondo }]}>Empezar</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Overlay de resultado ─────────────────────────────────────────────────────

function OverlayResultado({ estado, onSiguiente, onCambiar, onSalir }: {
  estado: EstadoPractica
  onSiguiente: () => void
  onCambiar: () => void
  onSalir: () => void
}) {
  const gane = estado.ganador === 'humano'
  const empate = estado.ganador === 'empate'
  const totalHumano = valorMano(estado.cartasHumano).total
  const totalBot = valorMano(estado.cartasBot).total

  const titulo = empate ? '¡Empate!' : gane ? '¡Ganaste la ronda! 🏆' : 'Perdiste la ronda'

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade">
      <View style={ov.overlay}>
        <View style={ov.card}>
          <Text style={[ov.titulo, { color: gane ? '#C9A84C' : empate ? '#F5F2EC' : '#9A8E7E' }]}>
            {titulo}
          </Text>
          {!!estado.resultado && (
            <Text style={ov.detalle}>{RESULTADO_PRACTICA_LABELS[estado.resultado]}</Text>
          )}
          {estado.multiplicador > 1 && (
            <View style={ov.x2Pill}><Text style={ov.x2Txt}>Ronda ×2</Text></View>
          )}

          <View style={ov.manosWrap}>
            <View style={ov.manoRow}>
              <Text style={ov.manoLabel}>Vos · {totalHumano}</Text>
              <View style={ov.cartasRow}>
                {estado.cartasHumano.map((cta, i) => <CartaImg key={i} carta={cta} w={44} h={62} boca />)}
              </View>
            </View>
            <View style={ov.divisor} />
            <View style={ov.manoRow}>
              <Text style={ov.manoLabel}>Bot · {totalBot}</Text>
              <View style={ov.cartasRow}>
                {estado.cartasBot.map((cta, i) => <CartaImg key={i} carta={cta} w={44} h={62} boca />)}
              </View>
            </View>
          </View>

          <View style={ov.marcador}>
            <Text style={ov.marcadorTxt}>Vos {estado.puntosHumano}</Text>
            <Text style={ov.marcadorSep}>·</Text>
            <Text style={ov.marcadorTxt}>Bot {estado.puntosBot}</Text>
          </View>

          <TouchableOpacity style={[ov.btn, { backgroundColor: '#C9A84C' }]} onPress={onSiguiente} activeOpacity={0.85}>
            <Text style={[ov.btnTxt, { color: '#141210' }]}>Siguiente ronda</Text>
          </TouchableOpacity>
          <View style={ov.btnRow}>
            <TouchableOpacity style={[ov.btnChico, { backgroundColor: '#272420' }]} onPress={onCambiar} activeOpacity={0.8}>
              <Text style={[ov.btnTxt, { color: '#9A8E7E' }]}>Dificultad</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ov.btnChico, { backgroundColor: '#272420' }]} onPress={onSalir} activeOpacity={0.8}>
              <Text style={[ov.btnTxt, { color: '#9A8E7E' }]}>Salir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function PracticaBlackjackScreen() {
  const { width: W } = useWindowDimensions()
  const [estado, setEstado] = useState<EstadoPractica | null>(null)
  const [botReveal, setBotReveal] = useState(1)   // cuántas cartas del Bot están dadas vuelta
  const [overlayVisible, setOverlayVisible] = useState(false)

  const CARD_W = Math.min(66, W * 0.16)
  const CARD_H = Math.round(CARD_W * 1.4)

  // Cuando la ronda cierra, el Bot "juega" ~4s: revelamos sus cartas una por una
  // y recién después mostramos el resultado (da tiempo a procesar la jugada).
  useEffect(() => {
    if (estado?.fase !== 'resultado') {
      setBotReveal(1)
      setOverlayVisible(false)
      return
    }
    const total = estado.cartasBot.length
    setBotReveal(1)
    setOverlayVisible(false)
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let n = 2; n <= total; n++) {
      timers.push(setTimeout(() => setBotReveal(n), (n - 1) * 1000))
    }
    const finReveal = (total - 1) * 1000
    timers.push(setTimeout(() => setOverlayVisible(true), Math.max(finReveal + 1300, 4000)))
    return () => timers.forEach(clearTimeout)
  }, [estado?.fase, estado?.ronda])

  if (!estado) {
    return <Setup onEmpezar={(d) => setEstado(nuevaRonda(d, 0, 0, 1))} />
  }

  const jugando = estado.fase === 'jugando'
  const totalHumano = valorMano(estado.cartasHumano).total
  const totalBotVisible = valorMano(estado.cartasBot.slice(0, botReveal)).total
  const botTodoVisible = botReveal >= estado.cartasBot.length
  const puedeDoblarAhora = puedeDoblar(estado)

  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={MESA_IMG} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />

      {/* Header */}
      <View style={bj.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={12}>
          <Text style={bj.volver}>‹</Text>
        </TouchableOpacity>
        <View style={bj.headerCenter}>
          <Text style={bj.headerTitulo}>Práctica</Text>
          <Text style={bj.headerFase}>{DIFICULTAD_LABELS[estado.dificultad]}</Text>
        </View>
        <View style={bj.boteChip}>
          <Text style={bj.boteLabel}>Marcador</Text>
          <Text style={bj.boteNum}>{estado.puntosHumano} · {estado.puntosBot}</Text>
        </View>
      </View>

      {/* ── Zona del Bot (arriba) ── */}
      <View style={bj.zonaRival}>
        <View style={bj.jugadorInfo}>
          <View style={[bj.avatar, { backgroundColor: '#2d3a3a' }]}>
            <Text style={[bj.avatarTxt, { color: '#7fb8b8' }]}>B</Text>
          </View>
          <View>
            <Text style={bj.jugadorNombre}>Bot · {DIFICULTAD_LABELS[estado.dificultad]}</Text>
            <Text style={bj.jugadorChips}>{estado.puntosBot} pts</Text>
          </View>
        </View>

        <View style={bj.cartasRow}>
          {estado.cartasBot.map((cta, i) => (
            <CartaImg key={i} carta={cta} w={CARD_W} h={CARD_H} boca={i < botReveal} />
          ))}
        </View>
        <View style={bj.totalPill}>
          <Text style={bj.totalPillTxt}>
            {botTodoVisible ? totalBotVisible : `${totalBotVisible} + ?`}
          </Text>
        </View>
      </View>

      {/* ── Centro: estado ── */}
      <View style={bj.centro} pointerEvents="none">
        {jugando && <Text style={bj.centroTxt}>Tu turno · acercate a 21 sin pasarte</Text>}
        {!jugando && !overlayVisible && <Text style={bj.centroTxt}>El Bot está jugando…</Text>}
      </View>

      {/* ── Zona propia (abajo) ── */}
      <View style={bj.zonaPropia}>
        <View style={bj.cartasRow}>
          {estado.cartasHumano.map((cta, i) => <CartaImg key={i} carta={cta} w={CARD_W} h={CARD_H} boca />)}
        </View>
        <View style={bj.totalPill}>
          <Text style={bj.totalPillTxt}>{totalHumano}</Text>
        </View>

        <View style={[bj.jugadorInfo, { justifyContent: 'flex-end' }]}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={bj.jugadorNombre}>Vos</Text>
            <Text style={bj.jugadorChips}>{estado.puntosHumano} pts</Text>
          </View>
          <View style={[bj.avatar, { backgroundColor: '#C9A84C' }]}>
            <Text style={[bj.avatarTxt, { color: '#141210' }]}>V</Text>
          </View>
        </View>

        {jugando && (
          <View style={bj.acciones}>
            <TouchableOpacity
              style={[bj.accionBtn, { backgroundColor: '#5ABF8A' }]}
              onPress={() => setEstado(pedir(estado))}
              activeOpacity={0.8}
            >
              <Text style={bj.accionTxt}>Pedir</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[bj.accionBtn, { backgroundColor: '#E0A052' }]}
              onPress={() => setEstado(plantarse(estado))}
              activeOpacity={0.8}
            >
              <Text style={[bj.accionTxt, { color: '#141210' }]}>Plantarse</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[bj.accionBtn, { backgroundColor: '#C9A84C', opacity: puedeDoblarAhora ? 1 : 0.35 }]}
              onPress={() => setEstado(doblar(estado))}
              disabled={!puedeDoblarAhora}
              activeOpacity={0.8}
            >
              <Text style={[bj.accionTxt, { color: '#141210' }]}>Doblar</Text>
            </TouchableOpacity>
          </View>
        )}

        {!jugando && !overlayVisible && (
          <View style={bj.esperandoBanca}>
            <ActivityIndicator color="#C9A84C" />
            <Text style={bj.esperandoBancaTxt}>El Bot está jugando su mano…</Text>
          </View>
        )}
      </View>

      {overlayVisible && (
        <OverlayResultado
          estado={estado}
          onSiguiente={() => setEstado(siguienteRonda(estado))}
          onCambiar={() => setEstado(null)}
          onSalir={() => router.back()}
        />
      )}
    </View>
  )
}

// ─── Estilos del juego (mesa oscura) ──────────────────────────────────────────

const bj = StyleSheet.create({
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 20, paddingBottom: 10, zIndex: 5,
  },
  volver: { color: '#C9A84C', fontSize: 32, fontWeight: '700', lineHeight: 36 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitulo: { color: '#F5F2EC', fontSize: 16, fontWeight: '700' },
  headerFase: { color: '#9A8E7E', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  boteChip: { alignItems: 'flex-end' },
  boteLabel: { color: '#9A8E7E', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  boteNum: { color: '#C9A84C', fontSize: 16, fontWeight: '800' },

  zonaRival: { position: 'absolute', top: 112, left: 0, right: 0, alignItems: 'center', gap: 8 },
  zonaPropia: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingBottom: 32, gap: 10 },

  jugadorInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 16, fontWeight: '700' },
  jugadorNombre: { color: '#F5F2EC', fontSize: 14, fontWeight: '700' },
  jugadorChips: { color: '#9A8E7E', fontSize: 12, fontWeight: '500' },

  cartasRow: { flexDirection: 'row', gap: 8, minHeight: 4 },

  totalPill: {
    backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.45)',
    paddingHorizontal: 14, paddingVertical: 3, borderRadius: 20,
  },
  totalPillTxt: { color: '#DFC47A', fontSize: 15, fontWeight: '800' },

  centro: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10,
  },
  centroTxt: { color: '#F5F2EC', fontSize: 15, fontWeight: '600', textAlign: 'center', opacity: 0.9 },
  x2Pill: {
    backgroundColor: 'rgba(201,168,76,0.15)', borderWidth: 1, borderColor: '#C9A84C',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
  },
  x2Txt: { color: '#DFC47A', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },

  acciones: { flexDirection: 'row', gap: 10, paddingHorizontal: 20 },
  accionBtn: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  accionTxt: { color: '#F5F2EC', fontSize: 15, fontWeight: '800' },

  esperandoBanca: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24 },
  esperandoBancaTxt: { color: '#9A8E7E', fontSize: 13, fontWeight: '600', flex: 1 },
})

const ov = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, borderRadius: 24, padding: 24, borderWidth: 1, backgroundColor: '#1E1C18', borderColor: '#2A2520' },
  titulo: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  detalle: { fontSize: 14, fontWeight: '600', textAlign: 'center', color: '#9A8E7E', marginBottom: 8 },
  x2Pill: {
    alignSelf: 'center', backgroundColor: 'rgba(201,168,76,0.15)', borderWidth: 1, borderColor: '#C9A84C',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginBottom: 14,
  },
  x2Txt: { color: '#DFC47A', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  manosWrap: { gap: 14, marginBottom: 18 },
  manoRow: { alignItems: 'center', gap: 8 },
  manoLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, color: '#9A8E7E' },
  cartasRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  divisor: { height: 1, backgroundColor: '#2A2520' },
  marcador: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 20 },
  marcadorTxt: { color: '#F5F2EC', fontSize: 15, fontWeight: '800' },
  marcadorSep: { color: '#6b6257', fontSize: 15, fontWeight: '800' },
  btn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btnChico: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { fontSize: 16, fontWeight: '700' },
})

function makeSetupEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1 },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 20, paddingTop: 56, paddingBottom: 10,
    },
    volver: { fontSize: 32, fontWeight: '700', lineHeight: 36, marginRight: 4 },
    titulo: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
    body: { flex: 1, paddingHorizontal: 24, paddingTop: 12 },
    subtitulo: { fontSize: 14, lineHeight: 20, marginBottom: 28 },
    seccionLabel: {
      fontSize: 12, fontWeight: '700', letterSpacing: 1.2,
      textTransform: 'uppercase', marginBottom: 12,
    },
    opcion: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      borderWidth: 1.5, borderRadius: 16, padding: 16,
    },
    radio: {
      width: 24, height: 24, borderRadius: 12, borderWidth: 2,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    radioDot: { width: 12, height: 12, borderRadius: 6 },
    opcionTitulo: { fontSize: 17, fontWeight: '800' },
    opcionDesc: { fontSize: 13, marginTop: 3, lineHeight: 18 },
    footer: { paddingHorizontal: 24, paddingBottom: 36, paddingTop: 12 },
    botonPrimario: { height: 58, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    botonTexto: { fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
  })
}
