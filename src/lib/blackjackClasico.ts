// Blackjack Clásico — con dealer (Bot) y dos jugadores compitiendo por la corona.
//
// Modelo "blackjack real + corona" (decidido con el usuario):
//  · Cada jugador juega su mano contra el DEALER con pagos estándar
//    (le ganás/dealer se pasa → 1:1, blackjack natural → 3:2, empate → push).
//    Pueden ganar o perder los dos: es independiente entre jugadores.
//  · CORONA (opcional): entre los dos jugadores, el de mejor mano (más cerca de
//    21 sin pasarse; el blackjack natural desempata) se lleva un bonus = un
//    porcentaje de SU apuesta, que le paga el rival. Es una transferencia entre
//    jugadores; no afecta el juego contra la banca.
//
// Este archivo es el modo LOCAL (humano vs Bot vs dealer). Los helpers puros
// (resolverVsDealer, ganadorCorona, jugarDealer, botPide) se reutilizan luego
// para la versión online (vs amigo).

import { Carta, crearMazo, mezclar } from '@/lib/poker'
import { valorMano, esBlackjack } from '@/lib/blackjack'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type FaseClasico = 'apuesta' | 'turno_humano' | 'resultado'
export type OutcomeDealer = 'blackjack' | 'gana' | 'push' | 'pierde'

export interface ResultadoJugador {
  outcome: OutcomeDealer
  delta: number // fichas ganadas/perdidas contra el dealer (antes de la corona)
}

export interface EstadoClasico {
  mazo: Carta[]
  cartasHumano: Carta[]
  cartasBot: Carta[]
  cartasDealer: Carta[]
  apuesta: number // apuesta de la mano (el bot iguala)
  dobladaHumano: boolean
  dobladaBot: boolean
  fase: FaseClasico
  fichasHumano: number
  fichasBot: number
  fichasIniciales: number
  coronaActiva: boolean
  coronaPct: number
  mano: number
  // resultado (se completa en la fase 'resultado')
  resHumano: ResultadoJugador | null
  resBot: ResultadoJugador | null
  coronaGanador: 'humano' | 'bot' | null
  coronaBonus: number
}

// ─── Helpers puros (reutilizables en el modo online) ──────────────────────────

/** Liquida una mano contra el dealer con pagos estándar de blackjack. */
export function resolverVsDealer(
  mano: Carta[],
  dealer: Carta[],
  apuesta: number,
  doblada: boolean,
): ResultadoJugador {
  const total = valorMano(mano).total
  const totalDealer = valorMano(dealer).total
  const monto = doblada ? apuesta * 2 : apuesta

  if (total > 21) return { outcome: 'pierde', delta: -monto }

  const bj = esBlackjack(mano)
  const bjDealer = esBlackjack(dealer)
  if (bj && !bjDealer) return { outcome: 'blackjack', delta: Math.floor(apuesta * 1.5) } // 3:2
  if (bjDealer && !bj) return { outcome: 'pierde', delta: -monto }
  if (bj && bjDealer) return { outcome: 'push', delta: 0 }

  if (totalDealer > 21) return { outcome: 'gana', delta: monto }
  if (total > totalDealer) return { outcome: 'gana', delta: monto }
  if (total < totalDealer) return { outcome: 'pierde', delta: -monto }
  return { outcome: 'push', delta: 0 }
}

/** ¿Quién se lleva la corona entre las dos manos? El natural desempata un 21. */
export function ganadorCorona(manoHumano: Carta[], manoBot: Carta[]): 'humano' | 'bot' | null {
  const th = valorMano(manoHumano).total
  const tb = valorMano(manoBot).total
  const pasoH = th > 21
  const pasoB = tb > 21

  if (pasoH && pasoB) return null
  if (pasoH) return 'bot'
  if (pasoB) return 'humano'
  if (th > tb) return 'humano'
  if (tb > th) return 'bot'

  // Mismo total: el blackjack natural (2 cartas) se lleva la corona
  const bjH = esBlackjack(manoHumano)
  const bjB = esBlackjack(manoBot)
  if (bjH && !bjB) return 'humano'
  if (bjB && !bjH) return 'bot'
  return null
}

