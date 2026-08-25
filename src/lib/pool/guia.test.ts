// Tests de la guía de tiro (raycast + rebote en banda).
// Correr: npx tsx --test src/lib/pool/*.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { limitesJuego, PARAMETROS, TRONERAS } from './fisica'
import { calcularGuia, calcularTrayectoriaGuia } from './guia'
import { Bola, Vec2 } from './tipos'

// misma fuente de verdad que la física real (chocarBandas) — nunca
// recalcular esto en paralelo, es justo el bug que motivó este archivo
const { lx: LX, ly: LY } = limitesJuego()
const R = PARAMETROS.radioBola

// Reimplementación de referencia del modelo normal/tangencial de
// rebotarPared() (fisica.ts) — a propósito NO importa nada de guia.ts, para
// no validar el código contra sí mismo. Mismos parámetros y misma fórmula
// que la auditoría técnica documentó en
// docs/POOL_REVISION_TECNICA_Y_ROADMAP.md §1.
function reflexionEsperada(d: Vec2, normal: Vec2, wz: number): Vec2 {
  const tx = -normal.y
  const ty = normal.x
  const vn = d.x * normal.x + d.y * normal.y
  let vt = d.x * tx + d.y * ty
  const vpt = vt - wz * R
  vt -= PARAMETROS.fricBanda * vpt * PARAMETROS.englishBanda
  vt -= PARAMETROS.fricBanda * vt * (1 - PARAMETROS.englishBanda)
  const vnNuevo = -PARAMETROS.restBanda * vn
  const dx = vnNuevo * normal.x + vt * tx
  const dy = vnNuevo * normal.y + vt * ty
  const mag = Math.hypot(dx, dy)
  return { x: dx / mag, y: dy / mag }
}

function wzEsperado(fuerza: number, efectoLateral: number): number {
  const a = Math.max(-1, Math.min(1, efectoLateral))
  const V = Math.max(0.05, Math.min(1, fuerza)) * PARAMETROS.velMaxTaco
  return ((2.5 * a) / R) * V * PARAMETROS.factorEnglish
}

// dirección unitaria del segundo tramo (post-rebote) de una trayectoria
function dirSegundoTramo(t: NonNullable<ReturnType<typeof calcularTrayectoriaGuia>>): Vec2 {
  const s = t.segmentos[1]
  const m = Math.hypot(s.fin.x - s.origen.x, s.fin.y - s.origen.y)
  return { x: (s.fin.x - s.origen.x) / m, y: (s.fin.y - s.origen.y) / m }
}

function bola(n: number, x: number, y: number): Bola {
  return {
    n, pos: { x, y }, vel: { x: 0, y: 0 }, wx: 0, wy: 0, wz: 0, viva: true, quieta: true,
    rot: 0, dirX: 0, dirY: 1, qx: 0, qy: 0, qz: 0, qw: 1,
  }
}

test('calcularGuia: tiro directo a una bola sin obstáculos', () => {
  const bolas = [bola(0, 0, -0.3), bola(1, 0, 0.3)]
  const guia = calcularGuia(bolas, Math.PI / 2)
  assert.ok(guia)
  assert.equal(guia!.bolaObjetivo, 1)
  assert.ok(guia!.dirObjetivo, 'hay dirección de salida de la bola objetivo')
})

test('calcularGuia: sin nada en el camino, termina en la banda', () => {
  const bolas = [bola(0, 0, 0)]
  const guia = calcularGuia(bolas, 0) // hacia +x
  assert.ok(guia)
  assert.equal(guia!.bolaObjetivo, null)
  assert.ok(Math.abs(guia!.impacto.x - LX) < 1e-6, `impacto en la banda derecha (x=${guia!.impacto.x})`)
})

test('calcularTrayectoriaGuia: maxRebotes 0 coincide con calcularGuia', () => {
  const bolas = [bola(0, 0, 0)]
  const guia = calcularGuia(bolas, 0.7)
  const trayectoria = calcularTrayectoriaGuia(bolas, 0.7, { maxRebotes: 0, alcanceTotal: 10 })
  assert.ok(trayectoria)
  assert.equal(trayectoria!.segmentos.length, 1)
  assert.ok(Math.abs(trayectoria!.segmentos[0].fin.x - guia!.impacto.x) < 1e-9)
  assert.ok(Math.abs(trayectoria!.segmentos[0].fin.y - guia!.impacto.y) < 1e-9)
})

// Nota (auditoría técnica jul 2026, Fase 7.4): estos tests usaban y=0 para el
// impacto en banda — que es EXACTAMENTE el centro de la banda larga, donde
// vive la tronera lateral (TRONERAS id 2/3, centrada en y=0). Con el fix que
// no dibuja rebote dentro de la boca de una tronera, ese tiro ahora termina
// en la boca (correcto: en la mesa real esa bola cae, no rebota) — se movió
// el impacto a y=0.3, lejos de cualquier tronera, para volver a testear el
// rebote en banda "limpia" que estos tests quieren cubrir.

test('calcularTrayectoriaGuia: un rebote refleja el ángulo correctamente (banda vertical)', () => {
  const bolas = [bola(0, 0, 0.3)]
  const trayectoria = calcularTrayectoriaGuia(bolas, 0, { maxRebotes: 1 }) // hacia +x
  assert.ok(trayectoria)
  assert.equal(trayectoria!.segmentos.length, 2, 'primer tramo a la banda + tramo reflejado')
  assert.equal(trayectoria!.segmentos[0].tipo, 'banda')
  assert.ok(Math.abs(trayectoria!.segmentos[0].fin.x - LX) < 1e-6, 'primer impacto en la banda derecha')
  // impacto perpendicular (ángulo 0 contra una banda vertical): en este caso
  // particular no hay componente tangencial, así que el modelo normal/
  // tangencial y la vieja reflexión especular coinciden — vuelve hacia -x
  // por la banda izquierda, sin cambiar de y
  const seg2 = trayectoria!.segmentos[1]
  assert.ok(Math.abs(seg2.fin.x - -LX) < 1e-6, `rebote llega a la banda izquierda (x=${seg2.fin.x})`)
  assert.ok(Math.abs(seg2.fin.y - 0.3) < 1e-6, 'impacto perpendicular: la reflexión no debería cambiar la y')
})

