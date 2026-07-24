// Geometría de la mesa: conversión entre coordenadas de mesa (metros, ver
// tipos.ts) y píxeles de pantalla, y el octágono real del paño jugable.
// 100% puro, sin dependencia de react-native — separado de transform.ts
// (que sí depende de Platform para SENSIBILIDAD_APUNTADO) justamente para
// poder testear esta geometría en Node sin arrastrar react-native/index.js
// (su sintaxis Flow no la puede parsear tsx/esbuild fuera de Metro).
//
// El fondo es el ARTE de assets/pool-assets/mesa.png: el canvas adopta el
// aspecto de la imagen y la superficie jugable de la física se mapea al rect
// del paño dibujado (fracciones calibradas a ojo sobre el asset). El paño del
// dibujo es ~1.70:1 y la física usa el 2:1 exacto de una mesa real, así que
// las escalas x/y difieren ~15% — imperceptible, y la física no se toca.
// (Si el arte se re-exporta con el paño exactamente 2:1, esto queda 1:1.)

import { PARAMETROS } from './fisica'
import { Vec2 } from './tipos'

// Calibración del asset mesa.png (1234×1852): bordes del paño jugable
// (la "nariz" de las bandas, el punto real donde una bola rebota — no
// donde el verde termina a simple vista) como fracción del ancho/alto de
// la imagen. Recalibrado sobre el archivo real (jul 2026, feedback de
// juego): la medición anterior (a partir de una captura de canvas de
// 513×770) quedaba corrida hacia afuera en las 4 bandas — las bolas
// llegaban a rebotar visiblemente más allá de la "nariz" real, sobre la
// zona de banda/madera (bug real de auditoría). Medido en píxeles
// directo sobre mesa.png (1234×1852) con un editor de fotos:
// superior 129px, inferior 129px, izquierdo 185px, derecho 190px.
export const ASSET_MESA = {
  aspecto: 1852 / 1234, // alto / ancho
  fx0: 0.1499, // 185/1234
  fx1: 0.846, // 1 - 190/1234
  fy0: 0.0697, // 129/1852
  fy1: 0.9303, // 1 - 129/1852
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

// Chaflán de esquina, en unidades de MESA (no píxeles calibrados a mano):
// el arte recorta cada esquina en diagonal antes de llegar a la tronera
// (así es una mesa de pool de verdad). Subido de 0.1 a 0.16 tras feedback
// de juego real (jul 2026): con 0.1 seguía viéndose una bola por encima de
// la zona de tronera/metal en la esquina — el bisel visual real del arte
// es más generoso que el radio de boca de la tronera (radioBocaEsquina en
// fisica.ts=0.105), que solo describe la zona sin pared, no el corte
// visual del paño. Pendiente de calibrar con precisión contra el overlay
// de debug (app/juegos/debug-pool.tsx) en dispositivo real.
const CHAFLAN_ESQUINA = 0.16 // unidades de mesa

// Vértices (en píxeles de pantalla) del octágono real de la mesa. Usado
// para recortar visualmente la capa de bolas (MesaPool.tsx) — así ninguna
// se ve "flotando" fuera del paño cerca de una esquina — y por el overlay
// de debug para la línea verde. Sin tocar la física.
//
// Los tramos RECTOS quedan anclados al borde REAL de la mesa (MX,MY) — NO
// al límite de banda de la física (lx,ly = MX-R,MY-R), que es el límite del
// CENTRO de una bola: el DIBUJO del círculo se extiende R más allá de su
// centro hacia la banda, así que anclar el polígono en lx/ly recortaría la
// mitad del borde de cualquier bola pegada a una banda recta. Una primera
// versión además calibraba los 8 vértices a mano, en píxeles, sobre una
// captura específica del arte — con offsets del mismo orden que el radio de
// una bola, agravando el mismo problema. Ambos bugs reales de auditoría,
// jul 2026 (reportado como "las bolas se ven tapadas"). Con el chaflán
// anclado al borde real y sin offsets ad-hoc, un círculo de radio R
// centrado en el límite físico (lx,ly) queda siempre dentro del polígono
// en los tramos rectos, por construcción — solo se recorta dentro del
// triángulo de cada esquina.
export function verticesOctagonoMesa(tf: TransformMesa): Vec2[] {
  const MX = PARAMETROS.anchoMesa / 2
  const MY = PARAMETROS.altoMesa / 2
  const c = CHAFLAN_ESQUINA
  const puntosMesa: Vec2[] = [
    { x: -MX + c, y: MY }, // sup-izq, sobre banda superior
    { x: MX - c, y: MY }, // sup-der, sobre banda superior
    { x: MX, y: MY - c }, // sup-der, sobre banda derecha
    { x: MX, y: -MY + c }, // inf-der, sobre banda derecha
    { x: MX - c, y: -MY }, // inf-der, sobre banda inferior
    { x: -MX + c, y: -MY }, // inf-izq, sobre banda inferior
    { x: -MX, y: -MY + c }, // inf-izq, sobre banda izquierda
    { x: -MX, y: MY - c }, // sup-izq, sobre banda izquierda
  ]
  return puntosMesa.map(p => tf.aPantalla(p))
}
