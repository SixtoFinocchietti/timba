// Partida de Pool — dos modos sobre la misma mesa:
//   practica: mesa libre sin reglas (fase 2).
//   bot:      8-ball real contra el bot (fase 3): la máquina de estados de
//             reglas.ts arbitra (grupos, faltas, bola en mano, la 8) y el bot
//             decide con bot.ts usando el mismo motor que el jugador.
//
// Ciclo del tiro: apuntar (drag relativo) → fuerza (slider, soltar dispara) →
// simularTiro() resuelve todo por adelantado → animación por muestras a 60fps
// → resolverTiro() aplica las reglas → si le toca al bot, "piensa" (se ve su
// línea de apuntado) y tira.

import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import MesaPoolLazy from '@/components/pool/MesaPoolLazy'
import ControlFuerza from '@/components/pool/ControlFuerza'
import SelectorSpin, { Spin } from '@/components/pool/SelectorSpin'
import {
  CABECERA_Y, crearRack, crearRng, PARAMETROS, posicionBlancaValida, simularTiro,
} from '@/lib/pool/fisica'
import { Dificultad, decidirTiro } from '@/lib/pool/bot'
import {
  EstadoJuego, Falta, Jugador, aplicarEleccionRebreak, crearEstadoInicial,
  esDelGrupo, resolverTiro, rival,
} from '@/lib/pool/reglas'
import { crearTransform, RELACION_ASPECTO } from '@/lib/pool/transform'
import { Bola, MuestraAnimacion, ResultadoSimulacion, Tiro } from '@/lib/pool/tipos'

const AJUSTE_FINO = (0.25 * Math.PI) / 180
const SENSIBILIDAD = 2.2 // rad por metro de arrastre tangencial

const HUMANO: Jugador = 'A'
const BOT: Jugador = 'B'

const NOMBRE_DIFICULTAD: Record<Dificultad, string> = {
  facil: 'Fácil', normal: 'Normal', dificil: 'Difícil',
}

const TEXTO_FALTA: Record<Falta, string> = {
  sin_contacto: 'Falta: la blanca no tocó ninguna bola',
  contacto_ilegal: 'Falta: primero hay que tocar una bola propia',
  sin_banda: 'Falta: ninguna bola tocó banda tras el contacto',
  blanca_embocada: 'Falta: bola blanca embocada',
  timeout: 'Falta: se acabó el tiempo',
}

const COLORES_RIEL: Record<number, string> = {
  1: '#F0B428', 2: '#1E5AA8', 3: '#C93430', 4: '#5B3E8F',
  5: '#E07B28', 6: '#1F7A4D', 7: '#8A3038', 8: '#161616',
}

function nuevaSeed(): number {
  return (Date.now() ^ (Math.random() * 0x7fffffff)) | 0
}

// posición válida para reponer la blanca (bola en mano tras scratch)
function reponerBlanca(bolas: Bola[], soloCabecera: boolean): Bola[] {
  const candidatos = [{ x: 0, y: CABECERA_Y }]
  for (let y = CABECERA_Y; y >= -1.0; y -= 0.06) {
    for (let x = 0; x <= 0.4; x += 0.05) candidatos.push({ x, y }, { x: -x, y })
  }
  if (!soloCabecera) {
    for (let y = -0.5; y <= 1.0; y += 0.08) {
      for (let x = 0; x <= 0.4; x += 0.05) candidatos.push({ x, y }, { x: -x, y })
    }
  }
  const pos = candidatos.find(p => posicionBlancaValida(bolas, p, soloCabecera)) ?? { x: 0, y: CABECERA_Y }
  return bolas.map(b =>
    b.n === 0
      ? { ...b, viva: true, quieta: true, pos: { ...pos }, vel: { x: 0, y: 0 }, wx: 0, wy: 0, wz: 0 }
      : b,
  )
}

