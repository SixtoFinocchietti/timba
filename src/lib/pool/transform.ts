// Conversión entre coordenadas de mesa (metros, ver tipos.ts) y píxeles de
// pantalla. Puro: lo usan tanto el canvas (dibujo) como los gestos (input).
//
// El fondo es el ARTE de assets/pool-assets/mesa.png: el canvas adopta el
// aspecto de la imagen y la superficie jugable de la física se mapea al rect
// del paño dibujado (fracciones calibradas a ojo sobre el asset). El paño del
// dibujo es ~1.70:1 y la física usa el 2:1 exacto de una mesa real, así que
// las escalas x/y difieren ~15% — imperceptible, y la física no se toca.
// (Si el arte se re-exporta con el paño exactamente 2:1, esto queda 1:1.)

import { Platform } from 'react-native'
import { PARAMETROS } from './fisica'
import { Vec2 } from './tipos'

// Sensibilidad del apuntado por arrastre (rad por metro de arrastre
// tangencial). Feedback real de usuario: en web (mouse) 2.2 quedaba alto;
// en Android quedaba tan bajo que un giro de 180° necesitaba varios
// arrastres con el dedo levantado — no hay un único valor que sirva para
// ambos por cómo RNGH reporta los deltas en cada plataforma.
export const SENSIBILIDAD_APUNTADO = Platform.select({ web: 1.7, default: 6.5 })!

// Calibración del asset mesa.png (1234×1852): bordes del paño jugable
// (la "nariz" de las bandas) como fracción del ancho/alto de la imagen.
export const ASSET_MESA = {
  aspecto: 1852 / 1234, // alto / ancho
  fx0: 0.159,
  fx1: 0.843,
  fy0: 0.117,
  fy1: 0.891,
} as const

export const RELACION_ASPECTO = ASSET_MESA.aspecto // alto/ancho del canvas

export interface TransformMesa {
  anchoPx: number
  altoPx: number
  sx: number // px por unidad de mesa en x
  sy: number // px por unidad de mesa en y
  radioBolaPx: number // media geométrica: reparte la anisotropía
  aPantalla: (v: Vec2) => { x: number; y: number }
  aMesa: (px: number, py: number) => Vec2
}

export function crearTransform(anchoPx: number): TransformMesa {
  const altoPx = anchoPx * ASSET_MESA.aspecto
  const cx = anchoPx * ((ASSET_MESA.fx0 + ASSET_MESA.fx1) / 2)
  const cy = altoPx * ((ASSET_MESA.fy0 + ASSET_MESA.fy1) / 2)
  const sx = (anchoPx * (ASSET_MESA.fx1 - ASSET_MESA.fx0)) / PARAMETROS.anchoMesa
  const sy = (altoPx * (ASSET_MESA.fy1 - ASSET_MESA.fy0)) / PARAMETROS.altoMesa
  return {
    anchoPx,
    altoPx,
    sx,
    sy,
    radioBolaPx: PARAMETROS.radioBola * Math.sqrt(sx * sy),
    aPantalla: v => ({ x: cx + v.x * sx, y: cy - v.y * sy }),
    aMesa: (px, py) => ({ x: (px - cx) / sx, y: (cy - py) / sy }),
  }
}
