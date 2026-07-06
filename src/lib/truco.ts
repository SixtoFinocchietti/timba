// Lógica pura del Truco argentino — mano a mano, a 30 puntos.
// Sin dependencias. El estado completo se serializa como jsonb en
// truco_partidas.estado_juego; ambos clientes aplican acciones con `reducir`
// y sincronizan por Supabase Realtime (control de versión optimista).
//
// Simplificaciones v1 (documentadas):
// - "El envido está primero" no está implementado (no se puede responder envido a un truco).
// - Flor: quien la canta primero gana 3 (o 6 si ambos tienen, gana la más alta). Sin contraflor.
// - Sin señas ni muestra (truco argentino clásico, no uruguayo).

export type Palo = 'espada' | 'basto' | 'oro' | 'copa'
export type Carta = { palo: Palo; numero: number } // 1-7, 10-12
export type Equipo = 'p1' | 'p2'
export type EnvidoCanto = 'envido' | 'real' | 'falta'

export type Pendiente =
  | { tipo: 'truco'; nivel: 2 | 3 | 4; por: Equipo } // valor de la mano si aceptan
  | { tipo: 'envido'; chain: EnvidoCanto[]; por: Equipo }

export type Evento =
  | { id: number; tipo: 'canto'; por: Equipo; texto: string }
  | { id: number; tipo: 'respuesta'; por: Equipo; quiero: boolean }
  | { id: number; tipo: 'envido'; por: Equipo; datos: { p1: number; p2: number; ganador: Equipo; valor: number } }
  | { id: number; tipo: 'flor'; por: Equipo; datos: { ganador: Equipo; valor: number; doble: boolean } }
  | { id: number; tipo: 'mazo'; por: Equipo }

export type RazonFinMano = 'bazas' | 'noQuerido' | 'mazo'

export type EstadoJuego = {
  conFlor: boolean
  manoNum: number
  manoDe: Equipo // quién es mano (juega primero) en esta mano
  turno: Equipo
  cartasIniciales: Record<Equipo, Carta[]>
  cartas: Record<Equipo, Carta[]> // cartas que quedan en la mano
  mesa: Record<Equipo, (Carta | null)[]> // carta jugada por baza [0..2]
  bazaActual: number
  bazas: (Equipo | 'parda')[]
  puntos: Record<Equipo, number>
  trucoNivel: 1 | 2 | 3 | 4 // valor actual de la mano
  trucoPuedeSubir: Equipo | null // quién tiene derecho a subir (null: nadie cantó aún)
  envidoResuelto: boolean
  florDe: Equipo | null
  pendiente: Pendiente | null
  eventoSeq: number
  evento: Evento | null
  resumenMano: { ganador: Equipo; puntos: number; razon: RazonFinMano } | null
  ganador: Equipo | null
  abandonadoPor?: Equipo
}

export type Accion =
  | { tipo: 'jugarCarta'; idx: number }
  | { tipo: 'cantarTruco' }
  | { tipo: 'cantarEnvido'; canto: EnvidoCanto }
  | { tipo: 'cantarFlor' }
  | { tipo: 'responder'; quiero: boolean }
  | { tipo: 'irAlMazo' }
  | { tipo: 'nuevaMano' }

export const PUNTOS_OBJETIVO = 30

// ─── Cartas ───────────────────────────────────────────────────────────────────

export const PALOS: Palo[] = ['espada', 'basto', 'oro', 'copa']
const NUMEROS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]

export function mazoCompleto(): Carta[] {
  const m: Carta[] = []
  for (const palo of PALOS) for (const numero of NUMEROS) m.push({ palo, numero })
  return m
}

function mezclar<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Fuerza de la carta en el truco (mayor gana la baza). */
export function jerarquia(c: Carta): number {
  if (c.numero === 1 && c.palo === 'espada') return 14
  if (c.numero === 1 && c.palo === 'basto') return 13
  if (c.numero === 7 && c.palo === 'espada') return 12
  if (c.numero === 7 && c.palo === 'oro') return 11
  switch (c.numero) {
    case 3: return 10
    case 2: return 9
    case 1: return 8
    case 12: return 7
    case 11: return 6
    case 10: return 5
    case 7: return 4
    case 6: return 3
    case 5: return 2
    default: return 1 // 4
  }
}

function valorEnvidoCarta(c: Carta): number {
  return c.numero >= 10 ? 0 : c.numero
}

export function envidoDe(cartas: Carta[]): number {
  let mejor = -1
  for (let i = 0; i < cartas.length; i++) {
    for (let j = i + 1; j < cartas.length; j++) {
      if (cartas[i].palo === cartas[j].palo) {
        mejor = Math.max(mejor, 20 + valorEnvidoCarta(cartas[i]) + valorEnvidoCarta(cartas[j]))
      }
    }
  }
  if (mejor >= 0) return mejor
  return Math.max(...cartas.map(valorEnvidoCarta))
}

