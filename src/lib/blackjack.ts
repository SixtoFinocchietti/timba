import { Carta, crearMazo, mezclar } from '@/lib/poker'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type FaseBlackjack = 'apuesta' | 'jugador' | 'resultado'
export type GanadorMano = 'jugador' | 'banca' | 'empate' | null
// Detalle del resultado para mostrar en la UI
export type ResultadoMano =
  | 'blackjack'          // el jugador ganó con blackjack natural (paga 3:2)
  | 'blackjack_banca'    // la banca tenía blackjack natural
  | 'blackjack_empate'   // ambos con blackjack natural
  | 'paso_jugador'       // el jugador se pasó de 21
  | 'paso_banca'         // la banca se pasó de 21
  | 'mayor_jugador'      // el jugador quedó más cerca de 21
  | 'mayor_banca'        // la banca quedó más cerca de 21
  | 'empate'             // mismo total
  | null

export interface PartidaBlackjack {
  id: string
  host_id: string
  invitado_id: string
  mazo: Carta[]
  cartas_jugador: Carta[]
  cartas_banca: Carta[]
  // true = el host es la banca esta mano; se alterna en cada mano nueva
  banca_es_host: boolean
  fase: FaseBlackjack
  apuesta: number
  doblada: boolean
  fichas_host: number
  fichas_invitado: number
  ganador: GanadorMano
  resultado: ResultadoMano
  fichas_iniciales: number
}

// ─── Valor de la mano ─────────────────────────────────────────────────────────

const VALOR_BJ: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 10, 'Q': 10, 'K': 10, 'A': 11,
}

/** Total de la mano. Los ases valen 11, pero bajan a 1 si la mano se pasa.
 *  esBlando = hay un as contando como 11 (mano "blanda"). */
export function valorMano(cartas: Carta[]): { total: number; esBlando: boolean } {
  let total = 0
  let ases = 0
  for (const carta of cartas) {
    const valor = carta.slice(carta.indexOf('-') + 1)
    total += VALOR_BJ[valor] ?? 0
    if (valor === 'A') ases++
  }
  while (total > 21 && ases > 0) {
    total -= 10
    ases--
  }
  return { total, esBlando: ases > 0 }
}

/** Blackjack natural: 21 con las dos cartas iniciales */
export function esBlackjack(cartas: Carta[]): boolean {
  return cartas.length === 2 && valorMano(cartas).total === 21
}

// ─── Fichas por rol ───────────────────────────────────────────────────────────

export function fichasDeBanca(p: PartidaBlackjack): number {
  return p.banca_es_host ? p.fichas_host : p.fichas_invitado
}

export function fichasDeJugador(p: PartidaBlackjack): number {
  return p.banca_es_host ? p.fichas_invitado : p.fichas_host
}

/** La apuesta no puede superar lo que tiene el jugador ni lo que la banca puede pagar */
export function apuestaMaxima(p: PartidaBlackjack): number {
  return Math.min(fichasDeJugador(p), fichasDeBanca(p))
}

// ─── Estado inicial / mano nueva ──────────────────────────────────────────────

/** Estado para empezar una mano nueva (mantiene fichas acumuladas).
 *  Las cartas se reparten recién cuando el jugador apuesta. */
export function nuevaMano(
  fichasHost: number,
  fichasInvitado: number,
  bancaEsHost: boolean,
): Omit<PartidaBlackjack, 'id' | 'host_id' | 'invitado_id' | 'fichas_iniciales'> {
  return {
    mazo: mezclar(crearMazo()),
    cartas_jugador: [],
    cartas_banca: [],
    banca_es_host: bancaEsHost,
    fase: 'apuesta',
    apuesta: 0,
    doblada: false,
    fichas_host: fichasHost,
    fichas_invitado: fichasInvitado,
    ganador: null,
    resultado: null,
  }
}

/** Devuelve el estado completo para insertar en Supabase al empezar una partida */
export function estadoInicial(
  fichasIniciales: number,
): Omit<PartidaBlackjack, 'id' | 'host_id' | 'invitado_id'> {
  // Primera mano: el host reparte (es la banca). Las siguientes alternan.
  return {
    ...nuevaMano(fichasIniciales, fichasIniciales, true),
    fichas_iniciales: fichasIniciales,
  }
}

// ─── Resolución de la mano ────────────────────────────────────────────────────

/** Aplica el pago al terminar la mano y arma el estado final.
 *  Las fichas nunca quedan negativas: la ganancia se limita a lo que
 *  el que pierde puede pagar (igual que un all-in). */
function resolver(
  p: PartidaBlackjack,
  cartasJugador: Carta[],
  cartasBanca: Carta[],
  mazo: Carta[],
  apuesta: number,
  ganador: Exclude<GanadorMano, null>,
  resultado: ResultadoMano,
): Partial<PartidaBlackjack> {
  const fichasBanca = fichasDeBanca(p)
  const fichasJugador = fichasDeJugador(p)

  let delta = 0   // lo que gana el jugador (negativo si pierde)
  if (ganador === 'jugador') {
    const ganancia = resultado === 'blackjack' ? Math.floor(apuesta * 1.5) : apuesta
    delta = Math.min(ganancia, fichasBanca)
  } else if (ganador === 'banca') {
    delta = -Math.min(apuesta, fichasJugador)
  }

  const nuevasJugador = fichasJugador + delta
  const nuevasBanca = fichasBanca - delta

  return {
    mazo,
    cartas_jugador: cartasJugador,
    cartas_banca: cartasBanca,
    apuesta,
    fase: 'resultado',
    ganador,
    resultado,
    fichas_host: p.banca_es_host ? nuevasBanca : nuevasJugador,
    fichas_invitado: p.banca_es_host ? nuevasJugador : nuevasBanca,
  }
}

