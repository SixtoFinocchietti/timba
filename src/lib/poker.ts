// ─── Tipos ────────────────────────────────────────────────────────────────────

export type Palo = 'S' | 'H' | 'D' | 'C'
export type Valor = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A'
export type Carta = string   // formato 'Palo-Valor', ej. 'S-A', 'H-10'

export type FaseJuego = 'pre_flop' | 'flop' | 'turn' | 'river' | 'showdown'
export type TurnoJuego = 'host' | 'invitado'
export type GanadorJuego = 'host' | 'invitado' | 'empate' | null

export interface PartidaPoker {
  id: string
  host_id: string
  invitado_id: string
  mazo: Carta[]
  cartas_host: Carta[]
  cartas_invitado: Carta[]
  comunitarias: Carta[]
  fase: FaseJuego
  turno: TurnoJuego
  bote: number
  apuesta_actual: number
  fichas_host: number
  fichas_invitado: number
  apuesta_fase_host: number
  apuesta_fase_invitado: number
  actuo_host: boolean
  actuo_invitado: boolean
  ganador: GanadorJuego
  manos_mostradas: boolean
  fichas_iniciales: number
  // true = el host paga la small blind esta mano; se alterna en cada mano nueva
  sb_es_host: boolean
}

// ─── Mazo ─────────────────────────────────────────────────────────────────────

const PALOS: Palo[] = ['S', 'H', 'D', 'C']
const VALORES: Valor[] = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']

export function crearMazo(): Carta[] {
  return PALOS.flatMap(p => VALORES.map(v => `${p}-${v}`))
}

export function mezclar<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Evaluación de manos ──────────────────────────────────────────────────────

const NUM: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
}

function parsear(carta: Carta): { palo: string; num: number } {
  const idx = carta.indexOf('-')
  return { palo: carta.slice(0, idx), num: NUM[carta.slice(idx + 1)] }
}

export interface RangoMano {
  rango: number      // 0 (carta alta) … 8 (escalera de color)
  kickers: number[]  // desempate
  nombre: string
}

function evaluar5(cartas: Carta[]): RangoMano {
  const p = cartas.map(parsear)
  const nums = p.map(c => c.num).sort((a, b) => b - a)
  const palos = p.map(c => c.palo)
  const esFlush = palos.every(x => x === palos[0])

  function straightAlto(ns: number[]): number | null {
    const uniq = [...new Set(ns)].sort((a, b) => b - a)
    for (let i = 0; i <= uniq.length - 5; i++) {
      if (uniq[i] - uniq[i + 4] === 4) return uniq[i]
    }
    // rueda A-2-3-4-5
    if (uniq.includes(14) && [2,3,4,5].every(x => uniq.includes(x))) return 5
    return null
  }

  const alto = straightAlto(nums)

  if (esFlush && alto !== null) {
    return { rango: 8, kickers: [alto], nombre: alto === 14 ? 'Escalera Real' : 'Escalera de Color' }
  }

  // frecuencias
  const freq: Record<number, number> = {}
  nums.forEach(n => { freq[n] = (freq[n] ?? 0) + 1 })
  const grupos = Object.entries(freq)
    .map(([n, c]) => ({ n: +n, c }))
    .sort((a, b) => b.c - a.c || b.n - a.n)

  if (grupos[0].c === 4)
    return { rango: 7, kickers: [grupos[0].n, grupos[1].n], nombre: 'Póker' }
  if (grupos[0].c === 3 && grupos[1]?.c === 2)
    return { rango: 6, kickers: [grupos[0].n, grupos[1].n], nombre: 'Full House' }
  if (esFlush)
    return { rango: 5, kickers: nums.slice(0, 5), nombre: 'Color' }
  if (alto !== null)
    return { rango: 4, kickers: [alto], nombre: 'Escalera' }
  if (grupos[0].c === 3)
    return { rango: 3, kickers: grupos.map(g => g.n).slice(0, 3), nombre: 'Trío' }
  if (grupos[0].c === 2 && grupos[1]?.c === 2)
    return { rango: 2, kickers: grupos.map(g => g.n).slice(0, 3), nombre: 'Doble Par' }
  if (grupos[0].c === 2)
    return { rango: 1, kickers: grupos.map(g => g.n).slice(0, 4), nombre: 'Par' }
  return { rango: 0, kickers: nums.slice(0, 5), nombre: 'Carta Alta' }
}

function combinar5de(cartas: Carta[]): Carta[][] {
  const res: Carta[][] = []
  const n = cartas.length
  for (let a = 0; a < n - 4; a++)
    for (let b = a+1; b < n - 3; b++)
      for (let c = b+1; c < n - 2; c++)
        for (let d = c+1; d < n - 1; d++)
          for (let e = d+1; e < n; e++)
            res.push([cartas[a], cartas[b], cartas[c], cartas[d], cartas[e]])
  return res
}

