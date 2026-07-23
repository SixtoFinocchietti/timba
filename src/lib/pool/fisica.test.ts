// Tests del motor de física — escenarios cualitativos + determinismo.
// Correr: npx tsx --test src/lib/pool/*.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CABECERA_Y, PARAMETROS, PIE, TRONERAS,
  clonarBolas, crearRack, posicionBlancaValida, simularTiro,
} from './fisica'
import { Bola, Tiro } from './tipos'

const R = PARAMETROS.radioBola

function bola(n: number, x: number, y: number): Bola {
  return { n, pos: { x, y }, vel: { x: 0, y: 0 }, wx: 0, wy: 0, wz: 0, viva: true, quieta: true, rot: 0, dirX: 0, dirY: 1 }
}

function tiro(parcial: Partial<Tiro>): Tiro {
  return { angulo: Math.PI / 2, fuerza: 0.5, efectoLateral: 0, efectoVertical: 0, ...parcial }
}

function finalDe(bolas: Bola[], n: number): Bola {
  const b = bolas.find(x => x.n === n)
  assert.ok(b, `bola ${n} existe`)
  return b as Bola
}

test('rack: 16 bolas, sin solapes, 8 al centro, blanca en cabecera', () => {
  const bolas = crearRack(42)
  assert.equal(bolas.length, 16)

  const blanca = finalDe(bolas, 0)
  assert.equal(blanca.pos.x, 0)
  assert.equal(blanca.pos.y, CABECERA_Y)

  const b8 = finalDe(bolas, 8)
  assert.ok(Math.abs(b8.pos.x) < 0.001, 'la 8 centrada en x')
  const dy = 2 * R * 0.8660254
  assert.ok(Math.abs(b8.pos.y - (PIE.y + 2 * dy)) < 0.01, 'la 8 en la tercera fila')

  for (let i = 0; i < bolas.length; i++) {
    for (let j = i + 1; j < bolas.length; j++) {
      const d = Math.hypot(bolas[i].pos.x - bolas[j].pos.x, bolas[i].pos.y - bolas[j].pos.y)
      assert.ok(d >= 2 * R - 1e-9, `bolas ${bolas[i].n} y ${bolas[j].n} no solapan`)
    }
  }

  // los números 1..15 están todos
  const numeros = bolas.map(b => b.n).sort((a, b) => a - b)
  assert.deepEqual(numeros, Array.from({ length: 16 }, (_, i) => i))
})

test('determinismo: mismo estado + mismo tiro = misma trayectoria bit a bit', () => {
  const bolas = crearRack(7)
  const t: Tiro = tiro({ angulo: Math.PI / 2 + 0.013, fuerza: 1, efectoLateral: 0.2, efectoVertical: -0.3 })
  const r1 = simularTiro(bolas, t)
  const r2 = simularTiro(bolas, t)
  assert.equal(JSON.stringify(r1.snapshot), JSON.stringify(r2.snapshot))
  assert.equal(JSON.stringify(r1.eventos), JSON.stringify(r2.eventos))
  // y no muta el estado de entrada
  assert.equal(bolas.find(b => b.n === 0)?.quieta, true)
})

test('tiro recto: contacto directo y la bola objetivo sale hacia adelante', () => {
  const bolas = [bola(0, 0, -0.5), bola(1, 0, 0)]
  const r = simularTiro(bolas, tiro({ fuerza: 0.4 }))
  const contacto = r.eventos.find(e => e.tipo === 'contacto_bola')
  assert.ok(contacto, 'hubo contacto')
  // la posición final puede incluir retornos de banda: medimos el avance máximo
  const maxY = Math.max(...r.muestras.flatMap(m => m.bolas.filter(b => b.n === 1).map(b => b.y)))
  assert.ok(maxY > 0.4, `la bola 1 avanzó con decisión (maxY=${maxY})`)
  assert.ok(Math.abs(finalDe(r.bolas, 0).pos.x) < 0.05, 'la blanca no se desvió lateralmente')
})

