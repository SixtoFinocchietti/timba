// Guía de tiro — raycast puro desde la blanca en una dirección dada.
// calcularGuia() devuelve el primer impacto (bola o banda), la posición de
// la "ghost ball", la dirección que tomará la bola objetivo y la tangente
// de la blanca. La UI la dibuja; el bot la reutiliza para chequear líneas
// libres — su firma no cambió, sigue siendo compatible con esos usos.
//
// calcularTrayectoriaGuia() la extiende con rebotes en banda. Bug real de
// auditoría (jul 2026): la primera versión reflejaba el ángulo de forma
// ESPECULAR (como un espejo) — pero la banda real (rebotarPared, fisica.ts)
// no rebota así: la componente normal se frena con restBanda y la tangencial
// con fricBanda/englishBanda, factores DISTINTOS, así que ni siquiera un
// rebote sin efecto sale a un ángulo espejado (error sistemático, chico pero
// real en todos los rebotes). Con efecto lateral el error es mucho más
// grande: el english (wz) tuerce la tangencial vía vpt = vt − wz·R, y la
// guía vieja no sabía nada de eso. reflejarEnBanda() replica exactamente el
// mismo modelo normal/tangencial (ver docs/POOL_REVISION_TECNICA_Y_ROADMAP.md
// §1) trabajando sobre un vector unitario en vez de una velocidad real —
// sigue siendo una aproximación (el wz se trata como CONSTANTE en el
// trayecto, sin decaimientoWz — decir "va a curvar para este lado, más o
// menos así" alcanza para una guía, no hace falta simular tiro por tiro) —
// y ya no es sistemáticamente incorrecta como la versión anterior.
//
// Un tramo post-rebote solo se agrega si de verdad hay algo (bola u otra
// banda) dentro del alcance restante; si no, la guía simplemente no
// continúa. Tampoco se agrega si el impacto cae en la boca de una tronera
// (enBoca, fisica.ts): ahí no hay pared real, la bola real cae o la escupe
// un poste — dibujar un rebote ahí sería mostrar algo que no va a pasar.

import { enBoca, PARAMETROS, limitesJuego } from './fisica'
import { Bola, Vec2 } from './tipos'

const R = PARAMETROS.radioBola
// misma fuente de verdad que chocarBandas() (fisica.ts) — la guía tiene que
// terminar exactamente donde la bola de verdad rebota, no en un cálculo aparte
const { lx: LX, ly: LY } = limitesJuego()

export interface GuiaTiro {
  origen: Vec2
  // centro de la blanca en el momento del primer contacto (ghost ball si es bola)
  impacto: Vec2
  bolaObjetivo: number | null // null = la guía termina en una banda
  dirObjetivo: Vec2 | null // dirección de salida de la bola objetivo
  dirBlanca: Vec2 | null // tangente de la blanca tras el contacto (null si tiro pleno)
}

export interface SegmentoGuia {
  origen: Vec2
  fin: Vec2
  tipo: 'bola' | 'banda'
}

export interface TrayectoriaGuia {
  segmentos: SegmentoGuia[] // 1 elemento sin rebote, más si hubo rebotes en banda
  bolaObjetivo: number | null // null = la guía terminó en una banda (sin tocar nada)
  dirObjetivo: Vec2 | null
  dirBlanca: Vec2 | null
}

interface RayoImpacto {
  t: number
  punto: Vec2
  bola: Bola | null // null = impactó una banda
  normal: Vec2 | null // normal de la banda golpeada (solo si bola es null)
}