/** El dealer pide hasta 17 (pide en 17 blando). Devuelve su mano final. */
export function jugarDealer(cartasDealer: Carta[], mazo: Carta[]): { cartasDealer: Carta[]; mazo: Carta[] } {
  const cartas = [...cartasDealer]
  const resto = [...mazo]
  while (resto.length > 0) {
    const { total, esBlando } = valorMano(cartas)
    if (total > 17) break
    if (total === 17 && !esBlando) break
    cartas.push(resto.shift()!)
  }
  return { cartasDealer: cartas, mazo: resto }
}

/** Política de un jugador-bot: pide hasta 17 (pide en 17 blando). */
function botPide(cartas: Carta[]): boolean {
  const { total, esBlando } = valorMano(cartas)
  if (total < 17) return true
  if (total === 17 && esBlando) return true
  return false
}

// ─── Estado inicial / mano nueva ──────────────────────────────────────────────

export function estadoInicialClasico(
  fichasIniciales: number,
  coronaActiva: boolean,
  coronaPct: number,
): EstadoClasico {
  return {
    mazo: mezclar(crearMazo()),
    cartasHumano: [],
    cartasBot: [],
    cartasDealer: [],
    apuesta: 0,
    dobladaHumano: false,
    dobladaBot: false,
    fase: 'apuesta',
    fichasHumano: fichasIniciales,
    fichasBot: fichasIniciales,
    fichasIniciales,
    coronaActiva,
    coronaPct,
    mano: 1,
    resHumano: null,
    resBot: null,
    coronaGanador: null,
    coronaBonus: 0,
  }
}

/** Nueva mano conservando fichas y config. Si alguno quedó sin fichas, revancha. */
export function nuevaMano(e: EstadoClasico): EstadoClasico {
  const terminada = e.fichasHumano <= 0 || e.fichasBot <= 0
  return {
    ...e,
    mazo: mezclar(crearMazo()),
    cartasHumano: [],
    cartasBot: [],
    cartasDealer: [],
    apuesta: 0,
    dobladaHumano: false,
    dobladaBot: false,
    fase: 'apuesta',
    fichasHumano: terminada ? e.fichasIniciales : e.fichasHumano,
    fichasBot: terminada ? e.fichasIniciales : e.fichasBot,
    mano: e.mano + 1,
    resHumano: null,
    resBot: null,
    coronaGanador: null,
    coronaBonus: 0,
  }
}

/** La apuesta no puede superar lo que tiene el jugador ni lo que el bot puede igualar. */
export function apuestaMaxima(e: EstadoClasico): number {
  return Math.min(e.fichasHumano, e.fichasBot)
}

// ─── Acciones ─────────────────────────────────────────────────────────────────

/** El humano apuesta; el bot iguala y se reparten 2 cartas a cada uno y al dealer. */
export function apostar(e: EstadoClasico, monto: number): EstadoClasico {
  if (e.fase !== 'apuesta') return e
  const apuesta = Math.max(1, Math.min(monto, apuestaMaxima(e)))
  const mazo = [...e.mazo]
  const cartasHumano = [mazo.shift()!, mazo.shift()!]
  const cartasBot = [mazo.shift()!, mazo.shift()!]
  const cartasDealer = [mazo.shift()!, mazo.shift()!]
  return { ...e, mazo, cartasHumano, cartasBot, cartasDealer, apuesta, fase: 'turno_humano' }
}

/** Pedir carta. Si te pasás, tu turno termina, pero el resultado se revela
 *  recién cuando juegan el bot y el dealer. */
