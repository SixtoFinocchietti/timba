import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ActivityIndicator, useWindowDimensions, Pressable,
} from 'react-native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { CARTAS_IMG, MESA_IMG } from '@/lib/cartasAssets'
import { valorMano } from '@/lib/blackjack'
import {
  EstadoClasico, estadoInicialClasico, nuevaMano, apostar, pedir, plantarse,
  doblar, puedeDoblar, apuestaMaxima, OUTCOME_LABELS, CORONA_PCTS,
} from '@/lib/blackjackClasico'

const ORO = '#C9A84C'
const CLARO = '#F5F2EC'
const SUAVE = '#9A8E7E'

function fmt(n: number) { return n.toLocaleString('es-AR') }

// ─── Carta ────────────────────────────────────────────────────────────────────

function CartaImg({ carta, w, h, boca = true }: { carta?: string; w: number; h: number; boca?: boolean }) {
  const src = boca && carta ? (CARTAS_IMG[carta] ?? CARTAS_IMG['BACK']) : CARTAS_IMG['BACK']
  return <Image source={src} style={{ width: w, height: h, borderRadius: 5 }} contentFit="contain" />
}

/** Total de una mano, respetando el revelado (muestra "X + ?" si hay cartas tapadas). */
function totalTxt(cartas: string[], revelado: boolean) {
  if (cartas.length === 0) return '—'
  if (revelado) return String(valorMano(cartas).total)
  return `${valorMano(cartas.slice(0, 1)).total} + ?`
}

// ─── Fila de jugador/dealer en la mesa ────────────────────────────────────────

function FilaMesa({ nombre, sub, cartas, revelado, cw, ch, color = '#2d3a3a', textColor = '#7fb8b8', destacado }: {
  nombre: string; sub?: string; cartas: string[]; revelado: boolean
  cw: number; ch: number; color?: string; textColor?: string; destacado?: boolean
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
          : cartas.map((c, i) => <CartaImg key={i} carta={c} w={cw} h={ch} boca={i === 0 || revelado} />)}
      </View>
      <View style={m.totalPill}>
        <Text style={m.totalPillTxt}>{totalTxt(cartas, revelado)}</Text>
      </View>
    </View>
  )
}

// ─── Selector de apuesta ──────────────────────────────────────────────────────