export function tieneFlor(cartas: Carta[]): boolean {
  return cartas.length === 3 && cartas[0].palo === cartas[1].palo && cartas[1].palo === cartas[2].palo
}

export function valorFlor(cartas: Carta[]): number {
  return 20 + cartas.reduce((s, c) => s + valorEnvidoCarta(c), 0)
}

export function rivalDe(e: Equipo): Equipo {
  return e === 'p1' ? 'p2' : 'p1'
}

// ─── Reparto ──────────────────────────────────────────────────────────────────

function repartir(base: {
  conFlor: boolean; manoNum: number; manoDe: Equipo
  puntos: Record<Equipo, number>; eventoSeq: number
}): EstadoJuego {
  const mazo = mezclar(mazoCompleto())
  const p1 = mazo.slice(0, 3)
  const p2 = mazo.slice(3, 6)
  return {
    conFlor: base.conFlor,
    manoNum: base.manoNum,
    manoDe: base.manoDe,
    turno: base.manoDe,
    cartasIniciales: { p1, p2 },
    cartas: { p1: [...p1], p2: [...p2] },
    mesa: { p1: [null, null, null], p2: [null, null, null] },
    bazaActual: 0,
    bazas: [],
    puntos: base.puntos,
    trucoNivel: 1,
    trucoPuedeSubir: null,
    envidoResuelto: false,
    florDe: null,
    pendiente: null,
    eventoSeq: base.eventoSeq,
    evento: null,
    resumenMano: null,
    ganador: null,
  }
}

export function estadoInicial(conFlor: boolean): EstadoJuego {
  return repartir({ conFlor, manoNum: 0, manoDe: 'p1', puntos: { p1: 0, p2: 0 }, eventoSeq: 0 })
}

// ─── Resolución de bazas y mano ───────────────────────────────────────────────

function ganadorBaza(c1: Carta, c2: Carta): Equipo | 'parda' {
  const j1 = jerarquia(c1)
  const j2 = jerarquia(c2)
  if (j1 === j2) return 'parda'
  return j1 > j2 ? 'p1' : 'p2'
}

/** Ganador de la mano según bazas jugadas (null si aún no se define). */
export function ganadorMano(bazas: (Equipo | 'parda')[], manoDe: Equipo): Equipo | null {
  if (bazas.length < 2) return null
  const [b1, b2, b3] = bazas
  if (b1 !== 'parda' && b2 !== 'parda') {
    if (b1 === b2) return b1
    if (bazas.length < 3) return null
    return b3 === 'parda' ? b1 : b3
  }
  if (b1 === 'parda') {
    if (b2 !== 'parda') return b2 // parda la primera, gana quien gana la segunda
    if (bazas.length < 3) return null
    return b3 === 'parda' ? manoDe : b3 // todas pardas: gana el mano
  }
  return b1 // primera ganada + segunda parda: gana quien ganó la primera
}

// ─── Valores de cantos ────────────────────────────────────────────────────────

/** Puntos del envido según la cadena de cantos. `quiero=false` → valor del rechazo. */
export function valorEnvidoChain(
  chain: EnvidoCanto[],
  puntos: Record<Equipo, number>,
  quiero: boolean,
): number {
  const lista = quiero ? chain : chain.slice(0, -1)
  if (lista.length === 0) return 1 // rechazar el primer canto: 1 punto
  let v = 0
  for (const c of lista) {
    if (c === 'envido') v += 2
    else if (c === 'real') v += 3
    else return Math.max(1, PUNTOS_OBJETIVO - Math.max(puntos.p1, puntos.p2)) // falta envido
  }
  return v
}

export function etiquetaEnvido(canto: EnvidoCanto): string {
  return canto === 'envido' ? '¡ENVIDO!' : canto === 'real' ? '¡REAL ENVIDO!' : '¡FALTA ENVIDO!'
}

export function etiquetaTruco(nivel: 2 | 3 | 4): string {
  return nivel === 2 ? '¡TRUCO!' : nivel === 3 ? '¡RETRUCO!' : '¡VALE CUATRO!'
}

// ─── Helpers de estado ────────────────────────────────────────────────────────

function clonar(s: EstadoJuego): EstadoJuego {
  return JSON.parse(JSON.stringify(s))
}

type EventoSinId = Evento extends infer E ? (E extends { id: number } ? Omit<E, 'id'> : never) : never

