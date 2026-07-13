import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ActivityIndicator, useWindowDimensions,
} from 'react-native'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { CARTAS_IMG, MESA_IMG } from '@/lib/cartasAssets'
import { valorMano } from '@/lib/blackjack'
import { OUTCOME_LABELS } from '@/lib/blackjackClasico'
import {
  PartidaClasico, Asiento, apostarClasico, pedirClasico, plantarseClasico,
  doblarClasico, puedeDoblarClasico, nuevaManoClasico, apuestaMaximaClasico,
} from '@/lib/blackjackClasicoOnline'

const ORO = '#C9A84C'
const CLARO = '#F5F2EC'
const SUAVE = '#9A8E7E'

function fmt(n: number) { return n.toLocaleString('es-AR') }

// ─── Presentación ─────────────────────────────────────────────────────────────

function CartaImg({ carta, w, h, boca = true }: { carta?: string; w: number; h: number; boca?: boolean }) {
  const src = boca && carta ? (CARTAS_IMG[carta] ?? CARTAS_IMG['BACK']) : CARTAS_IMG['BACK']
  return <Image source={src} style={{ width: w, height: h, borderRadius: 5 }} contentFit="contain" />
}

function totalTxt(cartas: string[], revelado: boolean) {
  if (cartas.length === 0) return '—'
  if (revelado) return String(valorMano(cartas).total)
  return `${valorMano(cartas.slice(0, 1)).total} + ?`
}

function FilaMesa({ nombre, sub, cartas, revelado, cw, ch, color, textColor, destacado }: {
  nombre: string; sub?: string; cartas: string[]; revelado: boolean
  cw: number; ch: number; color: string; textColor: string; destacado?: boolean
}) {
  return (
    <View style={[m.fila, destacado && m.filaDestacada]}>
      <View style={m.filaInfo}>
        <View style={[m.avatar, { backgroundColor: color }]}>
          <Text style={[m.avatarTxt, { color: textColor }]}>{nombre.charAt(0).toUpperCase()}</Text>
        </View>
        <View>
          <Text style={m.filaNombre}>{nombre}</Text>
          {!!sub && <Text style={m.filaSub}>{sub}</Text>}
        </View>
      </View>
      <View style={m.filaCartas}>
        {cartas.length === 0
          ? <Text style={m.filaSinCartas}>—</Text>
          : cartas.map((cta, i) => <CartaImg key={i} carta={cta} w={cw} h={ch} boca={i === 0 || revelado} />)}
      </View>
      <View style={m.totalPill}>
        <Text style={m.totalPillTxt}>{totalTxt(cartas, revelado)}</Text>
      </View>
    </View>
  )
}

