import { useEffect, useState, useMemo, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Share,
  Alert, RefreshControl, Modal, TextInput, useWindowDimensions,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { Timba, Participante } from '@/types'
import { AppIcon } from '@/components/ui/AppIcon'
import { mensajeError } from '@/lib/errores'
import Svg, { Defs, RadialGradient, Stop, Ellipse, Path } from 'react-native-svg'
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withRepeat, withSequence,
  withDelay, Easing, interpolate,
} from 'react-native-reanimated'

function formatearFecha(iso: string) {
  const d = new Date(iso)
  const dd = d.getDate().toString().padStart(2, '0')
  const mm = (d.getMonth() + 1).toString().padStart(2, '0')
  const hh = d.getHours().toString().padStart(2, '0')
  const min = d.getMinutes().toString().padStart(2, '0')
  return `${dd}/${mm} ${hh}:${min}`
}

// ── colores celebración ────────────────────────────────────────────────────────
const V_ORO     = '#DFC47A'
const V_ORO_OSC = '#C9A84C'
const V_FONDO   = 'rgba(20,18,16,0.97)'
const V_CARD    = '#1E1C18'
const V_BORDE   = '#2A2520'
const V_SUAVE   = '#9A8E7E'
const V_TEXTO   = '#FBF1D6'
const V_DARK    = '#272420'
const V_LIGHT   = '#F4EBD4'
const V_BODY    = '#C9BBA6'

// ── confetti ───────────────────────────────────────────────────────────────────
interface Particula { id: number; leftPct: number; size: number; duration: number; delay: number; color: string; round: boolean }

function generarConfetti(): Particula[] {
  const palette = [V_ORO, V_ORO_OSC, V_SUAVE, V_TEXTO]
  return Array.from({ length: 24 }, (_, i) => ({
    id: i,
    leftPct: Math.round(Math.random() * 100),
    size: 5 + Math.round(Math.random() * 6),
    duration: Math.round(2800 + Math.random() * 2600),
    delay: Math.round(Math.random() * 2400),
    color: palette[i % palette.length],
    round: Math.random() > 0.5,
  }))
}

function ParticulaConfetti({ p, screenH }: { p: Particula; screenH: number }) {
  const prog = useSharedValue(0)
  useEffect(() => {
    prog.value = withDelay(p.delay,
      withRepeat(withTiming(1, { duration: p.duration, easing: Easing.linear }), -1, false))
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
      pointerEvents="none"
      style={[{
        position: 'absolute',
        left: `${p.leftPct}%` as any,
        top: -20,
        width: p.size,
        height: p.size + 2,
        backgroundColor: p.color,
        borderRadius: p.round ? p.size / 2 : 2,
      }, animStyle]}
    />
  )
}

// ── Modal: Proponer Resultado ─────────────────────────────────────────────────
function ModalProponerResultado({
  winner, esMonetaria, onCancelar, onProponer,
}: {
  winner: string; esMonetaria: boolean
  onCancelar: () => void; onProponer: () => void
}) {
  const cardTY = useSharedValue(28)
  const cardOp = useSharedValue(0)
  const cardSc = useSharedValue(0.96)
  const glowOp = useSharedValue(0.45)

  useEffect(() => {
    cardTY.value = withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) })
    cardOp.value = withTiming(1, { duration: 320 })
    cardSc.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) })
    glowOp.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 2250, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.45, { duration: 2250, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    )
  }, [])

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOp.value,
    transform: [{ translateY: cardTY.value }, { scale: cardSc.value }],
  }))
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOp.value }))

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onCancelar}>
      <View style={mp.fondo}>
        <Animated.View style={[mp.glow, glowStyle]} pointerEvents="none">
          <Svg width={520} height={520}>
            <Defs>
              <RadialGradient id="pglow" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0%"   stopColor={V_ORO_OSC} stopOpacity={0.4} />
                <Stop offset="55%"  stopColor={V_ORO_OSC} stopOpacity={0.08} />
                <Stop offset="100%" stopColor={V_ORO_OSC} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={260} cy={260} rx={260} ry={260} fill="url(#pglow)" />
          </Svg>
        </Animated.View>

        <Animated.View style={[mp.card, cardStyle]}>
          {/* Badge */}
          <View style={mp.badge}>
            <View style={mp.badgeIcono}>
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <Path d="M9 11l3 3L22 4" stroke={V_ORO_OSC} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <Path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke={V_ORO_OSC} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </Svg>
            </View>
            <Text style={mp.badgeLabel}>Confirmar timba</Text>
          </View>

          <Text style={mp.titulo}>Proponer resultado</Text>

          <Text style={mp.pregunta}>
            {'¿Proponés '}
            <Text style={mp.ganador}>"{winner}"</Text>
            {' como ganador?'}
          </Text>

          <View style={mp.infoBox}>
            <Svg width={18} height={18} viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 } as any}>
              <Path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke={V_SUAVE} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M12 16v-4M12 8h.01" stroke={V_SUAVE} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={mp.infoTexto}>
              Los participantes deberán confirmar antes de que
              {esMonetaria ? ' se generen las deudas y' : ''} se cierre la timba.
            </Text>
          </View>

          <View style={mp.botones}>
            <TouchableOpacity style={mp.btnCancelar} onPress={onCancelar} activeOpacity={0.8}>
              <Text style={mp.btnCancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={mp.btnProponer} onPress={onProponer} activeOpacity={0.85}>
              <Text style={mp.btnProponerTexto}>Proponer</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const mp = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: V_FONDO, alignItems: 'center', justifyContent: 'center', padding: 28 },
  glow: { position: 'absolute', top: -180, alignSelf: 'center', width: 520, height: 520 },
  card: {
    width: '100%', maxWidth: 400,
    backgroundColor: V_CARD, borderRadius: 24, padding: 30, paddingBottom: 22,
    borderWidth: 1, borderColor: V_BORDE,
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  badgeIcono: {
    width: 42, height: 42, alignItems: 'center', justifyContent: 'center',
    borderRadius: 13, backgroundColor: V_DARK, borderWidth: 1, borderColor: V_BORDE,
  },
  badgeLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 2.2, textTransform: 'uppercase', color: V_SUAVE },
  titulo: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6, color: V_LIGHT, marginBottom: 12 },
  pregunta: { fontSize: 17, fontWeight: '500', lineHeight: 25, color: V_BODY, marginBottom: 18 },
  ganador: { color: V_ORO, fontWeight: '700' },
  infoBox: {
    flexDirection: 'row', gap: 11, padding: 14, paddingHorizontal: 16, marginBottom: 26,
    backgroundColor: V_DARK, borderWidth: 1, borderColor: V_BORDE, borderRadius: 14, alignItems: 'flex-start',
  },
  infoTexto: { flex: 1, fontSize: 14, fontWeight: '500', lineHeight: 21, color: V_SUAVE },
  botones: { flexDirection: 'row', gap: 12 },
  btnCancelar: {
    flex: 1, height: 52, borderRadius: 14, borderWidth: 1, borderColor: V_BORDE,
    alignItems: 'center', justifyContent: 'center',
  },
  btnCancelarTexto: { fontSize: 14, fontWeight: '600', letterSpacing: 0.4, color: V_SUAVE },
  btnProponer: {
    flex: 1.4, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: V_ORO_OSC,
    shadowColor: V_ORO, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 8,
  },
  btnProponerTexto: { fontSize: 14, fontWeight: '700', letterSpacing: 0.4, color: V_CARD },
})

