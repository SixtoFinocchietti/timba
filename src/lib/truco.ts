// Lógica pura del Truco argentino — mano a mano (1v1) y parejas (2v2), a 30 puntos.
// Sin dependencias. El estado completo se serializa como jsonb en
// truco_partidas.estado_juego; todos los clientes aplican acciones con `reducir`
// y sincronizan por Supabase Realtime (control de versión optimista).
//
// Modelo: cada jugador ocupa un ASIENTO (0..n-1, en orden de juego). Los asientos
// pares son del equipo 'p1' y los impares del equipo 'p2' (en la BD: jugador1 y
// jugador3 vs jugador2 y jugador4). En 1v1 el asiento coincide con el equipo.
//
// Simplificaciones v1 (documentadas):
// - "El envido está primero" no está implementado (no se puede responder envido a un truco).
// - Flor: quien la canta primero resuelve; si el equipo rival también tiene flor se
//   comparan las mejores de cada equipo (+6), si no +3. Sin contraflor.
// - En parejas, el envido se resuelve comparando el mejor envido de cada equipo
//   (sin la ronda de "son buenas" jugador por jugador).
// - Irse al mazo lo decide cualquier jugador en su turno y arrastra a su equipo.
// - Sin señas ni muestra (truco argentino clásico, no uruguayo).

export type Palo = 'espada' | 'basto' | 'oro' | 'copa'
export type Carta = { palo: Palo; numero: number } // 1-7, 10-12
export type Equipo = 'p1' | 'p2'
export type Asiento = number // 0..numJugadores-1, en orden de juego
export type NumJugadores = 2 | 4
export type EnvidoCanto = 'envido' | 'real' | 'falta'

export type Pendiente =
  | { tipo: 'truco'; nivel: 2 | 3 | 4; por: Equipo } // valor de la mano si aceptan
  | { tipo: 'envido'; chain: EnvidoCanto[]; por: Equipo }

export type Evento =
  | { id: number; tipo: 'canto'; por: Asiento; texto: string }
  | { id: number; tipo: 'respuesta'; por: Asiento; quiero: boolean }
  | { id: number; tipo: 'envido'; por: Asiento; datos: { p1: number; p2: number; ganador: Equipo; valor: number } }
  | { id: number; tipo: 'flor'; por: Asiento; datos: { ganador: Equipo; valor: number; doble: boolean } }
  | { id: number; tipo: 'mazo'; por: Asiento }

export type RazonFinMano = 'bazas' | 'noQuerido' | 'mazo'

