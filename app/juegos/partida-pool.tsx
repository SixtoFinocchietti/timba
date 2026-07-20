// Partida de Pool — tres modos sobre la misma mesa:
//   practica: mesa libre sin reglas (fase 2).
//   bot:      8-ball contra el bot (fase 3): reglas.ts arbitra y bot.ts decide.
//   online:   8-ball contra un amigo (fase 5): fila en partidas_pool con
//             "autoridad del tirador" — el que tira simula, anima y escribe
//             {input, snapshot, estado}; el rival re-simula el MISMO input con
//             el motor determinista para ver la animación y aplica el snapshot
//             como verdad. Escribe solo el cliente del turno (patrón blackjack
//             clásico online). El host es SIEMPRE el jugador 'A'.
//
// Simplificaciones online v1 (documentadas): break inválido ⇒ se juega como
// quedó (sin elección); la 8 en el break ⇒ re-rack sin animar en el rival;
// sin revancha automática al terminar la serie (se re-invita).

import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
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
  AsientoPool, PartidaPoolFila, asientoDe, avanzarSerie, bolasDeSnapshot, jugadorDe,
} from '@/lib/pool/online'
import {
  EstadoJuego, Falta, Jugador, aplicarEleccionRebreak, crearEstadoInicial,
  esDelGrupo, resolverTimeout, resolverTiro, rival,
} from '@/lib/pool/reglas'
import { crearTransform, RELACION_ASPECTO } from '@/lib/pool/transform'
import { Bola, MuestraAnimacion, ResultadoSimulacion, Tiro } from '@/lib/pool/tipos'

const AJUSTE_FINO = (0.25 * Math.PI) / 180
const SENSIBILIDAD = 2.2 // rad por metro de arrastre tangencial
const GRACIA_RECLAMO_MS = 90_000 // inactividad del rival para reclamar la victoria

