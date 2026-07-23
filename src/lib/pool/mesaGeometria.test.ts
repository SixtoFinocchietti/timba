// Tests de transform.ts — sobre todo el octágono de recorte visual, que tuvo
// dos bugs reales (auditoría, jul 2026): anclarlo al límite de CENTRO de
// bola en vez del borde real de la mesa, y offsets de esquina calibrados a
// mano del mismo orden que el radio de una bola. Ambos recortaban el borde
// de bolas pegadas a una banda recta.
// Correr: npx tsx --test src/lib/pool/*.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PARAMETROS } from './fisica'
import { crearTransform, verticesOctagonoMesa } from './mesaGeometria'

const R = PARAMETROS.radioBola

for (const anchoPx of [200, 513, 900]) {
  test(`verticesOctagonoMesa: tramos rectos anclados al borde real de la mesa (anchoPx=${anchoPx})`, () => {
    const tf = crearTransform(anchoPx)
    const v = verticesOctagonoMesa(tf)
    const MX = PARAMETROS.anchoMesa / 2
    const MY = PARAMETROS.altoMesa / 2

    // banda superior (v0-v1) e inferior (v4-v5): Y exacto al borde real
    const ySup = tf.aPantalla({ x: 0, y: MY }).y
    const yInf = tf.aPantalla({ x: 0, y: -MY }).y
    assert.ok(Math.abs(v[0].y - ySup) < 1e-6 && Math.abs(v[1].y - ySup) < 1e-6, 'banda superior en el borde real')
    assert.ok(Math.abs(v[4].y - yInf) < 1e-6 && Math.abs(v[5].y - yInf) < 1e-6, 'banda inferior en el borde real')

    // banda izquierda (v6-v7) y derecha (v2-v3): X exacto al borde real
    const xIzq = tf.aPantalla({ x: -MX, y: 0 }).x
    const xDer = tf.aPantalla({ x: MX, y: 0 }).x
    assert.ok(Math.abs(v[6].x - xIzq) < 1e-6 && Math.abs(v[7].x - xIzq) < 1e-6, 'banda izquierda en el borde real')
    assert.ok(Math.abs(v[2].x - xDer) < 1e-6 && Math.abs(v[3].x - xDer) < 1e-6, 'banda derecha en el borde real')
  })

  test(`verticesOctagonoMesa: una bola pegada a cualquier banda recta queda completa dentro del octágono (anchoPx=${anchoPx})`, () => {
    const tf = crearTransform(anchoPx)
    const v = verticesOctagonoMesa(tf)
    const rPx = tf.radioBolaPx
    const lx = PARAMETROS.anchoMesa / 2 - R
    const ly = PARAMETROS.altoMesa / 2 - R

    // centro de una bola pegada a cada banda (a mitad de camino del tramo recto)
    const pegadaIzq = tf.aPantalla({ x: -lx, y: 0 })
    const pegadaSup = tf.aPantalla({ x: 0, y: ly })

    const bordeIzqPoligono = Math.min(v[6].x, v[7].x)
    const bordeSupPoligono = Math.min(v[0].y, v[1].y)

    assert.ok(pegadaIzq.x - rPx >= bordeIzqPoligono - 0.5, 'el círculo pegado a la banda izquierda no se recorta')
    assert.ok(pegadaSup.y - rPx >= bordeSupPoligono - 0.5, 'el círculo pegado a la banda superior no se recorta')
  })
}
