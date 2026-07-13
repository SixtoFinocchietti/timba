// Blackjack — Práctica rápida (1 humano vs Bot, 100% local).
//
// A diferencia del modo online (src/lib/blackjack.ts), acá NO hay banca ni
// apuestas de dinero: es una competencia simétrica de "quién queda más cerca
// de 21". El marcador es por puntos (llevar el tanteo), sin saldo que se vacíe.
// El "doblar" no dobla plata: hace que la ronda valga doble (arriesgás:
// recibís UNA sola carta y te plantás).
//
// Reutiliza los helpers puros del modo online y el mazo del póker.

import { Carta, crearMazo, mezclar } from '@/lib/poker'
import { valorMano, esBlackjack } from '@/lib/blackjack'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type Dificultad = 'facil' | 'normal'
export type FasePractica = 'jugando' | 'resultado'
export type GanadorRonda = 'humano' | 'bot' | 'empate'

export type ResultadoPractica =
  | 'bj_humano'    // el humano ganó con blackjack natural
  | 'bj_bot'       // el bot tenía blackjack natural
  | 'bj_empate'    // ambos con blackjack natural
  | 'paso_humano'  // el humano se pasó de 21 (el bot no)
  | 'paso_bot'     // el bot se pasó de 21 (el humano no)
  | 'paso_ambos'   // los dos se pasaron de 21
  | 'mayor_humano' // el humano quedó más cerca de 21
  | 'mayor_bot'    // el bot quedó más cerca de 21
  | 'empate'       // mismo total

export interface EstadoPractica {
  dificultad: Dificultad
  mazo: Carta[]
  cartasHumano: Carta[]
  cartasBot: Carta[]
  fase: FasePractica
  doblada: boolean            // esta ronda vale doble
  ganador: GanadorRonda | null
  resultado: ResultadoPractica | null
  multiplicador: number       // puntos que vale la ronda (1 o 2)
  puntosHumano: number
  puntosBot: number
  ronda: number
}

// ─── Reparto / nueva ronda ────────────────────────────────────────────────────

/** Empieza una ronda nueva conservando el marcador acumulado. */
export function nuevaRonda(
  dificultad: Dificultad,
  puntosHumano: number,
  puntosBot: number,
  ronda: number,
): EstadoPractica {
  const mazo = mezclar(crearMazo())
  const cartasHumano = [mazo.shift()!, mazo.shift()!]
  const cartasBot = [mazo.shift()!, mazo.shift()!]

  const base: EstadoPractica = {
    dificultad,
    mazo,
    cartasHumano,
    cartasBot,
    fase: 'jugando',
    doblada: false,
    ganador: null,
    resultado: null,
    multiplicador: 1,
    puntosHumano,
    puntosBot,
    ronda,
  }

  // La ronda NO se resuelve al repartir, ni aunque haya un blackjack natural:
  // el resultado se muestra recién cuando los dos terminan su turno (más real).
  return base
}

/** Reinicia para la ronda siguiente manteniendo dificultad y marcador. */
export function siguienteRonda(e: EstadoPractica): EstadoPractica {
  return nuevaRonda(e.dificultad, e.puntosHumano, e.puntosBot, e.ronda + 1)
}

// ─── Resolución ───────────────────────────────────────────────────────────────

/** Cierra la ronda: fija el resultado y suma los puntos al ganador. */
function finalizar(
  e: EstadoPractica,
  ganador: GanadorRonda,
  resultado: ResultadoPractica,
): EstadoPractica {
  const multiplicador = e.doblada ? 2 : 1
  return {
    ...e,
    fase: 'resultado',
    ganador,
    resultado,
    multiplicador,
    puntosHumano: e.puntosHumano + (ganador === 'humano' ? multiplicador : 0),
    puntosBot: e.puntosBot + (ganador === 'bot' ? multiplicador : 0),
  }
}

/** Compara ambas manos ya cerradas y decide la ronda (showdown). */
function comparar(e: EstadoPractica): EstadoPractica {
  const totalHumano = valorMano(e.cartasHumano).total
  const totalBot = valorMano(e.cartasBot).total
  const pasoHumano = totalHumano > 21
  const pasoBot = totalBot > 21

  // Pasarse
  if (pasoHumano && pasoBot) return finalizar(e, 'empate', 'paso_ambos')
  if (pasoHumano) return finalizar(e, 'bot', 'paso_humano')
  if (pasoBot) return finalizar(e, 'humano', 'paso_bot')

  // Los dos con mano válida: gana el más cercano a 21 (el blackjack natural es solo adorno)
  if (totalHumano > totalBot)
    return finalizar(e, 'humano', esBlackjack(e.cartasHumano) ? 'bj_humano' : 'mayor_humano')
  if (totalBot > totalHumano)
    return finalizar(e, 'bot', esBlackjack(e.cartasBot) ? 'bj_bot' : 'mayor_bot')

  // Empate
  if (esBlackjack(e.cartasHumano) && esBlackjack(e.cartasBot))
    return finalizar(e, 'empate', 'bj_empate')
  return finalizar(e, 'empate', 'empate')
}

