// Conversión entre coordenadas de mesa (metros, ver tipos.ts) y píxeles de
// pantalla. Puro: lo usan tanto el canvas (dibujo) como los gestos (input).
//
// La mesa se dibuja con banda + marco de madera alrededor de la superficie
// jugable; el origen de mesa (0,0) queda en el centro del canvas y el eje y
// de mesa apunta HACIA ARRIBA (pantalla: hacia abajo), por eso se invierte.

import { PARAMETROS } from './fisica'
import { Vec2 } from './tipos'

export const ANCHO_BANDA = 0.05 // banda de goma visible (unidades de mesa)
export const ANCHO_MARCO = 0.07 // marco de madera

const EXTRA = 2 * (ANCHO_BANDA + ANCHO_MARCO)
export const ANCHO_TOTAL_MESA = PARAMETROS.anchoMesa + EXTRA
export const ALTO_TOTAL_MESA = PARAMETROS.altoMesa + EXTRA
export const RELACION_ASPECTO = ALTO_TOTAL_MESA / ANCHO_TOTAL_MESA // ≈ 1.82

export interface TransformMesa {
  anchoPx: number
  altoPx: number
  escala: number // px por unidad de mesa
  aPantalla: (v: Vec2) => { x: number; y: number }
  aMesa: (px: number, py: number) => Vec2
}

export function crearTransform(anchoPx: number): TransformMesa {
  const escala = anchoPx / ANCHO_TOTAL_MESA
  const altoPx = anchoPx * RELACION_ASPECTO
  const cx = anchoPx / 2
  const cy = altoPx / 2
  return {
    anchoPx,
    altoPx,
    escala,
    aPantalla: v => ({ x: cx + v.x * escala, y: cy - v.y * escala }),
    aMesa: (px, py) => ({ x: (px - cx) / escala, y: (cy - py) / escala }),
  }
}