function SelectorApuesta({ max, valor, setValor, onApostar }: {
  max: number; valor: number; setValor: (n: number) => void; onApostar: () => void
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
      <TouchableOpacity style={ap.apostarBtn} onPress={onApostar} activeOpacity={0.85}>
        <Text style={ap.apostarTxt}>Apostar {fmt(valor)}</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── Setup: fichas + corona ───────────────────────────────────────────────────

function Setup({ onEmpezar }: { onEmpezar: (fichas: number, corona: boolean, pct: number) => void }) {
  const c = useColores()
  const es = makeSetupEstilos(c)
  const [fichas, setFichas] = useState(5000)
  const [corona, setCorona] = useState(true)
  const [pct, setPct] = useState(25)
  const [info, setInfo] = useState(false)

  const FICHAS = [5000, 10000, 20000]

  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <View style={es.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={12}>
          <Text style={[es.volver, { color: c.primario }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[es.titulo, { color: c.texto }]}>Clásico vs Bot</Text>
        <View style={{ width: 18 }} />
      </View>

      <View style={es.body}>
        <Text style={[es.subtitulo, { color: c.textoSuave }]}>
          Vos y un Bot juegan cada uno contra el dealer. Ganás o perdés según tu mano vs la banca, y el de mejor mano se lleva la corona.
        </Text>

        <Text style={[es.seccionLabel, { color: c.textoSuave }]}>Fichas iniciales</Text>
        <View style={es.chipsRow}>
          {FICHAS.map(f => {
            const activo = fichas === f
            return (
              <TouchableOpacity key={f} onPress={() => setFichas(f)} activeOpacity={0.8}
                style={[es.pill, { borderColor: activo ? c.primario : c.borde, backgroundColor: activo ? 'rgba(201,168,76,0.1)' : c.fondoCard }]}>
                <Text style={[es.pillTxt, { color: activo ? c.primario : c.textoSuave }]}>{fmt(f)}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <View style={es.coronaTituloRow}>
          <Text style={[es.seccionLabel, { color: c.textoSuave, marginBottom: 0 }]}>Corona</Text>
          <TouchableOpacity onPress={() => setInfo(true)} hitSlop={10} activeOpacity={0.7}
            style={[es.infoBtn, { borderColor: c.borde }]}>
            <Text style={[es.infoTxt, { color: c.primario }]}>i</Text>
          </TouchableOpacity>
        </View>
        <View style={[es.chipsRow, { marginBottom: corona ? 16 : 0 }]}>
          {[{ v: true, l: 'Con corona' }, { v: false, l: 'Sin corona' }].map(o => {
            const activo = corona === o.v
            return (
              <TouchableOpacity key={o.l} onPress={() => setCorona(o.v)} activeOpacity={0.8}
                style={[es.pill, { flex: 1, borderColor: activo ? c.primario : c.borde, backgroundColor: activo ? 'rgba(201,168,76,0.1)' : c.fondoCard }]}>
                <Text style={[es.pillTxt, { color: activo ? c.primario : c.textoSuave }]}>{o.l}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {corona && (
          <>
            <Text style={[es.seccionLabel, { color: c.textoSuave }]}>Bonus de la corona (% de la apuesta)</Text>
            <View style={es.chipsRow}>
              {CORONA_PCTS.map(p => {
                const activo = pct === p
                return (
                  <TouchableOpacity key={p} onPress={() => setPct(p)} activeOpacity={0.8}
                    style={[es.pill, { borderColor: activo ? c.primario : c.borde, backgroundColor: activo ? 'rgba(201,168,76,0.1)' : c.fondoCard }]}>
                    <Text style={[es.pillTxt, { color: activo ? c.primario : c.textoSuave }]}>{p}%</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </>
        )}
      </View>

      <View style={es.footer}>
        <TouchableOpacity style={[es.empezar, { backgroundColor: c.primario }]} onPress={() => onEmpezar(fichas, corona, pct)} activeOpacity={0.85}>
          <Text style={[es.empezarTxt, { color: c.fondo }]}>Empezar</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={info} transparent animationType="fade" onRequestClose={() => setInfo(false)}>
        <Pressable style={es.infoOverlay} onPress={() => setInfo(false)}>
          <Pressable style={[es.infoCard, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
            <Text style={[es.infoTitulo, { color: c.texto }]}>¿Qué es la corona? 👑</Text>
            <Text style={[es.infoCuerpo, { color: c.textoSuave }]}>
              Además de jugar contra la banca, los dos jugadores compiten entre sí: el que hace la mejor mano (más cerca de 21 sin pasarse) se lleva la corona.
              {'\n\n'}
              El ganador cobra un bonus igual a un porcentaje de su apuesta, que le paga el rival. No afecta lo que ganás o perdés contra la banca.
              {'\n\n'}
              Si los dos se pasan o empatan, no hay corona.
            </Text>
            <TouchableOpacity style={[es.infoCerrar, { backgroundColor: c.primario }]} onPress={() => setInfo(false)} activeOpacity={0.85}>
              <Text style={{ color: c.fondo, fontWeight: '800', fontSize: 15 }}>Entendido</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

// ─── Overlay de resultado ─────────────────────────────────────────────────────

function OverlayResultado({ e, onSiguiente, onCambiar, onSalir }: {
  e: EstadoClasico; onSiguiente: () => void; onCambiar: () => void; onSalir: () => void
}) {
  const dH = e.resHumano?.delta ?? 0
  const netHumano = dH + (e.coronaGanador === 'humano' ? e.coronaBonus : e.coronaGanador === 'bot' ? -e.coronaBonus : 0)
  const terminada = e.fichasHumano <= 0 || e.fichasBot <= 0
  const titulo = terminada
    ? (e.fichasHumano > 0 ? '¡Ganaste la partida! 🏆' : 'Perdiste la partida')
    : netHumano > 0 ? '¡Ganaste la mano! 🏆' : netHumano < 0 ? 'Perdiste la mano' : 'Mano pareja'

  const signo = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n))

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade">
      <View style={ov.overlay}>
        <View style={ov.card}>
          <Text style={[ov.titulo, { color: netHumano > 0 ? ORO : netHumano < 0 ? SUAVE : CLARO }]}>{titulo}</Text>
          <Text style={ov.net}>Tu resultado neto: <Text style={{ color: netHumano >= 0 ? '#5ABF8A' : '#E0857A', fontWeight: '800' }}>{signo(netHumano)}</Text></Text>

          <View style={ov.lineas}>
            <View style={ov.linea}>
              <Text style={ov.lineaLabel}>Vos vs banca</Text>
              <Text style={ov.lineaVal}>{e.resHumano ? OUTCOME_LABELS[e.resHumano.outcome] : '—'} ({signo(dH)})</Text>
            </View>
            <View style={ov.linea}>
              <Text style={ov.lineaLabel}>Bot vs banca</Text>
              <Text style={ov.lineaVal}>{e.resBot ? OUTCOME_LABELS[e.resBot.outcome] : '—'}</Text>
            </View>
            <View style={ov.linea}>
              <Text style={ov.lineaLabel}>Corona 👑</Text>
              <Text style={ov.lineaVal}>
                {!e.coronaActiva ? 'desactivada'
                  : e.coronaGanador === 'humano' ? `Vos · +${fmt(e.coronaBonus)}`
                  : e.coronaGanador === 'bot' ? `Bot · −${fmt(e.coronaBonus)}`
                  : 'sin corona'}
              </Text>
            </View>
          </View>

          <View style={ov.manos}>
            <ManoResumen label={`Dealer · ${valorMano(e.cartasDealer).total}`} cartas={e.cartasDealer} />
            <ManoResumen label={`Vos · ${valorMano(e.cartasHumano).total}`} cartas={e.cartasHumano} />
            <ManoResumen label={`Bot · ${valorMano(e.cartasBot).total}`} cartas={e.cartasBot} />
          </View>

          <View style={ov.fichasRow}>
            <Text style={ov.fichasTxt}>Vos {fmt(e.fichasHumano)}</Text>
            <Text style={ov.fichasSep}>·</Text>
            <Text style={ov.fichasTxt}>Bot {fmt(e.fichasBot)}</Text>
          </View>

          <TouchableOpacity style={[ov.btn, { backgroundColor: ORO }]} onPress={onSiguiente} activeOpacity={0.85}>
            <Text style={[ov.btnTxt, { color: '#141210' }]}>{terminada ? 'Revancha' : 'Siguiente mano'}</Text>
          </TouchableOpacity>
          <View style={ov.btnRow}>
            <TouchableOpacity style={[ov.btnChico, { backgroundColor: '#272420' }]} onPress={onCambiar} activeOpacity={0.8}>
              <Text style={[ov.btnTxt, { color: SUAVE }]}>Reglas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ov.btnChico, { backgroundColor: '#272420' }]} onPress={onSalir} activeOpacity={0.8}>
              <Text style={[ov.btnTxt, { color: SUAVE }]}>Salir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function ManoResumen({ label, cartas }: { label: string; cartas: string[] }) {
  return (
    <View style={ov.manoRow}>
      <Text style={ov.manoLabel}>{label}</Text>
      <View style={ov.manoCartas}>
        {cartas.map((c, i) => <CartaImg key={i} carta={c} w={30} h={42} boca />)}
      </View>
    </View>
  )
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function ClasicoBotScreen() {
  const { width: W } = useWindowDimensions()
  const [estado, setEstado] = useState<EstadoClasico | null>(null)
  const [apuestaSel, setApuestaSel] = useState(100)
  const [revBot, setRevBot] = useState(false)
  const [revDealer, setRevDealer] = useState(false)
  const [overlay, setOverlay] = useState(false)

  const CW = Math.min(52, W * 0.13)
  const CH = Math.round(CW * 1.4)

  // Reveló escalonado al resolver: primero el bot, después el dealer, después el resultado.
  useEffect(() => {
    if (estado?.fase !== 'resultado') {
      setRevBot(false); setRevDealer(false); setOverlay(false)
      return
    }
    setRevBot(false); setRevDealer(false); setOverlay(false)
    const t1 = setTimeout(() => setRevBot(true), 400)
    const t2 = setTimeout(() => setRevDealer(true), 2000)
    const t3 = setTimeout(() => setOverlay(true), 3700)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [estado?.fase, estado?.mano])

  // Al entrar a la fase de apuesta, sugerir una apuesta acotada a lo disponible.
  useEffect(() => {
    if (estado?.fase === 'apuesta') {
      const max = apuestaMaxima(estado)
      setApuestaSel(Math.max(1, Math.min(100, max)))
    }
  }, [estado?.fase, estado?.mano])

  if (!estado) {
    return <Setup onEmpezar={(f, corona, pct) => setEstado(estadoInicialClasico(f, corona, pct))} />
  }

  const apostando = estado.fase === 'apuesta'
  const miTurno = estado.fase === 'turno_humano'
  const resolviendo = estado.fase === 'resultado' && !overlay
  const maxApuesta = apuestaMaxima(estado)

  const estadoCentro = resolviendo
    ? (!revBot ? 'El Bot está jugando…' : !revDealer ? 'El dealer juega…' : 'Contando la mano…')
    : apostando ? 'Hacé tu apuesta' : ''

  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={MESA_IMG} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={12}>
          <Text style={s.volver}>‹</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitulo}>Clásico vs Bot</Text>
          <Text style={s.headerSub}>{estado.coronaActiva ? `Corona ${estado.coronaPct}%` : 'Sin corona'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.boteLabel}>Apuesta</Text>
          <Text style={s.boteNum}>{estado.apuesta ? fmt(estado.apuesta) : '—'}</Text>
        </View>
      </View>

      {/* Mesa: dealer arriba, después bot, después vos */}
      <View style={s.mesa}>
        <FilaMesa nombre="Dealer" sub="Banca" cartas={estado.cartasDealer} revelado={revDealer}
          cw={CW} ch={CH} color="#3a2f2a" textColor="#d8b98f" />
        <FilaMesa nombre="Bot" sub={`${fmt(estado.fichasBot)} fichas`} cartas={estado.cartasBot} revelado={revBot}
          cw={CW} ch={CH} color="#2d3a3a" textColor="#7fb8b8" />
        <FilaMesa nombre="Vos" sub={`${fmt(estado.fichasHumano)} fichas`} cartas={estado.cartasHumano} revelado
          cw={CW} ch={CH} color={ORO} textColor="#141210" destacado />
      </View>

      {/* Centro: estado */}
      {!!estadoCentro && (
        <View style={s.centro} pointerEvents="none">
          {resolviendo && <ActivityIndicator color={ORO} style={{ marginBottom: 8 }} />}
          <Text style={s.centroTxt}>{estadoCentro}</Text>
        </View>
      )}

      {/* Controles abajo */}
      <View style={s.controles}>
        {apostando && (
          <SelectorApuesta
            max={maxApuesta}
            valor={Math.min(apuestaSel, maxApuesta)}
            setValor={setApuestaSel}
            onApostar={() => setEstado(apostar(estado, apuestaSel))}
          />
        )}
        {miTurno && (
          <View style={s.acciones}>
            <TouchableOpacity style={[s.accionBtn, { backgroundColor: '#5ABF8A' }]} onPress={() => setEstado(pedir(estado))} activeOpacity={0.8}>
              <Text style={s.accionTxt}>Pedir</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.accionBtn, { backgroundColor: '#E0A052' }]} onPress={() => setEstado(plantarse(estado))} activeOpacity={0.8}>
              <Text style={[s.accionTxt, { color: '#141210' }]}>Plantarse</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.accionBtn, { backgroundColor: ORO, opacity: puedeDoblar(estado) ? 1 : 0.35 }]}
              onPress={() => setEstado(doblar(estado))} disabled={!puedeDoblar(estado)} activeOpacity={0.8}>
              <Text style={[s.accionTxt, { color: '#141210' }]}>Doblar</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {overlay && (
        <OverlayResultado
          e={estado}
          onSiguiente={() => setEstado(nuevaMano(estado))}
          onCambiar={() => setEstado(null)}
          onSalir={() => router.back()}
        />
      )}
    </View>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
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
})

const m = StyleSheet.create({
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 14, padding: 8,
    borderWidth: 1, borderColor: 'transparent',
  },
  filaDestacada: { borderColor: 'rgba(201,168,76,0.5)', backgroundColor: 'rgba(201,168,76,0.08)' },
  filaInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 96 },
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
  linea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineaLabel: { color: SUAVE, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  lineaVal: { color: CLARO, fontSize: 13, fontWeight: '700' },
  manos: { gap: 8, marginBottom: 16, borderTopWidth: 1, borderTopColor: '#2A2520', paddingTop: 14 },
  manoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  manoLabel: { color: SUAVE, fontSize: 12, fontWeight: '700', width: 96 },
  manoCartas: { flex: 1, flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  fichasRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 18 },
  fichasTxt: { color: CLARO, fontSize: 15, fontWeight: '800' },
  fichasSep: { color: '#6b6257', fontSize: 15, fontWeight: '800' },
  btn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btnChico: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { fontSize: 15, fontWeight: '700' },
})

function makeSetupEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 10 },
    volver: { fontSize: 32, fontWeight: '700', lineHeight: 36, marginRight: 4 },
    titulo: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
    body: { flex: 1, paddingHorizontal: 24, paddingTop: 12 },
    subtitulo: { fontSize: 14, lineHeight: 20, marginBottom: 26 },
    seccionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 },
    chipsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
    pill: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, alignItems: 'center' },
    pillTxt: { fontSize: 15, fontWeight: '700' },
    coronaTituloRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    infoBtn: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    infoTxt: { fontSize: 12, fontWeight: '800', fontStyle: 'italic' },
    footer: { paddingHorizontal: 24, paddingBottom: 36, paddingTop: 12 },
    empezar: { height: 58, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    empezarTxt: { fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
    infoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 28 },
    infoCard: { width: '100%', maxWidth: 380, borderRadius: 20, borderWidth: 1, padding: 22 },
    infoTitulo: { fontSize: 19, fontWeight: '800', marginBottom: 12 },
    infoCuerpo: { fontSize: 14, lineHeight: 21 },
    infoCerrar: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  })
}