export type EstadoJuego = {
  conFlor: boolean
  numJugadores: NumJugadores
  manoNum: number
  manoDe: Asiento // quién es mano (reparte el anterior, juega primero) en esta mano
  turno: Asiento
  liderBaza: Asiento // quién salió en la baza actual (define el orden de juego)
  cartasIniciales: Carta[][] // por asiento
  cartas: Carta[][] // cartas que quedan en la mano, por asiento
  mesa: (Carta | null)[][] // [asiento][baza 0..2]
  bazaActual: number
  bazas: (Equipo | 'parda')[]
  puntos: Record<Equipo, number>
  trucoNivel: 1 | 2 | 3 | 4 // valor actual de la mano
  trucoPuedeSubir: Equipo | null // equipo con derecho a subir (null: nadie cantó aún)
  envidoResuelto: boolean
  florDe: Equipo | null
  pendiente: Pendiente | null
  eventoSeq: number
  evento: Evento | null
  resumenMano: { ganador: Equipo; puntos: number; razon: RazonFinMano } | null
  ganador: Equipo | null
  abandonadoPor?: Equipo
  abandonadoPorAsiento?: Asiento
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

// ─── Asientos y equipos ───────────────────────────────────────────────────────

export function equipoDe(a: Asiento): Equipo {
  return a % 2 === 0 ? 'p1' : 'p2'
}

export function rivalDe(e: Equipo): Equipo {
  return e === 'p1' ? 'p2' : 'p1'
}

export function miembrosDe(e: Equipo, n: NumJugadores): Asiento[] {
  const out: Asiento[] = []
  for (let a = e === 'p1' ? 0 : 1; a < n; a += 2) out.push(a)
  return out
}

/** Compañero de un asiento (solo tiene sentido con 4 jugadores). */
export function companeroDe(a: Asiento, n: NumJugadores): Asiento | null {
  return n === 4 ? (a + 2) % 4 : null
}

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

/** Mejor envido entre los miembros del equipo (con sus cartas iniciales). */
function mejorEnvidoEquipo(s: EstadoJuego, e: Equipo): number {
  return Math.max(...miembrosDe(e, s.numJugadores).map(a => envidoDe(s.cartasIniciales[a])))
}

// ─── Reparto ──────────────────────────────────────────────────────────────────

function repartir(base: {
  conFlor: boolean; numJugadores: NumJugadores; manoNum: number; manoDe: Asiento
  puntos: Record<Equipo, number>; eventoSeq: number
}): EstadoJuego {
  const mazo = mezclar(mazoCompleto())
  const n = base.numJugadores
  const manos: Carta[][] = []
  for (let a = 0; a < n; a++) manos.push(mazo.slice(a * 3, a * 3 + 3))
  return {
    conFlor: base.conFlor,
    numJugadores: n,
    manoNum: base.manoNum,
    manoDe: base.manoDe,
    turno: base.manoDe,
    liderBaza: base.manoDe,
    cartasIniciales: manos,
    cartas: manos.map(m => [...m]),
    mesa: manos.map(() => [null, null, null]),
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

export function estadoInicial(conFlor: boolean, numJugadores: NumJugadores = 2): EstadoJuego {
  return repartir({ conFlor, numJugadores, manoNum: 0, manoDe: 0, puntos: { p1: 0, p2: 0 }, eventoSeq: 0 })
}

// ─── Compatibilidad con estados viejos (formato 1v1 con records p1/p2) ────────

/** Convierte estados guardados antes del modo parejas (cartas/mesa como {p1,p2}). */
export function normalizarEstado(raw: unknown): EstadoJuego {
  const r = raw as any
  if (Array.isArray(r.cartas)) return r as EstadoJuego
  const seat = (e: 'p1' | 'p2'): Asiento => (e === 'p1' ? 0 : 1)
  return {
    conFlor: r.conFlor,
    numJugadores: 2,
    manoNum: r.manoNum,
    manoDe: seat(r.manoDe),
    turno: seat(r.turno),
    liderBaza: seat(r.manoDe),
    cartasIniciales: [r.cartasIniciales.p1, r.cartasIniciales.p2],
    cartas: [r.cartas.p1, r.cartas.p2],
    mesa: [r.mesa.p1, r.mesa.p2],
    bazaActual: r.bazaActual,
    bazas: r.bazas,
    puntos: r.puntos,
    trucoNivel: r.trucoNivel,
    trucoPuedeSubir: r.trucoPuedeSubir,
    envidoResuelto: r.envidoResuelto,
    florDe: r.florDe,
    pendiente: r.pendiente,
    eventoSeq: r.eventoSeq,
    evento: r.evento ? { ...r.evento, por: seat(r.evento.por) } : null,
    resumenMano: r.resumenMano,
    ganador: r.ganador,
    abandonadoPor: r.abandonadoPor,
    abandonadoPorAsiento: r.abandonadoPor ? seat(r.abandonadoPor) : undefined,
  }
}

// ─── Resolución de bazas y mano ───────────────────────────────────────────────

/**
 * Resuelve la baza con las cartas de todos los asientos.
 * Parda solo si las cartas más altas son de equipos distintos; si empatan dos
 * del mismo equipo, gana ese equipo y sale el que jugó primero (orden desde el líder).
 */
function resolverBaza(
  cartasBaza: Carta[], lider: Asiento, n: NumJugadores,
): { resultado: Equipo | 'parda'; sale: Asiento | null } {
  const jer = cartasBaza.map(jerarquia)
  const max = Math.max(...jer)
  const ganadores: Asiento[] = []
  for (let a = 0; a < n; a++) if (jer[a] === max) ganadores.push(a)
  const equipos = new Set(ganadores.map(equipoDe))
  if (equipos.size > 1) return { resultado: 'parda', sale: null }
  // Sale el ganador que jugó primero en el orden de la baza
  const orden = (a: Asiento) => (a - lider + n) % n
  const sale = ganadores.reduce((mejor, a) => (orden(a) < orden(mejor) ? a : mejor))
  return { resultado: equipoDe(sale), sale }
}

/** Ganador de la mano según bazas jugadas (null si aún no se define). */
export function ganadorMano(bazas: (Equipo | 'parda')[], equipoMano: Equipo): Equipo | null {
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
    return b3 === 'parda' ? equipoMano : b3 // todas pardas: gana el equipo mano
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

export function accionesDisponibles(s: EstadoJuego, yo: Asiento) {
  const miEquipo = equipoDe(yo)
  const bloqueado = !!(s.resumenMano || s.pendiente || s.ganador)
  const miTurno = s.turno === yo
  const trucoOk = !bloqueado && miTurno && s.trucoNivel < 4
    && (s.trucoPuedeSubir === null || s.trucoPuedeSubir === miEquipo)
  const envidoOk = !bloqueado && miTurno && s.bazaActual === 0
    && !s.envidoResuelto && s.florDe === null
  const florBase = s.conFlor && !s.ganador && !s.resumenMano && s.bazaActual === 0
    && s.florDe === null && !s.envidoResuelto && tieneFlor(s.cartasIniciales[yo])
  const florOk = florBase && (
    s.pendiente === null
      ? miTurno
      : s.pendiente.tipo === 'envido' && s.pendiente.por !== miEquipo // flor mata envido
  )
  const mazoOk = !bloqueado && miTurno
  const jugarOk = !bloqueado && miTurno
  const responderOk = !s.resumenMano && !s.ganador && !!s.pendiente && s.pendiente.por !== miEquipo
  const trucoLabel = s.trucoNivel === 1 ? 'Truco' : s.trucoNivel === 2 ? 'Retruco' : 'Vale 4'
  return { trucoOk, envidoOk, florOk, mazoOk, jugarOk, responderOk, trucoLabel }
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

export function reducir(prev: EstadoJuego, accion: Accion, actor: Asiento): EstadoJuego {
  if (prev.ganador && accion.tipo !== 'nuevaMano') return prev
  if (actor < 0 || actor >= prev.numJugadores) return prev
  const n = prev.numJugadores
  const miEquipo = equipoDe(actor)
  const otroEquipo = rivalDe(miEquipo)

  switch (accion.tipo) {
    case 'nuevaMano': {
      if (!prev.resumenMano || prev.ganador) return prev
      return repartir({
        conFlor: prev.conFlor,
        numJugadores: n,
        manoNum: prev.manoNum + 1,
        manoDe: (prev.manoDe + 1) % n,
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
      const jugadas = s.mesa.filter(m => m[s.bazaActual]).length
      if (jugadas < n) {
        s.turno = (actor + 1) % n
        return s
      }
      // Baza completa: resolver
      const cartasBaza = s.mesa.map(m => m[s.bazaActual]!)
      const { resultado, sale } = resolverBaza(cartasBaza, s.liderBaza, n)
      s.bazas.push(resultado)
      const gm = ganadorMano(s.bazas, equipoDe(s.manoDe))
      if (gm) {
        finDeMano(s, gm, s.trucoNivel, 'bazas')
      } else {
        s.bazaActual += 1
        const lider = resultado === 'parda' || sale === null ? s.manoDe : sale
        s.turno = lider
        s.liderBaza = lider
      }
      return s
    }

    case 'cantarTruco': {
      if (prev.resumenMano) return prev
      // ¿Es una subida en respuesta a un truco pendiente del equipo rival?
      if (prev.pendiente) {
        if (prev.pendiente.tipo !== 'truco' || prev.pendiente.por === miEquipo) return prev
        if (prev.pendiente.nivel >= 4) return prev
        const s = clonar(prev)
        const pend = s.pendiente as Extract<Pendiente, { tipo: 'truco' }>
        s.trucoNivel = pend.nivel // subir implica querer el canto anterior
        const nuevoNivel = (pend.nivel + 1) as 3 | 4
        s.pendiente = { tipo: 'truco', nivel: nuevoNivel, por: miEquipo }
        emitir(s, { tipo: 'canto', por: actor, texto: etiquetaTruco(nuevoNivel) })
        return s
      }
      // Canto nuevo en mi turno
      if (prev.turno !== actor || prev.trucoNivel >= 4) return prev
      if (prev.trucoPuedeSubir !== null && prev.trucoPuedeSubir !== miEquipo) return prev
      const s = clonar(prev)
      const nivel = (s.trucoNivel + 1) as 2 | 3 | 4
      s.pendiente = { tipo: 'truco', nivel, por: miEquipo }
      emitir(s, { tipo: 'canto', por: actor, texto: etiquetaTruco(nivel) })
      return s
    }

    case 'cantarEnvido': {
      if (prev.resumenMano || prev.envidoResuelto || prev.florDe) return prev
      if (prev.bazaActual !== 0) return prev
      if (prev.pendiente) {
        // Subida en respuesta a un envido pendiente del equipo rival
        if (prev.pendiente.tipo !== 'envido' || prev.pendiente.por === miEquipo) return prev
        if (!subidasEnvido(prev.pendiente.chain).includes(accion.canto)) return prev
        const s = clonar(prev)
        const pend = s.pendiente as Extract<Pendiente, { tipo: 'envido' }>
        s.pendiente = { tipo: 'envido', chain: [...pend.chain, accion.canto], por: miEquipo }
        emitir(s, { tipo: 'canto', por: actor, texto: etiquetaEnvido(accion.canto) })
        return s
      }
      // Canto inicial en mi turno
      if (prev.turno !== actor) return prev
      const s = clonar(prev)
      s.pendiente = { tipo: 'envido', chain: [accion.canto], por: miEquipo }
      emitir(s, { tipo: 'canto', por: actor, texto: etiquetaEnvido(accion.canto) })
      return s
    }

    case 'cantarFlor': {
      const disp = accionesDisponibles(prev, actor)
      if (!disp.florOk) return prev
      const s = clonar(prev)
      s.pendiente = null // la flor mata al envido pendiente
      s.florDe = miEquipo
      s.envidoResuelto = true
      const floresMias = miembrosDe(miEquipo, n)
        .map(a => s.cartasIniciales[a]).filter(tieneFlor)
      const floresRival = miembrosDe(otroEquipo, n)
        .map(a => s.cartasIniciales[a]).filter(tieneFlor)
      const doble = floresRival.length > 0
      let ganadorFlor: Equipo = miEquipo
      let valor = 3
      if (doble) {
        const fMia = Math.max(...floresMias.map(valorFlor))
        const fRival = Math.max(...floresRival.map(valorFlor))
        ganadorFlor = fMia === fRival ? equipoDe(s.manoDe) : fMia > fRival ? miEquipo : otroEquipo
        valor = 6
      }
      sumarPuntos(s, ganadorFlor, valor)
      emitir(s, { tipo: 'flor', por: actor, datos: { ganador: ganadorFlor, valor, doble } })
      return s
    }

    case 'responder': {
      const pend = prev.pendiente
      if (!pend || pend.por === miEquipo || prev.resumenMano) return prev
      const s = clonar(prev)

      if (pend.tipo === 'truco') {
        if (accion.quiero) {
          s.trucoNivel = pend.nivel
          s.trucoPuedeSubir = miEquipo // el equipo que acepta tiene derecho a subir después
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
        const e1 = mejorEnvidoEquipo(s, 'p1')
        const e2 = mejorEnvidoEquipo(s, 'p2')
        const ganadorEnv: Equipo = e1 === e2 ? equipoDe(s.manoDe) : e1 > e2 ? 'p1' : 'p2'
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
      finDeMano(s, otroEquipo, pts, 'mazo')
      return s
    }

    default:
      return prev
  }
}
