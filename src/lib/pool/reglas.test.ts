// Tests de las reglas 8-ball con eventos sintéticos (sin física).
// Correr: npx tsx --test src/lib/pool/*.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventoFisica } from './tipos'
import {
  EstadoJuego, aplicarEleccionRebreak, bolasObjetivoDe, crearEstadoInicial,
  resolverAbandono, resolverTimeout, resolverTiro,
} from './reglas'

// ─── Helpers de eventos ──────────────────────────────────────────────────────

const ct = (t: number, a: number, b: number): EventoFisica => ({ tipo: 'contacto_bola', t, a, b, energia: 1 })
const bd = (t: number, bola: number): EventoFisica => ({ tipo: 'banda', t, bola, energia: 1 })
const tr = (t: number, bola: number): EventoFisica => ({ tipo: 'tronera', t, bola, tronera: 0 })

// bolasFinales: todas vivas salvo las listadas
function vivasSalvo(...muertas: number[]) {
  return Array.from({ length: 16 }, (_, n) => ({ n, viva: !muertas.includes(n) }))
}

function enJuego(parcial: Partial<EstadoJuego>): EstadoJuego {
  return {
    fase: 'asignados',
    turno: 'A',
    grupos: { A: 'lisas', B: 'rayadas' },
    bolaEnMano: false,
    soloCabecera: false,
    ganador: null,
    motivoFin: null,
    ...parcial,
  }
}

// ─── Break ───────────────────────────────────────────────────────────────────

test('break legal con emboque: sigue tirando, mesa abierta', () => {
  const { estado, resultado } = resolverTiro(
    crearEstadoInicial('A'),
    [ct(0.1, 0, 1), bd(0.2, 2), bd(0.25, 3), tr(0.5, 3)],
    vivasSalvo(3),
  )
  assert.deepEqual(resultado.faltas, [])
  assert.equal(resultado.sigueTirando, true)
  assert.equal(estado.fase, 'abierta')
  assert.equal(estado.turno, 'A')
  assert.equal(estado.bolaEnMano, false)
  assert.equal(resultado.asignoGrupos, false, 'el break nunca asigna grupos')
})

test('break legal sin emboque (4 bolas a banda): turno al rival', () => {
  const { estado, resultado } = resolverTiro(
    crearEstadoInicial('A'),
    [ct(0.1, 0, 1), bd(0.2, 1), bd(0.2, 2), bd(0.3, 5), bd(0.4, 11)],
    vivasSalvo(),
  )
  assert.deepEqual(resultado.faltas, [])
  assert.equal(resultado.sigueTirando, false)
  assert.equal(estado.fase, 'abierta')
  assert.equal(estado.turno, 'B')
})

test('break ilegal: el rival elige re-break o jugar', () => {
  const { estado, resultado } = resolverTiro(
    crearEstadoInicial('A'),
    [ct(0.1, 0, 1), bd(0.2, 1)], // solo 1 bola a banda, nada embocado
    vivasSalvo(),
  )
  assert.equal(resultado.breakIlegal, true)
  assert.equal(estado.fase, 'eleccion_rebreak')
  assert.equal(estado.turno, 'B')

  const juega = aplicarEleccionRebreak(estado, 'jugar')
  assert.equal(juega.fase, 'abierta')
  assert.equal(juega.turno, 'B')

  const rompe = aplicarEleccionRebreak(estado, 'rebreak')
  assert.equal(rompe.fase, 'break')
  assert.equal(rompe.turno, 'B')
  assert.equal(rompe.soloCabecera, true)
})

test('scratch en el break: bola en mano detrás de la cabecera', () => {
  const { estado, resultado } = resolverTiro(
    crearEstadoInicial('A'),
    [ct(0.1, 0, 1), bd(0.2, 1), bd(0.2, 2), bd(0.3, 5), bd(0.4, 11), tr(0.6, 0)],
    vivasSalvo(0),
  )
  assert.ok(resultado.faltas.includes('blanca_embocada'))
  assert.equal(estado.turno, 'B')
  assert.equal(estado.bolaEnMano, true)
  assert.equal(estado.soloCabecera, true)
  assert.equal(estado.fase, 'abierta')
})

test('la 8 en el break: re-rack y repite el mismo breaker', () => {
  const { estado, resultado } = resolverTiro(
    crearEstadoInicial('A'),
    [ct(0.1, 0, 1), tr(0.4, 8)],
    vivasSalvo(8),
  )
  assert.equal(resultado.rerack, true)
  assert.equal(estado.fase, 'break')
  assert.equal(estado.turno, 'A')
  assert.equal(estado.soloCabecera, true)
})