// ── Pantalla Victoria Timba ───────────────────────────────────────────────────
interface VictoriaInfo {
  ganador: string
  titulo: string
  votosGanador: number
  rivalLabel: string
  votosRival: number
}

function PantallaVictoriaTimba({ info, onCerrar }: { info: VictoriaInfo; onCerrar: () => void }) {
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

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOp.value,
    transform: [{ translateY: cardTY.value }, { scale: cardSc.value }],
  }))
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOp.value }))
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringSc.value }],
    opacity: ringOp.value,
  }))

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade">
      <View style={tv.overlay}>
        {/* Glow */}
        <Animated.View style={[tv.glow, glowStyle]} pointerEvents="none">
          <Svg width={560} height={560}>
            <Defs>
              <RadialGradient id="tglow" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0%"   stopColor={V_ORO_OSC} stopOpacity={0.5} />
                <Stop offset="55%"  stopColor={V_ORO_OSC} stopOpacity={0.1} />
                <Stop offset="100%" stopColor={V_ORO_OSC} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={280} cy={280} rx={280} ry={280} fill="url(#tglow)" />
          </Svg>
        </Animated.View>

        {/* Confetti */}
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
          {confetti.map(p => <ParticulaConfetti key={p.id} p={p} screenH={SH} />)}
        </View>

        {/* Card */}
        <Animated.View style={[tv.card, cardStyle]}>
          {/* Badge */}
          <View style={tv.badgeRow}>
            <View style={tv.badgeIcono}>
              <Animated.View style={[tv.badgeRing, ringStyle]} />
              <AppIcon name="ganadas" size={22} color={V_CARD} />
            </View>
            <Text style={tv.badgeTexto}>Timba cerrada</Text>
          </View>

          <Text style={tv.titulo}>¡Ganó {info.ganador}!</Text>
          <Text style={tv.subtitulo}>"{info.titulo}"</Text>

          {/* Score strip */}
          <View style={tv.scoreStrip}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={tv.scoreNum}>{info.votosGanador}</Text>
              <Text style={tv.scoreLbl}>{info.ganador}</Text>
            </View>
            <View style={{ width: 1, backgroundColor: V_BORDE }} />
            <View style={{ flex: 1, alignItems: 'center', opacity: 0.55 }}>
              <Text style={[tv.scoreNum, { color: V_SUAVE }]}>{info.votosRival}</Text>
              <Text style={tv.scoreLbl}>{info.rivalLabel}</Text>
            </View>
          </View>

          <TouchableOpacity style={tv.btnCerrar} onPress={onCerrar} activeOpacity={0.85}>
            <Text style={tv.btnCerrarTexto}>Cerrar</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  )
}

