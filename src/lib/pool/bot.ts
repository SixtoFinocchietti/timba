// IA del bot — comportamiento humano, no porcentaje (spec §10).
//
// Un solo cerebro en cuatro etapas, tres personalidades por parámetros:
//   1. GENERADOR    por cada bola legal × cada tronera: ghost ball, ¿camino
//                   libre?, ángulo de corte → candidatos.
//   2. EVALUADOR    probabilidad de emboque = f(corte, distancias, tronera).
//   3. PLANIFICADOR 0 / 1 / 2 tiros de anticipación con simulaciones forward
//                   reales del motor (simularTiro sinMuestras); el Difícil
//                   además juega seguridades deliberadas (snooker).
//   4. EJECUTOR     RUIDO en el INPUT (gaussiano en ángulo y fuerza, sesgos
//                   por perfil) — la física hace el resto: los fallos se ven
//                   humanos, nunca hay dados visibles.
//
// El bot usa exactamente el mismo motor y las mismas reglas que el jugador:
// cero información privilegiada. Determinista dado un rng seedeado (tests).

import { crearRng, PARAMETROS, TRONERAS, Tronera, CABECERA_Y, PIE, clonarBolas, posicionBlancaValida, simularTiro } from './fisica'
import { calcularGuia } from './guia'
import { EstadoJuego, bolasObjetivoDe, resolverTiro, rival } from './reglas'
import { Bola, Tiro, Vec2 } from './tipos'

export type Dificultad = 'facil' | 'normal' | 'dificil'

export interface DecisionBot {
  tiro: Tiro
  posBlanca?: Vec2 // si había bola en mano, dónde la coloca
  pensarMs: number
  seguridad: boolean
  objetivo: number | null // bola a la que apunta (UI / tests)
}

interface Perfil {
  sigmaAngulo: number // rad — error de ejecución base
  sigmaFuerza: number
  sesgoFuerza: number // >1 = le pega de más (típico principiante)
  escalaConDificultad: boolean // el error crece en tiros difíciles
  usaSpin: boolean
  planifica: 0 | 1 | 2 // tiros de anticipación
  umbralSeguridad: number // si el mejor tiro baja de esto, juega seguro
  probErrorLectura: number // elige una bola equivocada (faltas reales)
  eligePorCercania: boolean // fácil: la bola "más cerca de una tronera"
  presionOcho: number // multiplicador de sigma en la bola 8
  pensarMs: [number, number]
}

export const PERFILES: Record<Dificultad, Perfil> = {
  facil: {
    sigmaAngulo: 0.061, sigmaFuerza: 0.15, sesgoFuerza: 1.25,
    escalaConDificultad: false, usaSpin: false, planifica: 0,
    umbralSeguridad: 0, probErrorLectura: 0.1, eligePorCercania: true,
    presionOcho: 1, pensarMs: [800, 2000],
  },
  // Nota de calibración: el error angular se amplifica ~d1/(2R) (≈10×) al
  // pasar por la ghost ball — sigmas chicos YA producen fallos humanos.
  normal: {
    sigmaAngulo: 0.012, sigmaFuerza: 0.08, sesgoFuerza: 1.0,
    escalaConDificultad: true, usaSpin: true, planifica: 1,
    umbralSeguridad: 0.33, probErrorLectura: 0, eligePorCercania: false,
    presionOcho: 1.15, pensarMs: [1500, 3500],
  },
  dificil: {
    sigmaAngulo: 0.003, sigmaFuerza: 0.035, sesgoFuerza: 1.0,
    escalaConDificultad: true, usaSpin: true, planifica: 2,
    umbralSeguridad: 0.45, probErrorLectura: 0, eligePorCercania: false,
    presionOcho: 1.3, pensarMs: [2500, 5000],
  },
}

const R = PARAMETROS.radioBola

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gauss(rng: () => number): number {
  const u = Math.max(rng(), 1e-9)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}

function distSegmentoPunto(a: Vec2, b: Vec2, p: Vec2): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const l2 = abx * abx + aby * aby
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2))
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby))
}

function conBlancaEn(bolas: Bola[], pos: Vec2): Bola[] {
  return bolas.map(b => (b.n === 0 ? { ...b, pos: { ...pos }, viva: true } : b))
}

// ─── Generador + evaluador ───────────────────────────────────────────────────

interface Candidato {
  bola: number
  tronera: Tronera
  angulo: number // dirección blanca → ghost ball
  fuerza: number
  prob: number
  dificultadTiro: number // 0 fácil .. 1 límite (escala el ruido)
}