// ─── Mesa abierta ────────────────────────────────────────────────────────────

test('mesa abierta: la primera embocada asigna grupos y se sigue tirando', () => {
  const abierta = enJuego({ fase: 'abierta', grupos: { A: null, B: null } })
  const { estado, resultado } = resolverTiro(abierta, [ct(0.1, 0, 9), bd(0.2, 9), tr(0.3, 9)], vivasSalvo(9))
  assert.deepEqual(resultado.faltas, [])
  assert.equal(resultado.asignoGrupos, true)
  assert.equal(estado.fase, 'asignados')
  assert.equal(estado.grupos.A, 'rayadas')
  assert.equal(estado.grupos.B, 'lisas')
  assert.equal(estado.turno, 'A')
  assert.equal(resultado.sigueTirando, true)
})

test('mesa abierta: tocar la 8 primero es falta', () => {
  const abierta = enJuego({ fase: 'abierta', grupos: { A: null, B: null } })
  const { estado, resultado } = resolverTiro(abierta, [ct(0.1, 0, 8), bd(0.2, 8)], vivasSalvo())
  assert.ok(resultado.faltas.includes('contacto_ilegal'))
  assert.equal(estado.turno, 'B')
  assert.equal(estado.bolaEnMano, true)
  assert.equal(estado.soloCabecera, false)
  assert.equal(estado.grupos.A, null, 'sigue abierta')
})

test('mesa abierta sin emboque: pasa el turno sin falta', () => {
  const abierta = enJuego({ fase: 'abierta', grupos: { A: null, B: null } })
  const { estado, resultado } = resolverTiro(abierta, [ct(0.1, 0, 5), bd(0.2, 5)], vivasSalvo())
  assert.deepEqual(resultado.faltas, [])
  assert.equal(estado.turno, 'B')
  assert.equal(estado.fase, 'abierta')
})

// ─── Faltas comunes ──────────────────────────────────────────────────────────

test('no tocar nada es falta', () => {
  const { estado, resultado } = resolverTiro(enJuego({}), [bd(0.2, 0)], vivasSalvo())
  assert.ok(resultado.faltas.includes('sin_contacto'))
  assert.equal(estado.bolaEnMano, true)
  assert.equal(estado.turno, 'B')
})

test('tras el contacto, sin banda ni emboque es falta (la blanca a banda salva)', () => {
  const soloContacto = resolverTiro(enJuego({}), [ct(0.1, 0, 3)], vivasSalvo())
  assert.ok(soloContacto.resultado.faltas.includes('sin_banda'))

  const blancaABanda = resolverTiro(enJuego({}), [ct(0.1, 0, 3), bd(0.3, 0)], vivasSalvo())
  assert.deepEqual(blancaABanda.resultado.faltas, [])
})

test('banda ANTES del contacto no cuenta para la regla de banda', () => {
  const { resultado } = resolverTiro(enJuego({}), [bd(0.05, 0), ct(0.1, 0, 3)], vivasSalvo())
  assert.ok(resultado.faltas.includes('sin_banda'))
})

test('tocar primero una bola del rival es falta', () => {
  const { estado, resultado } = resolverTiro(enJuego({}), [ct(0.1, 0, 9), bd(0.2, 9)], vivasSalvo())
  assert.ok(resultado.faltas.includes('contacto_ilegal'))
  assert.equal(estado.bolaEnMano, true)
})

test('scratch normal: bola en mano libre para el rival', () => {
  const { estado, resultado } = resolverTiro(enJuego({}), [ct(0.1, 0, 3), tr(0.4, 0)], vivasSalvo(0))
  assert.ok(resultado.faltas.includes('blanca_embocada'))
  assert.equal(estado.bolaEnMano, true)
  assert.equal(estado.soloCabecera, false)
})

// ─── Continuación de turno ───────────────────────────────────────────────────

test('embocar bola propia: sigue tirando', () => {
  const { estado, resultado } = resolverTiro(enJuego({}), [ct(0.1, 0, 3), tr(0.3, 3)], vivasSalvo(3))
  assert.deepEqual(resultado.faltas, [])
  assert.equal(resultado.sigueTirando, true)
  assert.equal(estado.turno, 'A')
})

