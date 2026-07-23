// Tests de la guía de tiro (raycast + rebote en banda).
// Correr: npx tsx --test src/lib/pool/*.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PARAMETROS } from './fisica'
import { calcularGuia, calcularTrayectoriaGuia } from './guia'
import { Bola } from './tipos'

const R = PARAMETROS.radioBola
const LX = PARAMETROS.anchoMesa / 2 - R
const LY = PARAMETROS.altoMesa / 2 - R

function bola(n: number, x: number, y: number): Bola {
  return { n, pos: { x, y }, vel: { x: 0, y: 0 }, wx: 0, wy: 0, wz: 0, viva: true, quieta: true, rot: 0, dirX: 0, dirY: 1 }
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

test('calcularTrayectoriaGuia: un rebote refleja el ángulo correctamente (banda vertical)', () => {
  const bolas = [bola(0, 0, 0)]
  const trayectoria = calcularTrayectoriaGuia(bolas, 0, { maxRebotes: 1 }) // hacia +x
  assert.ok(trayectoria)
  assert.equal(trayectoria!.segmentos.length, 2, 'primer tramo a la banda + tramo reflejado')
  assert.equal(trayectoria!.segmentos[0].tipo, 'banda')
  assert.ok(Math.abs(trayectoria!.segmentos[0].fin.x - LX) < 1e-6, 'primer impacto en la banda derecha')
  // reflexión de una dirección puramente horizontal contra una banda
  // vertical: el segundo tramo vuelve hacia -x y llega a la banda izquierda
  const seg2 = trayectoria!.segmentos[1]
  assert.ok(Math.abs(seg2.fin.x - -LX) < 1e-6, `rebote llega a la banda izquierda (x=${seg2.fin.x})`)
  assert.ok(Math.abs(seg2.fin.y - 0) < 1e-6, 'sin componente y: la reflexión no debería introducir una')
})

test('calcularTrayectoriaGuia: sin nada dentro del alcance tras el rebote, no agrega ese tramo', () => {
  const bolas = [bola(0, 0, 0)]
  // alcance apenas mayor que el primer tramo (~LX): no debería alcanzar para
  // encontrar la banda opuesta tras reflejar
  const trayectoria = calcularTrayectoriaGuia(bolas, 0, { maxRebotes: 1, alcanceTotal: LX + 0.05 })
  assert.ok(trayectoria)
  assert.equal(trayectoria!.segmentos.length, 1, 'el tramo post-rebote no se dibuja si no hay colisión en rango')
})

test('calcularTrayectoriaGuia: encuentra una bola después del rebote', () => {
  const bolas = [bola(0, 0, 0), bola(1, -0.2, 0)]
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