function generarCandidatos(bolas: Bola[], objetivos: number[]): Candidato[] {
  const blanca = bolas.find(b => b.n === 0 && b.viva)
  if (!blanca) return []
  const candidatos: Candidato[] = []

  for (const n of objetivos) {
    const bola = bolas.find(b => b.n === n && b.viva)
    if (!bola) continue

    for (const tr of TRONERAS) {
      const haciaTronera = { x: tr.centro.x - bola.pos.x, y: tr.centro.y - bola.pos.y }
      const d2 = Math.hypot(haciaTronera.x, haciaTronera.y)
      if (d2 < 0.001) continue
      const dir2 = { x: haciaTronera.x / d2, y: haciaTronera.y / d2 }

      // ghost ball: donde debe estar la blanca al contactar
      const ghost = { x: bola.pos.x - dir2.x * 2 * R, y: bola.pos.y - dir2.y * 2 * R }
      const haciaGhost = { x: ghost.x - blanca.pos.x, y: ghost.y - blanca.pos.y }
      const d1 = Math.hypot(haciaGhost.x, haciaGhost.y)
      if (d1 < 0.01) continue
      const dir1 = { x: haciaGhost.x / d1, y: haciaGhost.y / d1 }

      // ángulo de corte: >78° es infactible
      const cosCorte = dir1.x * dir2.x + dir1.y * dir2.y
      if (cosCorte < 0.2) continue

      // camino blanca → ghost: la guía debe encontrar exactamente esta bola
      const angulo = Math.atan2(haciaGhost.y, haciaGhost.x)
      const guia = calcularGuia(bolas, angulo)
      if (!guia || guia.bolaObjetivo !== n) continue

      // camino bola → tronera despejado
      let libre = true
      for (const otra of bolas) {
        if (!otra.viva || otra.n === n || otra.n === 0) continue
        if (distSegmentoPunto(bola.pos, tr.centro, otra.pos) < 2 * R - 0.002) {
          libre = false
          break
        }
      }
      if (!libre) continue

      const lateral = tr.id === 2 || tr.id === 3
      let prob = Math.pow(cosCorte, 1.6) * Math.exp(-(d1 + d2) / 2.2)
      if (lateral) prob *= 0.8
      prob = Math.max(0.02, Math.min(0.98, prob))

      const fuerza = Math.max(0.15, Math.min(0.92, 0.16 + 0.14 * d1 + (0.2 * d2) / Math.max(cosCorte, 0.35)))
      const dificultadTiro = Math.max(0, Math.min(1, 1 - prob * 1.4))

      candidatos.push({ bola: n, tronera: tr, angulo, fuerza, prob, dificultadTiro })
    }
  }
  return candidatos.sort((a, b) => b.prob - a.prob)
}

function mejorProb(bolas: Bola[], objetivos: number[]): number {
  const c = generarCandidatos(bolas, objetivos)
  return c.length > 0 ? c[0].prob : 0
}

// ─── Planificador ────────────────────────────────────────────────────────────

// valor posicional: simula el tiro exacto y mira qué tan buena queda la mesa
function valorPosicional(bolas: Bola[], c: Candidato, objetivos: number[], estado: EstadoJuego): number {
  const res = simularTiro(bolas, { angulo: c.angulo, fuerza: c.fuerza, efectoLateral: 0, efectoVertical: 0 }, { sinMuestras: true })
  const blanca = res.bolas.find(b => b.n === 0)
  if (!blanca || !blanca.viva) return -0.6 // scratch: pésimo
  const embocoObjetivo = res.eventos.some(e => e.tipo === 'tronera' && e.bola === c.bola)
  if (!embocoObjetivo) return 0 // el plan no se concreta ni en la simulación limpia
  const siguientes = objetivos.filter(n => n !== c.bola && res.bolas.find(b => b.n === n)?.viva)
  if (siguientes.length === 0) return 0.35 // limpió: pasa a la 8, bien
  return 0.55 * mejorProb(res.bolas, siguientes)
}

