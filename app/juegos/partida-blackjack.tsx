import { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ActivityIndicator, useWindowDimensions,
} from 'react-native'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { CARTAS_IMG, MESA_IMG } from '@/lib/cartasAssets'
import {
  PartidaBlackjack, valorMano, apuestaMaxima, fichasDeBanca, fichasDeJugador,
  apostar, pedir, plantarse, doblar, puedeDoblar, nuevaMano, RESULTADO_LABELS,
} from '@/lib/blackjack'

// ─── Carta ────────────────────────────────────────────────────────────────────

function CartaImg({ carta, w = 64, h = 90, boca = true }: {
  carta?: string; w?: number; h?: number; boca?: boolean
}) {
  const src = boca && carta ? (CARTAS_IMG[carta] ?? CARTAS_IMG['BACK']) : CARTAS_IMG['BACK']
  return (
    <Image source={src} style={{ width: w, height: h, borderRadius: 6 }} contentFit="contain" />
  )
}

function SlotVacio({ w, h }: { w: number; h: number }) {
  return (
    <View style={[bj.slotVacio, { width: w, height: h }]}>
      <Text style={bj.slotVacioTxt}>?</Text>
    </View>
  )
}

// ─── Overlay de resultado ─────────────────────────────────────────────────────

function OverlayResultado({
  partida, soyJugador, onSiguiente, onSalir,
}: {
  partida: PartidaBlackjack
  soyJugador: boolean
  onSiguiente: () => void
  onSalir: () => void
}) {
  const gane =
    (partida.ganador === 'jugador' && soyJugador) ||
    (partida.ganador === 'banca' && !soyJugador)
  const empate = partida.ganador === 'empate'
  const terminada = partida.fichas_host === 0 || partida.fichas_invitado === 0

  const totalJugador = valorMano(partida.cartas_jugador).total
  const totalBanca = valorMano(partida.cartas_banca).total

  const titulo = terminada
    ? (gane ? '¡Ganaste la partida! 🏆' : 'Perdiste la partida')
    : empate ? '¡Empate!' : gane ? '¡Ganaste la mano! 🏆' : 'Perdiste la mano'

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade">
      <View style={ov.overlay}>
        <View style={ov.card}>
          <Text style={[ov.titulo, { color: gane ? '#C9A84C' : empate ? '#F5F2EC' : '#9A8E7E' }]}>
            {titulo}
          </Text>
          {!!partida.resultado && (
            <Text style={ov.detalle}>{RESULTADO_LABELS[partida.resultado]}</Text>
          )}

          <View style={ov.manosWrap}>
            <View style={ov.manoRow}>
              <Text style={ov.manoLabel}>{soyJugador ? 'Vos (jugador)' : 'El jugador'} · {totalJugador}</Text>
              <View style={ov.cartasRow}>
                {partida.cartas_jugador.map((c, i) => <CartaImg key={i} carta={c} w={46} h={64} boca />)}
              </View>
            </View>
            <View style={ov.divisor} />
            <View style={ov.manoRow}>
              <Text style={ov.manoLabel}>{soyJugador ? 'La banca' : 'Vos (banca)'} · {totalBanca}</Text>
              <View style={ov.cartasRow}>
                {partida.cartas_banca.map((c, i) => <CartaImg key={i} carta={c} w={46} h={64} boca />)}
              </View>
            </View>
          </View>

          <TouchableOpacity style={[ov.btn, { backgroundColor: '#C9A84C' }]} onPress={onSiguiente} activeOpacity={0.85}>
            <Text style={[ov.btnTxt, { color: '#141210' }]}>{terminada ? 'Revancha' : 'Siguiente mano'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[ov.btn, { backgroundColor: '#272420', marginTop: 8 }]} onPress={onSalir} activeOpacity={0.8}>
            <Text style={[ov.btnTxt, { color: '#9A8E7E' }]}>Salir</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const ov = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, borderRadius: 24, padding: 24, borderWidth: 1, backgroundColor: '#1E1C18', borderColor: '#2A2520' },
  titulo: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  detalle: { fontSize: 14, fontWeight: '600', textAlign: 'center', color: '#9A8E7E', marginBottom: 20 },
  manosWrap: { gap: 14, marginBottom: 24 },
  manoRow: { alignItems: 'center', gap: 8 },
  manoLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, color: '#9A8E7E' },
  cartasRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  divisor: { height: 1, backgroundColor: '#2A2520' },
  btn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { fontSize: 16, fontWeight: '700' },
})