const tv = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: V_FONDO,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20,
  },
  glow: { position: 'absolute', top: -160, alignSelf: 'center', width: 560, height: 560 },
  card: {
    width: '100%', maxWidth: 380,
    backgroundColor: V_CARD, borderWidth: 1, borderColor: V_BORDE,
    borderRadius: 26, padding: 30, paddingBottom: 24,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  badgeIcono: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: V_ORO,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: V_ORO, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 18, elevation: 12,
  },
  badgeRing: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 14, borderWidth: 2, borderColor: 'rgba(223,196,122,0.5)',
  },
  badgeTexto: { fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', color: V_SUAVE },
  titulo: { fontSize: 38, fontWeight: '800', color: V_ORO, letterSpacing: -1, marginBottom: 6 },
  subtitulo: { fontSize: 15, fontWeight: '500', color: V_SUAVE, marginBottom: 24 },
  scoreStrip: {
    flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 24,
    backgroundColor: V_DARK, borderWidth: 1, borderColor: V_BORDE, borderRadius: 16,
  },
  scoreNum: { fontSize: 34, fontWeight: '800', color: V_ORO, lineHeight: 40 },
  scoreLbl: { marginTop: 4, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: V_SUAVE },
  btnCerrar: {
    backgroundColor: V_ORO, borderRadius: 15, height: 54,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: V_ORO, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.65, shadowRadius: 24, elevation: 10,
  },
  btnCerrarTexto: { fontSize: 15, fontWeight: '700', color: V_CARD, letterSpacing: 0.5 },
})

// ── Modal: Confirmar Voto ─────────────────────────────────────────────────────
function ModalConfirmarVoto({
  opcion, onCancelar, onConfirmar,
}: {
  opcion: string; onCancelar: () => void; onConfirmar: () => void
}) {
  const cardTY = useSharedValue(16)
  const cardOp = useSharedValue(0)
  const cardSc = useSharedValue(0.97)
  const bgOp   = useSharedValue(0)
  const ringSc = useSharedValue(1)
  const ringOp = useSharedValue(0.5)

  useEffect(() => {
    cardTY.value = withTiming(0, { duration: 360, easing: Easing.out(Easing.cubic) })
    cardOp.value = withTiming(1, { duration: 280 })
    cardSc.value = withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) })
    bgOp.value   = withTiming(1, { duration: 240 })
    ringSc.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        withTiming(1,    { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    )
    ringOp.value = withRepeat(
      withSequence(
        withTiming(0.15, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.5,  { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    )
  }, [])

  const bgStyle   = useAnimatedStyle(() => ({ opacity: bgOp.value }))
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOp.value,
    transform: [{ translateY: cardTY.value }, { scale: cardSc.value }],
  }))
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringSc.value }],
    opacity: ringOp.value,
  }))

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onCancelar}>
      <Animated.View style={[cv.fondo, bgStyle]}>
        {/* Ambient warm glow */}
        <View style={cv.glowAmbiental} pointerEvents="none">
          <Svg width={760} height={520}>
            <Defs>
              <RadialGradient id="cvglow" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0%"   stopColor={V_ORO_OSC} stopOpacity={0.16} />
                <Stop offset="100%" stopColor={V_ORO_OSC} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={380} cy={260} rx={380} ry={260} fill="url(#cvglow)" />
          </Svg>
        </View>

        {/* Card */}
        <Animated.View style={[cv.card, cardStyle]}>
          {/* Icon badge */}
          <View style={cv.badgeWrap}>
            <Animated.View style={[cv.badgeGlow, ringStyle]} pointerEvents="none">
              <Svg width={76} height={76}>
                <Defs>
                  <RadialGradient id="brglow" cx="50%" cy="50%" rx="50%" ry="50%">
                    <Stop offset="0%"   stopColor={V_ORO_OSC} stopOpacity={0.35} />
                    <Stop offset="100%" stopColor={V_ORO_OSC} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Ellipse cx={38} cy={38} rx={38} ry={38} fill="url(#brglow)" />
              </Svg>
            </Animated.View>
            <View style={cv.badgeBox}>
              <View style={cv.diamond} />
            </View>
          </View>

          <Text style={cv.eyebrow}>Tu apuesta</Text>
          <Text style={cv.titulo}>¿Confirmás tu voto?</Text>

          <View style={cv.cuerpoRow}>
            <Text style={cv.cuerpoTexto}>Vas a apostar por</Text>
            <View style={cv.pill}>
              <View style={cv.pillDot} />
              <Text style={cv.pillTexto}>{opcion}</Text>
            </View>
            <Text style={cv.cuerpoTexto}>.</Text>
          </View>

          <View style={cv.warningBox}>
            <View style={cv.warningIcon}>
              <Text style={cv.warningIconTexto}>!</Text>
            </View>
            <Text style={cv.warningTexto}>
              Una vez que confirmás{' '}
              <Text style={{ color: '#C9BEAC' }}>no podés cambiar tu voto</Text>.
            </Text>
          </View>

          <View style={cv.botones}>
            <TouchableOpacity style={cv.btnCancelar} onPress={onCancelar} activeOpacity={0.8}>
              <Text style={cv.btnCancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cv.btnConfirmar} onPress={onConfirmar} activeOpacity={0.85}>
              <Text style={cv.btnConfirmarTexto}>Confirmar voto</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