export function mejorMano(cartas: Carta[]): RangoMano {
  if (cartas.length <= 5) return evaluar5(cartas)
  return combinar5de(cartas)
    .map(evaluar5)
    .sort((a, b) => {
      if (a.rango !== b.rango) return b.rango - a.rango
      for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) {
        const diff = (b.kickers[i] ?? 0) - (a.kickers[i] ?? 0)
        if (diff) return diff
      }
      return 0
    })[0]
}

export function compararManos(a: RangoMano, b: RangoMano): 'A' | 'B' | 'empate' {
  if (a.rango !== b.rango) return a.rango > b.rango ? 'A' : 'B'
  for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) {
    const diff = (a.kickers[i] ?? 0) - (b.kickers[i] ?? 0)
    if (diff) return diff > 0 ? 'A' : 'B'
  }
  return 'empate'
}

// ─── Estado inicial de una mano ───────────────────────────────────────────────

export const SB = 25   // small blind
export const BB = 50   // big blind

/** Devuelve el estado completo para insertar en Supabase al empezar una partida */
export function estadoInicial(
  fichasIniciales: number,
): Omit<PartidaPoker, 'id' | 'host_id' | 'invitado_id'> {
  // Primera mano: host = SB. Las siguientes manos alternan (ver nuevaMano).
  return {
    ...nuevaMano(fichasIniciales, fichasIniciales, true),
    fichas_iniciales: fichasIniciales,
  }
}

/** Calcula el siguiente estado tras una acción */
export function aplicarAccion(
  p: PartidaPoker,
  quien: TurnoJuego,
  accion: 'check' | 'call' | 'fold' | 'raise',
  subirA?: number,   // solo para raise: apuesta_actual nueva
): Partial<PartidaPoker> {
  const rival: TurnoJuego = quien === 'host' ? 'invitado' : 'host'
  const misChips  = quien === 'host' ? p.fichas_host : p.fichas_invitado
  const miApuesta = quien === 'host' ? p.apuesta_fase_host : p.apuesta_fase_invitado

  if (accion === 'fold') {
    const fichas_host     = quien === 'host' ? p.fichas_host : p.fichas_host + p.bote
    const fichas_invitado = quien === 'invitado' ? p.fichas_invitado : p.fichas_invitado + p.bote
    return { ganador: rival, manos_mostradas: true, fichas_host, fichas_invitado }
  }

  let nuevasChips = misChips
  let nuevaBote = p.bote
  let nuevaApuestaActual = p.apuesta_actual
  let nuevaMiApuesta = miApuesta

  if (accion === 'call') {
    const debo = p.apuesta_actual - miApuesta
    const pago = Math.min(debo, misChips)
    nuevasChips = misChips - pago
    nuevaBote = p.bote + pago
    nuevaMiApuesta = miApuesta + pago
  } else if (accion === 'raise' && subirA !== undefined) {
    const debo = subirA - miApuesta
    const pago = Math.min(debo, misChips)
    nuevasChips = misChips - pago
    nuevaBote = p.bote + pago
    nuevaApuestaActual = subirA
    nuevaMiApuesta = miApuesta + pago
  }
  // check: no cambia chips

  const nuevoActuo = true

  const hostActuo     = quien === 'host' ? nuevoActuo : p.actuo_host
  const invitActuo    = quien === 'invitado' ? nuevoActuo : p.actuo_invitado
  const hostApuesta   = quien === 'host' ? nuevaMiApuesta : p.apuesta_fase_host
  const invApuesta    = quien === 'invitado' ? nuevaMiApuesta : p.apuesta_fase_invitado
  const fichasHost    = quien === 'host' ? nuevasChips : p.fichas_host
  const fichasInv     = quien === 'invitado' ? nuevasChips : p.fichas_invitado

  const amboActuaron  = hostActuo && invitActuo
  const apuestasIguales = hostApuesta === invApuesta

  if (accion === 'raise') {
    // El rival debe actuar de nuevo
    return {
      fichas_host: fichasHost, fichas_invitado: fichasInv,
      bote: nuevaBote, apuesta_actual: nuevaApuestaActual,
      apuesta_fase_host: hostApuesta, apuesta_fase_invitado: invApuesta,
      actuo_host: hostActuo, actuo_invitado: invitActuo,
      turno: rival,
    }
  }

  // Bug fix: all-in call — si el que llama se quedó sin fichas, la apuesta
  // nunca va a igualar (quedó short), pero la acción está completa
  const callerWentAllIn = accion === 'call' && nuevasChips === 0

  if (amboActuaron && (apuestasIguales || callerWentAllIn)) {
    return avanzarFase({ ...p,
      fichas_host: fichasHost, fichas_invitado: fichasInv,
      bote: nuevaBote, apuesta_actual: nuevaApuestaActual,
      apuesta_fase_host: hostApuesta, apuesta_fase_invitado: invApuesta,
    })
  }

  return {
    fichas_host: fichasHost, fichas_invitado: fichasInv,
    bote: nuevaBote, apuesta_actual: nuevaApuestaActual,
    apuesta_fase_host: hostApuesta, apuesta_fase_invitado: invApuesta,
    actuo_host: hostActuo, actuo_invitado: invitActuo,
    turno: rival,
  }
}