function emitir(s: EstadoJuego, evento: EventoSinId): void {
  s.eventoSeq += 1
  s.evento = { ...evento, id: s.eventoSeq } as Evento
}

function sumarPuntos(s: EstadoJuego, equipo: Equipo, pts: number): void {
  s.puntos[equipo] = Math.min(PUNTOS_OBJETIVO, s.puntos[equipo] + pts)
  if (s.puntos[equipo] >= PUNTOS_OBJETIVO) s.ganador = equipo
}

function finDeMano(s: EstadoJuego, ganador: Equipo, pts: number, razon: RazonFinMano): void {
  s.pendiente = null
  sumarPuntos(s, ganador, pts)
  s.resumenMano = { ganador, puntos: pts, razon }
}

// ─── Acciones disponibles (para la UI) ────────────────────────────────────────

export function accionesDisponibles(s: EstadoJuego, yo: Equipo) {
  const bloqueado = !!(s.resumenMano || s.pendiente || s.ganador)
  const miTurno = s.turno === yo
  const trucoOk = !bloqueado && miTurno && s.trucoNivel < 4
    && (s.trucoPuedeSubir === null || s.trucoPuedeSubir === yo)
  const envidoOk = !bloqueado && miTurno && s.bazaActual === 0
    && !s.envidoResuelto && s.florDe === null
  const florBase = s.conFlor && !s.ganador && !s.resumenMano && s.bazaActual === 0
    && s.florDe === null && !s.envidoResuelto && tieneFlor(s.cartasIniciales[yo])
  const florOk = florBase && (
    s.pendiente === null
      ? miTurno
      : s.pendiente.tipo === 'envido' && s.pendiente.por !== yo // flor mata envido
  )
  const mazoOk = !bloqueado && miTurno
  const jugarOk = !bloqueado && miTurno
  const trucoLabel = s.trucoNivel === 1 ? 'Truco' : s.trucoNivel === 2 ? 'Retruco' : 'Vale 4'
  return { trucoOk, envidoOk, florOk, mazoOk, jugarOk, trucoLabel }
}

