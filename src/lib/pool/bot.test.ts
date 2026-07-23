// Tests del bot — decisiones legales, diferencias reales entre dificultades
// y un partido completo bot vs bot con las reglas de verdad (integración).
// Correr: npx tsx --test src/lib/pool/*.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirTiro } from './bot'
import { CABECERA_Y, crearRack, crearRng, posicionBlancaValida, simularTiro } from './fisica'
import { calcularGuia } from './guia'
import { EstadoJuego, aplicarEleccionRebreak, crearEstadoInicial, resolverTiro } from './reglas'
import { Bola } from './tipos'

function bola(n: number, x: number, y: number): Bola {
  return { n, pos: { x, y }, vel: { x: 0, y: 0 }, wx: 0, wy: 0, wz: 0, viva: true, quieta: true, rot: 0, dirX: 0, dirY: 1 }
}

function estadoAsignados(turno: 'A' | 'B' = 'A'): EstadoJuego {
  return {
    fase: 'asignados',
    turno,
    grupos: { A: 'lisas', B: 'rayadas' },
    bolaEnMano: false,
    soloCabecera: false,
    ganador: null,
    motivoFin: null,
  }
}

// escenario de tiro medio: la 3 (lisa) con línea casi recta a la esquina
// superior derecha, y una rayada suelta para que haya objetivos de ambos
const MESA_MEDIA = () => [bola(0, 0, -0.3), bola(3, 0.2, 0.3), bola(11, -0.35, 0.5)]

test('sin ruido: el bot emboca el tiro que eligió (la intención es exacta)', () => {
  const dec = decidirTiro(MESA_MEDIA(), estadoAsignados(), 'dificil', crearRng(5), { sinRuido: true })
  assert.equal(dec.objetivo, 3, 'eligió su bola')
  const res = simularTiro(MESA_MEDIA(), dec.tiro, { sinMuestras: true })
  assert.ok(
    res.eventos.some(e => e.tipo === 'tronera' && e.bola === 3),
    'la 3 cayó en la simulación limpia',
  )
})

test('respeta los objetivos legales: con grupo asignado apunta a una bola propia', () => {
  for (const dif of ['facil', 'normal', 'dificil'] as const) {
    const dec = decidirTiro(MESA_MEDIA(), estadoAsignados(), dif, crearRng(11), { sinRuido: true })
    const guia = calcularGuia(MESA_MEDIA(), dec.tiro.angulo)
    assert.ok(guia && guia.bolaObjetivo !== null, `${dif}: apunta a una bola`)
    assert.ok([1, 2, 3, 4, 5, 6, 7].includes(guia!.bolaObjetivo!), `${dif}: la primera tocada es lisa`)
  }
})

test('bola en mano: coloca la blanca en una posición válida', () => {
  const bolas = [bola(0, 0, 0), bola(3, 0.2, 0.3), bola(11, -0.35, 0.5)]
  const estado = { ...estadoAsignados(), bolaEnMano: true }
  const dec = decidirTiro(bolas, estado, 'dificil', crearRng(3))
  assert.ok(dec.posBlanca, 'devolvió posición para la blanca')
  assert.ok(posicionBlancaValida(bolas, dec.posBlanca!, false), 'la posición es válida')
  assert.equal(dec.tiro.posBlanca, dec.posBlanca, 'el tiro lleva la colocación')
})

test('break: tiro fuerte desde atrás de la cabecera', () => {
  const dec = decidirTiro(crearRack(9), crearEstadoInicial('B'), 'normal', crearRng(9))
  assert.ok(dec.tiro.fuerza >= 0.55, `fuerza de break (${dec.tiro.fuerza})`)
  assert.ok(dec.posBlanca && dec.posBlanca.y <= CABECERA_Y, 'rompe detrás de la línea de cabecera')
})

test('las dificultades son de verdad: Difícil emboca mucho más que Fácil', () => {
  const INTENTOS = 30
  const emboca = (dif: 'facil' | 'dificil') => {
    const rng = crearRng(77)
    let logradas = 0
    for (let i = 0; i < INTENTOS; i++) {
      const bolas = MESA_MEDIA()
      const dec = decidirTiro(bolas, estadoAsignados(), dif, rng)
      const res = simularTiro(bolas, dec.tiro, { sinMuestras: true })
      if (res.eventos.some(e => e.tipo === 'tronera' && e.bola === 3)) logradas++
    }
    return logradas
  }
  const facil = emboca('facil')
  const dificil = emboca('dificil')
  assert.ok(dificil >= facil + 8, `dificil ${dificil}/30 vs facil ${facil}/30`)
  assert.ok(dificil >= 18, `dificil emboca seguido (${dificil}/30)`)
})

test('partido completo Difícil vs Fácil con reglas: termina y suele ganar el Difícil', () => {
  let victoriasDificil = 0
  for (const seed of [101, 202, 303]) {
    const rng = crearRng(seed)
    let bolas = crearRack(seed)
    let estado = crearEstadoInicial('A') // A = dificil, B = facil
    let tiros = 0

    while (estado.fase !== 'fin' && tiros < 300) {
      tiros++
      if (estado.fase === 'eleccion_rebreak') {
        estado = aplicarEleccionRebreak(estado, 'jugar')
        continue
      }
      const dif = estado.turno === 'A' ? 'dificil' : 'facil'
      const dec = decidirTiro(bolas, estado, dif, rng)
      const res = simularTiro(bolas, dec.tiro, { sinMuestras: true })
      const paso = resolverTiro(estado, res.eventos, res.snapshot)
      if (paso.resultado.rerack) {
        bolas = crearRack(seed + tiros)
        estado = paso.estado
        continue
      }
      bolas = res.bolas
      estado = paso.estado
    }

    assert.ok(estado.fase === 'fin', `seed ${seed}: el partido terminó (${tiros} tiros)`)
    assert.ok(estado.ganador, `seed ${seed}: hay ganador`)
    if (estado.ganador === 'A') victoriasDificil++
  }
  assert.ok(victoriasDificil >= 2, `el Difícil ganó ${victoriasDificil}/3`)
})