test('embocar solo una del rival (sin falta): el turno pasa, la bola queda abajo', () => {
  const { estado, resultado } = resolverTiro(enJuego({}), [ct(0.1, 0, 3), tr(0.3, 12)], vivasSalvo(12))
  assert.deepEqual(resultado.faltas, [])
  assert.equal(resultado.sigueTirando, false)
  assert.equal(estado.turno, 'B')
})

test('embocar propia y del rival en el mismo tiro: sigue tirando', () => {
  const { resultado } = resolverTiro(enJuego({}), [ct(0.1, 0, 3), tr(0.3, 3), tr(0.4, 12)], vivasSalvo(3, 12))
  assert.equal(resultado.sigueTirando, true)
})

// ─── La 8 ────────────────────────────────────────────────────────────────────

test('la 8 antes de tiempo: derrota inmediata', () => {
  // A todavía tiene lisas vivas
  const { estado, resultado } = resolverTiro(enJuego({}), [ct(0.1, 0, 3), tr(0.3, 8)], vivasSalvo(8))
  assert.equal(resultado.ganador, 'B')
  assert.equal(resultado.motivoFin, 'ocho_antes_de_tiempo')
  assert.equal(estado.fase, 'fin')
})

test('la 8 con falta (scratch): derrota', () => {
  // A ya limpió sus lisas
  const sinLisas = vivasSalvo(1, 2, 3, 4, 5, 6, 7, 8, 0)
  const { estado, resultado } = resolverTiro(enJuego({}), [ct(0.1, 0, 8), tr(0.3, 8), tr(0.4, 0)], sinLisas)
  assert.equal(resultado.ganador, 'B')
  assert.equal(resultado.motivoFin, 'ocho_con_falta')
  assert.equal(estado.fase, 'fin')
})

test('la 8 legal con el grupo completo: victoria', () => {
  const sinLisas = vivasSalvo(1, 2, 3, 4, 5, 6, 7, 8)
  const { estado, resultado } = resolverTiro(enJuego({}), [ct(0.1, 0, 8), tr(0.3, 8)], sinLisas)
  assert.equal(resultado.ganador, 'A')
  assert.equal(resultado.motivoFin, 'ocho_legal')
  assert.equal(estado.fase, 'fin')
  assert.equal(estado.ganador, 'A')
})

test('con el grupo completo, tocar primero una del rival y embocar la 8: derrota', () => {
  const sinLisas = vivasSalvo(1, 2, 3, 4, 5, 6, 7, 8)
  const { resultado } = resolverTiro(enJuego({}), [ct(0.1, 0, 12), ct(0.2, 0, 8), tr(0.3, 8)], sinLisas)
  assert.equal(resultado.ganador, 'B')
  assert.equal(resultado.motivoFin, 'ocho_con_falta')
})

// ─── Timeout y abandono ──────────────────────────────────────────────────────

test('timeout en juego: falta simple, bola en mano para el rival', () => {
  const estado = resolverTimeout(enJuego({}))
  assert.equal(estado.turno, 'B')
  assert.equal(estado.bolaEnMano, true)
  assert.equal(estado.fase, 'asignados')
})

test('timeout en el break: el rival pasa a romper', () => {
  const estado = resolverTimeout(crearEstadoInicial('A'))
  assert.equal(estado.fase, 'break')
  assert.equal(estado.turno, 'B')
  assert.equal(estado.soloCabecera, true)
})

test('abandono: gana el que queda', () => {
  const estado = resolverAbandono(enJuego({}), 'B')
  assert.equal(estado.fase, 'fin')
  assert.equal(estado.ganador, 'A')
  assert.equal(estado.motivoFin, 'abandono')
})

// ─── Bolas objetivo ──────────────────────────────────────────────────────────

test('bolasObjetivoDe: abierta, asignados y bola 8', () => {
  const abierta = enJuego({ fase: 'abierta', grupos: { A: null, B: null } })
  assert.equal(bolasObjetivoDe(abierta, 'A', vivasSalvo()).length, 14, 'todas menos blanca y 8')

  const asignados = enJuego({})
  assert.deepEqual(bolasObjetivoDe(asignados, 'A', vivasSalvo(1, 2, 3, 4, 5)), [6, 7])

  const soloOcho = bolasObjetivoDe(asignados, 'A', vivasSalvo(1, 2, 3, 4, 5, 6, 7))
  assert.deepEqual(soloOcho, [8])
})