export function pedir(e: EstadoClasico): EstadoClasico {
  if (e.fase !== 'turno_humano') return e
  const mazo = [...e.mazo]
  const cartasHumano = [...e.cartasHumano, mazo.shift()!]
  const next = { ...e, mazo, cartasHumano }
  if (valorMano(cartasHumano).total > 21) return resolverMano(next)
  return next
}

/** Plantarse: juegan el bot y el dealer y se liquida la mano. */
export function plantarse(e: EstadoClasico): EstadoClasico {
  if (e.fase !== 'turno_humano') return e
  return resolverMano(e)
}

export function puedeDoblar(e: EstadoClasico): boolean {
  return e.fase === 'turno_humano'
    && e.cartasHumano.length === 2
    && e.fichasHumano >= e.apuesta * 2
}

/** Doblar: la apuesta se duplica, recibís UNA carta y se resuelve la mano. */
export function doblar(e: EstadoClasico): EstadoClasico {
  if (!puedeDoblar(e)) return e
  const mazo = [...e.mazo]
  const cartasHumano = [...e.cartasHumano, mazo.shift()!]
  return resolverMano({ ...e, mazo, cartasHumano, dobladaHumano: true })
}

// ─── Resolución de la mano (juega el bot, juega el dealer, se paga) ───────────

function resolverMano(e: EstadoClasico): EstadoClasico {
  let mazo = [...e.mazo]

  // 1) Juega el bot
  const cartasBot = [...e.cartasBot]
  let dobladaBot = false
  const totalBotInicial = valorMano(cartasBot).total
  if ((totalBotInicial === 10 || totalBotInicial === 11) && e.fichasBot >= e.apuesta * 2 && mazo.length > 0) {
    cartasBot.push(mazo.shift()!)
    dobladaBot = true
  } else {
    while (botPide(cartasBot) && mazo.length > 0) cartasBot.push(mazo.shift()!)
  }

  // 2) Juega el dealer
  const jugadaDealer = jugarDealer(e.cartasDealer, mazo)
  const cartasDealer = jugadaDealer.cartasDealer
  mazo = jugadaDealer.mazo

  // 3) Liquidación contra el dealer (independiente por jugador)
  const resHumano = resolverVsDealer(e.cartasHumano, cartasDealer, e.apuesta, e.dobladaHumano)
  const resBot = resolverVsDealer(cartasBot, cartasDealer, e.apuesta, dobladaBot)
  let fichasHumano = e.fichasHumano + resHumano.delta
  let fichasBot = e.fichasBot + resBot.delta

  // 4) Corona (transferencia entre jugadores)
  let coronaGanador: 'humano' | 'bot' | null = null
  let coronaBonus = 0
  if (e.coronaActiva) {
    const g = ganadorCorona(e.cartasHumano, cartasBot)
    if (g) {
      const apuestaGanador = g === 'humano'
        ? (e.dobladaHumano ? e.apuesta * 2 : e.apuesta)
        : (dobladaBot ? e.apuesta * 2 : e.apuesta)
      const fichasPerdedor = g === 'humano' ? fichasBot : fichasHumano
      coronaBonus = Math.max(0, Math.min(Math.floor(apuestaGanador * e.coronaPct / 100), fichasPerdedor))
      if (g === 'humano') { fichasHumano += coronaBonus; fichasBot -= coronaBonus }
      else { fichasBot += coronaBonus; fichasHumano -= coronaBonus }
      coronaGanador = g
    }
  }

  return {
    ...e,
    mazo,
    cartasBot,
    cartasDealer,
    dobladaBot,
    fase: 'resultado',
    fichasHumano,
    fichasBot,
    resHumano,
    resBot,
    coronaGanador,
    coronaBonus,
  }
}

// ─── Textos para la UI ────────────────────────────────────────────────────────

export const OUTCOME_LABELS: Record<OutcomeDealer, string> = {
  blackjack: 'Blackjack · paga 3:2',
  gana: 'Le ganó a la banca',
  push: 'Empate con la banca',
  pierde: 'Perdió con la banca',
}

export const CORONA_PCTS = [5, 10, 25, 50] as const