const HUMANO: Jugador = 'A' // en bot: humano=A, bot=B; en online: host=A
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
  const { usuario } = useAuthStore()
  const params = useLocalSearchParams<{ modo?: string; dificultad?: string; partidaId?: string }>()
  const esBot = params.modo === 'bot'
  const esOnline = params.modo === 'online'
  const partidaId = params.partidaId
  const dificultad = (['facil', 'normal', 'dificil'].includes(params.dificultad ?? '')
    ? params.dificultad
    : 'normal') as Dificultad

  const [bolas, setBolas] = useState<Bola[]>(() => (esOnline ? [] : crearRack(nuevaSeed())))
  const [estado, setEstado] = useState<EstadoJuego | null>(() => (esBot ? crearEstadoInicial(HUMANO) : null))
  const [fila, setFila] = useState<PartidaPoolFila | null>(null)
  const [nombreRival, setNombreRival] = useState('Rival')
  const [rivalPresente, setRivalPresente] = useState(true)
  const [segundos, setSegundos] = useState<number | null>(null)
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
  const numTiroRef = useRef(0) // online: último num_tiro procesado localmente

  const bolasRef = useRef(bolas)
  bolasRef.current = bolas
  const anguloRef = useRef(angulo)
  anguloRef.current = angulo
  const estadoRef = useRef(estado)
  estadoRef.current = estado
  const filaRef = useRef(fila)
  filaRef.current = fila
  const animandoRef = useRef(false)
  animandoRef.current = animando
  const pendienteRef = useRef<PartidaPoolFila | null>(null) // update remoto llegado durante animación

  // online: mi asiento y mi jugador de reglas
  const miAsiento: AsientoPool | null = esOnline && fila && usuario?.id
    ? (fila.host_id === usuario.id ? 'host' : 'invitado')
    : null
  const miJugador: Jugador = esOnline ? (miAsiento ? jugadorDe(miAsiento) : 'A') : HUMANO

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    if (botTimer.current) clearTimeout(botTimer.current)
    if (msgTimer.current) clearTimeout(msgTimer.current)
  }, [])

  // Fallback de medición: en web, un tab en segundo plano no dispara onLayout
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

  // ── ONLINE: carga inicial + realtime + presencia ──
  useEffect(() => {
    if (!esOnline || !partidaId) return
    let activo = true
    supabase.from('partidas_pool').select('*').eq('id', partidaId).single()
      .then(({ data }) => {
        if (!activo || !data) return
        const f = data as PartidaPoolFila
        numTiroRef.current = f.num_tiro
        setFila(f)
        setBolas(bolasDeSnapshot(f.estado_bolas))
        setEstado(f.estado_juego)
      })
    const canal = supabase
      .channel(`pool-${partidaId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'partidas_pool',
        filter: `id=eq.${partidaId}`,
      }, payload => onFilaRemota(payload.new as PartidaPoolFila))
      .subscribe()
    return () => { activo = false; supabase.removeChannel(canal) }
  }, [esOnline, partidaId])

  // nombre del rival
  useEffect(() => {
    if (!esOnline || !fila || !usuario?.id) return
    const rivalId = fila.host_id === usuario.id ? fila.invitado_id : fila.host_id
    supabase.from('usuarios_publicos').select('nombre').eq('id', rivalId).single()
      .then(({ data }) => { if (data?.nombre) setNombreRival(data.nombre) })
  }, [esOnline, fila?.id, usuario?.id])

  // presencia en la partida (desconexión ≠ abandono, spec §6)
  useEffect(() => {
    if (!esOnline || !partidaId || !usuario?.id || !miAsiento) return
    const canal = supabase.channel(`pool-presencia-${partidaId}`)
    canal
      .on('presence', { event: 'sync' }, () => {
        const state = canal.presenceState<{ asiento: string }>()
        const presentes = Object.values(state).flatMap(ps => (ps as any[]).map((p: any) => p.asiento))
        setRivalPresente(presentes.includes(miAsiento === 'host' ? 'invitado' : 'host'))
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') await canal.track({ asiento: miAsiento })
      })
    return () => { supabase.removeChannel(canal) }
  }, [esOnline, partidaId, usuario?.id, miAsiento])

  // timer de turno (corre para ambos; solo ACTÚA el dueño del turno)
  useEffect(() => {
    if (!esOnline || !fila || fila.timer_seg === 0 || !estado || estado.fase === 'fin' || fila.fase !== 'en_juego' || animando) {
      setSegundos(null)
      return
    }
    setSegundos(fila.timer_seg)
    const iv = setInterval(() => {
      setSegundos(s => {
        if (s === null) return null
        if (s <= 1) {
          clearInterval(iv)
          if (estadoRef.current?.turno === miJugador) vencioMiTimer()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [esOnline, fila?.num_tiro, fila?.timer_seg, fila?.fase, estado?.turno, animando, miJugador])

  // el humano tiene bola en mano ahora mismo
  const turnoMio = esOnline
    ? !!estado && estado.turno === miJugador && estado.fase !== 'fin' && fila?.fase === 'en_juego'
    : !esBot || (estado?.turno === HUMANO && estado.fase !== 'fin' && estado.fase !== 'eleccion_rebreak')

  const bolaEnMano = esBot || esOnline
    ? !!estado && estado.fase !== 'fin' && estado.bolaEnMano && turnoMio
    : bolaEnManoPractica

  const finJuego = (esBot && estado?.fase === 'fin') || (esOnline && (fila?.fase === 'terminada' || fila?.fase === 'abandonada'))
  const eligeRebreak = esBot && estado?.fase === 'eleccion_rebreak' && estado.turno === HUMANO
  const controlesActivos = !animando && !pensando && turnoMio && !finJuego && (!esOnline || !!fila)

  // ── arranque / revancha (práctica y bot) ──
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

  // ── ejecutar un tiro y animarlo (local: humano/bot; online: el mío) ──
  function ejecutarTiro(t: Tiro, bolasAhora?: Bola[]) {
    const base = bolasAhora ?? bolasRef.current
    const res = simularTiro(base, t)
    setSpin({ a: 0, b: 0 })
    setFuerza(0)
    fuerzaRef.current = 0
    animar(res, () => {
      if (esOnline) procesarOnline(res, t)
      else if (esBot) procesarReglas(res)
      else procesarPractica(res)
    })
  }

  function animar(res: ResultadoSimulacion, alTerminar: () => void) {
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
        alTerminar()
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

  // ── banners comunes de un tiro resuelto ──
  function comunicarResultado(previo: EstadoJuego, e2: EstadoJuego, resultado: ReturnType<typeof resolverTiro>['resultado'], quienTiro: Jugador, nombreOtro: string) {
    if (resultado.ganador) return
    if (resultado.rerack) {
      avisar('La 8 cayó en el break: se arma de nuevo')
    } else if (resultado.faltas.length > 0) {
      const quien = quienTiro === miJugador && !esOnline ? '' : quienTiro === (esOnline ? miJugador : HUMANO) ? '' : ` de ${nombreOtro}`
      avisar(`${TEXTO_FALTA[resultado.faltas[0]]}${quien}`)
    } else if (resultado.asignoGrupos) {
      const mio = e2.grupos[esOnline ? miJugador : HUMANO] === 'lisas' ? 'las LISAS' : 'las RAYADAS'
      avisar(`Grupos asignados: vos jugás con ${mio}`)
    } else if (e2.turno !== previo.turno) {
      avisar(e2.turno === (esOnline ? miJugador : HUMANO) ? 'Tu turno' : `Turno de ${nombreOtro}`, 1600)
    } else if (resultado.embocadas.length > 0 && e2.turno === (esOnline ? miJugador : HUMANO)) {
      avisar('¡Buena! Seguís tirando', 1600)
    }
  }

  // ── 8-ball vs bot ──
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

    if (resultado.breakIlegal) {
      if (e2.turno === BOT) {
        avisar('Break inválido: el Bot decide jugar así')
        const e3 = aplicarEleccionRebreak(e2, 'jugar')
        setEstado(e3)
        botTimer.current = setTimeout(() => programarBot(e3, finales), 900)
      }
      return
    }

    comunicarResultado(previo, e2, resultado, previo.turno, `el Bot`)

    if (e2.fase !== 'fin' && e2.fase !== 'eleccion_rebreak' && e2.turno === BOT) {
      botTimer.current = setTimeout(() => programarBot(e2, finales), 700)
    }
  }

  // ── ONLINE: procesar MI tiro y escribir la fila ──
  async function procesarOnline(res: ResultadoSimulacion, input: Tiro) {
    const previo = estadoRef.current
    const f = filaRef.current
    if (!previo || !f) return
    let { estado: e2, resultado } = resolverTiro(previo, res.eventos, res.snapshot)

    // simplificación v1: online el break inválido se juega como quedó
    if (resultado.breakIlegal) {
      e2 = aplicarEleccionRebreak(e2, 'jugar')
      avisar('Break flojo: se juega como quedó')
    }

    const num = numTiroRef.current + 1
    numTiroRef.current = num

    let up: Partial<PartidaPoolFila> = {
      estado_bolas: res.snapshot,
      estado_juego: e2,
      ultimo_tiro: { input, num },
      num_tiro: num,
    }
    let finales = res.bolas

    if (resultado.rerack) {
      // la 8 en el break: rack nuevo (el rival no anima este tiro, solo banner)
      const rack = crearRack(nuevaSeed())
      finales = rack
      up.estado_bolas = rack.map(b => ({ n: b.n, x: b.pos.x, y: b.pos.y, viva: b.viva }))
      up.ultimo_tiro = null
    } else if (resultado.ganador) {
      // terminó un juego de la serie
      const serieUp = avanzarSerie(f, resultado.ganador, nuevaSeed())
      up = { ...up, ...serieUp }
      if (serieUp.estado_bolas) {
        finales = bolasDeSnapshot(serieUp.estado_bolas)
        up.estado_juego = serieUp.estado_juego
        e2 = serieUp.estado_juego!
        const gane = resultado.ganador === miJugador
        avisar(gane ? '¡Juego para vos! Se arma el siguiente' : `Juego para ${nombreRival} — va el siguiente`, 3500)
      }
    } else if (e2.bolaEnMano) {
      finales = reponerBlanca(finales, e2.soloCabecera)
      const s = finales.find(b => b.n === 0)!
      up.estado_bolas = res.snapshot.map(b => (b.n === 0 ? { ...b, x: s.pos.x, y: s.pos.y, viva: true } : b))
    }

    setBolas(finales)
    setEstado(e2)
    setFila({ ...f, ...up } as PartidaPoolFila)
    if (!resultado.rerack && !resultado.ganador) {
      comunicarResultado(previo, e2, resultado, previo.turno, nombreRival)
    } else if (resultado.rerack) {
      avisar('La 8 cayó en el break: se arma de nuevo')
    }

    await supabase.from('partidas_pool')
      .update({ ...up, updated_at: new Date().toISOString() })
      .eq('id', f.id)
  }

  // ── ONLINE: llegó un update remoto ──
  function onFilaRemota(f: PartidaPoolFila) {
    if (animandoRef.current) {
      pendienteRef.current = f
      return
    }
    aplicarFilaRemota(f)
  }

  function aplicarFilaRemota(f: PartidaPoolFila) {
    const anterior = filaRef.current
    setFila(f)

    if (f.fase === 'abandonada') {
      setEstado(f.estado_juego)
      return
    }

    // ¿hay un tiro del rival para animar?
    if (f.num_tiro > numTiroRef.current) {
      numTiroRef.current = f.num_tiro
      const previo = estadoRef.current
      if (f.ultimo_tiro && previo && bolasRef.current.length > 0) {
        // re-simular el MISMO input con el mismo motor: misma animación
        const res = simularTiro(bolasRef.current, f.ultimo_tiro.input)
        animar(res, () => {
          // snapshot autoritativo del tirador + estado de la fila
          setBolas(bolasDeSnapshot(f.estado_bolas))
          setEstado(f.estado_juego)
          const { resultado } = resolverTiro(previo, res.eventos, res.snapshot)
          if (f.fase === 'terminada') {
            // el overlay muestra el final
          } else if ((anterior?.victorias_host ?? 0) !== f.victorias_host || (anterior?.victorias_invitado ?? 0) !== f.victorias_invitado) {
            const gane = f.estado_juego.turno === miJugador // informativo
            avisar(`Juego para ${resultado.ganador === miJugador ? 'vos' : nombreRival} — va el siguiente`, 3500)
          } else {
            comunicarResultado(previo, f.estado_juego, resultado, previo.turno, nombreRival)
          }
          const pend = pendienteRef.current
          pendienteRef.current = null
          if (pend && pend.num_tiro > f.num_tiro) aplicarFilaRemota(pend)
        })
        return
      }
      // sin input (re-rack / timeout): aplicar directo
      setBolas(bolasDeSnapshot(f.estado_bolas))
      setEstado(f.estado_juego)
      if (f.estado_juego.fase === 'break') avisar('Se arma de nuevo')
      else if (f.estado_juego.turno === miJugador) avisar('Tu turno', 1600)
      return
    }

    // mismo num_tiro: sync de estado (p. ej. reconexión)
    setEstado(f.estado_juego)
    setBolas(bolasDeSnapshot(f.estado_bolas))
  }

  // ── ONLINE: timer vencido (lo escribe el dueño del turno) ──
  async function vencioMiTimer() {
    const previo = estadoRef.current
    const f = filaRef.current
    if (!previo || !f || previo.fase === 'fin') return
    const e2 = resolverTimeout(previo)
    const num = numTiroRef.current + 1
    numTiroRef.current = num
    let finales = bolasRef.current
    if (e2.bolaEnMano) finales = reponerBlanca(finales, e2.soloCabecera)
    setEstado(e2)
    setBolas(finales)
    avisar('Se acabó tu tiempo: bola en mano para el rival')
    await supabase.from('partidas_pool')
      .update({
        estado_juego: e2,
        estado_bolas: finales.map(b => ({ n: b.n, x: b.pos.x, y: b.pos.y, viva: b.viva })),
        ultimo_tiro: null,
        num_tiro: num,
        updated_at: new Date().toISOString(),
      })
      .eq('id', f.id)
  }

  // ── ONLINE: abandonar / reclamar por inactividad ──
  async function abandonar() {
    const f = filaRef.current
    if (!f || !miAsiento) return
    await supabase.from('partidas_pool')
      .update({
        fase: 'abandonada',
        ganador_serie: miAsiento === 'host' ? 'invitado' : 'host',
        updated_at: new Date().toISOString(),
      })
      .eq('id', f.id)
    router.back()
  }

  async function reclamarVictoria() {
    const f = filaRef.current
    if (!f || !miAsiento) return
    const limite = new Date(Date.now() - GRACIA_RECLAMO_MS).toISOString()
    // garantía server-side: solo procede si la fila está inactiva de verdad
    const { data } = await supabase.from('partidas_pool')
      .update({ fase: 'abandonada', ganador_serie: miAsiento, updated_at: new Date().toISOString() })
      .eq('id', f.id)
      .eq('fase', 'en_juego')
      .lt('updated_at', limite)
      .select('id')
    if (!data || data.length === 0) avisar('Todavía no pasó el tiempo de gracia')
  }

  const puedeReclamar = esOnline && fila && estado && fila.fase === 'en_juego' &&
    estado.turno !== miJugador && !rivalPresente &&
    Date.now() - new Date(fila.updated_at).getTime() > GRACIA_RECLAMO_MS

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
        const soloCab = !!estadoRef.current?.soloCabecera
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
  const conReglas = esBot || esOnline
  const rivalJugador: Jugador = esOnline ? rival(miJugador) : BOT
  const nombreOponente = esOnline ? nombreRival : `Bot · ${NOMBRE_DIFICULTAD[dificultad]}`
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

  const marcador = esOnline && fila && fila.serie_max > 1
    ? ` (${miAsiento === 'host' ? `${fila.victorias_host}–${fila.victorias_invitado}` : `${fila.victorias_invitado}–${fila.victorias_host}`})`
    : ''
  const titulo = esOnline
    ? `Pool online${marcador}`
    : esBot ? `Vs Bot · ${NOMBRE_DIFICULTAD[dificultad]}` : 'Práctica libre'

  const ganeSerie = esOnline && fila?.ganador_serie != null && fila.ganador_serie === miAsiento
  const ganeJuegoBot = estado?.ganador === HUMANO

  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <View style={es.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={12}>
          <Text style={[es.volver, { color: c.primario }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[es.titulo, { color: c.texto }]}>{titulo}</Text>
        {esOnline && fila?.fase === 'en_juego' ? (
          <TouchableOpacity style={[es.botonRack, { borderColor: c.borde }]} onPress={abandonar} activeOpacity={0.8}>
            <Text style={[es.botonRackTexto, { color: c.error }]}>Rendirse</Text>
          </TouchableOpacity>
        ) : esBot || esOnline ? (
          <View style={{ width: 52 }} />
        ) : (
          <TouchableOpacity style={[es.botonRack, { borderColor: c.borde }]} onPress={reRack} activeOpacity={0.8}>
            <Text style={[es.botonRackTexto, { color: c.primario }]}>Rack</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* HUD superior */}
      {conReglas && estado ? (
        <View style={es.hudBot}>
          <View
            style={[
              es.chipJugador,
              { borderColor: estado.turno === miJugador && !finJuego ? c.primario : c.borde, backgroundColor: c.fondoCard },
            ]}
          >
            <Text style={[es.chipNombre, { color: estado.turno === miJugador ? c.primario : c.texto }]}>Vos</Text>
            <Text style={[es.chipGrupo, { color: c.textoSuave }]}>{etiquetaGrupo(miJugador)}</Text>
            <View style={es.chipBolas}>
              {embocadasDe(miJugador).map(b => (
                <View key={b.n} style={[es.mini, { backgroundColor: COLORES_RIEL[b.n <= 8 ? b.n : b.n - 8] }, b.n >= 9 && es.miniRayada]} />
              ))}
            </View>
          </View>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text style={[es.vs, { color: c.textoSuave }]}>{pensando ? '…' : 'VS'}</Text>
            {segundos !== null && (
              <Text style={[es.timer, { color: segundos <= 10 ? c.error : c.textoSuave }]}>⏱ {segundos}s</Text>
            )}
          </View>
          <View
            style={[
              es.chipJugador,
              { borderColor: estado.turno === rivalJugador && !finJuego ? c.primario : c.borde, backgroundColor: c.fondoCard },
            ]}
          >
            <Text style={[es.chipNombre, { color: estado.turno === rivalJugador ? c.primario : c.texto }]} numberOfLines={1}>
              {nombreOponente} {pensando ? '🤔' : ''}{esOnline && !rivalPresente ? ' ⚠️' : ''}
            </Text>
            <Text style={[es.chipGrupo, { color: c.textoSuave }]}>{etiquetaGrupo(rivalJugador)}</Text>
            <View style={es.chipBolas}>
              {embocadasDe(rivalJugador).map(b => (
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
        ) : esOnline && !rivalPresente && fila?.fase === 'en_juego' ? (
          <Text style={[es.msg, { color: c.advertencia }]}>
            {nombreRival} se desconectó — esperando que vuelva…
          </Text>
        ) : conReglas ? (
          <Text style={[es.rielVacio, { color: c.textoSuave }]}>
            {pensando ? 'El Bot está mirando la mesa…' : bolaEnMano ? 'Bola en mano: arrastrá la blanca' : turnoMio ? 'Tu turno' : esOnline ? `Turno de ${nombreRival}` : ''}
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
        {anchoMesa > 0 && bolas.length > 0 && (
          <>
            <GestureDetector gesture={panMesa}>
              <View>
                <MesaPoolLazy
                  anchoPx={anchoMesa}
                  bolas={bolas}
                  muestra={muestra}
                  angulo={angulo}
                  fuerzaPreview={fuerza}
                  mostrarGuia={!animando && turnoMio}
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
                  if (!esBot && !esOnline) setBolaEnManoPractica(false)
                  ejecutarTiro({
                    angulo: anguloRef.current,
                    fuerza: f,
                    efectoLateral: spin.a,
                    efectoVertical: spin.b,
                    ...(bolaEnMano
                      ? { posBlanca: { ...bolasRef.current.find(b => b.n === 0)!.pos } }
                      : {}),
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

        {puedeReclamar ? (
          <TouchableOpacity
            style={[es.botonSpin, { borderColor: c.error, backgroundColor: c.fondoCard }]}
            onPress={reclamarVictoria}
            activeOpacity={0.8}
          >
            <Text style={[es.botonSpinTexto, { color: c.error }]}>Reclamar victoria</Text>
          </TouchableOpacity>
        ) : (
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
        )}
      </View>

      <SelectorSpin visible={spinAbierto} spin={spin} onCerrar={() => setSpinAbierto(false)} onElegir={setSpin} />

      {/* overlay: elección tras break inválido (solo vs bot) */}
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

      {/* overlay: fin (bot) */}
      {esBot && estado?.fase === 'fin' && (
        <View style={es.overlay}>
          <View style={[es.cartaFin, { backgroundColor: c.fondoCard, borderColor: ganeJuegoBot ? c.primario : c.borde }]}>
            <Text style={[es.finTitulo, { color: ganeJuegoBot ? c.primario : c.texto }]}>
              {ganeJuegoBot ? '¡Ganaste! 🎱' : 'Ganó el Bot'}
            </Text>
            <Text style={[es.finDetalle, { color: c.textoSuave }]}>
              {estado.motivoFin === 'ocho_legal' && (ganeJuegoBot ? 'Embocaste la 8 con la mesa limpia.' : 'El Bot embocó la 8 con la mesa limpia.')}
              {estado.motivoFin === 'ocho_antes_de_tiempo' && (ganeJuegoBot ? 'El Bot metió la 8 antes de tiempo.' : 'La 8 cayó antes de tiempo.')}
              {estado.motivoFin === 'ocho_con_falta' && (ganeJuegoBot ? 'El Bot embocó la 8 con falta.' : 'Embocaste la 8 con falta.')}
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

      {/* overlay: fin (online) */}
      {esOnline && (fila?.fase === 'terminada' || fila?.fase === 'abandonada') && (
        <View style={es.overlay}>
          <View style={[es.cartaFin, { backgroundColor: c.fondoCard, borderColor: ganeSerie ? c.primario : c.borde }]}>
            <Text style={[es.finTitulo, { color: ganeSerie ? c.primario : c.texto }]}>
              {ganeSerie ? '¡Ganaste! 🎱' : `Ganó ${nombreRival}`}
            </Text>
            <Text style={[es.finDetalle, { color: c.textoSuave }]}>
              {fila.fase === 'abandonada'
                ? ganeSerie ? `${nombreRival} abandonó la partida.` : 'Abandonaste la partida.'
                : fila.serie_max > 1
                  ? `Serie ${miAsiento === 'host' ? `${fila.victorias_host}–${fila.victorias_invitado}` : `${fila.victorias_invitado}–${fila.victorias_host}`}.`
                  : ganeSerie ? 'Embocaste la 8.' : 'Se llevó la 8.'}
            </Text>
            <View style={es.finBotones}>
              <TouchableOpacity style={[es.botonPri, { backgroundColor: c.primario }]} onPress={() => router.back()} activeOpacity={0.8}>
                <Text style={[es.botonPriTexto, { color: c.fondo }]}>Salir</Text>
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
    timer: { fontSize: 11, fontWeight: '800' },
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