function avanzarFase(p: PartidaPoker): Partial<PartidaPoker> {
  const mazo = [...p.mazo]

  const base = {
    apuesta_actual: 0,
    apuesta_fase_host: 0, apuesta_fase_invitado: 0,
    actuo_host: false, actuo_invitado: false,
    // Post-flop actúa primero la big blind (el que NO es SB)
    turno: (p.sb_es_host ? 'invitado' : 'host') as TurnoJuego,
  }

  if (p.fase === 'pre_flop') {
    const comunitarias = mazo.splice(0, 3)
    return { ...base, fase: 'flop', mazo, comunitarias }
  }
  if (p.fase === 'flop') {
    const comunitarias = [...p.comunitarias, ...mazo.splice(0, 1)]
    return { ...base, fase: 'turn', mazo, comunitarias }
  }
  if (p.fase === 'turn') {
    const comunitarias = [...p.comunitarias, ...mazo.splice(0, 1)]
    return { ...base, fase: 'river', mazo, comunitarias }
  }
  if (p.fase === 'river') {
    // Showdown: evaluar y determinar ganador
    const manoHost = mejorMano([...p.cartas_host, ...p.comunitarias])
    const manoInv  = mejorMano([...p.cartas_invitado, ...p.comunitarias])
    const resultado = compararManos(manoHost, manoInv)
    const ganador: GanadorJuego = resultado === 'A' ? 'host' : resultado === 'B' ? 'invitado' : 'empate'
    const mitad = Math.floor(p.bote / 2)
    // En empate con bote impar, la ficha sobrante va a la small blind (regla estándar)
    const mitadHost = p.sb_es_host ? p.bote - mitad : mitad
    const mitadInv  = p.sb_es_host ? mitad : p.bote - mitad
    const fichas_host     = ganador === 'host' ? p.fichas_host + p.bote : ganador === 'empate' ? p.fichas_host + mitadHost : p.fichas_host
    const fichas_invitado = ganador === 'invitado' ? p.fichas_invitado + p.bote : ganador === 'empate' ? p.fichas_invitado + mitadInv : p.fichas_invitado
    return { fase: 'showdown', ganador, manos_mostradas: true, fichas_host, fichas_invitado }
  }
  return {}
}

/** Estado para empezar una mano nueva (mantiene fichas acumuladas).
 *  sbEsHost indica quién paga la small blind esta mano — alternar en cada mano. */
export function nuevaMano(
  fichasHost: number,
  fichasInvitado: number,
  sbEsHost: boolean,
): Omit<PartidaPoker, 'id' | 'host_id' | 'invitado_id' | 'fichas_iniciales'> {
  const mazo = mezclar(crearMazo())
  const cartas_host = mazo.splice(0, 2)
  const cartas_invitado = mazo.splice(0, 2)
  // Caps para jugadores que no tienen suficientes fichas para el blind completo
  const sbPago = Math.min(SB, sbEsHost ? fichasHost : fichasInvitado)
  const bbPago = Math.min(BB, sbEsHost ? fichasInvitado : fichasHost)
  const apuestaHost = sbEsHost ? sbPago : bbPago
  const apuestaInv  = sbEsHost ? bbPago : sbPago
  return {
    mazo, cartas_host, cartas_invitado, comunitarias: [],
    fase: 'pre_flop',
    turno: sbEsHost ? 'host' : 'invitado',   // la SB actúa primero en pre-flop
    bote: sbPago + bbPago,
    apuesta_actual: bbPago,
    fichas_host: fichasHost - apuestaHost,
    fichas_invitado: fichasInvitado - apuestaInv,
    apuesta_fase_host: apuestaHost,
    apuesta_fase_invitado: apuestaInv,
    actuo_host: false, actuo_invitado: false,
    ganador: null, manos_mostradas: false,
    sb_es_host: sbEsHost,
  }
}