// ─── Selector de apuesta ──────────────────────────────────────────────────────

function SelectorApuesta({
  max, valor, setValor, onApostar, deshabilitado,
}: {
  max: number; valor: number; setValor: (n: number) => void
  onApostar: () => void; deshabilitado: boolean
}) {
  const step = Math.max(1, Math.round(max / 20))
  const clamp = (n: number) => Math.max(1, Math.min(n, max))
  const chips = [...new Set([
    Math.round(max / 4), Math.round(max / 2), max,
  ])].filter(x => x >= 1 && x <= max).sort((a, b) => a - b)

  return (
    <View style={bj.apuestaBox}>
      <Text style={bj.apuestaLabel}>Tu apuesta</Text>
      <View style={bj.stepperRow}>
        <TouchableOpacity style={bj.stepBtn} onPress={() => setValor(clamp(valor - step))} activeOpacity={0.7}>
          <Text style={bj.stepBtnTxt}>−</Text>
        </TouchableOpacity>
        <View style={bj.apuestaValorWrap}>
          <Text style={bj.apuestaValor}>{valor.toLocaleString('es-AR')}</Text>
          <Text style={bj.apuestaMax}>máx {max.toLocaleString('es-AR')}</Text>
        </View>
        <TouchableOpacity style={bj.stepBtn} onPress={() => setValor(clamp(valor + step))} activeOpacity={0.7}>
          <Text style={bj.stepBtnTxt}>+</Text>
        </TouchableOpacity>
      </View>
      <View style={bj.chipsRow}>
        {chips.map((ch, i) => (
          <TouchableOpacity key={ch} style={bj.chip} onPress={() => setValor(clamp(ch))} activeOpacity={0.75}>
            <Text style={bj.chipTxt}>{i === chips.length - 1 ? 'Máx' : ch.toLocaleString('es-AR')}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={[bj.apostarBtn, { opacity: deshabilitado ? 0.4 : 1 }]}
        onPress={onApostar}
        disabled={deshabilitado}
        activeOpacity={0.85}
      >
        <Text style={bj.apostarTxt}>Apostar {valor.toLocaleString('es-AR')}</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function PartidaBlackjackScreen() {
  const { width: W } = useWindowDimensions()
  const { usuario } = useAuthStore()
  const { partidaId } = useLocalSearchParams<{ partidaId: string }>()
  const myId = usuario?.id ?? ''

  const CARD_W = Math.min(66, W * 0.16)
  const CARD_H = Math.round(CARD_W * 1.4)

  const [partida, setPartida] = useState<PartidaBlackjack | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [nombreRival, setNombreRival] = useState('Rival')
  const [apuestaSel, setApuestaSel] = useState(0)

  // ── Carga inicial + Realtime ───────────────────────────────────────────────
  useEffect(() => {
    if (!partidaId) return
    let activo = true
    supabase.from('partidas_blackjack').select('*').eq('id', partidaId).single()
      .then(({ data }) => {
        if (activo && data) setPartida(data as PartidaBlackjack)
        if (activo) setCargando(false)
      })

    const canal = supabase
      .channel(`partida-blackjack-${partidaId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'partidas_blackjack',
        filter: `id=eq.${partidaId}`,
      }, payload => { setPartida(payload.new as PartidaBlackjack) })
      .subscribe()

    return () => { activo = false; supabase.removeChannel(canal) }
  }, [partidaId])

  // Nombre del rival
  useEffect(() => {
    if (!partida || !myId) return
    const rivalId = partida.host_id === myId ? partida.invitado_id : partida.host_id
    supabase.from('usuarios_publicos').select('nombre').eq('id', rivalId).single()
      .then(({ data }) => { if (data?.nombre) setNombreRival(data.nombre) })
  }, [partida?.id, myId])

  // Reiniciar la apuesta sugerida al empezar cada mano
  const maxApuesta = partida ? apuestaMaxima(partida) : 0
  useEffect(() => {
    if (partida?.fase === 'apuesta') {
      setApuestaSel(Math.max(1, Math.min(100, maxApuesta || 1)))
    }
  }, [partida?.fase, partida?.banca_es_host])

  // ── Escritura de acciones (solo el jugador escribe durante la mano) ────────
  async function aplicar(delta: Partial<PartidaBlackjack>) {
    if (!partida || enviando) return
    setEnviando(true)
    await supabase
      .from('partidas_blackjack')
      .update({ ...delta, updated_at: new Date().toISOString() })
      .eq('id', partida.id)
    setEnviando(false)
  }

  async function siguienteMano() {
    if (!partida || enviando) return
    const terminada = partida.fichas_host === 0 || partida.fichas_invitado === 0
    const fichasH = terminada ? partida.fichas_iniciales : partida.fichas_host
    const fichasI = terminada ? partida.fichas_iniciales : partida.fichas_invitado
    // Los roles rotan: la banca pasa al otro jugador
    await aplicar(nuevaMano(fichasH, fichasI, !partida.banca_es_host))
  }

  // ── Render guards ──────────────────────────────────────────────────────────
  if (cargando || !partida) {
    return (
      <View style={bj.centrado}>
        <ActivityIndicator color="#C9A84C" size="large" />
      </View>
    )
  }

  const rol: 'host' | 'invitado' | null =
    partida.host_id === myId ? 'host' : partida.invitado_id === myId ? 'invitado' : null
  if (!rol) {
    return (
      <View style={bj.centrado}>
        <Text style={{ color: '#9A8E7E' }}>No sos participante de esta partida.</Text>
      </View>
    )
  }

  const soyBanca = (rol === 'host') === partida.banca_es_host
  const soyJugador = !soyBanca
  const misFichas = rol === 'host' ? partida.fichas_host : partida.fichas_invitado
  const susFichas = rol === 'host' ? partida.fichas_invitado : partida.fichas_host

  const totalJugador = valorMano(partida.cartas_jugador).total
  const revelarBanca = partida.fase === 'resultado'
  const totalBancaVisible = revelarBanca
    ? valorMano(partida.cartas_banca).total
    : partida.cartas_banca.length ? valorMano(partida.cartas_banca.slice(0, 1)).total : 0

  const hayGanador = partida.fase === 'resultado'
  const puedeDoblarAhora = soyJugador && puedeDoblar(partida)

  const FASE_LABEL: Record<string, string> = {
    apuesta: 'Apuesta', jugador: soyJugador ? 'Tu jugada' : 'Juega el rival', resultado: 'Resultado',
  }

  // Etiquetas de rol para las zonas (arriba = rival, abajo = vos)
  const rivalEsBanca = !soyBanca
  const miRol = soyBanca ? 'Banca' : 'Jugador'
  const rivalRol = rivalEsBanca ? 'Banca' : 'Jugador'

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
          <Text style={bj.headerTitulo}>Blackjack</Text>
          <Text style={bj.headerFase}>{FASE_LABEL[partida.fase]}</Text>
        </View>
        <View style={bj.boteChip}>
          <Text style={bj.boteLabel}>Apuesta</Text>
          <Text style={bj.boteNum}>{partida.apuesta ? partida.apuesta.toLocaleString('es-AR') : '—'}</Text>
        </View>
      </View>

      {/* ── Zona rival (arriba) ── */}
      <View style={bj.zonaRival}>
        <View style={bj.jugadorInfo}>
          <View style={[bj.avatar, { backgroundColor: '#2d3a3a' }]}>
            <Text style={[bj.avatarTxt, { color: '#7fb8b8' }]}>{nombreRival.charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={bj.jugadorNombre}>{nombreRival} · {rivalRol}</Text>
            <Text style={bj.jugadorChips}>{susFichas.toLocaleString('es-AR')} fichas</Text>
          </View>
        </View>

        {/* Cartas del rival */}
        <View style={bj.cartasRow}>
          {rivalEsBanca ? (
            // El rival es la banca: primera carta visible, la segunda oculta hasta el resultado
            partida.cartas_banca.length === 0
              ? <SlotVacio w={CARD_W} h={CARD_H} />
              : partida.cartas_banca.map((c, i) => (
                  <CartaImg key={i} carta={c} w={CARD_W} h={CARD_H} boca={revelarBanca || i === 0} />
                ))
          ) : (
            // El rival es el jugador: sus cartas se ven
            partida.cartas_jugador.length === 0
              ? <SlotVacio w={CARD_W} h={CARD_H} />
              : partida.cartas_jugador.map((c, i) => <CartaImg key={i} carta={c} w={CARD_W} h={CARD_H} boca />)
          )}
        </View>
        {(rivalEsBanca ? partida.cartas_banca.length > 0 : partida.cartas_jugador.length > 0) && (
          <View style={bj.totalPill}>
            <Text style={bj.totalPillTxt}>
              {rivalEsBanca
                ? (revelarBanca ? valorMano(partida.cartas_banca).total : `${totalBancaVisible} + ?`)
                : valorMano(partida.cartas_jugador).total}
            </Text>
          </View>
        )}
      </View>

      {/* ── Centro: estado ── */}
      <View style={bj.centro} pointerEvents="none">
        {partida.fase === 'apuesta' && (
          <Text style={bj.centroTxt}>
            {soyJugador ? 'Hacé tu apuesta' : `Esperando la apuesta de ${nombreRival}…`}
          </Text>
        )}
        {partida.fase === 'jugador' && !soyJugador && (
          <Text style={bj.centroTxt}>{nombreRival} está jugando su mano…</Text>
        )}
      </View>

      {/* ── Zona propia (abajo) ── */}
      <View style={bj.zonaPropia}>
        {/* Cartas propias */}
        <View style={bj.cartasRow}>
          {soyBanca ? (
            partida.cartas_banca.length === 0
              ? <SlotVacio w={CARD_W} h={CARD_H} />
              : partida.cartas_banca.map((c, i) => (
                  <CartaImg key={i} carta={c} w={CARD_W} h={CARD_H} boca={revelarBanca || i === 0} />
                ))
          ) : (
            partida.cartas_jugador.length === 0
              ? <SlotVacio w={CARD_W} h={CARD_H} />
              : partida.cartas_jugador.map((c, i) => <CartaImg key={i} carta={c} w={CARD_W} h={CARD_H} boca />)
          )}
        </View>
        {(soyBanca ? partida.cartas_banca.length > 0 : partida.cartas_jugador.length > 0) && (
          <View style={bj.totalPill}>
            <Text style={bj.totalPillTxt}>
              {soyBanca
                ? (revelarBanca ? valorMano(partida.cartas_banca).total : `${totalBancaVisible} + ?`)
                : totalJugador}
            </Text>
          </View>
        )}

        <View style={[bj.jugadorInfo, { justifyContent: 'flex-end' }]}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={bj.jugadorNombre}>{usuario?.nombre ?? 'Vos'} · {miRol}</Text>
            <Text style={bj.jugadorChips}>{misFichas.toLocaleString('es-AR')} fichas</Text>
          </View>
          <View style={[bj.avatar, { backgroundColor: '#C9A84C' }]}>
            <Text style={[bj.avatarTxt, { color: '#141210' }]}>{(usuario?.nombre ?? '?').charAt(0).toUpperCase()}</Text>
          </View>
        </View>

        {/* Controles */}
        {partida.fase === 'apuesta' && soyJugador && (
          <SelectorApuesta
            max={maxApuesta}
            valor={Math.min(apuestaSel, maxApuesta)}
            setValor={setApuestaSel}
            onApostar={() => aplicar(apostar(partida, apuestaSel))}
            deshabilitado={enviando || maxApuesta < 1}
          />
        )}

        {partida.fase === 'jugador' && soyJugador && (
          <View style={bj.acciones}>
            <TouchableOpacity
              style={[bj.accionBtn, { backgroundColor: '#5ABF8A', opacity: enviando ? 0.4 : 1 }]}
              onPress={() => aplicar(pedir(partida))}
              disabled={enviando}
              activeOpacity={0.8}
            >
              <Text style={bj.accionTxt}>Pedir</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[bj.accionBtn, { backgroundColor: '#E0A052', opacity: enviando ? 0.4 : 1 }]}
              onPress={() => aplicar(plantarse(partida))}
              disabled={enviando}
              activeOpacity={0.8}
            >
              <Text style={[bj.accionTxt, { color: '#141210' }]}>Plantarse</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[bj.accionBtn, { backgroundColor: '#C9A84C', opacity: puedeDoblarAhora && !enviando ? 1 : 0.35 }]}
              onPress={() => aplicar(doblar(partida))}
              disabled={!puedeDoblarAhora || enviando}
              activeOpacity={0.8}
            >
              <Text style={[bj.accionTxt, { color: '#141210' }]}>Doblar</Text>
            </TouchableOpacity>
          </View>
        )}

        {partida.fase !== 'resultado' && soyBanca && (
          <View style={bj.esperandoBanca}>
            <ActivityIndicator color="#C9A84C" />
            <Text style={bj.esperandoBancaTxt}>
              Sos la banca. {partida.fase === 'apuesta' ? 'Esperá la apuesta.' : 'La banca juega sola al plantarse el jugador.'}
            </Text>
          </View>
        )}
      </View>

      {hayGanador && (
        <OverlayResultado
          partida={partida}
          soyJugador={soyJugador}
          onSiguiente={siguienteMano}
          onSalir={() => router.back()}
        />
      )}
    </View>
  )
}

const bj = StyleSheet.create({
  centrado: { flex: 1, backgroundColor: '#141210', alignItems: 'center', justifyContent: 'center' },

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
  slotVacio: {
    borderRadius: 6, borderWidth: 1, borderColor: '#2A2520', borderStyle: 'dashed',
    backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center',
  },
  slotVacioTxt: { color: '#6b6257', fontSize: 18, fontWeight: '700' },

  totalPill: {
    backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.45)',
    paddingHorizontal: 14, paddingVertical: 3, borderRadius: 20,
  },
  totalPillTxt: { color: '#DFC47A', fontSize: 15, fontWeight: '800' },

  centro: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40,
  },
  centroTxt: { color: '#F5F2EC', fontSize: 15, fontWeight: '600', textAlign: 'center', opacity: 0.9 },

  acciones: { flexDirection: 'row', gap: 10, paddingHorizontal: 20 },
  accionBtn: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  accionTxt: { color: '#F5F2EC', fontSize: 15, fontWeight: '800' },

  esperandoBanca: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24 },
  esperandoBancaTxt: { color: '#9A8E7E', fontSize: 13, fontWeight: '600', flex: 1 },

  // Selector de apuesta
  apuestaBox: {
    marginHorizontal: 20, alignSelf: 'stretch',
    backgroundColor: 'rgba(20,18,16,0.9)', borderRadius: 18, borderWidth: 1, borderColor: '#2A2520',
    padding: 16, gap: 12,
  },
  apuestaLabel: {
    color: '#9A8E7E', fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1, textAlign: 'center',
  },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: '#272420',
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnTxt: { color: '#C9A84C', fontSize: 28, fontWeight: '700' },
  apuestaValorWrap: { alignItems: 'center' },
  apuestaValor: { color: '#F5F2EC', fontSize: 26, fontWeight: '800' },
  apuestaMax: { color: '#6b6257', fontSize: 11, fontWeight: '600' },
  chipsRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1, borderColor: '#2A2520', backgroundColor: 'rgba(201,168,76,0.08)',
  },
  chipTxt: { color: '#DFC47A', fontSize: 13, fontWeight: '700' },
  apostarBtn: { height: 52, borderRadius: 14, backgroundColor: '#C9A84C', alignItems: 'center', justifyContent: 'center' },
  apostarTxt: { color: '#141210', fontSize: 16, fontWeight: '800' },
})