export default function PartidaPool() {
  const c = useColores()
  const es = makeEstilos(c)
  const params = useLocalSearchParams<{ modo?: string; dificultad?: string }>()
  const esBot = params.modo === 'bot'
  const dificultad = (['facil', 'normal', 'dificil'].includes(params.dificultad ?? '')
    ? params.dificultad
    : 'normal') as Dificultad

  const [bolas, setBolas] = useState<Bola[]>(() => crearRack(nuevaSeed()))
  const [estado, setEstado] = useState<EstadoJuego | null>(() => (esBot ? crearEstadoInicial(HUMANO) : null))
  const [angulo, setAngulo] = useState(Math.PI / 2)
  const [spin, setSpin] = useState<Spin>({ a: 0, b: 0 })
  const [fuerza, setFuerza] = useState(0)
  const [muestra, setMuestra] = useState<MuestraAnimacion | null>(null)
  const [animando, setAnimando] = useState(false)
  const [pensando, setPensando] = useState(false)
  const [bolaEnManoPractica, setBolaEnManoPractica] = useState(false)
  const [spinAbierto, setSpinAbierto] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [anchoMesa, setAnchoMesa] = useState(0)
  const zonaRef = useRef<View>(null)

  const rafRef = useRef<number | null>(null)
  const botTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const modoDrag = useRef<'apuntar' | 'mover'>('apuntar')
  const fuerzaRef = useRef(0)
  const rompe = useRef<Jugador>(HUMANO)
  const rng = useRef(crearRng(nuevaSeed()))

  const bolasRef = useRef(bolas)
  bolasRef.current = bolas
  const anguloRef = useRef(angulo)
  anguloRef.current = angulo
  const estadoRef = useRef(estado)
  estadoRef.current = estado

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    if (botTimer.current) clearTimeout(botTimer.current)
    if (msgTimer.current) clearTimeout(msgTimer.current)
  }, [])

  // Fallback de medición: en web, un tab en segundo plano no dispara onLayout
  // (ResizeObserver no corre sin pintado) — se mide directo del DOM para que
  // la mesa monte igual.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (anchoMesa > 0) return
      const el = zonaRef.current as unknown as { getBoundingClientRect?: () => { width: number; height: number } }
      const rect = el?.getBoundingClientRect?.()
      if (rect && rect.width > 0 && rect.height > 0) {
        const ancho = Math.min(rect.width - 52 - 20, rect.height / RELACION_ASPECTO)
        setAnchoMesa(Math.max(120, Math.floor(ancho)))
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [anchoMesa])

  const avisar = useCallback((texto: string, ms = 2800) => {
    setMsg(texto)
    if (msgTimer.current) clearTimeout(msgTimer.current)
    msgTimer.current = setTimeout(() => setMsg(null), ms)
  }, [])

  // el humano tiene bola en mano ahora mismo
  const bolaEnMano = esBot
    ? !!estado && estado.fase !== 'fin' && estado.bolaEnMano && estado.turno === HUMANO
    : bolaEnManoPractica

  const finJuego = esBot && estado?.fase === 'fin'
  const eligeRebreak = esBot && estado?.fase === 'eleccion_rebreak' && estado.turno === HUMANO
  const turnoHumano = !esBot || (estado?.turno === HUMANO && estado.fase !== 'fin' && estado.fase !== 'eleccion_rebreak')
  const controlesActivos = !animando && !pensando && turnoHumano && !finJuego

  // ── arranque / revancha ──
  function nuevaPartida(quienRompe: Jugador) {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    if (botTimer.current) clearTimeout(botTimer.current)
    setMuestra(null)
    setAnimando(false)
    setPensando(false)
    setSpin({ a: 0, b: 0 })
    setFuerza(0)
    setBolaEnManoPractica(false)
    setAngulo(Math.PI / 2)
    const rack = crearRack(nuevaSeed())
    setBolas(rack)
    if (esBot) {
      const e = crearEstadoInicial(quienRompe)
      setEstado(e)
      if (quienRompe === BOT) programarBot(e, rack)
      else avisar('Rompés vos: acomodá la blanca y tirá fuerte')
    }
  }

  // ── turno del bot ──
  function programarBot(e: EstadoJuego, bolasAhora: Bola[]) {
    setPensando(true)
    const decision = decidirTiro(bolasAhora, e, dificultad, rng.current)
    // se ve lo que considera: coloca la blanca (si corresponde) y apunta
    let bolasParaTiro = bolasAhora
    if (decision.posBlanca) {
      bolasParaTiro = bolasAhora.map(b =>
        b.n === 0 ? { ...b, viva: true, quieta: true, pos: { ...decision.posBlanca! } } : b,
      )
      setBolas(bolasParaTiro)
    }
    setAngulo(decision.tiro.angulo)
    botTimer.current = setTimeout(() => {
      setPensando(false)
      ejecutarTiro(decision.tiro, bolasParaTiro)
    }, decision.pensarMs)
  }

  // ── ejecutar un tiro (humano o bot) ──
  function ejecutarTiro(t: Tiro, bolasAhora?: Bola[]) {
    const base = bolasAhora ?? bolasRef.current
    const res = simularTiro(base, t)
    setSpin({ a: 0, b: 0 })
    setFuerza(0)
    fuerzaRef.current = 0
    setAnimando(true)

    const t0 = performance.now()
    const paso = () => {
      const tt = (performance.now() - t0) / 1000
      const idx = Math.min(res.muestras.length - 1, Math.floor(tt * PARAMETROS.fpsMuestreo))
      setMuestra(res.muestras[idx])
      if (idx < res.muestras.length - 1) {
        rafRef.current = requestAnimationFrame(paso)
      } else {
        setMuestra(null)
        setAnimando(false)
        if (esBot) procesarReglas(res)
        else procesarPractica(res)
      }
    }
    rafRef.current = requestAnimationFrame(paso)
  }

  // ── práctica libre (sin reglas) ──
  function procesarPractica(res: ResultadoSimulacion) {
    const embocadas = res.eventos.filter(e => e.tipo === 'tronera').map(e => e.bola)
    let finales = res.bolas
    if (embocadas.includes(0)) {
      finales = reponerBlanca(finales, false)
      setBolaEnManoPractica(true)
      avisar('Bola blanca embocada — acomodala donde quieras')
    } else if (embocadas.length > 0) {
      avisar(embocadas.length === 1 ? '¡Embocaste una!' : `¡Embocaste ${embocadas.length}!`)
    }
    setBolas(finales)
    if (finales.filter(b => b.viva && b.n !== 0).length === 0) {
      avisar('¡Mesa limpia! Tocá Rack para volver a armar')
    }
  }

  // ── 8-ball vs bot: las reglas arbitran ──
  function procesarReglas(res: ResultadoSimulacion) {
    const previo = estadoRef.current
    if (!previo) return
    const { estado: e2, resultado } = resolverTiro(previo, res.eventos, res.snapshot)

    if (resultado.rerack) {
      avisar('La 8 cayó en el break: se arma de nuevo')
      const rack = crearRack(nuevaSeed())
      setBolas(rack)
      setEstado(e2)
      if (e2.turno === BOT) botTimer.current = setTimeout(() => programarBot(e2, rack), 1200)
      return
    }

    let finales = res.bolas
    if (e2.fase !== 'fin' && e2.bolaEnMano) {
      finales = reponerBlanca(finales, e2.soloCabecera)
    }
    setBolas(finales)
    setEstado(e2)

    // comunicar lo que pasó (spec §5: nada ocurre en silencio)
    if (resultado.ganador) {
      // el overlay de fin lo muestra
    } else if (resultado.faltas.length > 0) {
      const quien = previo.turno === HUMANO ? '' : ' del Bot'
      avisar(`${TEXTO_FALTA[resultado.faltas[0]]}${quien}`)
    } else if (resultado.asignoGrupos) {
      const grupoHumano = e2.grupos[HUMANO] === 'lisas' ? 'las LISAS' : 'las RAYADAS'
      avisar(`Grupos asignados: vos jugás con ${grupoHumano}`)
    } else if (resultado.breakIlegal) {
      if (e2.turno === BOT) {
        avisar('Break inválido: el Bot decide jugar así')
        const e3 = aplicarEleccionRebreak(e2, 'jugar')
        setEstado(e3)
        botTimer.current = setTimeout(() => programarBot(e3, finales), 900)
        return
      }
      // humano elige con el overlay (eligeRebreak)
      return
    } else if (e2.turno !== previo.turno) {
      avisar(e2.turno === HUMANO ? 'Tu turno' : 'Turno del Bot', 1600)
    } else if (resultado.embocadas.length > 0 && e2.turno === HUMANO) {
      avisar('¡Buena! Seguís tirando', 1600)
    }

    if (e2.fase !== 'fin' && e2.fase !== 'eleccion_rebreak' && e2.turno === BOT) {
      botTimer.current = setTimeout(() => programarBot(e2, finales), 700)
    }
  }

  function elegirRebreak(eleccion: 'rebreak' | 'jugar') {
    const e = estadoRef.current
    if (!e) return
    const e2 = aplicarEleccionRebreak(e, eleccion)
    if (eleccion === 'rebreak') {
      const rack = crearRack(nuevaSeed())
      setBolas(rack)
      setEstado(e2)
      avisar('Rompés vos: acomodá la blanca y tirá fuerte')
    } else {
      setEstado(e2)
      avisar('Jugás la mesa como quedó')
    }
  }

  function reRack() {
    nuevaPartida(rompe.current)
  }

  function revancha() {
    rompe.current = rival(rompe.current)
    nuevaPartida(rompe.current)
  }

  // ── gestos sobre la mesa ──
  const tf = anchoMesa > 0 ? crearTransform(anchoMesa) : null

  const panMesa = Gesture.Pan()
    .enabled(controlesActivos)
    .runOnJS(true)
    .onBegin(e => {
      if (!tf) return
      const m = tf.aMesa(e.x, e.y)
      const blanca = bolasRef.current.find(b => b.n === 0)
      modoDrag.current =
        bolaEnMano && blanca && Math.hypot(m.x - blanca.pos.x, m.y - blanca.pos.y) < 0.14
          ? 'mover'
          : 'apuntar'
    })
    .onChange(e => {
      if (!tf) return
      if (modoDrag.current === 'mover') {
        const m = tf.aMesa(e.x, e.y)
        const pos = { x: m.x, y: m.y + 0.07 }
        const soloCab = esBot ? !!estadoRef.current?.soloCabecera : false
        if (posicionBlancaValida(bolasRef.current, pos, soloCab)) {
          setBolas(prev => prev.map(b => (b.n === 0 ? { ...b, pos } : b)))
        }
        return
      }
      const dxM = e.changeX / tf.sx
      const dyM = -e.changeY / tf.sy
      const a = anguloRef.current
      setAngulo(a + (dxM * -Math.sin(a) + dyM * Math.cos(a)) * SENSIBILIDAD)
    })

  // ── datos del HUD ──
  const grupoDe = (j: Jugador) => estado?.grupos[j]
  const embocadasDe = (j: Jugador) => {
    const g = grupoDe(j)
    if (!g) return []
    return bolas.filter(b => !b.viva && esDelGrupo(b.n, g))
  }
  const etiquetaGrupo = (j: Jugador) => {
    const g = grupoDe(j)
    return g ? (g === 'lisas' ? 'LISAS' : 'RAYADAS') : '—'
  }
  const vivasNo0 = bolas.filter(b => b.viva && b.n !== 0).length
  const embocadasPractica = bolas.filter(b => !b.viva && b.n !== 0)

  const titulo = esBot ? `Vs Bot · ${NOMBRE_DIFICULTAD[dificultad]}` : 'Práctica libre'
  const gane = estado?.ganador === HUMANO

  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <View style={es.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={12}>
          <Text style={[es.volver, { color: c.primario }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[es.titulo, { color: c.texto }]}>{titulo}</Text>
        {esBot ? (
          <View style={{ width: 52 }} />
        ) : (
          <TouchableOpacity style={[es.botonRack, { borderColor: c.borde }]} onPress={reRack} activeOpacity={0.8}>
            <Text style={[es.botonRackTexto, { color: c.primario }]}>Rack</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* HUD superior */}
      {esBot && estado ? (
        <View style={es.hudBot}>
          <View
            style={[
              es.chipJugador,
              { borderColor: estado.turno === HUMANO && !finJuego ? c.primario : c.borde, backgroundColor: c.fondoCard },
            ]}
          >
            <Text style={[es.chipNombre, { color: estado.turno === HUMANO ? c.primario : c.texto }]}>Vos</Text>
            <Text style={[es.chipGrupo, { color: c.textoSuave }]}>{etiquetaGrupo(HUMANO)}</Text>
            <View style={es.chipBolas}>
              {embocadasDe(HUMANO).map(b => (
                <View key={b.n} style={[es.mini, { backgroundColor: COLORES_RIEL[b.n <= 8 ? b.n : b.n - 8] }, b.n >= 9 && es.miniRayada]} />
              ))}
            </View>
          </View>
          <Text style={[es.vs, { color: c.textoSuave }]}>{pensando ? '…' : 'VS'}</Text>
          <View
            style={[
              es.chipJugador,
              { borderColor: estado.turno === BOT && !finJuego ? c.primario : c.borde, backgroundColor: c.fondoCard },
            ]}
          >
            <Text style={[es.chipNombre, { color: estado.turno === BOT ? c.primario : c.texto }]}>
              Bot {pensando ? '🤔' : ''}
            </Text>
            <Text style={[es.chipGrupo, { color: c.textoSuave }]}>{etiquetaGrupo(BOT)}</Text>
            <View style={es.chipBolas}>
              {embocadasDe(BOT).map(b => (
                <View key={b.n} style={[es.mini, { backgroundColor: COLORES_RIEL[b.n <= 8 ? b.n : b.n - 8] }, b.n >= 9 && es.miniRayada]} />
              ))}
            </View>
          </View>
        </View>
      ) : null}

      {/* banner / riel */}
      <View style={es.riel}>
        {msg ? (
          <Text style={[es.msg, { color: c.primarioSuave }]}>{msg}</Text>
        ) : esBot ? (
          <Text style={[es.rielVacio, { color: c.textoSuave }]}>
            {pensando ? 'El Bot está mirando la mesa…' : bolaEnMano ? 'Bola en mano: arrastrá la blanca' : turnoHumano ? 'Tu turno' : ''}
          </Text>
        ) : embocadasPractica.length === 0 ? (
          <Text style={[es.rielVacio, { color: c.textoSuave }]}>
            Arrastrá para apuntar · deslizá la barra y soltá para tirar · quedan {vivasNo0}
          </Text>
        ) : (
          <View style={es.rielBolas}>
            {embocadasPractica.map(b => (
              <View key={b.n} style={[es.mini, { backgroundColor: COLORES_RIEL[b.n <= 8 ? b.n : b.n - 8] }, b.n >= 9 && es.miniRayada]} />
            ))}
          </View>
        )}
      </View>

      {/* mesa + slider */}
      <View
        ref={zonaRef}
        style={es.zonaJuego}
        onLayout={ev => {
          const { width, height } = ev.nativeEvent.layout
          const ancho = Math.min(width - 52 - 20, height / RELACION_ASPECTO)
          setAnchoMesa(Math.max(120, Math.floor(ancho)))
        }}
      >
        {anchoMesa > 0 && (
          <>
            <GestureDetector gesture={panMesa}>
              <View>
                <MesaPoolLazy
                  anchoPx={anchoMesa}
                  bolas={bolas}
                  muestra={muestra}
                  angulo={angulo}
                  fuerzaPreview={fuerza}
                  mostrarGuia={!animando && (turnoHumano || pensando)}
                  bolaEnMano={bolaEnMano}
                />
              </View>
            </GestureDetector>
            <ControlFuerza
              habilitado={controlesActivos}
              fuerza={fuerza}
              onCambio={f => {
                fuerzaRef.current = f
                setFuerza(f)
              }}
              onSoltar={() => {
                const f = fuerzaRef.current
                fuerzaRef.current = 0
                setFuerza(0)
                if (f >= 0.06) {
                  if (!esBot) setBolaEnManoPractica(false)
                  ejecutarTiro({
                    angulo: anguloRef.current,
                    fuerza: f,
                    efectoLateral: spin.a,
                    efectoVertical: spin.b,
                  })
                }
              }}
              alto={Math.min(320, anchoMesa * RELACION_ASPECTO)}
            />
          </>
        )}
      </View>

      {/* barra inferior */}
      <View style={es.barra}>
        <TouchableOpacity
          style={[es.botonSpin, { borderColor: c.borde, backgroundColor: c.fondoCard }]}
          onPress={() => setSpinAbierto(true)}
          activeOpacity={0.8}
          disabled={!controlesActivos}
        >
          <View style={es.spinBola}>
            <View style={[es.spinPunto, { transform: [{ translateX: spin.a * 9 }, { translateY: -spin.b * 9 }] }]} />
          </View>
          <Text style={[es.botonSpinTexto, { color: c.textoSuave }]}>Efecto</Text>
        </TouchableOpacity>

        <View style={es.finoWrap}>
          <TouchableOpacity
            style={[es.botonFino, { borderColor: c.borde, backgroundColor: c.fondoCard }]}
            onPress={() => setAngulo(a => a + AJUSTE_FINO)}
            activeOpacity={0.7}
            disabled={!controlesActivos}
          >
            <Text style={[es.botonFinoTexto, { color: c.primario }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[es.finoLabel, { color: c.textoSuave }]}>fino</Text>
          <TouchableOpacity
            style={[es.botonFino, { borderColor: c.borde, backgroundColor: c.fondoCard }]}
            onPress={() => setAngulo(a => a - AJUSTE_FINO)}
            activeOpacity={0.7}
            disabled={!controlesActivos}
          >
            <Text style={[es.botonFinoTexto, { color: c.primario }]}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      <SelectorSpin visible={spinAbierto} spin={spin} onCerrar={() => setSpinAbierto(false)} onElegir={setSpin} />

      {/* overlay: elección tras break inválido */}
      {eligeRebreak && (
        <View style={es.overlay}>
          <View style={[es.cartaFin, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
            <Text style={[es.finTitulo, { color: c.texto }]}>Break inválido</Text>
            <Text style={[es.finDetalle, { color: c.textoSuave }]}>
              El Bot no movió suficiente el rack. ¿Qué querés hacer?
            </Text>
            <View style={es.finBotones}>
              <TouchableOpacity style={[es.botonSec, { borderColor: c.borde }]} onPress={() => elegirRebreak('jugar')} activeOpacity={0.8}>
                <Text style={[es.botonSecTexto, { color: c.textoSuave }]}>Jugar así</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[es.botonPri, { backgroundColor: c.primario }]} onPress={() => elegirRebreak('rebreak')} activeOpacity={0.8}>
                <Text style={[es.botonPriTexto, { color: c.fondo }]}>Romper yo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* overlay: fin de partida */}
      {finJuego && estado && (
        <View style={es.overlay}>
          <View style={[es.cartaFin, { backgroundColor: c.fondoCard, borderColor: gane ? c.primario : c.borde }]}>
            <Text style={[es.finTitulo, { color: gane ? c.primario : c.texto }]}>
              {gane ? '¡Ganaste! 🎱' : 'Ganó el Bot'}
            </Text>
            <Text style={[es.finDetalle, { color: c.textoSuave }]}>
              {estado.motivoFin === 'ocho_legal' && (gane ? 'Embocaste la 8 con la mesa limpia.' : 'El Bot embocó la 8 con la mesa limpia.')}
              {estado.motivoFin === 'ocho_antes_de_tiempo' && (gane ? 'El Bot metió la 8 antes de tiempo.' : 'La 8 cayó antes de tiempo.')}
              {estado.motivoFin === 'ocho_con_falta' && (gane ? 'El Bot embocó la 8 con falta.' : 'Embocaste la 8 con falta.')}
            </Text>
            <View style={es.finBotones}>
              <TouchableOpacity style={[es.botonSec, { borderColor: c.borde }]} onPress={() => router.back()} activeOpacity={0.8}>
                <Text style={[es.botonSecTexto, { color: c.textoSuave }]}>Salir</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[es.botonPri, { backgroundColor: c.primario }]} onPress={revancha} activeOpacity={0.8}>
                <Text style={[es.botonPriTexto, { color: c.fondo }]}>Revancha</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1 },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 54, paddingBottom: 6,
    },
    volver: { fontSize: 26, fontWeight: '700', width: 24 },
    titulo: { fontSize: 18, fontWeight: '800' },
    botonRack: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
    botonRackTexto: { fontSize: 13, fontWeight: '800' },
    hudBot: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 10, paddingHorizontal: 16, paddingVertical: 2,
    },
    chipJugador: {
      flex: 1, maxWidth: 170, borderWidth: 1.5, borderRadius: 12,
      paddingHorizontal: 10, paddingVertical: 6, gap: 2,
    },
    chipNombre: { fontSize: 13, fontWeight: '800' },
    chipGrupo: { fontSize: 10, fontWeight: '700' },
    chipBolas: { flexDirection: 'row', gap: 3, minHeight: 12 },
    vs: { fontSize: 12, fontWeight: '800' },
    riel: { minHeight: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    rielVacio: { fontSize: 11, textAlign: 'center' },
    rielBolas: { flexDirection: 'row', gap: 5 },
    mini: { width: 12, height: 12, borderRadius: 6 },
    miniRayada: { borderWidth: 2.5, borderColor: '#F2EFE8' },
    msg: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
    zonaJuego: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 10, paddingHorizontal: 8, paddingVertical: 8,
    },
    barra: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 24, paddingBottom: 28, paddingTop: 4,
    },
    botonSpin: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8,
    },
    spinBola: {
      width: 28, height: 28, borderRadius: 14, backgroundColor: '#F2EFE8',
      alignItems: 'center', justifyContent: 'center',
    },
    spinPunto: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C93430' },
    botonSpinTexto: { fontSize: 13, fontWeight: '700' },
    finoWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    finoLabel: { fontSize: 11, fontWeight: '600' },
    botonFino: {
      width: 44, height: 44, borderRadius: 12, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center',
    },
    botonFinoTexto: { fontSize: 22, fontWeight: '800' },
    overlay: {
      position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 32,
    },
    cartaFin: {
      width: '100%', maxWidth: 360, borderWidth: 1.5, borderRadius: 20,
      padding: 24, alignItems: 'center', gap: 8,
    },
    finTitulo: { fontSize: 24, fontWeight: '800' },
    finDetalle: { fontSize: 14, textAlign: 'center' },
    finBotones: { flexDirection: 'row', gap: 12, marginTop: 14 },
    botonSec: { borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24 },
    botonSecTexto: { fontSize: 15, fontWeight: '800' },
    botonPri: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24 },
    botonPriTexto: { fontSize: 15, fontWeight: '800' },
  })
}