test('calcularTrayectoriaGuia: sin nada dentro del alcance tras el rebote, no agrega ese tramo', () => {
  const bolas = [bola(0, 0, 0.3)]
  // alcance apenas mayor que el primer tramo (~LX): no debería alcanzar para
  // encontrar la banda opuesta tras reflejar
  const trayectoria = calcularTrayectoriaGuia(bolas, 0, { maxRebotes: 1, alcanceTotal: LX + 0.05 })
  assert.ok(trayectoria)
  assert.equal(trayectoria!.segmentos.length, 1, 'el tramo post-rebote no se dibuja si no hay colisión en rango')
})

test('calcularTrayectoriaGuia: encuentra una bola después del rebote', () => {
  const bolas = [bola(0, 0, 0.3), bola(1, -0.2, 0.3)]
  const trayectoria = calcularTrayectoriaGuia(bolas, 0, { maxRebotes: 1 })
  assert.ok(trayectoria)
  assert.equal(trayectoria!.segmentos.length, 2)
  assert.equal(trayectoria!.segmentos[1].tipo, 'bola')
  assert.equal(trayectoria!.bolaObjetivo, 1)
})

test('calcularTrayectoriaGuia: sin blanca viva devuelve null', () => {
  const bolas = [{ ...bola(0, 0, 0), viva: false }]
  assert.equal(calcularTrayectoriaGuia(bolas, 0), null)
})

// ─── auditoría técnica jul 2026: el rebote ya NO es una reflexión especular ──

test('calcularTrayectoriaGuia: rebote rasante sin efecto — coincide con el modelo normal/tangencial real, no con el espejo', () => {
  const bolas = [bola(0, 0, 0)]
  const angulo = 0.6 // rasante contra la banda derecha, lejos de cualquier tronera
  const trayectoria = calcularTrayectoriaGuia(bolas, angulo, { maxRebotes: 1 })
  assert.ok(trayectoria)
  assert.equal(trayectoria!.segmentos.length, 2)

  const d: Vec2 = { x: Math.cos(angulo), y: Math.sin(angulo) }
  const normal: Vec2 = { x: -1, y: 0 } // banda derecha
  const esperado = reflexionEsperada(d, normal, 0)
  const real = dirSegundoTramo(trayectoria!)
  assert.ok(Math.abs(real.x - esperado.x) < 1e-9, `x: real=${real.x} esperado=${esperado.x}`)
  assert.ok(Math.abs(real.y - esperado.y) < 1e-9, `y: real=${real.y} esperado=${esperado.y}`)

  // y, sobre todo, confirma que YA NO es la vieja reflexión especular (espejo)
  const dotEsp = d.x * normal.x + d.y * normal.y
  const especular: Vec2 = { x: d.x - 2 * dotEsp * normal.x, y: d.y - 2 * dotEsp * normal.y }
  const distanciaAEspecular = Math.hypot(real.x - especular.x, real.y - especular.y)
  assert.ok(distanciaAEspecular > 0.015, `el rebote corregido tiene que diferir del espejo (distancia=${distanciaAEspecular})`)
})

test('calcularTrayectoriaGuia: el efecto lateral conocido tuerce el rebote de forma medible', () => {
  const bolas = [bola(0, 0, 0)]
  const angulo = 0.6
  const sinEfecto = calcularTrayectoriaGuia(bolas, angulo, { maxRebotes: 1 })
  const conEfecto = calcularTrayectoriaGuia(bolas, angulo, { maxRebotes: 1, efectoLateral: 0.3, fuerza: 0.5 })
  assert.ok(sinEfecto && conEfecto)
  assert.equal(sinEfecto!.segmentos.length, 2)
  assert.equal(conEfecto!.segmentos.length, 2)

  const normal: Vec2 = { x: -1, y: 0 }
  const d: Vec2 = { x: Math.cos(angulo), y: Math.sin(angulo) }
  const esperadoConEfecto = reflexionEsperada(d, normal, wzEsperado(0.5, 0.3))
  const realConEfecto = dirSegundoTramo(conEfecto!)
  assert.ok(Math.abs(realConEfecto.x - esperadoConEfecto.x) < 1e-9)
  assert.ok(Math.abs(realConEfecto.y - esperadoConEfecto.y) < 1e-9)

  // el efecto tiene que cambiar el resultado de forma clara, no marginal
  const realSinEfecto = dirSegundoTramo(sinEfecto!)
  const distancia = Math.hypot(realSinEfecto.x - realConEfecto.x, realSinEfecto.y - realConEfecto.y)
  assert.ok(distancia > 0.1, `el efecto lateral tiene que torcer el rebote (distancia=${distancia})`)
})

test('calcularTrayectoriaGuia: no dibuja rebote si el impacto cae en la boca de una tronera', () => {
  const bolas = [bola(0, 0, 0)]
  const tr = TRONERAS[1] // esquina superior derecha
  const angulo = Math.atan2(tr.centro.y, tr.centro.x)
  const trayectoria = calcularTrayectoriaGuia(bolas, angulo, { maxRebotes: 1 })
  assert.ok(trayectoria)
  assert.equal(trayectoria!.segmentos.length, 1, 'no debe agregar un tramo reflejado dentro de la boca de una tronera')
})