// primer impacto (bola o banda) desde `origen` viajando en dirección
// unitaria `d`, hasta como mucho `alcanceMax`. null = nada dentro del alcance.
function primerImpacto(bolas: Bola[], origen: Vec2, d: Vec2, alcanceMax: number): RayoImpacto | null {
  let tMin = Infinity
  let objetivo: Bola | null = null
  for (const b of bolas) {
    if (b.n === 0 || !b.viva) continue
    const ocx = b.pos.x - origen.x
    const ocy = b.pos.y - origen.y
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

  let tBanda = Infinity
  let normal: Vec2 | null = null
  if (d.x > 1e-9) { const t = (LX - origen.x) / d.x; if (t < tBanda) { tBanda = t; normal = { x: -1, y: 0 } } }
  if (d.x < -1e-9) { const t = (-LX - origen.x) / d.x; if (t < tBanda) { tBanda = t; normal = { x: 1, y: 0 } } }
  if (d.y > 1e-9) { const t = (LY - origen.y) / d.y; if (t < tBanda) { tBanda = t; normal = { x: 0, y: -1 } } }
  if (d.y < -1e-9) { const t = (-LY - origen.y) / d.y; if (t < tBanda) { tBanda = t; normal = { x: 0, y: 1 } } }

  if (objetivo && tMin < Math.min(tBanda, alcanceMax)) {
    return { t: tMin, punto: { x: origen.x + d.x * tMin, y: origen.y + d.y * tMin }, bola: objetivo, normal: null }
  }
  if (tBanda < alcanceMax && normal) {
    return { t: tBanda, punto: { x: origen.x + d.x * tBanda, y: origen.y + d.y * tBanda }, bola: null, normal }
  }
  return null
}

function datosImpactoBola(d: Vec2, impacto: Vec2, objetivo: Bola): { dirObjetivo: Vec2; dirBlanca: Vec2 | null } {
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
  return { dirObjetivo, dirBlanca }
}

const ALCANCE_TOTAL_DEFAULT = 6 // unidades de mesa (~2.7x el largo de la mesa)

// Refleja `d` (dirección UNITARIA) contra una banda de normal `normal`,
// replicando el modelo normal/tangencial real de rebotarPared() (fisica.ts)
// — NO una reflexión especular. `wz` es el english que tendría la blanca al
// llegar a la banda (0 = sin efecto). Devuelve un vector unitario: el
// raycast de esta guía (primerImpacto/restante) asume que `d` siempre tiene
// magnitud 1, así que hay que renormalizar tras la reflexión.
function reflejarEnBanda(d: Vec2, normal: Vec2, wz: number): Vec2 {
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
  const mag = Math.hypot(dx, dy) || 1
  return { x: dx / mag, y: dy / mag }
}

// wz que tendría la blanca según el efecto lateral elegido — misma fórmula
// que aplicarTiro() (fisica.ts), sin necesidad de simular. El efecto
// VERTICAL (draw/follow) no entra acá: solo mueve wx/wy, no wz — no afecta
// el ángulo de salida en banda.
function wzInicial(fuerza: number, efectoLateral: number): number {
  const a = Math.max(-1, Math.min(1, efectoLateral))
  const V = Math.max(0.05, Math.min(1, fuerza)) * PARAMETROS.velMaxTaco
  return ((2.5 * a) / R) * V * PARAMETROS.factorEnglish
}

export function calcularTrayectoriaGuia(
  bolas: Bola[],
  angulo: number,
  opts?: { maxRebotes?: number; alcanceTotal?: number; efectoLateral?: number; fuerza?: number },
): TrayectoriaGuia | null {
  const blanca = bolas.find(b => b.n === 0 && b.viva)
  if (!blanca) return null
  const maxRebotes = opts?.maxRebotes ?? 1
  const alcanceTotal = opts?.alcanceTotal ?? ALCANCE_TOTAL_DEFAULT

  const segmentos: SegmentoGuia[] = []
  let origen = blanca.pos
  let d: Vec2 = { x: Math.cos(angulo), y: Math.sin(angulo) }
  let restante = alcanceTotal
  let rebotes = 0
  let bolaObjetivo: number | null = null
  let dirObjetivo: Vec2 | null = null
  let dirBlanca: Vec2 | null = null
  let wz = wzInicial(opts?.fuerza ?? 0, opts?.efectoLateral ?? 0)

  while (restante > 0) {
    const esPrimerTramo = segmentos.length === 0
    const imp = primerImpacto(bolas, origen, d, restante)

    if (!imp) {
      // nada dentro del alcance restante: el primer tramo siempre se dibuja
      // (en una mesa real siempre hay una banda a distancia finita) hasta el
      // límite; un tramo post-rebote sin colisión real simplemente no se agrega.
      if (esPrimerTramo) {
        segmentos.push({ origen, fin: { x: origen.x + d.x * restante, y: origen.y + d.y * restante }, tipo: 'banda' })
      }
      break
    }

    segmentos.push({ origen, fin: imp.punto, tipo: imp.bola ? 'bola' : 'banda' })
    restante -= imp.t

    if (imp.bola) {
      const datos = datosImpactoBola(d, imp.punto, imp.bola)
      bolaObjetivo = imp.bola.n
      dirObjetivo = datos.dirObjetivo
      dirBlanca = datos.dirBlanca
      break // el raycast termina al tocar una bola
    }

    // dentro de la boca de una tronera no hay pared real: no seguir
    // dibujando un rebote que en la mesa real no va a pasar.
    if (rebotes >= maxRebotes || !imp.normal || enBoca(imp.punto)) break
    rebotes++
    d = reflejarEnBanda(d, imp.normal, wz)
    wz *= 1 - PARAMETROS.absorcionWzBanda // mismo consumo por rebote que la física real
    origen = imp.punto
  }

  return { segmentos, bolaObjetivo, dirObjetivo, dirBlanca }
}

export function calcularGuia(bolas: Bola[], angulo: number): GuiaTiro | null {
  const blanca = bolas.find(b => b.n === 0 && b.viva)
  if (!blanca) return null
  const trayectoria = calcularTrayectoriaGuia(bolas, angulo, { maxRebotes: 0, alcanceTotal: 10 })
  if (!trayectoria || trayectoria.segmentos.length === 0) return null
  return {
    origen: blanca.pos,
    impacto: trayectoria.segmentos[0].fin,
    bolaObjetivo: trayectoria.bolaObjetivo,
    dirObjetivo: trayectoria.dirObjetivo,
    dirBlanca: trayectoria.dirBlanca,
  }
}