function SelectorApuesta({ max, valor, setValor, onApostar, deshabilitado }: {
  max: number; valor: number; setValor: (n: number) => void; onApostar: () => void; deshabilitado: boolean
}) {
  const step = Math.max(1, Math.round(max / 20))
  const clamp = (n: number) => Math.max(1, Math.min(n, max))
  const chips = [...new Set([Math.round(max / 4), Math.round(max / 2), max])].filter(x => x >= 1 && x <= max).sort((a, b) => a - b)
  return (
    <View style={ap.box}>
      <Text style={ap.label}>Tu apuesta</Text>
      <View style={ap.stepperRow}>
        <TouchableOpacity style={ap.stepBtn} onPress={() => setValor(clamp(valor - step))} activeOpacity={0.7}>
          <Text style={ap.stepTxt}>−</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={ap.valor}>{fmt(valor)}</Text>
          <Text style={ap.max}>máx {fmt(max)}</Text>
        </View>
        <TouchableOpacity style={ap.stepBtn} onPress={() => setValor(clamp(valor + step))} activeOpacity={0.7}>
          <Text style={ap.stepTxt}>+</Text>
        </TouchableOpacity>
      </View>
      <View style={ap.chipsRow}>
        {chips.map((ch, i) => (
          <TouchableOpacity key={ch} style={ap.chip} onPress={() => setValor(clamp(ch))} activeOpacity={0.75}>
            <Text style={ap.chipTxt}>{i === chips.length - 1 ? 'Máx' : fmt(ch)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={[ap.apostarBtn, { opacity: deshabilitado ? 0.4 : 1 }]} onPress={onApostar} disabled={deshabilitado} activeOpacity={0.85}>
        <Text style={ap.apostarTxt}>Apostar {fmt(valor)}</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── Overlay de resultado ─────────────────────────────────────────────────────

function OverlayResultado({ p, mi, rival, nombreRival, onSiguiente, onSalir }: {
  p: PartidaClasico; mi: Asiento; rival: Asiento; nombreRival: string
  onSiguiente: () => void; onSalir: () => void
}) {
  const miRes = mi === 'host' ? p.resultado_host : p.resultado_invitado
  const rivalRes = rival === 'host' ? p.resultado_host : p.resultado_invitado
  const miDelta = mi === 'host' ? p.delta_host : p.delta_invitado
  const misCartas = mi === 'host' ? p.cartas_host : p.cartas_invitado
  const rivalCartas = rival === 'host' ? p.cartas_host : p.cartas_invitado
  const misFichas = mi === 'host' ? p.fichas_host : p.fichas_invitado
  const rivalFichas = rival === 'host' ? p.fichas_host : p.fichas_invitado

  const coronaMia = p.corona_ganador === mi
  const coronaRival = p.corona_ganador === rival
  const net = miDelta + (coronaMia ? p.corona_bonus : coronaRival ? -p.corona_bonus : 0)
  const terminada = p.fichas_host <= 0 || p.fichas_invitado <= 0
  const signo = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n))
  const titulo = terminada
    ? (misFichas > 0 ? '¡Ganaste la partida! 🏆' : 'Perdiste la partida')
    : net > 0 ? '¡Ganaste la mano! 🏆' : net < 0 ? 'Perdiste la mano' : 'Mano pareja'

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade">
      <View style={ov.overlay}>
        <View style={ov.card}>
          <Text style={[ov.titulo, { color: net > 0 ? ORO : net < 0 ? SUAVE : CLARO }]}>{titulo}</Text>
          <Text style={ov.net}>Tu resultado neto: <Text style={{ color: net >= 0 ? '#5ABF8A' : '#E0857A', fontWeight: '800' }}>{signo(net)}</Text></Text>

          <View style={ov.lineas}>
            <View style={ov.linea}>
              <Text style={ov.lineaLabel}>Vos vs banca</Text>
              <Text style={ov.lineaVal}>{miRes ? OUTCOME_LABELS[miRes] : '—'} ({signo(miDelta)})</Text>
            </View>
            <View style={ov.linea}>
              <Text style={ov.lineaLabel} numberOfLines={1}>{nombreRival} vs banca</Text>
              <Text style={ov.lineaVal}>{rivalRes ? OUTCOME_LABELS[rivalRes] : '—'}</Text>
            </View>
            <View style={ov.linea}>
              <Text style={ov.lineaLabel}>Corona 👑</Text>
              <Text style={ov.lineaVal}>
                {!p.corona_activa ? 'desactivada'
                  : coronaMia ? `Vos · +${fmt(p.corona_bonus)}`
                  : coronaRival ? `${nombreRival} · −${fmt(p.corona_bonus)}`
                  : 'sin corona'}
              </Text>
            </View>
          </View>

          <View style={ov.manos}>
            <ManoResumen label={`Dealer · ${valorMano(p.cartas_dealer).total}`} cartas={p.cartas_dealer} />
            <ManoResumen label={`Vos · ${valorMano(misCartas).total}`} cartas={misCartas} />
            <ManoResumen label={`${nombreRival} · ${valorMano(rivalCartas).total}`} cartas={rivalCartas} />
          </View>

          <View style={ov.fichasRow}>
            <Text style={ov.fichasTxt}>Vos {fmt(misFichas)}</Text>
            <Text style={ov.fichasSep}>·</Text>
            <Text style={ov.fichasTxt}>{nombreRival} {fmt(rivalFichas)}</Text>
          </View>

          <TouchableOpacity style={[ov.btn, { backgroundColor: ORO }]} onPress={onSiguiente} activeOpacity={0.85}>
            <Text style={[ov.btnTxt, { color: '#141210' }]}>{terminada ? 'Revancha' : 'Siguiente mano'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[ov.btn, { backgroundColor: '#272420', marginTop: 8 }]} onPress={onSalir} activeOpacity={0.8}>
            <Text style={[ov.btnTxt, { color: SUAVE }]}>Salir</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

function ManoResumen({ label, cartas }: { label: string; cartas: string[] }) {
  return (
    <View style={ov.manoRow}>
      <Text style={ov.manoLabel} numberOfLines={1}>{label}</Text>
      <View style={ov.manoCartas}>
        {cartas.map((c, i) => <CartaImg key={i} carta={c} w={30} h={42} boca />)}
      </View>
    </View>
  )
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function PartidaClasicoOnlineScreen() {
  const { width: W } = useWindowDimensions()
  const { usuario } = useAuthStore()
  const { partidaId } = useLocalSearchParams<{ partidaId: string }>()
  const myId = usuario?.id ?? ''

  const CW = Math.min(52, W * 0.13)
  const CH = Math.round(CW * 1.4)

  const [partida, setPartida] = useState<PartidaClasico | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [nombreRival, setNombreRival] = useState('Rival')
  const [apuestaSel, setApuestaSel] = useState(100)
  const [revDealer, setRevDealer] = useState(false)
  const [overlay, setOverlay] = useState(false)

  // Carga + Realtime
  useEffect(() => {
    if (!partidaId) return
    let activo = true
    supabase.from('partidas_blackjack_clasico').select('*').eq('id', partidaId).single()
      .then(({ data }) => {
        if (activo && data) setPartida(data as PartidaClasico)
        if (activo) setCargando(false)
      })
    const canal = supabase
      .channel(`bjc-${partidaId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'partidas_blackjack_clasico',
        filter: `id=eq.${partidaId}`,
      }, payload => setPartida(payload.new as PartidaClasico))
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

  const rol: Asiento | null = partida
    ? (partida.host_id === myId ? 'host' : partida.invitado_id === myId ? 'invitado' : null)
    : null
  const maxApuesta = partida && rol ? apuestaMaximaClasico(partida, rol) : 0

  // Revelado del dealer al resolver, después el overlay
  useEffect(() => {
    if (partida?.fase !== 'resultado') { setRevDealer(false); setOverlay(false); return }
    setRevDealer(false); setOverlay(false)
    const t1 = setTimeout(() => setRevDealer(true), 500)
    const t2 = setTimeout(() => setOverlay(true), 2600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [partida?.fase, partida?.mano])

  // Apuesta sugerida al entrar a la fase de apuestas
  useEffect(() => {
    if (partida?.fase === 'apuestas') setApuestaSel(Math.max(1, Math.min(100, maxApuesta || 1)))
  }, [partida?.fase, partida?.mano])

  async function aplicar(update: Partial<PartidaClasico>) {
    if (!partida || enviando || Object.keys(update).length === 0) return
    setEnviando(true)
    await supabase.from('partidas_blackjack_clasico')
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq('id', partida.id)
    setEnviando(false)
  }

  if (cargando || !partida) {
    return <View style={s.centrado}><ActivityIndicator color={ORO} size="large" /></View>
  }
  if (!rol) {
    return <View style={s.centrado}><Text style={{ color: SUAVE }}>No sos parte de esta partida.</Text></View>
  }

  const mi = rol
  const rival: Asiento = mi === 'host' ? 'invitado' : 'host'
  const misCartas = mi === 'host' ? partida.cartas_host : partida.cartas_invitado
  const rivalCartas = rival === 'host' ? partida.cartas_host : partida.cartas_invitado
  const misFichas = mi === 'host' ? partida.fichas_host : partida.fichas_invitado
  const rivalFichas = rival === 'host' ? partida.fichas_host : partida.fichas_invitado
  const miApuesta = mi === 'host' ? partida.apuesta_host : partida.apuesta_invitado
  const rivalApuesta = rival === 'host' ? partida.apuesta_host : partida.apuesta_invitado

  const esMiTurno = partida.turno === mi
  const apostando = partida.fase === 'apuestas'
  const jugando = partida.fase === 'juego'
  const resolviendo = partida.fase === 'resultado' && !overlay

  const estadoCentro =
    resolviendo ? (!revDealer ? 'El dealer juega…' : 'Contando la mano…')
    : apostando ? (esMiTurno ? 'Hacé tu apuesta' : `Esperando la apuesta de ${nombreRival}…`)
    : jugando ? (esMiTurno ? 'Tu turno' : `Juega ${nombreRival}…`)
    : ''

  const rivalSub = `${fmt(rivalFichas)} fichas${rivalApuesta ? ` · apuesta ${fmt(rivalApuesta)}` : ''}`
  const miSub = `${fmt(misFichas)} fichas${miApuesta ? ` · apuesta ${fmt(miApuesta)}` : ''}`

  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={MESA_IMG} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={12}>
          <Text style={s.volver}>‹</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitulo}>Blackjack</Text>
          <Text style={s.headerSub}>{partida.corona_activa ? `Corona ${partida.corona_pct}%` : 'Sin corona'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.boteLabel}>Tu apuesta</Text>
          <Text style={s.boteNum}>{miApuesta ? fmt(miApuesta) : '—'}</Text>
        </View>
      </View>

      <View style={s.mesa}>
        <FilaMesa nombre="Dealer" sub="Banca" cartas={partida.cartas_dealer} revelado={revDealer}
          cw={CW} ch={CH} color="#3a2f2a" textColor="#d8b98f" />
        <FilaMesa nombre={nombreRival} sub={rivalSub} cartas={rivalCartas} revelado
          cw={CW} ch={CH} color="#2d3a3a" textColor="#7fb8b8" destacado={partida.turno === rival} />
        <FilaMesa nombre="Vos" sub={miSub} cartas={misCartas} revelado
          cw={CW} ch={CH} color={ORO} textColor="#141210" destacado={esMiTurno && partida.fase !== 'resultado'} />
      </View>

      {!!estadoCentro && (
        <View style={s.centro} pointerEvents="none">
          {resolviendo && <ActivityIndicator color={ORO} style={{ marginBottom: 8 }} />}
          <Text style={s.centroTxt}>{estadoCentro}</Text>
        </View>
      )}

      <View style={s.controles}>
        {apostando && esMiTurno && (
          <SelectorApuesta
            max={maxApuesta}
            valor={Math.min(apuestaSel, maxApuesta)}
            setValor={setApuestaSel}
            onApostar={() => aplicar(apostarClasico(partida, mi, apuestaSel))}
            deshabilitado={enviando || maxApuesta < 1}
          />
        )}
        {jugando && esMiTurno && (
          <View style={s.acciones}>
            <TouchableOpacity style={[s.accionBtn, { backgroundColor: '#5ABF8A', opacity: enviando ? 0.4 : 1 }]}
              onPress={() => aplicar(pedirClasico(partida, mi))} disabled={enviando} activeOpacity={0.8}>
              <Text style={s.accionTxt}>Pedir</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.accionBtn, { backgroundColor: '#E0A052', opacity: enviando ? 0.4 : 1 }]}
              onPress={() => aplicar(plantarseClasico(partida, mi))} disabled={enviando} activeOpacity={0.8}>
              <Text style={[s.accionTxt, { color: '#141210' }]}>Plantarse</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.accionBtn, { backgroundColor: ORO, opacity: puedeDoblarClasico(partida, mi) && !enviando ? 1 : 0.35 }]}
              onPress={() => aplicar(doblarClasico(partida, mi))} disabled={!puedeDoblarClasico(partida, mi) || enviando} activeOpacity={0.8}>
              <Text style={[s.accionTxt, { color: '#141210' }]}>Doblar</Text>
            </TouchableOpacity>
          </View>
        )}
        {(jugando || apostando) && !esMiTurno && (
          <View style={s.espera}>
            <ActivityIndicator color={ORO} />
            <Text style={s.esperaTxt}>Esperando a {nombreRival}…</Text>
          </View>
        )}
      </View>

      {overlay && (
        <OverlayResultado
          p={partida} mi={mi} rival={rival} nombreRival={nombreRival}
          onSiguiente={() => aplicar(nuevaManoClasico(partida))}
          onSalir={() => router.back()}
        />
      )}
    </View>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  centrado: { flex: 1, backgroundColor: '#141210', alignItems: 'center', justifyContent: 'center' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 20, paddingBottom: 10,
  },
  volver: { color: ORO, fontSize: 32, fontWeight: '700', lineHeight: 36 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitulo: { color: CLARO, fontSize: 16, fontWeight: '700' },
  headerSub: { color: SUAVE, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  boteLabel: { color: SUAVE, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  boteNum: { color: ORO, fontSize: 16, fontWeight: '800' },

  mesa: { position: 'absolute', top: 104, left: 0, right: 0, paddingHorizontal: 12, gap: 10 },
  centro: { position: 'absolute', top: 0, bottom: 150, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  centroTxt: { color: CLARO, fontSize: 15, fontWeight: '700', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },

  controles: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 32, paddingHorizontal: 16 },
  acciones: { flexDirection: 'row', gap: 10 },
  accionBtn: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  accionTxt: { color: CLARO, fontSize: 15, fontWeight: '800' },
  espera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14 },
  esperaTxt: { color: SUAVE, fontSize: 14, fontWeight: '600' },
})

const m = StyleSheet.create({
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 14, padding: 8,
    borderWidth: 1, borderColor: 'transparent',
  },
  filaDestacada: { borderColor: 'rgba(201,168,76,0.6)', backgroundColor: 'rgba(201,168,76,0.08)' },
  filaInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 104 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 15, fontWeight: '800' },
  filaNombre: { color: CLARO, fontSize: 13, fontWeight: '700' },
  filaSub: { color: SUAVE, fontSize: 10, fontWeight: '600' },
  filaCartas: { flex: 1, flexDirection: 'row', gap: 5, justifyContent: 'center', flexWrap: 'wrap' },
  filaSinCartas: { color: '#6b6257', fontSize: 16 },
  totalPill: {
    backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.45)',
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 16, minWidth: 48, alignItems: 'center',
  },
  totalPillTxt: { color: '#DFC47A', fontSize: 14, fontWeight: '800' },
})

const ap = StyleSheet.create({
  box: { backgroundColor: 'rgba(20,18,16,0.92)', borderRadius: 18, borderWidth: 1, borderColor: '#2A2520', padding: 14, gap: 10 },
  label: { color: SUAVE, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: { width: 50, height: 50, borderRadius: 14, backgroundColor: '#272420', alignItems: 'center', justifyContent: 'center' },
  stepTxt: { color: ORO, fontSize: 28, fontWeight: '700' },
  valor: { color: CLARO, fontSize: 24, fontWeight: '800' },
  max: { color: '#6b6257', fontSize: 11, fontWeight: '600' },
  chipsRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#2A2520', backgroundColor: 'rgba(201,168,76,0.08)' },
  chipTxt: { color: '#DFC47A', fontSize: 13, fontWeight: '700' },
  apostarBtn: { height: 50, borderRadius: 14, backgroundColor: ORO, alignItems: 'center', justifyContent: 'center' },
  apostarTxt: { color: '#141210', fontSize: 16, fontWeight: '800' },
})

const ov = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 400, borderRadius: 24, padding: 22, borderWidth: 1, backgroundColor: '#1E1C18', borderColor: '#2A2520' },
  titulo: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  net: { fontSize: 14, fontWeight: '600', textAlign: 'center', color: SUAVE, marginBottom: 16 },
  lineas: { gap: 8, marginBottom: 16 },
  linea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  lineaLabel: { color: SUAVE, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 1 },
  lineaVal: { color: CLARO, fontSize: 13, fontWeight: '700' },
  manos: { gap: 8, marginBottom: 16, borderTopWidth: 1, borderTopColor: '#2A2520', paddingTop: 14 },
  manoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  manoLabel: { color: SUAVE, fontSize: 12, fontWeight: '700', width: 104 },
  manoCartas: { flex: 1, flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  fichasRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 18 },
  fichasTxt: { color: CLARO, fontSize: 15, fontWeight: '800' },
  fichasSep: { color: '#6b6257', fontSize: 15, fontWeight: '800' },
  btn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { fontSize: 15, fontWeight: '700' },
})
