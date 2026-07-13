// Blackjack Clásico ONLINE (2 humanos + dealer), sincronizado por Realtime.
//
// Mismo modelo de reglas que el modo vs Bot, pero con dos jugadores humanos
// (asientos 'host' e 'invitado') en una fila de `partidas_blackjack_clasico`.
// Turnos SECUENCIALES: en cada fase escribe un solo cliente (el del turno),
// evitando choques de escritura — igual patrón que partidas_blackjack/poker.
//
// Flujo de una mano:
//   apuestas: apuesta el "primero", después el "segundo" (y se reparte) →
//   juego: juega el primero, después el segundo →
//   el dealer juega y se liquida → resultado.
//
// Reutiliza los helpers puros de blackjackClasico.ts.

import { Carta, crearMazo, mezclar } from '@/lib/poker'
import { valorMano } from '@/lib/blackjack'
import {
  OutcomeDealer, resolverVsDealer, ganadorCorona, jugarDealer,
} from '@/lib/blackjackClasico'

// ─── Tipos (reflejan las columnas de la tabla) ────────────────────────────────

export type Asiento = 'host' | 'invitado'

export interface PartidaClasico {
  id: string
  host_id: string
  invitado_id: string
  mazo: Carta[]
  cartas_host: Carta[]
  cartas_invitado: Carta[]
  cartas_dealer: Carta[]
  apuesta_host: number
  apuesta_invitado: number
  doblada_host: boolean
  doblada_invitado: boolean
  fichas_host: number
  fichas_invitado: number
  fichas_iniciales: number
  corona_activa: boolean
  corona_pct: number
  fase: 'apuestas' | 'juego' | 'resultado'
  turno: Asiento | 'dealer' | null
  primero_es_host: boolean
  resultado_host: OutcomeDealer | null
  resultado_invitado: OutcomeDealer | null
  delta_host: number
  delta_invitado: number
  corona_ganador: Asiento | null
  corona_bonus: number
  mano: number
}

type Update = Partial<PartidaClasico>

// ─── Helpers de asiento ───────────────────────────────────────────────────────

function otro(a: Asiento): Asiento { return a === 'host' ? 'invitado' : 'host' }
function primeroDe(p: PartidaClasico): Asiento { return p.primero_es_host ? 'host' : 'invitado' }
function manoDe(p: PartidaClasico, a: Asiento): Carta[] { return a === 'host' ? p.cartas_host : p.cartas_invitado }
function fichasDe(p: PartidaClasico, a: Asiento): number { return a === 'host' ? p.fichas_host : p.fichas_invitado }
function apuestaDe(p: PartidaClasico, a: Asiento): number { return a === 'host' ? p.apuesta_host : p.apuesta_invitado }
function dobladaDe(p: PartidaClasico, a: Asiento): boolean { return a === 'host' ? p.doblada_host : p.doblada_invitado }
function setMano(a: Asiento, cartas: Carta[]): Update { return a === 'host' ? { cartas_host: cartas } : { cartas_invitado: cartas } }

export function apuestaMaximaClasico(p: PartidaClasico, a: Asiento): number { return fichasDe(p, a) }

// ─── Estado inicial / mano nueva ──────────────────────────────────────────────

export function estadoInicialClasicoOnline(
  fichasIniciales: number,
  coronaActiva: boolean,
  coronaPct: number,
): Omit<PartidaClasico, 'id' | 'host_id' | 'invitado_id'> {
  return {
    mazo: mezclar(crearMazo()),
    cartas_host: [],
    cartas_invitado: [],
    cartas_dealer: [],
    apuesta_host: 0,
    apuesta_invitado: 0,
    doblada_host: false,
    doblada_invitado: false,
    fichas_host: fichasIniciales,
    fichas_invitado: fichasIniciales,
    fichas_iniciales: fichasIniciales,
    corona_activa: coronaActiva,
    corona_pct: coronaPct,
    fase: 'apuestas',
    turno: 'host', // el host es el primero en la primera mano
    primero_es_host: true,
    resultado_host: null,
    resultado_invitado: null,
    delta_host: 0,
    delta_invitado: 0,
    corona_ganador: null,
    corona_bonus: 0,
    mano: 1,
  }
}

export function nuevaManoClasico(p: PartidaClasico): Update {
  const terminada = p.fichas_host <= 0 || p.fichas_invitado <= 0
  const primeroEsHost = !p.primero_es_host // se alterna quién arranca
  return {
    mazo: mezclar(crearMazo()),
    cartas_host: [],
    cartas_invitado: [],
    cartas_dealer: [],
    apuesta_host: 0,
    apuesta_invitado: 0,
    doblada_host: false,
    doblada_invitado: false,
    fichas_host: terminada ? p.fichas_iniciales : p.fichas_host,
    fichas_invitado: terminada ? p.fichas_iniciales : p.fichas_invitado,
    fase: 'apuestas',
    turno: primeroEsHost ? 'host' : 'invitado',
    primero_es_host: primeroEsHost,
    resultado_host: null,
    resultado_invitado: null,
    delta_host: 0,
    delta_invitado: 0,
    corona_ganador: null,
    corona_bonus: 0,
    mano: p.mano + 1,
  }
}