/** La banca juega automática: pide hasta llegar a 17 o más (se planta en 17,
 *  incluso blando) y se compara contra el total del jugador. */
function jugarBanca(
  p: PartidaBlackjack,
  cartasJugador: Carta[],
  mazo: Carta[],
  apuesta: number,
): Partial<PartidaBlackjack> {
  const cartasBanca = [...p.cartas_banca]
  const mazoRestante = [...mazo]
  while (valorMano(cartasBanca).total < 17 && mazoRestante.length > 0) {
    cartasBanca.push(mazoRestante.shift()!)
  }

  const totalBanca = valorMano(cartasBanca).total
  const totalJugador = valorMano(cartasJugador).total

  if (totalBanca > 21)
    return resolver(p, cartasJugador, cartasBanca, mazoRestante, apuesta, 'jugador', 'paso_banca')
  if (totalJugador > totalBanca)
    return resolver(p, cartasJugador, cartasBanca, mazoRestante, apuesta, 'jugador', 'mayor_jugador')
  if (totalBanca > totalJugador)
    return resolver(p, cartasJugador, cartasBanca, mazoRestante, apuesta, 'banca', 'mayor_banca')
  return resolver(p, cartasJugador, cartasBanca, mazoRestante, apuesta, 'empate', 'empate')
}

// ─── Acciones del jugador ─────────────────────────────────────────────────────

/** El jugador apuesta y se reparten las cartas (jugador y banca reciben dos).
 *  Si alguno tiene blackjack natural la mano se resuelve al instante. */
export function apostar(p: PartidaBlackjack, apuesta: number): Partial<PartidaBlackjack> {
  const monto = Math.max(1, Math.min(apuesta, apuestaMaxima(p)))
  const mazo = [...p.mazo]
  const cartasJugador = [mazo.shift()!, mazo.shift()!]
  const cartasBanca = [mazo.shift()!, mazo.shift()!]

  const bjJugador = esBlackjack(cartasJugador)
  const bjBanca = esBlackjack(cartasBanca)

  if (bjJugador && bjBanca)
    return resolver(p, cartasJugador, cartasBanca, mazo, monto, 'empate', 'blackjack_empate')
  if (bjJugador)
    return resolver(p, cartasJugador, cartasBanca, mazo, monto, 'jugador', 'blackjack')
  if (bjBanca)
    return resolver(p, cartasJugador, cartasBanca, mazo, monto, 'banca', 'blackjack_banca')

  return {
    mazo,
    cartas_jugador: cartasJugador,
    cartas_banca: cartasBanca,
    apuesta: monto,
    fase: 'jugador',
  }
}

/** Pedir una carta. Si el jugador se pasa de 21, pierde al instante. */
export function pedir(p: PartidaBlackjack): Partial<PartidaBlackjack> {
  const mazo = [...p.mazo]
  const cartasJugador = [...p.cartas_jugador, mazo.shift()!]

  if (valorMano(cartasJugador).total > 21)
    return resolver(p, cartasJugador, p.cartas_banca, mazo, p.apuesta, 'banca', 'paso_jugador')

  return { mazo, cartas_jugador: cartasJugador }
}

/** Plantarse: le toca jugar a la banca. */
export function plantarse(p: PartidaBlackjack): Partial<PartidaBlackjack> {
  return jugarBanca(p, p.cartas_jugador, p.mazo, p.apuesta)
}

/** Doblar: solo con las dos cartas iniciales y fichas suficientes.
 *  La apuesta se duplica, se recibe UNA carta y se planta automáticamente. */
export function puedeDoblar(p: PartidaBlackjack): boolean {
  return p.fase === 'jugador'
    && p.cartas_jugador.length === 2
    && fichasDeJugador(p) >= p.apuesta * 2
    && fichasDeBanca(p) >= p.apuesta * 2
}

export function doblar(p: PartidaBlackjack): Partial<PartidaBlackjack> {
  const mazo = [...p.mazo]
  const cartasJugador = [...p.cartas_jugador, mazo.shift()!]
  const apuestaDoble = p.apuesta * 2

  if (valorMano(cartasJugador).total > 21) {
    return {
      ...resolver(p, cartasJugador, p.cartas_banca, mazo, apuestaDoble, 'banca', 'paso_jugador'),
      doblada: true,
    }
  }
  return { ...jugarBanca(p, cartasJugador, mazo, apuestaDoble), doblada: true }
}

// ─── Textos para la UI ────────────────────────────────────────────────────────

export const RESULTADO_LABELS: Record<Exclude<ResultadoMano, null>, string> = {
  blackjack: '¡Blackjack! Paga 3:2',
  blackjack_banca: 'La banca tenía Blackjack',
  blackjack_empate: 'Doble Blackjack — empate',
  paso_jugador: 'El jugador se pasó de 21',
  paso_banca: 'La banca se pasó de 21',
  mayor_jugador: 'El jugador quedó más cerca de 21',
  mayor_banca: 'La banca quedó más cerca de 21',
  empate: 'Empate — la apuesta se devuelve',
}
