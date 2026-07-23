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
// Medido por el usuario en píxeles sobre una captura de 513×770 (canvas real,
// sin la barra de título/leyenda) con un editor de fotos — no a ojo como la
// calibración original. Ver también los offsets de troneras en fisica.ts,
// resueltos con el mismo procedimiento a partir de estos mismos números.
export const ASSET_MESA = {
  aspecto: 1852 / 1234, // alto / ancho
  fx0: 0.1261,
  fx1: 0.8701,
  fy0: 0.0596,
  fy1: 0.9406,
} as const

export const RELACION_ASPECTO = ASSET_MESA.aspecto // alto/ancho del canvas

export interface TransformMesa {
  anchoPx: number
  altoPx: number
  sx: number // px por unidad de mesa en x
  sy: number // px por unidad de mesa en y
  radioBolaPx: number // mínimo de sx/sy: el dibujo nunca excede el hit-box real
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
    // el asset y la física no son EXACTAMENTE proporcionales (ver nota de
    // arriba), así que sx≠sy — dibujar con la media geométrica hacía que el
    // círculo se pasara del hit-box real en el eje "comprimido" (la bola
    // parecía cruzar bandas/troneras que en la física todavía no tocó). Con
    // el mínimo, el dibujo nunca excede la física en ningún eje.
    radioBolaPx: PARAMETROS.radioBola * Math.min(sx, sy),
    aPantalla: v => ({ x: cx + v.x * sx, y: cy - v.y * sy }),
    aMesa: (px, py) => ({ x: (px - cx) / sx, y: (cy - py) / sy }),
  }
}
