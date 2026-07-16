// Guía de tiro — raycast puro desde la blanca en una dirección dada.
// Devuelve el primer impacto (bola o banda), la posición de la "ghost ball",
// la dirección que tomará la bola objetivo y la tangente de la blanca.
// La UI la dibuja; el bot (fase 3) la reutiliza para chequear líneas libres.

import { PARAMETROS } from './fisica'
import { Bola, Vec2 } from './tipos'

const R = PARAMETROS.radioBola

export interface GuiaTiro {
  origen: Vec2
  // centro de la blanca en el momento del primer contacto (ghost ball si es bola)
  impacto: Vec2
  bolaObjetivo: number | null // null = la guía termina en una banda
  dirObjetivo: Vec2 | null // dirección de salida de la bola objetivo
  dirBlanca: Vec2 | null // tangente de la blanca tras el contacto (null si tiro pleno)
}

export function calcularGuia(bolas: Bola[], angulo: number): GuiaTiro | null {
  const blanca = bolas.find(b => b.n === 0 && b.viva)
  if (!blanca) return null
  const o = blanca.pos
  const d: Vec2 = { x: Math.cos(angulo), y: Math.sin(angulo) }

  // primer contacto con una bola: rayo vs círculo de radio 2R
  let tMin = Infinity
  let objetivo: Bola | null = null
  for (const b of bolas) {
    if (b.n === 0 || !b.viva) continue
    const ocx = b.pos.x - o.x
    const ocy = b.pos.y - o.y
    const tca = ocx * d.x + ocy * d.y
    if (tca <= 0) continue
    const d2 = ocx * ocx + ocy * ocy - tca * tca
    const r2 = 4 * R * R
    if (d2 >= r2) continue
    const t = tca - Math.sqrt(r2 - d2)
    if (t < tMin) {
      tMin = t
      objetivo = b
    }
  }

  // distancia a las bandas (límite del centro de la bola)
  const lx = PARAMETROS.anchoMesa / 2 - R
  const ly = PARAMETROS.altoMesa / 2 - R
  let tBanda = Infinity
  if (d.x > 1e-9) tBanda = Math.min(tBanda, (lx - o.x) / d.x)
  if (d.x < -1e-9) tBanda = Math.min(tBanda, (-lx - o.x) / d.x)
  if (d.y > 1e-9) tBanda = Math.min(tBanda, (ly - o.y) / d.y)
  if (d.y < -1e-9) tBanda = Math.min(tBanda, (-ly - o.y) / d.y)

  if (objetivo && tMin < tBanda) {
    const impacto: Vec2 = { x: o.x + d.x * tMin, y: o.y + d.y * tMin }
    const nx = objetivo.pos.x - impacto.x
    const ny = objetivo.pos.y - impacto.y
    const nMag = Math.hypot(nx, ny) || 1
    const dirObjetivo: Vec2 = { x: nx / nMag, y: ny / nMag }
    // tangente: componente del rayo perpendicular a la línea de centros
    const dot = d.x * dirObjetivo.x + d.y * dirObjetivo.y
    const tx = d.x - dot * dirObjetivo.x
    const ty = d.y - dot * dirObjetivo.y
    const tMag = Math.hypot(tx, ty)
    const dirBlanca: Vec2 | null = tMag > 0.05 ? { x: tx / tMag, y: ty / tMag } : null
    return { origen: o, impacto, bolaObjetivo: objetivo.n, dirObjetivo, dirBlanca }
  }

  const t = Math.max(0, Math.min(tBanda, 10))
  return {
    origen: o,
    impacto: { x: o.x + d.x * t, y: o.y + d.y * t },
    bolaObjetivo: null,
    dirObjetivo: null,
    dirBlanca: null,
  }
}
