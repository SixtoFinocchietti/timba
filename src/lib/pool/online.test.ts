// Tests de la lib de sync online — el contrato de red del "tirador autoritativo".
// Correr: npx tsx --test src/lib/pool/*.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearRack, simularTiro } from './fisica'
import {
  avanzarSerie, bolasDeSnapshot, estadoInicialOnline, jugadorDe, victoriasNecesarias,
} from './online'
import { Tiro } from './tipos'

test('snapshot round-trip: la mesa persistida se reconstruye idéntica', () => {
  const rack = crearRack(31)
  const fila = estadoInicialOnline(3, 45, 31)
  const bolas = bolasDeSnapshot(fila.estado_bolas)
  assert.equal(bolas.length, 16)
  for (const b of bolas) {
    const original = rack.find(o => o.n === b.n)!
    assert.equal(b.pos.x, original.pos.x)
    assert.equal(b.pos.y, original.pos.y)
    assert.equal(b.viva, true)
    assert.equal(b.quieta, true)
  }
  assert.equal(fila.estado_juego.turno, 'A', 'rompe el host')
  assert.equal(fila.estado_juego.fase, 'break')
})

test('contrato de red: re-simular el MISMO input da el MISMO snapshot', () => {
  // el tirador simula sobre su mesa...
  const fila = estadoInicialOnline(1, 45, 99)
  const bolasTirador = bolasDeSnapshot(fila.estado_bolas)
  const input: Tiro = {
    angulo: Math.PI / 2 + 0.01,
    fuerza: 0.97,
    efectoLateral: 0.1,
    efectoVertical: -0.2,
    posBlanca: { x: 0.05, y: -0.6 },
  }
  const resTirador = simularTiro(bolasTirador, input, { sinMuestras: true })

  // ...y el rival re-simula el input que recibió sobre SU copia de la mesa
  const bolasRival = bolasDeSnapshot(fila.estado_bolas)
  const resRival = simularTiro(bolasRival, input)

  assert.equal(
    JSON.stringify(resRival.snapshot),
    JSON.stringify(resTirador.snapshot),
    'misma plataforma: coincidencia bit a bit (entre plataformas corrige el snapshot)',
  )
  assert.ok(resRival.muestras.length > 0, 'el rival tiene la animación completa')
})

test('serie suelta (1): el primer juego define la partida', () => {
  const up = avanzarSerie({ serie_max: 1, victorias_host: 0, victorias_invitado: 0, rompe_host: true }, 'B', 5)
  assert.equal(up.fase, 'terminada')
  assert.equal(up.ganador_serie, 'invitado')
  assert.equal(up.victorias_invitado, 1)
})

test('mejor de 3: 1-0 sigue con rack nuevo y rompe el otro', () => {
  const up = avanzarSerie({ serie_max: 3, victorias_host: 0, victorias_invitado: 0, rompe_host: true }, 'A', 7)
  assert.equal(up.fase, undefined, 'la serie sigue')
  assert.equal(up.victorias_host, 1)
  assert.equal(up.rompe_host, false, 'rompe el invitado')
  assert.equal(up.estado_bolas!.length, 16, 'rack nuevo')
  assert.equal(up.estado_juego!.turno, 'B', 'el estado arranca con el que rompe')
  assert.equal(up.ultimo_tiro, null)
})

test('mejor de 3: la segunda victoria cierra la serie', () => {
  const up = avanzarSerie({ serie_max: 3, victorias_host: 1, victorias_invitado: 1, rompe_host: false }, 'A', 9)
  assert.equal(up.fase, 'terminada')
  assert.equal(up.ganador_serie, 'host')
  assert.equal(up.victorias_host, 2)
})

test('mapeo de asientos: host=A, invitado=B', () => {
  assert.equal(jugadorDe('host'), 'A')
  assert.equal(jugadorDe('invitado'), 'B')
  assert.equal(victoriasNecesarias(1), 1)
  assert.equal(victoriasNecesarias(3), 2)
})