// ─── Apuestas (secuencial: primero y después el segundo) ──────────────────────

export function apostarClasico(p: PartidaClasico, asiento: Asiento, monto: number): Update {
  if (p.fase !== 'apuestas' || p.turno !== asiento) return {}
  const apuesta = Math.max(1, Math.min(monto, fichasDe(p, asiento)))
  const setAp: Update = asiento === 'host' ? { apuesta_host: apuesta } : { apuesta_invitado: apuesta }

  // ¿Falta que el otro apueste? Le pasamos el turno.
  if (apuestaDe(p, otro(asiento)) <= 0) return { ...setAp, turno: otro(asiento) }

  // Ya apostaron los dos: se reparte y arranca el juego.
  const mazo = [...p.mazo]
  const cartas_host = [mazo.shift()!, mazo.shift()!]
  const cartas_invitado = [mazo.shift()!, mazo.shift()!]
  const cartas_dealer = [mazo.shift()!, mazo.shift()!]
  return { ...setAp, mazo, cartas_host, cartas_invitado, cartas_dealer, fase: 'juego', turno: primeroDe(p) }
}

// ─── Turno de juego ───────────────────────────────────────────────────────────

/** Avanza al segundo jugador, o si ya jugaron los dos, resuelve la mano. */
function avanzarTurno(pProj: PartidaClasico, asiento: Asiento): Update {
  if (asiento === primeroDe(pProj)) return { turno: otro(asiento) }
  return resolverMano(pProj)
}

export function pedirClasico(p: PartidaClasico, asiento: Asiento): Update {
  if (p.fase !== 'juego' || p.turno !== asiento) return {}
  const mazo = [...p.mazo]
  const cartas = [...manoDe(p, asiento), mazo.shift()!]
  const setC = setMano(asiento, cartas)
  if (valorMano(cartas).total > 21) {
    const pProj: PartidaClasico = { ...p, mazo, ...setC }
    return { mazo, ...setC, ...avanzarTurno(pProj, asiento) }
  }
  return { mazo, ...setC }
}

export function plantarseClasico(p: PartidaClasico, asiento: Asiento): Update {
  if (p.fase !== 'juego' || p.turno !== asiento) return {}
  return avanzarTurno(p, asiento)
}

export function puedeDoblarClasico(p: PartidaClasico, asiento: Asiento): boolean {
  return p.fase === 'juego'
    && p.turno === asiento
    && manoDe(p, asiento).length === 2
    && fichasDe(p, asiento) >= apuestaDe(p, asiento) * 2
}

export function doblarClasico(p: PartidaClasico, asiento: Asiento): Update {
  if (!puedeDoblarClasico(p, asiento)) return {}
  const mazo = [...p.mazo]
  const cartas = [...manoDe(p, asiento), mazo.shift()!]
  const setC = setMano(asiento, cartas)
  const setDob: Update = asiento === 'host' ? { doblada_host: true } : { doblada_invitado: true }
  const pProj: PartidaClasico = { ...p, mazo, ...setC, ...setDob }
  return { mazo, ...setC, ...setDob, ...avanzarTurno(pProj, asiento) }
}

// ─── Resolución (juega el dealer y se paga) ───────────────────────────────────

function resolverMano(p: PartidaClasico): Update {
  const { cartasDealer, mazo } = jugarDealer(p.cartas_dealer, p.mazo)

  const resHost = resolverVsDealer(p.cartas_host, cartasDealer, p.apuesta_host, p.doblada_host)
  const resInv = resolverVsDealer(p.cartas_invitado, cartasDealer, p.apuesta_invitado, p.doblada_invitado)
  let fichas_host = p.fichas_host + resHost.delta
  let fichas_invitado = p.fichas_invitado + resInv.delta

  let corona_ganador: Asiento | null = null
  let corona_bonus = 0
  if (p.corona_activa) {
    const g = ganadorCorona(p.cartas_host, p.cartas_invitado) // 'humano'=host, 'bot'=invitado
    const ganador: Asiento | null = g === 'humano' ? 'host' : g === 'bot' ? 'invitado' : null
    if (ganador) {
      const apuestaGanador = ganador === 'host'
        ? (p.doblada_host ? p.apuesta_host * 2 : p.apuesta_host)
        : (p.doblada_invitado ? p.apuesta_invitado * 2 : p.apuesta_invitado)
      const fichasPerdedor = ganador === 'host' ? fichas_invitado : fichas_host
      corona_bonus = Math.max(0, Math.min(Math.floor(apuestaGanador * p.corona_pct / 100), fichasPerdedor))
      if (ganador === 'host') { fichas_host += corona_bonus; fichas_invitado -= corona_bonus }
      else { fichas_invitado += corona_bonus; fichas_host -= corona_bonus }
      corona_ganador = ganador
    }
  }

  return {
    mazo,
    cartas_dealer: cartasDealer,
    fase: 'resultado',
    turno: null,
    fichas_host,
    fichas_invitado,
    resultado_host: resHost.outcome,
    resultado_invitado: resInv.outcome,
    delta_host: resHost.delta,
    delta_invitado: resInv.delta,
    corona_ganador,
    corona_bonus,
  }
}