/** Subidas de envido válidas dada la cadena actual. */
export function subidasEnvido(chain: EnvidoCanto[]): EnvidoCanto[] {
  const out: EnvidoCanto[] = []
  if (chain.length === 1 && chain[0] === 'envido') out.push('envido')
  if (!chain.includes('real') && !chain.includes('falta')) out.push('real')
  if (!chain.includes('falta')) out.push('falta')
  return out
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function reducir(prev: EstadoJuego, accion: Accion, actor: Equipo): EstadoJuego {
  if (prev.ganador && accion.tipo !== 'nuevaMano') return prev
  const otro = rivalDe(actor)

  switch (accion.tipo) {
    case 'nuevaMano': {
      if (!prev.resumenMano || prev.ganador) return prev
      return repartir({
        conFlor: prev.conFlor,
        manoNum: prev.manoNum + 1,
        manoDe: rivalDe(prev.manoDe),
        puntos: prev.puntos,
        eventoSeq: prev.eventoSeq,
      })
    }

    case 'jugarCarta': {
      if (prev.resumenMano || prev.pendiente || prev.turno !== actor) return prev
      if (!prev.cartas[actor][accion.idx]) return prev
      const s = clonar(prev)
      const carta = s.cartas[actor].splice(accion.idx, 1)[0]
      s.mesa[actor][s.bazaActual] = carta
      const cartaOtro = s.mesa[otro][s.bazaActual]
      if (!cartaOtro) {
        s.turno = otro
        return s
      }
      // Baza completa: resolver
      const res = ganadorBaza(s.mesa.p1[s.bazaActual]!, s.mesa.p2[s.bazaActual]!)
      s.bazas.push(res)
      const gm = ganadorMano(s.bazas, s.manoDe)
      if (gm) {
        finDeMano(s, gm, s.trucoNivel, 'bazas')
      } else {
        s.bazaActual += 1
        s.turno = res === 'parda' ? s.manoDe : res
      }
      return s
    }

    case 'cantarTruco': {
      if (prev.resumenMano) return prev
      // ¿Es una subida en respuesta a un truco pendiente del rival?
      if (prev.pendiente) {
        if (prev.pendiente.tipo !== 'truco' || prev.pendiente.por === actor) return prev
        if (prev.pendiente.nivel >= 4) return prev
        const s = clonar(prev)
        const pend = s.pendiente as Extract<Pendiente, { tipo: 'truco' }>
        s.trucoNivel = pend.nivel // subir implica querer el canto anterior
        const nuevoNivel = (pend.nivel + 1) as 3 | 4
        s.pendiente = { tipo: 'truco', nivel: nuevoNivel, por: actor }
        emitir(s, { tipo: 'canto', por: actor, texto: etiquetaTruco(nuevoNivel) })
        return s
      }
      // Canto nuevo en mi turno
      if (prev.turno !== actor || prev.trucoNivel >= 4) return prev
      if (prev.trucoPuedeSubir !== null && prev.trucoPuedeSubir !== actor) return prev
      const s = clonar(prev)
      const nivel = (s.trucoNivel + 1) as 2 | 3 | 4
      s.pendiente = { tipo: 'truco', nivel, por: actor }
      emitir(s, { tipo: 'canto', por: actor, texto: etiquetaTruco(nivel) })
      return s
    }

    case 'cantarEnvido': {
      if (prev.resumenMano || prev.envidoResuelto || prev.florDe) return prev
      if (prev.bazaActual !== 0) return prev
      if (prev.pendiente) {
        // Subida en respuesta a un envido pendiente del rival
        if (prev.pendiente.tipo !== 'envido' || prev.pendiente.por === actor) return prev
        if (!subidasEnvido(prev.pendiente.chain).includes(accion.canto)) return prev
        const s = clonar(prev)
        const pend = s.pendiente as Extract<Pendiente, { tipo: 'envido' }>
        s.pendiente = { tipo: 'envido', chain: [...pend.chain, accion.canto], por: actor }
        emitir(s, { tipo: 'canto', por: actor, texto: etiquetaEnvido(accion.canto) })
        return s
      }
      // Canto inicial en mi turno
      if (prev.turno !== actor) return prev
      const s = clonar(prev)
      s.pendiente = { tipo: 'envido', chain: [accion.canto], por: actor }
      emitir(s, { tipo: 'canto', por: actor, texto: etiquetaEnvido(accion.canto) })
      return s
    }

    case 'cantarFlor': {
      const disp = accionesDisponibles(prev, actor)
      if (!disp.florOk) return prev
      const s = clonar(prev)
      s.pendiente = null // la flor mata al envido pendiente
      s.florDe = actor
      s.envidoResuelto = true
      const doble = tieneFlor(s.cartasIniciales[otro])
      let ganadorFlor: Equipo = actor
      let valor = 3
      if (doble) {
        const fa = valorFlor(s.cartasIniciales[actor])
        const fo = valorFlor(s.cartasIniciales[otro])
        ganadorFlor = fa === fo ? s.manoDe : fa > fo ? actor : otro
        valor = 6
      }
      sumarPuntos(s, ganadorFlor, valor)
      emitir(s, { tipo: 'flor', por: actor, datos: { ganador: ganadorFlor, valor, doble } })
      return s
    }

    case 'responder': {
      const pend = prev.pendiente
      if (!pend || pend.por === actor || prev.resumenMano) return prev
      const s = clonar(prev)

      if (pend.tipo === 'truco') {
        if (accion.quiero) {
          s.trucoNivel = pend.nivel
          s.trucoPuedeSubir = actor // quien acepta tiene derecho a subir después
          s.pendiente = null
          emitir(s, { tipo: 'respuesta', por: actor, quiero: true })
        } else {
          s.pendiente = null
          emitir(s, { tipo: 'respuesta', por: actor, quiero: false })
          finDeMano(s, pend.por, pend.nivel - 1, 'noQuerido')
        }
        return s
      }

      // envido
      if (accion.quiero) {
        const valor = valorEnvidoChain(pend.chain, s.puntos, true)
        const e1 = envidoDe(s.cartasIniciales.p1)
        const e2 = envidoDe(s.cartasIniciales.p2)
        const ganadorEnv: Equipo = e1 === e2 ? s.manoDe : e1 > e2 ? 'p1' : 'p2'
        s.envidoResuelto = true
        s.pendiente = null
        sumarPuntos(s, ganadorEnv, valor)
        emitir(s, { tipo: 'envido', por: actor, datos: { p1: e1, p2: e2, ganador: ganadorEnv, valor } })
      } else {
        const valor = valorEnvidoChain(pend.chain, s.puntos, false)
        s.envidoResuelto = true
        s.pendiente = null
        sumarPuntos(s, pend.por, valor)
        emitir(s, { tipo: 'respuesta', por: actor, quiero: false })
      }
      return s
    }

    case 'irAlMazo': {
      if (prev.resumenMano || prev.pendiente || prev.turno !== actor) return prev
      const s = clonar(prev)
      let pts: number = s.trucoNivel
      if (s.bazaActual === 0 && !s.envidoResuelto) pts += 1 // mazo en primera sin envido: +1
      emitir(s, { tipo: 'mazo', por: actor })
      finDeMano(s, otro, pts, 'mazo')
      return s
    }

    default:
      return prev
  }
}