// ─── Acciones del humano ──────────────────────────────────────────────────────

/** Pedir una carta. Si te pasás de 21, tu turno termina y juega el Bot
 *  (el resultado se revela recién en el showdown, no al instante). */
export function pedir(e: EstadoPractica): EstadoPractica {
  if (e.fase !== 'jugando') return e
  const mazo = [...e.mazo]
  const cartasHumano = [...e.cartasHumano, mazo.shift()!]
  const next = { ...e, mazo, cartasHumano }
  if (valorMano(cartasHumano).total > 21) return jugarBot(next)
  return next
}

/** Plantarse: le toca jugar al bot y se compara. */
export function plantarse(e: EstadoPractica): EstadoPractica {
  if (e.fase !== 'jugando') return e
  return jugarBot(e)
}

/** Doblar disponible solo con las dos cartas iniciales. */
export function puedeDoblar(e: EstadoPractica): boolean {
  return e.fase === 'jugando' && e.cartasHumano.length === 2
}

/** Doblar: la ronda pasa a valer doble, recibís UNA carta y te plantás.
 *  Aunque te pases, el resultado se revela recién cuando juega el Bot. */
export function doblar(e: EstadoPractica): EstadoPractica {
  if (!puedeDoblar(e)) return e
  const mazo = [...e.mazo]
  const cartasHumano = [...e.cartasHumano, mazo.shift()!]
  const next: EstadoPractica = { ...e, mazo, cartasHumano, doblada: true }
  return jugarBot(next)
}

// ─── Estrategia del bot ───────────────────────────────────────────────────────

/** ¿El bot pide otra carta? Depende de la dificultad. */
function botPide(cartas: Carta[], dificultad: Dificultad): boolean {
  const { total, esBlando } = valorMano(cartas)

  if (dificultad === 'normal') {
    // Estrategia sólida: pide hasta 17, y pide en 17 blando (como una banca dura).
    if (total < 17) return true
    if (total === 17 && esBlando) return true
    return false
  }

  // Fácil: tímido y con errores. Se planta pronto y deja totales bajos.
  if (total <= 11) return true
  if (total >= 15) return false
  // 12–14: se planta la mayoría de las veces.
  return Math.random() > 0.55
}

/** El bot juega su mano y se resuelve la ronda. */
function jugarBot(e: EstadoPractica): EstadoPractica {
  const mazo = [...e.mazo]
  const cartasBot = [...e.cartasBot]

  // En "normal", el bot dobla con 10 u 11 en sus dos primeras cartas:
  // una sola carta y se planta (la ronda pasa a valer doble).
  if (e.dificultad === 'normal' && cartasBot.length === 2 && mazo.length > 0) {
    const total = valorMano(cartasBot).total
    if (total === 10 || total === 11) {
      cartasBot.push(mazo.shift()!)
      return comparar({ ...e, mazo, cartasBot, doblada: true })
    }
  }

  while (botPide(cartasBot, e.dificultad) && mazo.length > 0) {
    cartasBot.push(mazo.shift()!)
  }
  return comparar({ ...e, mazo, cartasBot })
}

// ─── Textos para la UI ────────────────────────────────────────────────────────

export const RESULTADO_PRACTICA_LABELS: Record<ResultadoPractica, string> = {
  bj_humano: '¡Blackjack! Ganaste la ronda',
  bj_bot: 'El Bot sacó Blackjack',
  bj_empate: 'Doble Blackjack — empate',
  paso_humano: 'Te pasaste de 21',
  paso_bot: 'El Bot se pasó de 21',
  paso_ambos: 'Los dos se pasaron — empate',
  mayor_humano: 'Quedaste más cerca de 21',
  mayor_bot: 'El Bot quedó más cerca de 21',
  empate: 'Empate — mismo total',
}

export const DIFICULTAD_LABELS: Record<Dificultad, string> = {
  facil: 'Fácil',
  normal: 'Normal',
}