// seguridad deliberada del Difícil: esconder la blanca (snooker)
function buscarSeguridad(
  bolas: Bola[],
  estado: EstadoJuego,
  objetivos: number[],
): { tiro: Tiro; score: number } | null {
  const blanca = bolas.find(b => b.n === 0 && b.viva)
  if (!blanca) return null
  const yo = estado.turno
  const objetivosRival = bolasObjetivoDe(estado, rival(yo), bolas)

  let mejor: { tiro: Tiro; score: number } | null = null
  const cercanas = objetivos
    .map(n => bolas.find(b => b.n === n && b.viva))
    .filter((b): b is Bola => !!b)
    .sort((a, b) =>
      Math.hypot(a.pos.x - blanca.pos.x, a.pos.y - blanca.pos.y) -
      Math.hypot(b.pos.x - blanca.pos.x, b.pos.y - blanca.pos.y))
    .slice(0, 2)

  for (const bola of cercanas) {
    const base = Math.atan2(bola.pos.y - blanca.pos.y, bola.pos.x - blanca.pos.x)
    for (const dAng of [-0.06, 0, 0.06]) {
      for (const fuerza of [0.16, 0.28]) {
        const tiro: Tiro = { angulo: base + dAng, fuerza, efectoLateral: 0, efectoVertical: 0 }
        const guia = calcularGuia(bolas, tiro.angulo)
        if (!guia || guia.bolaObjetivo !== bola.n) continue
        const res = simularTiro(bolas, tiro, { sinMuestras: true })
        // que la seguridad no sea una falta
        const { resultado } = resolverTiro(estado, res.eventos, res.snapshot)
        let score = 1 - mejorProb(res.bolas, objetivosRival.filter(n => res.bolas.find(b => b.n === n)?.viva))
        if (resultado.faltas.length > 0) score -= 0.7
        if (resultado.ganador && resultado.ganador !== yo) score -= 2
        if (!mejor || score > mejor.score) mejor = { tiro, score }
      }
    }
  }
  return mejor
}

// ─── Bola en mano ────────────────────────────────────────────────────────────

function elegirPosBlanca(
  bolas: Bola[],
  estado: EstadoJuego,
  objetivos: number[],
  perfil: Perfil,
  rng: () => number,
): Vec2 {
  const yMax = estado.soloCabecera ? CABECERA_Y : PARAMETROS.altoMesa / 2 - 0.09
  const validas: { pos: Vec2; prob: number }[] = []
  for (let x = -0.48; x <= 0.481; x += 0.12) {
    for (let y = -1.02; y <= yMax + 0.001; y += 0.13) {
      const pos = { x, y }
      if (!posicionBlancaValida(bolas, pos, estado.soloCabecera)) continue
      const prob = perfil.eligePorCercania ? 0 : mejorProb(conBlancaEn(bolas, pos), objetivos)
      validas.push({ pos, prob })
    }
  }
  if (validas.length === 0) return { x: 0, y: CABECERA_Y }
  if (perfil.eligePorCercania) return validas[Math.floor(rng() * validas.length)].pos // fácil: cualquiera
  validas.sort((a, b) => b.prob - a.prob)
  const top = validas.slice(0, perfil.planifica >= 2 ? 1 : 3)
  return top[Math.floor(rng() * top.length)].pos
}

// ─── Decisión principal ──────────────────────────────────────────────────────

export interface OpcionesBot {
  sinRuido?: boolean // tests: ejecuta la intención exacta
}