const cv = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: '#0e0c0a', alignItems: 'center', justifyContent: 'center', padding: 28 },
  glowAmbiental: { position: 'absolute', top: -180, alignSelf: 'center', width: 760, height: 520 },
  card: {
    width: '100%', maxWidth: 460,
    backgroundColor: V_CARD, borderRadius: 28,
    paddingTop: 38, paddingHorizontal: 36, paddingBottom: 28,
    borderWidth: 1, borderColor: V_BORDE,
  },
  badgeWrap: { width: 64, height: 64, marginBottom: 26, alignItems: 'center', justifyContent: 'center' },
  badgeGlow: { position: 'absolute', top: -6, left: -6, width: 76, height: 76 },
  badgeBox: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: 'rgba(223,196,122,0.10)',
    borderWidth: 1, borderColor: 'rgba(223,196,122,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  diamond: {
    width: 22, height: 22, borderRadius: 5,
    backgroundColor: V_ORO_OSC,
    transform: [{ rotate: '45deg' }],
    shadowColor: V_ORO_OSC, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
  },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.8, textTransform: 'uppercase', color: V_SUAVE, marginBottom: 10 },
  titulo: { fontSize: 32, fontWeight: '600', letterSpacing: -0.3, color: '#F3ECDD', marginBottom: 16, lineHeight: 36 },
  cuerpoRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 20 },
  cuerpoTexto: { fontSize: 17, lineHeight: 26, color: '#C9BEAC' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999,
    backgroundColor: 'rgba(223,196,122,0.12)', borderWidth: 1, borderColor: 'rgba(223,196,122,0.4)',
  },
  pillDot: {
    width: 7, height: 7, borderRadius: 3.5, backgroundColor: V_ORO,
    shadowColor: V_ORO_OSC, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2,
  },
  pillTexto: { fontSize: 15, fontWeight: '600', color: V_ORO },
  warningBox: {
    flexDirection: 'row', gap: 11, alignItems: 'flex-start',
    backgroundColor: V_DARK, borderWidth: 1, borderColor: V_BORDE,
    borderRadius: 14, paddingVertical: 13, paddingHorizontal: 15, marginBottom: 28,
  },
  warningIcon: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: V_SUAVE,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  warningIconTexto: { fontSize: 11, fontWeight: '700', color: V_SUAVE },
  warningTexto: { flex: 1, fontSize: 15, lineHeight: 22, color: V_SUAVE },
  botones: { flexDirection: 'row', gap: 12 },
  btnCancelar: {
    flex: 1, height: 52, borderRadius: 14,
    borderWidth: 1, borderColor: '#34302a', alignItems: 'center', justifyContent: 'center',
  },
  btnCancelarTexto: { fontSize: 15, fontWeight: '600', color: '#C9BEAC', letterSpacing: 0.3 },
  btnConfirmar: {
    flex: 1.5, height: 52, borderRadius: 14, backgroundColor: V_ORO_OSC,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: V_ORO, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 24, elevation: 10,
  },
  btnConfirmarTexto: { fontSize: 15, fontWeight: '700', color: '#1E1714', letterSpacing: 0.3 },
})

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function DetalleTimba() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { usuario, session } = useAuthStore()
  const [timba, setTimba] = useState<Timba | null>(null)
  const [participantes, setParticipantes] = useState<Participante[]>([])
  const [miParticipacion, setMiParticipacion] = useState<Participante | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  // Modal monto (timbas monetarias)
  const [modalMonto, setModalMonto] = useState(false)
  const [opcionPendiente, setOpcionPendiente] = useState<string | null>(null)
  const [montoInput, setMontoInput] = useState('')

  // Celebración
  const [modalConfirmar, setModalConfirmar] = useState<string | null>(null)
  const [modalProponer, setModalProponer] = useState<string | null>(null)
  const [victoria, setVictoria] = useState<VictoriaInfo | null>(null)
  const estadoAnteriorRef = useRef<string | null>(null)

  const c = useColores()
  const es = makeEstilos(c)

  const userId = usuario?.id ?? session?.user?.id
  const soyCreador = timba?.creador_id === userId

  useEffect(() => { cargar() }, [id])

  async function cargar() {
    setCargando(true)
    setErrorCarga(null)
    try {
      const [{ data: timbaData, error: e1 }, { data: partsData, error: e2 }] = await Promise.all([
        supabase.from('timbas').select('*').eq('id', id).single(),
        supabase.from('participantes').select('*, usuario:usuarios_publicos(nombre, avatar_url)').eq('timba_id', id),
      ])
      if (e1 || e2) throw e1 ?? e2
      setTimba(timbaData)
      setParticipantes(partsData ?? [])
      setMiParticipacion(partsData?.find(p => p.usuario_id === userId) ?? null)

      // Detectar transición a 'cerrada' dentro de esta sesión
      if (
        estadoAnteriorRef.current !== null &&
        estadoAnteriorRef.current !== 'cerrada' &&
        timbaData.estado === 'cerrada' &&
        timbaData.resultado_ganador
      ) {
        const votosGanador = partsData?.filter(p => p.opcion_elegida === timbaData.resultado_ganador).length ?? 0
        const votosRival = (partsData?.length ?? 0) - votosGanador
        const otrasOpciones = (timbaData.opciones as string[]).filter(o => o !== timbaData.resultado_ganador)
        const rivalLabel = otrasOpciones.length === 1 ? otrasOpciones[0] : 'Otros'
        setVictoria({ ganador: timbaData.resultado_ganador, titulo: timbaData.titulo, votosGanador, rivalLabel, votosRival })
      }
      estadoAnteriorRef.current = timbaData.estado
    } catch (err) {
      setErrorCarga(mensajeError(err))
    } finally {
      setCargando(false)
    }
  }

  async function compartir() {
    await Share.share({ message: `Unite a mi timba "${timba?.titulo}" 🎲\ntimba://join/${timba?.codigo_invitacion}` })
  }

  async function seleccionarOpcion(opcion: string) {
    if (timba?.estado !== 'activa') return
    if (miParticipacion?.opcion_elegida) {
      Alert.alert('Ya votaste', `Tu voto por "${miParticipacion.opcion_elegida}" está confirmado y no se puede cambiar.`)
      return
    }

    if (timba.tipo === 'monetaria') {
      setOpcionPendiente(opcion)
      setMontoInput('')
      setModalMonto(true)
      return
    }

    setModalConfirmar(opcion)
  }

  async function confirmarVotoMonetario() {
    const monto = parseFloat(montoInput.replace(',', '.'))
    if (isNaN(monto) || monto <= 0) {
      Alert.alert('Ingresá un monto válido (mayor a 0)')
      return
    }
    if (timba?.monto_minimo && monto < timba.monto_minimo) {
      Alert.alert(`El mínimo para esta timba es $${timba.monto_minimo}`)
      return
    }
    if (timba?.monto_maximo && monto > timba.monto_maximo) {
      Alert.alert(`El máximo para esta timba es $${timba.monto_maximo}`)
      return
    }
    setModalMonto(false)
    setGuardando(true)
    const { error } = !miParticipacion
      ? await supabase.from('participantes').insert({ timba_id: id, usuario_id: userId, opcion_elegida: opcionPendiente, monto })
      : await supabase.from('participantes').update({ opcion_elegida: opcionPendiente, monto }).eq('id', miParticipacion.id)
    if (error) Alert.alert('No se pudo guardar tu apuesta', mensajeError(error))
    await cargar()
    setGuardando(false)
  }

  async function confirmarVoto() {
    if (!modalConfirmar) return
    const opcion = modalConfirmar
    setModalConfirmar(null)
    setGuardando(true)
    const { error } = !miParticipacion
      ? await supabase.from('participantes').insert({ timba_id: id, usuario_id: userId, opcion_elegida: opcion })
      : await supabase.from('participantes').update({ opcion_elegida: opcion }).eq('id', miParticipacion.id)
    if (error) Alert.alert('No se pudo guardar tu voto', mensajeError(error))
    await cargar()
    setGuardando(false)
  }

  async function confirmarProponer() {
    if (!modalProponer) return
    const opcion = modalProponer
    setModalProponer(null)
    setGuardando(true)

    const { error } = await supabase
      .from('timbas')
      .update({ resultado_ganador: opcion, estado: 'en_disputa' })
      .eq('id', id)
      .eq('creador_id', userId)

    if (error) {
      Alert.alert('Error', 'No se pudo proponer el resultado.')
      setGuardando(false)
      return
    }

    if (miParticipacion) {
      await supabase
        .from('participantes')
        .update({ confirmacion_resultado: true })
        .eq('id', miParticipacion.id)
    }

    await supabase.rpc('verificar_y_cerrar_timba', { p_timba_id: id })
    await cargar()
    setGuardando(false)
  }

  async function confirmarResultado(confirma: boolean) {
    if (!miParticipacion || guardando) return
    setGuardando(true)

    const { error } = await supabase
      .from('participantes')
      .update({ confirmacion_resultado: confirma })
      .eq('id', miParticipacion.id)
    if (error) Alert.alert('Error', mensajeError(error))

    if (!error && confirma) {
      await supabase.rpc('verificar_y_cerrar_timba', { p_timba_id: id })
    }

    await cargar()
    setGuardando(false)
  }

  function cancelarPropuesta() {
    if (guardando) return
    Alert.alert(
      'Cancelar propuesta',
      '¿Querés retirar el resultado propuesto? La timba vuelve a estar activa y se borran las confirmaciones.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            setGuardando(true)
            const { error } = await supabase.rpc('cancelar_propuesta', { p_timba_id: id })
            if (error) Alert.alert('Error', mensajeError(error))
            await cargar()
            setGuardando(false)
          },
        },
      ]
    )
  }

  if (cargando) {
    return <View style={{ flex: 1, backgroundColor: c.fondo }} />
  }

  if (errorCarga || !timba) {
    return (
      <View style={{ flex: 1, backgroundColor: c.fondo, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
        <AppIcon name="xCirculo" size={44} color={c.error} />
        <Text style={{ color: c.texto, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>
          {errorCarga ?? 'No se encontró la timba'}
        </Text>
        <TouchableOpacity onPress={cargar}>
          <Text style={{ color: c.primario, fontWeight: '700' }}>Reintentar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: c.textoSuave, fontSize: 14 }}>← Volver</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const ahora = new Date()
  const limiteVencido = timba.limite_union ? new Date(timba.limite_union) < ahora : false
  const timbaLlena = timba.max_participantes
    ? participantes.length >= timba.max_participantes && !miParticipacion
    : false
  const puedeVotar = timba.estado === 'activa' && !guardando &&
    (!limiteVencido || !!miParticipacion?.opcion_elegida) &&
    !timbaLlena
  const pozTotal = participantes.reduce((s, p) => s + (p.monto ?? 0), 0)

  return (
    <>
      <ScrollView
        style={es.flex}
        contentContainerStyle={es.contenedor}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={c.primario} />}
      >
        {/* Top bar */}
        <View style={es.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={es.volver}>← Volver</Text>
          </TouchableOpacity>
          {timba.estado === 'activa' && (
            <TouchableOpacity onPress={compartir} style={[es.btnCompartir, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
              <AppIcon name="compartirLink" size={14} color={c.texto} />
              <Text style={es.btnCompartirTexto}>Compartir</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Card principal */}
        <View style={es.card}>
          <Text style={es.titulo}>{timba.titulo}</Text>
          {timba.descripcion ? <Text style={es.descripcion}>{timba.descripcion}</Text> : null}

          {/* Info monetaria */}
          {timba.tipo === 'monetaria' && (timba.monto_minimo || timba.monto_maximo || pozTotal > 0) && (
            <View style={es.infoRow}>
              {(timba.monto_minimo || timba.monto_maximo) && (
                <View style={[es.infoChip, { backgroundColor: c.exito + '18', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                  <AppIcon name="conPlata" size={12} color={c.exito} />
                  <Text style={{ color: c.exito, fontSize: 12, fontWeight: '700' }}>
                    {timba.monto_minimo ? `Mín $${timba.monto_minimo}` : ''}
                    {timba.monto_minimo && timba.monto_maximo ? '  ·' : ''}
                    {timba.monto_maximo ? `  Máx $${timba.monto_maximo}` : ''}
                  </Text>
                </View>
              )}
              {pozTotal > 0 && (
                <View style={[es.infoChip, { backgroundColor: c.primario + '18', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                  <AppIcon name="pozoTotal" size={12} color={c.primario} />
                  <Text style={{ color: c.primario, fontSize: 12, fontWeight: '700' }}>Pozo: ${pozTotal}</Text>
                </View>
              )}
            </View>
          )}

          {/* Info amistosa */}
          {timba.tipo === 'amistosa' && (timba.premio_descripcion || timba.prenda_descripcion) && (
            <View style={{ gap: 4, marginTop: 6 }}>
              {timba.premio_descripcion && (
                <View style={es.premioRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 70 }}>
                    <AppIcon name="ganadas" size={13} color={c.textoSuave} />
                    <Text style={{ color: c.textoSuave, fontSize: 13, fontWeight: '600' }}>Premio:</Text>
                  </View>
                  <Text style={es.premioVal}>{timba.premio_descripcion}</Text>
                </View>
              )}
              {timba.prenda_descripcion && (
                <View style={es.premioRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 70 }}>
                    <AppIcon name="perdidas" size={13} color={c.textoSuave} />
                    <Text style={{ color: c.textoSuave, fontSize: 13, fontWeight: '600' }}>Prenda:</Text>
                  </View>
                  <Text style={[es.premioVal, { color: c.error }]}>{timba.prenda_descripcion}</Text>
                </View>
              )}
            </View>
          )}

          {/* Restricciones avanzadas */}
          {timba.limite_union && (
            <View style={[es.premioRow, { marginTop: 6 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 70 }}>
                <AppIcon name="limite" size={13} color={c.textoSuave} />
                <Text style={{ color: c.textoSuave, fontSize: 13, fontWeight: '600' }}>Límite:</Text>
              </View>
              <Text style={[es.premioVal, { color: limiteVencido ? c.error : c.textoSuave }]}>
                {limiteVencido ? 'Vencido · ' : ''}{formatearFecha(timba.limite_union)}
              </Text>
            </View>
          )}
          {timba.max_participantes && (
            <View style={es.premioRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 70 }}>
                <AppIcon name="cupo" size={13} color={c.textoSuave} />
                <Text style={{ color: c.textoSuave, fontSize: 13, fontWeight: '600' }}>Cupo:</Text>
              </View>
              <Text style={[es.premioVal, { color: timbaLlena ? c.error : c.textoSuave }]}>
                {participantes.length}/{timba.max_participantes}{timbaLlena ? ' · Llena' : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Banner resultado cerrado */}
        {timba.estado === 'cerrada' && timba.resultado_ganador && (
          <View style={es.resultadoBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppIcon name="ganadas" size={16} color={c.exito} />
              <Text style={es.resultadoTexto}>Ganó: {timba.resultado_ganador}</Text>
            </View>
          </View>
        )}

        {/* Banner en disputa */}
        {timba.estado === 'en_disputa' && timba.resultado_ganador && (() => {
          const confirmados = participantes.filter(p => p.confirmacion_resultado === true).length
          const miConfirmacion = miParticipacion?.confirmacion_resultado
          return (
            <View style={[es.resultadoBanner, { backgroundColor: c.primario + '15', borderColor: c.primario + '44', gap: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <AppIcon name="ganadas" size={16} color={c.primario} />
                <Text style={[es.resultadoTexto, { color: c.primario }]}>
                  Resultado propuesto: {timba.resultado_ganador}
                </Text>
              </View>

              <Text style={{ color: c.textoSuave, fontSize: 12, textAlign: 'center' }}>
                {confirmados}/{participantes.length} confirmaron
              </Text>

              {!soyCreador && miConfirmacion == null ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: c.texto, fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
                    ¿Confirmás este resultado?
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={[es.btnConfirmacion, { backgroundColor: c.error + '22', borderColor: c.error + '55', flex: 1 }]}
                      onPress={() => confirmarResultado(false)}
                      disabled={guardando}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: c.error, fontSize: 14, fontWeight: '700' }}>Disputar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[es.btnConfirmacion, { backgroundColor: c.exito + '22', borderColor: c.exito + '55', flex: 1 }]}
                      onPress={() => confirmarResultado(true)}
                      disabled={guardando}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: c.exito, fontSize: 14, fontWeight: '700' }}>Confirmar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : !soyCreador && miConfirmacion === true ? (
                <Text style={{ color: c.exito, fontSize: 13, textAlign: 'center', fontWeight: '600' }}>
                  Confirmaste · Esperando a los demás...
                </Text>
              ) : !soyCreador && miConfirmacion === false ? (
                <Text style={{ color: c.error, fontSize: 13, textAlign: 'center', fontWeight: '600' }}>
                  Disputaste este resultado · Hablá con el creador para resolverlo
                </Text>
              ) : soyCreador ? (
                <TouchableOpacity
                  style={[es.btnConfirmacion, { backgroundColor: c.error + '18', borderColor: c.error + '44' }]}
                  onPress={cancelarPropuesta}
                  disabled={guardando}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: c.error, fontSize: 14, fontWeight: '700' }}>Cancelar propuesta</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )
        })()}

        {/* Aviso si no puede unirse */}
        {timba.estado === 'activa' && (limiteVencido || timbaLlena) && !miParticipacion?.opcion_elegida && (
          <View style={[es.resultadoBanner, { backgroundColor: c.error + '15', borderColor: c.error + '44' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppIcon name={limiteVencido ? 'limite' : 'cupo'} size={16} color={c.error} />
              <Text style={[es.resultadoTexto, { color: c.error }]}>
                {limiteVencido ? 'El plazo de unión venció' : 'La timba está llena'}
              </Text>
            </View>
          </View>
        )}

        {/* Opciones */}
        <Text style={es.seccionTitulo}>
          {timba.estado === 'cerrada' ? 'Resultado final' : 'Elegí tu opción'}
        </Text>

        <View style={es.opciones}>
          {timba.opciones.map((op) => {
            const votos = participantes.filter(p => p.opcion_elegida === op).length
            const esGanadora = timba.resultado_ganador === op
            const esMiOpcion = miParticipacion?.opcion_elegida === op
            const yaVote = !!miParticipacion?.opcion_elegida
            const esOtraOpcion = yaVote && !esMiOpcion
            return (
              <TouchableOpacity
                key={op}
                style={[
                  es.opcion,
                  esMiOpcion && es.opcionMia,
                  esGanadora && es.opcionGanadora,
                  esOtraOpcion && es.opcionInactiva,
                ]}
                onPress={() => seleccionarOpcion(op)}
                disabled={!puedeVotar}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[es.opcionTexto, (esMiOpcion || esGanadora) && es.opcionTextoActivo]}>{op}</Text>
                  {esMiOpcion && <Text style={es.tuVoto}>Tu voto</Text>}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={es.votos}>{votos} {votos === 1 ? 'voto' : 'votos'}</Text>
                  {esMiOpcion && timba.tipo === 'monetaria' && miParticipacion?.monto ? (
                    <Text style={{ color: c.exito, fontSize: 12, fontWeight: '700' }}>${miParticipacion.monto}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Proponer ganador (solo creador, solo en activa) */}
        {soyCreador && timba.estado === 'activa' && (
          <View style={es.seccionGanador}>
            <Text style={es.seccionTitulo}>Proponer resultado</Text>
            <Text style={es.seccionSubtitulo}>Los participantes deberán confirmar antes de que se cierre</Text>
            <View style={es.botonesGanador}>
              {timba.opciones.map((op) => (
                <TouchableOpacity
                  key={`g-${op}`}
                  style={[es.btnGanador, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}
                  onPress={() => setModalProponer(op)}
                  disabled={guardando}
                  activeOpacity={0.8}
                >
                  <AppIcon name="ganadas" size={16} color={c.texto} />
                  <Text style={es.btnGanadorTexto}>{op} ganó</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Participantes */}
        <Text style={[es.seccionTitulo, { marginTop: 8 }]}>Participantes ({participantes.length})</Text>
        <View style={es.participantes}>
          {participantes.map((p) => (
            <View key={p.id} style={es.participante}>
              <View style={{ flex: 1 }}>
                <Text style={es.participanteNombre}>
                  {(p.usuario as any)?.nombre ?? 'Desconocido'}
                  {p.usuario_id === timba.creador_id && <Text style={es.creadorTag}> · creador</Text>}
                </Text>
                <Text style={es.participanteOpcion}>{p.opcion_elegida ?? '—'}</Text>
              </View>
              {timba.tipo === 'monetaria' && p.monto ? (
                <Text style={{ color: c.exito, fontSize: 14, fontWeight: '700' }}>${p.monto}</Text>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Modal monto para timbas monetarias */}
      <Modal visible={modalMonto} transparent animationType="slide" onRequestClose={() => setModalMonto(false)}>
        <View style={es.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setModalMonto(false)} activeOpacity={1} />
          <View style={[es.modalCard, { backgroundColor: c.fondoCard }]}>
            <View style={[es.modalHandle, { backgroundColor: c.borde }]} />
            <Text style={[es.modalTitulo, { color: c.texto }]}>¿Cuánto apostás?</Text>
            <Text style={{ color: c.textoSuave, fontSize: 14, textAlign: 'center' }}>
              Apostando por:{' '}
              <Text style={{ color: c.primario, fontWeight: '700' }}>{opcionPendiente}</Text>
            </Text>

            {(timba.monto_minimo || timba.monto_maximo) ? (
              <Text style={{ color: c.textoSuave, fontSize: 13, textAlign: 'center' }}>
                {timba.monto_minimo ? `Mín: $${timba.monto_minimo}` : ''}
                {timba.monto_minimo && timba.monto_maximo ? '  ·  ' : ''}
                {timba.monto_maximo ? `Máx: $${timba.monto_maximo}` : ''}
              </Text>
            ) : null}

            <View style={[es.montoBox, { backgroundColor: c.fondoInput, borderColor: c.primario }]}>
              <Text style={{ color: c.textoSuave, fontSize: 28, fontWeight: '700' }}>$</Text>
              <TextInput
                style={[es.montoInput, { color: c.texto }]}
                value={montoInput}
                onChangeText={setMontoInput}
                placeholder="0"
                placeholderTextColor={c.textoSuave}
                keyboardType="numeric"
                autoFocus
                selectionColor={c.primario}
              />
            </View>

            <View style={es.modalBotones}>
              <TouchableOpacity
                style={[es.modalBtn, { backgroundColor: c.fondoInput, borderColor: c.borde }]}
                onPress={() => setModalMonto(false)}
              >
                <Text style={{ color: c.textoSuave, fontSize: 16, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[es.modalBtn, { backgroundColor: c.primario }]}
                onPress={confirmarVotoMonetario}
                disabled={guardando}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
                  {guardando ? '...' : 'Confirmar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: confirmar voto */}
      {modalConfirmar && (
        <ModalConfirmarVoto
          opcion={modalConfirmar}
          onCancelar={() => setModalConfirmar(null)}
          onConfirmar={confirmarVoto}
        />
      )}

      {/* Modal: proponer resultado */}
      {modalProponer && (
        <ModalProponerResultado
          winner={modalProponer}
          esMonetaria={timba.tipo === 'monetaria'}
          onCancelar={() => setModalProponer(null)}
          onProponer={confirmarProponer}
        />
      )}

      {/* Celebración: timba cerrada */}
      {victoria && (
        <PantallaVictoriaTimba
          info={victoria}
          onCerrar={() => setVictoria(null)}
        />
      )}
    </>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.fondo },
    contenedor: { paddingBottom: 48 },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16 },
    volver: { color: c.primario, fontSize: 16 },
    btnCompartir: { backgroundColor: c.fondoCard, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: c.borde },
    btnCompartirTexto: { color: c.texto, fontSize: 14 },
    card: { marginHorizontal: 24, backgroundColor: c.fondoCard, borderRadius: 16, padding: 20, gap: 6, borderWidth: 1, borderColor: c.borde, marginBottom: 20 },
    titulo: { color: c.texto, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
    descripcion: { color: c.textoSuave, fontSize: 14, lineHeight: 20 },
    infoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    infoChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
    premioRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
    premioLabel: { color: c.textoSuave, fontSize: 13, fontWeight: '600', minWidth: 70 },
    premioVal: { color: c.texto, fontSize: 13, flex: 1 },
    resultadoBanner: { marginHorizontal: 24, backgroundColor: c.exito + '22', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: c.exito + '44' },
    resultadoTexto: { color: c.exito, fontSize: 16, fontWeight: '700' },
    seccionTitulo: { color: c.textoSuave, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, paddingHorizontal: 24, marginBottom: 10 },
    opciones: { paddingHorizontal: 24, gap: 10, marginBottom: 28 },
    opcion: { backgroundColor: c.fondoCard, borderRadius: 14, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.5, borderColor: c.borde },
    opcionMia: { borderColor: c.primario, backgroundColor: c.primario + '18' },
    opcionGanadora: { borderColor: c.exito, backgroundColor: c.exito + '18' },
    opcionInactiva: { opacity: 0.4 },
    opcionTexto: { color: c.texto, fontSize: 16, fontWeight: '600' },
    opcionTextoActivo: { color: c.primario },
    tuVoto: { color: c.primario, fontSize: 11, marginTop: 2, fontWeight: '500' },
    votos: { color: c.textoSuave, fontSize: 12 },
    seccionGanador: { marginHorizontal: 24, backgroundColor: c.fondoCard, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: c.borde, marginBottom: 28 },
    seccionSubtitulo: { color: c.textoSuave, fontSize: 13, marginTop: -4 },
    botonesGanador: { gap: 8 },
    btnGanador: { backgroundColor: c.fondoInput, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: c.borde },
    btnGanadorTexto: { color: c.texto, fontSize: 15, fontWeight: '600' },
    btnConfirmacion: { borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1 },
    participantes: { paddingHorizontal: 24, gap: 8, marginBottom: 24 },
    participante: { backgroundColor: c.fondoCard, borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: c.borde },
    participanteNombre: { color: c.texto, fontSize: 14, fontWeight: '600' },
    creadorTag: { color: c.textoSuave, fontWeight: '400', fontSize: 12 },
    participanteOpcion: { color: c.textoSuave, fontSize: 13, marginTop: 2 },
    overlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
    modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, gap: 14, paddingBottom: 40 },
    modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
    modalTitulo: { fontSize: 22, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 },
    montoBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 2, paddingHorizontal: 20, paddingVertical: 8, gap: 6 },
    montoInput: { flex: 1, fontSize: 36, fontWeight: '800', height: 56 },
    modalBotones: { flexDirection: 'row', gap: 12, marginTop: 4 },
    modalBtn: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  })
}