// Escenario compartido de los tests de efecto: bola 1 alineada con la tronera
// superior derecha sobre la diagonal a 45° (la única aproximación que entra
// limpia a una esquina). La bola 1 se emboca — sin segundo impacto de retorno —
// y lo que haga la blanca después del contacto es puro efecto del spin.
// Detalle de mesa 2:1: la diagonal a 45° hacia atrás apunta justo a la tronera
// lateral opuesta, así que un draw largo puede scratchear — no se exige viva.
const DIR = { x: Math.SQRT1_2, y: Math.SQRT1_2 }
const IMPACTO = { x: 0.35 - 2 * R * DIR.x, y: 0.91 - 2 * R * DIR.y }
function tiroConEfecto(efectoVertical: number) {
  const bolas = [bola(0, 0.15, 0.71), bola(1, 0.35, 0.91)]
  return simularTiro(bolas, tiro({ angulo: Math.PI / 4, fuerza: 0.35, efectoVertical }))
}
// avance de la blanca a lo largo de la línea de tiro, desde el punto de impacto
function avanceBlanca(r: ReturnType<typeof simularTiro>): number {
  const b = finalDe(r.bolas, 0)
  return (b.pos.x - IMPACTO.x) * DIR.x + (b.pos.y - IMPACTO.y) * DIR.y
}

test('stun: sin efecto, la bola 1 se emboca y la blanca queda casi clavada', () => {
  const r = tiroConEfecto(0)
  assert.ok(r.eventos.some(e => e.tipo === 'tronera' && e.bola === 1), 'la bola 1 cayó')
  const blanca = finalDe(r.bolas, 0)
  assert.equal(blanca.viva, true)
  assert.ok(Math.abs(avanceBlanca(r)) < 0.15, `blanca cerca del punto de impacto (d=${avanceBlanca(r).toFixed(3)})`)
})

test('draw: con backspin la blanca retrocede tras el impacto', () => {
  const r = tiroConEfecto(-0.8)
  assert.ok(r.eventos.some(e => e.tipo === 'tronera' && e.bola === 1), 'la bola 1 cayó')
  assert.ok(avanceBlanca(r) < -0.15, `la blanca volvió (avance=${avanceBlanca(r).toFixed(3)})`)
})

test('follow: con topspin la blanca sigue a la bola objetivo', () => {
  const r = tiroConEfecto(0.9)
  assert.ok(r.eventos.some(e => e.tipo === 'tronera' && e.bola === 1), 'la bola 1 cayó')
  // siguió con claridad (o se metió detrás de la bola 1: scratch de follow, válido)
  assert.ok(!finalDe(r.bolas, 0).viva || avanceBlanca(r) > 0.1, `la blanca siguió (avance=${avanceBlanca(r).toFixed(3)})`)
})

test('banda: rebote registra evento y devuelve la bola; el english cambia la salida', () => {
  const base = [bola(0, 0, 0)]
  const hacia = Math.atan2(0.3, 0.56) // hacia la banda derecha, subiendo
  const sinEfecto = simularTiro(base, tiro({ angulo: hacia, fuerza: 0.35, efectoLateral: 0 }))
  assert.ok(sinEfecto.eventos.some(e => e.tipo === 'banda' && e.bola === 0), 'hubo rebote en banda')
  assert.ok(finalDe(sinEfecto.bolas, 0).pos.x < 0.45, 'volvió de la banda')

  const conEfecto = simularTiro(base, tiro({ angulo: hacia, fuerza: 0.35, efectoLateral: 1 }))
  const dSalida = Math.hypot(
    finalDe(conEfecto.bolas, 0).pos.x - finalDe(sinEfecto.bolas, 0).pos.x,
    finalDe(conEfecto.bolas, 0).pos.y - finalDe(sinEfecto.bolas, 0).pos.y,
  )
  assert.ok(dSalida > 0.05, `el english desvió la salida (Δ=${dSalida})`)
})

test('tronera: apuntada al centro cae; apuntada al lado rebota (ceja/pared)', () => {
  const esquina = TRONERAS[1] // superior derecha
  // directo al centro de la boca
  const desde = { x: esquina.centro.x - 0.25, y: esquina.centro.y - 0.25 }
  const alCentro = Math.atan2(esquina.centro.y - desde.y, esquina.centro.x - desde.x)
  const r1 = simularTiro([bola(0, desde.x, desde.y)], tiro({ angulo: alCentro, fuerza: 0.35 }))
  assert.ok(r1.eventos.some(e => e.tipo === 'tronera' && e.bola === 0), 'la bola cayó en la tronera')
  assert.equal(finalDe(r1.bolas, 0).viva, false)

  // a la pared derecha, lejos de la boca: rebota en vez de caer ahí
  const objetivo = { x: PARAMETROS.anchoMesa / 2, y: 0.7 }
  const origen = { x: 0.1, y: 0.55 }
  const alLado = Math.atan2(objetivo.y - origen.y, objetivo.x - origen.x)
  const r2 = simularTiro([bola(0, origen.x, origen.y)], tiro({ angulo: alLado, fuerza: 0.22 }))
  assert.ok(r2.eventos.some(e => e.tipo === 'banda'), 'rebotó en la banda')
  assert.equal(finalDe(r2.bolas, 0).viva, true, 'siguió en la mesa')
})