export function decidirTiro(
  bolasActuales: Bola[],
  estado: EstadoJuego,
  dificultad: Dificultad,
  rng: () => number,
  opts?: OpcionesBot,
): DecisionBot {
  const perfil = PERFILES[dificultad]
  const pensarMs = Math.round(perfil.pensarMs[0] + rng() * (perfil.pensarMs[1] - perfil.pensarMs[0]))
  const yo = estado.turno

  // ── break: patrón fijo con jitter ──
  if (estado.fase === 'break') {
    const posBlanca: Vec2 = { x: (rng() - 0.5) * 0.2, y: CABECERA_Y - 0.02 }
    const angulo = Math.atan2(PIE.y - posBlanca.y, PIE.x - posBlanca.x) + (opts?.sinRuido ? 0 : gauss(rng) * 0.012)
    const fuerza = dificultad === 'facil' ? 0.55 + rng() * 0.45 : 0.93 + rng() * 0.07
    return {
      tiro: { angulo, fuerza, efectoLateral: 0, efectoVertical: dificultad === 'dificil' ? -0.25 : 0, posBlanca },
      posBlanca,
      pensarMs,
      seguridad: false,
      objetivo: null,
    }
  }

  let objetivos = bolasObjetivoDe(estado, yo, bolasActuales)

  // error de lectura del Fácil: a veces le apunta a una bola del rival
  if (!opts?.sinRuido && perfil.probErrorLectura > 0 && rng() < perfil.probErrorLectura) {
    const ajenas = bolasActuales
      .filter(b => b.viva && b.n !== 0 && !objetivos.includes(b.n))
      .map(b => b.n)
    if (ajenas.length > 0) objetivos = [ajenas[Math.floor(rng() * ajenas.length)]]
  }

  // ── bola en mano: elegir dónde colocar la blanca ──
  let bolas = bolasActuales
  let posBlanca: Vec2 | undefined
  if (estado.bolaEnMano) {
    posBlanca = elegirPosBlanca(bolasActuales, estado, objetivos, perfil, rng)
    bolas = conBlancaEn(bolasActuales, posBlanca)
  }

  const candidatos = generarCandidatos(bolas, objetivos)

  // ── elegir la intención ──
  let elegido: Candidato | null = null
  let seguridad = false

  if (candidatos.length > 0) {
    if (perfil.eligePorCercania) {
      // fácil: la bola que "se ve" más cerca de una tronera, no la más probable
      let dMin = Infinity
      for (const c of candidatos) {
        const bola = bolas.find(b => b.n === c.bola)
        if (!bola) continue
        const d = Math.hypot(c.tronera.centro.x - bola.pos.x, c.tronera.centro.y - bola.pos.y)
        if (d < dMin) {
          dMin = d
          elegido = c
        }
      }
    } else if (perfil.planifica === 0) {
      elegido = candidatos[0]
    } else {
      // normal/difícil: prob + valor posicional (simulaciones forward reales)
      const top = candidatos.slice(0, perfil.planifica >= 2 ? 4 : 3)
      let mejorScore = -Infinity
      for (const c of top) {
        const score = c.prob + (perfil.planifica >= 2 ? 0.55 : 0.4) * valorPosicional(bolas, c, objetivos, estado)
        if (score > mejorScore) {
          mejorScore = score
          elegido = c
        }
      }
    }
  }

  // ── ¿mejor jugar seguro? ──
  if (perfil.umbralSeguridad > 0 && (!elegido || elegido.prob < perfil.umbralSeguridad)) {
    if (perfil.planifica >= 2) {
      const seg = buscarSeguridad(bolas, estado, objetivos)
      if (seg && (!elegido || seg.score > 0.45)) {
        return {
          tiro: { ...seg.tiro, posBlanca },
          posBlanca,
          pensarMs,
          seguridad: true,
          objetivo: calcularGuia(bolas, seg.tiro.angulo)?.bolaObjetivo ?? null,
        }
      }
    } else if (elegido) {
      // normal: seguridad simple — el mismo tiro pero suave
      seguridad = true
    }
  }

  // ── fallback: nada embocable, tocar la bola legal más cercana ──
  if (!elegido) {
    const blanca = bolas.find(b => b.n === 0 && b.viva)
    const legales = objetivos
      .map(n => bolas.find(b => b.n === n && b.viva))
      .filter((b): b is Bola => !!b)
    if (blanca && legales.length > 0) {
      const cerca = legales.sort((a, b) =>
        Math.hypot(a.pos.x - blanca.pos.x, a.pos.y - blanca.pos.y) -
        Math.hypot(b.pos.x - blanca.pos.x, b.pos.y - blanca.pos.y))[0]
      const angulo = Math.atan2(cerca.pos.y - blanca.pos.y, cerca.pos.x - blanca.pos.x)
      return {
        tiro: { angulo, fuerza: 0.3, efectoLateral: 0, efectoVertical: 0, posBlanca },
        posBlanca,
        pensarMs,
        seguridad: true,
        objetivo: cerca.n,
      }
    }
    return {
      tiro: { angulo: Math.PI / 2, fuerza: 0.3, efectoLateral: 0, efectoVertical: 0, posBlanca },
      posBlanca,
      pensarMs,
      seguridad: false,
      objetivo: null,
    }
  }

  // ── ejecutor: ruido humano sobre la intención ──
  let angulo = elegido.angulo
  let fuerza = seguridad ? 0.18 : elegido.fuerza
  let efectoVertical = 0

  if (perfil.usaSpin && !seguridad) {
    // toque de draw en tiros cortos para no seguir a la tronera; follow en largos
    efectoVertical = elegido.fuerza > 0.5 ? 0.15 : -0.2
    if (efectoVertical < 0) fuerza *= 1.18 // el backspin frena a la blanca en el camino
  }

  if (!opts?.sinRuido) {
    let sigma = perfil.sigmaAngulo
    if (perfil.escalaConDificultad) sigma *= 1 + elegido.dificultadTiro
    if (elegido.bola === 8) sigma *= perfil.presionOcho
    angulo += gauss(rng) * sigma
    fuerza = fuerza * perfil.sesgoFuerza + gauss(rng) * perfil.sigmaFuerza
    fuerza = Math.max(0.12, Math.min(1, fuerza))
  }

  return {
    tiro: { angulo, fuerza, efectoLateral: 0, efectoVertical, posBlanca },
    posBlanca,
    pensarMs,
    seguridad,
    objetivo: elegido.bola,
  }
}

export { crearRng }