test('postes de esquina no interfieren con una bola pegada a la banda (bug real de juego)', () => {
  // Una bola que viaja bien pegada a la banda derecha hacia la esquina
  // sup-derecha rozaba un poste posicionado sobre la propia banda y
  // rebotaba contra "algo invisible" en vez de entrar. Ver historial del
  // commit para el diagnóstico completo.
  const origen = { x: PARAMETROS.anchoMesa / 2 - R - 0.001, y: 0.5 }
  const r = simularTiro([bola(0, origen.x, origen.y)], tiro({ angulo: Math.PI / 2, fuerza: 0.5 }))
  assert.ok(r.eventos.some(e => e.tipo === 'tronera' && e.bola === 0), 'entró pegada a la banda, sin rebotes raros')
})

test('postes de esquina no interfieren con un tiro casi perfecto al bisector', () => {
  const esquina = TRONERAS[1]
  const origen = { x: 0.2, y: 0.3 }
  const angulo = Math.atan2(esquina.centro.y - origen.y, esquina.centro.x - origen.x)
  const r = simularTiro([bola(0, origen.x, origen.y)], tiro({ angulo, fuerza: 0.5 }))
  assert.ok(r.eventos.some(e => e.tipo === 'tronera' && e.bola === 0), 'un tiro bien apuntado no debe rebotar contra un poste')
})

test('break completo: termina, nada escapa de la mesa, velocidades acotadas', () => {
  const bolas = crearRack(123)
  const r = simularTiro(bolas, tiro({ angulo: Math.PI / 2, fuerza: 1 }))

  assert.ok(r.duracion < PARAMETROS.tMax, 'terminó antes del failsafe')
  for (const b of r.bolas) {
    if (!b.viva) continue
    assert.ok(b.quieta, `bola ${b.n} quedó quieta`)
    assert.ok(Math.abs(b.pos.x) <= PARAMETROS.anchoMesa / 2 + 0.09, `bola ${b.n} dentro (x)`)
    assert.ok(Math.abs(b.pos.y) <= PARAMETROS.altoMesa / 2 + 0.09, `bola ${b.n} dentro (y)`)
  }

  // velocidad implícita entre muestras nunca supera la del taco
  for (let i = 1; i < r.muestras.length; i++) {
    const dt = r.muestras[i].t - r.muestras[i - 1].t
    if (dt <= 0) continue
    for (const bm of r.muestras[i].bolas) {
      const previa = r.muestras[i - 1].bolas.find(p => p.n === bm.n)
      if (!previa) continue
      const v = Math.hypot(bm.x - previa.x, bm.y - previa.y) / dt
      assert.ok(v <= PARAMETROS.velMaxTaco * 1.1, `bola ${bm.n} a velocidad razonable (${v.toFixed(2)})`)
    }
  }

  // el break real mueve el rack: hubo contacto y varias bandas
  assert.ok(r.eventos.some(e => e.tipo === 'contacto_bola'), 'hubo contacto')
  assert.ok(r.eventos.filter(e => e.tipo === 'banda').length >= 2, 'hubo rebotes')
})

test('simulación sin muestras (modo bot) no genera frames', () => {
  const bolas = [bola(0, 0, -0.4), bola(1, 0, 0)]
  const r = simularTiro(bolas, tiro({ fuerza: 0.4 }), { sinMuestras: true })
  assert.equal(r.muestras.length, 0)
  assert.ok(r.eventos.length > 0)
})

test('posicionBlancaValida: límites, solapes y restricción de cabecera', () => {
  const bolas = [bola(0, 0, -0.5), bola(1, 0.2, 0.2)]
  assert.equal(posicionBlancaValida(bolas, { x: 0, y: 0 }, false), true)
  assert.equal(posicionBlancaValida(bolas, { x: 0.6, y: 0 }, false), false, 'fuera de la mesa')
  assert.equal(posicionBlancaValida(bolas, { x: 0.2, y: 0.21 }, false), false, 'solapa la bola 1')
  assert.equal(posicionBlancaValida(bolas, { x: 0, y: 0 }, true), false, 'arriba de la cabecera')
  assert.equal(posicionBlancaValida(bolas, { x: 0, y: CABECERA_Y - 0.1 }, true), true)
})

test('clonarBolas: la simulación no muta el estado original', () => {
  const bolas = [bola(0, 0, -0.4), bola(1, 0, 0)]
  const copia = clonarBolas(bolas)
  simularTiro(bolas, tiro({ fuerza: 0.8 }))
  assert.deepEqual(bolas, copia)
})
