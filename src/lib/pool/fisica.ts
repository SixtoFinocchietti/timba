// Motor de física del Pool — determinista, TypeScript puro, sin dependencias.
//
// Modelo (estándar de la literatura de simulación de billar):
// - Integración semi-implícita de Euler a dt fijo (1/120 s) con substeps cuando
//   hay velocidades altas (el break no atraviesa bolas).
// - Cada bola tiene dos fases de fricción con el paño:
//     sliding (|u| > 0): fricción cinética alta sobre la velocidad de contacto u;
//       u converge a 0 con la clásica deceleración 7/2·μ·g. Acá viven el draw,
//       el follow y el stun: el spin actúa DESPUÉS del contacto.
//     rolling (u ≈ 0): rodadura pura, deceleración baja constante.
// - Colisión bola-bola: impulso sobre la normal con restitución; los spins se
//   conservan por bola (sin throw en v1 — documentado en la spec §12).
// - Bandas: rebote con restitución + fricción tangencial; el english (wz)
//   modifica el ángulo de salida.
// - Troneras: 6 sensores de captura + "postes" en los bordes de cada boca que
//   pueden escupir la bola (efecto ceja).
//
// Determinismo: cero Math.random (el rack se mezcla con un LCG seedeado).
// Mismo estado + mismo tiro ⇒ misma trayectoria bit a bit en una plataforma.
// Entre plataformas (Hermes vs. V8 web) puede haber divergencia flotante
// microscópica: online se corrige con el snapshot final del tirador (spec D4).
//
// simularTiro() resuelve el tiro COMPLETO por adelantado y devuelve trayectorias
// muestreadas a 60 fps + eventos + estado final: el render solo interpola, el
// sonido se agenda con t exactos, y el bot simula con { sinMuestras: true }.

import {
  Bola, EventoFisica, MuestraAnimacion, ResultadoSimulacion, SnapshotBola, Tiro, Vec2,
} from './tipos'

// ─── Parámetros (tunables; ver spec §12) ─────────────────────────────────────

export const PARAMETROS = {
  // Radio real de una bola de pool: 0.028575 (57.15mm de diámetro). Ya se
  // había agrandado ~12% (feedback de juego: se veían chicas) a 0.032; subido
  // de nuevo a pedido (ago 2026, "aumentar ligeramente el tamaño") — ~19%
  // sobre el real. El hit-box real sube junto con el dibujo (mismo R en toda
  // la física), así que no hay desfasaje visual/físico.
  radioBola: 0.045,
  anchoMesa: 1.12, // eje x
  altoMesa: 2.24, // eje y (mesa vertical: cabecera abajo)
  g: 9.8,

  // Fricciones. La rodadura real (~0.01) daría tiros eternos en pantalla:
  // se usa un valor mayor para partidas ágiles. Vueltos a los valores
  // ORIGINALES (jul 2026) a pedido — esa vez se habían subido de acá
  // (0.2/0.06) a 0.45/0.28 porque se sentían "como hielo" (bochas
  // patinando demasiado), y en ago 2026 se bajaron de nuevo a 0.38/0.16
  // buscando más fluidez. Ahora se prueba devolver la sensación de hielo
  // completa a ver si es lo que estaba faltando (ago 2026, experimento
  // explícito — el usuario tiene respaldo del estado anterior por si no
  // convence). El bug de oscilación infinita que salió a la luz la primera
  // vez que se subió esto ya está arreglado a nivel de código (ver
  // integrarBola: la reducción de deslizamiento se satura a como mucho el
  // deslizamiento actual), así que bajar el número de nuevo no debería
  // reabrirlo.
  muDesliz: 0.2,
  muRodadura: 0.06,
  decaimientoWz: 0.6, // 1/s, el english se disipa exponencialmente

  // Restitución bola-bola. Se probó primero cerca de 1 (0.98) para que el
  // impacto se sintiera más vivo, pero eso arma sin querer una "cuna de
  // Newton": la que pega se clava y pasa TODO el impulso a la siguiente de
  // la cadena, que hace lo mismo — una sola bocha termina absorbiendo casi
  // toda la energía del break (rebotando bandas por metros) mientras varias
  // del medio, fuera de esa cadena directa, casi no reciben nada (bug real
  // reportado jugando: rompiendo, la mitad del triángulo quedaba clavado).
  // 0.85 seguía siendo un choque con energía pero repartía mucho mejor el
  // impulso entre toda la bochada (feedback de juego, ago 2026). Bajado a
  // 0.80 a pedido ("más peso" en las bochas, sin tocar la fricción): menos
  // rebote elástico en el choque en sí ⇒ se siente más sólido/menos "billar
  // de juguete". La fricción de rodadura no se tocó — el glide entre choques
  // sigue igual. Techo real: el "stun" (blanca casi clavada tras un corte
  // sin efecto) depende de una restitución cercana a 1 — por debajo de
  // ~0.78 la blanca ya no se frena del todo y el stun deja de sentirse
  // "clavado" (medido: a 0.75 avanza 18cm en vez de <15cm). 0.80 deja
  // margen cómodo sin perder ese tiro.
  restBola: 0.80,
  // Banda más viva (una banda de pool real está en ~0.85): la bochada
  // conserva más energía tras rebotar y sigue abriéndose en vez de morir
  // contra la primera banda que toca.
  restBanda: 0.85,

  // Throw (ago 2026): hasta acá el choque bola-bola solo tocaba la
  // componente NORMAL — un corte salía exactamente por la línea geométrica
  // (ghost ball), sin el desvío que produce la fricción real entre las
  // superficies durante el contacto ("no hay throw en v1", spec §12).
  // Coeficiente de fricción bola-bola real: ~0.03-0.06 (bochas limpias).
  friccionBolaBola: 0.05,

  fricBanda: 0.2, // pérdida tangencial en banda (0..1)
  englishBanda: 0.55, // cuánto del wz·R entra a la tangencial en el rebote
  absorcionWzBanda: 0.5, // el english que se consume por rebote

  // Velocidad con fuerza = 1. Un break fuerte real va a 11-13 m/s; estábamos
  // en 8 (un break flojo), y esa era la causa de fondo de que el rack se
  // abriera poco (ago 2026). Subirlo NO cambia el agarre del paño — la
  // desaceleración se siente igual, la bochada sale con más energía.
  velMaxTaco: 12,
  factorEnglish: 0.7, // escala del wz inicial del taco

  dt: 1 / 120,
  fpsMuestreo: 60,
  umbralReposo: 0.015, // m/s
  umbralDesliz: 0.02, // m/s de velocidad de contacto para pasar a rodadura
  tMax: 20, // failsafe de simulación (s)

  // Troneras: capturas generosas para mobile (spec §5) — radio ~2.1× bola.
  // La boca de esquina es amplia a propósito: acepta el cono de entrada
  // realista (~90°), no solo la diagonal exacta.
  radioCapturaEsquina: 0.078,
  radioCapturaLateral: 0.068, // ↑ compensa la bola más grande (sin postes de "red")
  radioBocaEsquina: 0.078, // zona sin pared alrededor del centro de tronera
  radioBocaLateral: 0.068,
  radioPosteCeja: 0.006,

  cooldownEventos: 0.05, // s, antirrebote de eventos repetidos (sonido/reglas)

  // Contacto especulativo + pasadas de relajación (ver chocarBolas): sin
  // esto, un racimo apretado (rack recién armado) resuelve las colisiones
  // de a un eslabón por sub-paso — la bocha que golpea se clava y le pasa
  // TODO el impulso a la siguiente, dejando a las demás sin nada.
  margenContacto: 0.0015,
  pasadasColision: 6,
} as const

const R = PARAMETROS.radioBola
const MX = PARAMETROS.anchoMesa / 2 // |x| máximo del centro de una bola: MX - R
const MY = PARAMETROS.altoMesa / 2

// ─── Geometría de troneras ───────────────────────────────────────────────────

export interface Tronera {
  id: number
  centro: Vec2 // levemente fuera de la superficie de juego
  captura: number
  boca: number
}

function troneras(): Tronera[] {
  // Offsets del centro de cada tronera respecto a la esquina/lateral teórica,
  // medidos en píxeles por el usuario sobre la mesa real (jul 2026) y
  // resueltos junto con ASSET_MESA (mismo procedimiento, ver transform.ts).
  // Antes se estimaban a ojo con un único valor simétrico hacia AFUERA; la
  // medición real muestra que el centro real queda un poco hacia ADENTRO
  // (offset negativo) y que arriba/abajo no son exactamente iguales — el
  // arte de la mesa no es perfectamente simétrico verticalmente.
  const dSupX = -0.0090, dSupY = -0.0030 // esquinas superiores
  const dInfX = -0.0005, dInfY = 0.0010 // esquinas inferiores
  const dL = 0.0100 // laterales
  const e = PARAMETROS.radioCapturaEsquina
  const l = PARAMETROS.radioCapturaLateral
  const bE = PARAMETROS.radioBocaEsquina
  const bL = PARAMETROS.radioBocaLateral
  return [
    { id: 0, centro: { x: -MX - dSupX, y: MY + dSupY }, captura: e, boca: bE }, // sup izq
    { id: 1, centro: { x: MX + dSupX, y: MY + dSupY }, captura: e, boca: bE }, // sup der
    { id: 2, centro: { x: -MX - dL, y: 0 }, captura: l, boca: bL }, // lat izq
    { id: 3, centro: { x: MX + dL, y: 0 }, captura: l, boca: bL }, // lat der
    { id: 4, centro: { x: -MX - dInfX, y: -MY - dInfY }, captura: e, boca: bE }, // inf izq
    { id: 5, centro: { x: MX + dInfX, y: -MY - dInfY }, captura: e, boca: bE }, // inf der
  ]
}

export const TRONERAS: readonly Tronera[] = troneras()

// Postes de ceja: puntos duros cerca de la boca de cada tronera. Una bola que
// entra mal choca el poste y puede salir escupida — pero el poste NUNCA debe
// estorbar un tiro razonablemente apuntado (bug real detectado jugando: la
// bola rebotaba contra "algo invisible" yendo derecho a la tronera).
//
// Modelo POLAR alrededor del centro de cada tronera (no coordenadas de pared):
// cada poste vive a radioPostes de distancia, a ±deltaPoste del bisector de
// la boca. El bisector de una tronera de esquina es SIEMPRE 45° de cada banda
// (geometría real de una mesa, sin importar su proporción ancho/alto) — usar
// coordenadas de pared para ubicar los postes (como se hacía antes) los deja
// pegados a la banda o cruzando líneas de tiro razonables según la relación
// entre parámetros; el modelo polar evita ambos por construcción. Los valores
// (radioPostes, deltaPoste) fueron encontrados por búsqueda numérica
// verificando: una bola pegada a cualquier banda hacia la tronera entra limpio,
// y tiros casi perfectos al bisector desde varios orígenes del tablero no
// rozan ningún poste (ver historial de commits para el script de búsqueda).
// Retunados (jul 2026) tras recalibrar el centro real de las troneras con
// mediciones en píxeles: el centro quedó más adentro que la estimación a
// ojo original, así que se necesita más radio para mantener el mismo margen
// de seguridad. Búsqueda numérica re-verificada por separado para las
// esquinas de arriba y de abajo (que ya no son simétricas) — convergieron
// al mismo óptimo, de ahí una sola constante para las 4.
const RADIO_POSTES_ESQUINA = 0.18
const DELTA_POSTES_ESQUINA = (80 * Math.PI) / 180

// Las troneras laterales NO llevan postes: su captura/boca son mucho más
// chicas que las de esquina (0.055/0.068 vs 0.068/0.105 — solo un lado de
// mesa, sin dos bandas perpendiculares juntándose), y la búsqueda numérica
// mostró que cualquier poste ahí queda con márgenes de milímetros, listo
// para volver a "rebotar contra algo invisible". Además es realista: una
// tronera lateral real tiene mucha menos quijada que una de esquina.
function postes(): Vec2[] {
  const p: Vec2[] = []
  for (const tr of TRONERAS) {
    if (tr.id === 2 || tr.id === 3) continue // laterales: sin postes
    const radio = RADIO_POSTES_ESQUINA
    const delta = DELTA_POSTES_ESQUINA
    // bisector = dirección desde el centro de la tronera HACIA ADENTRO de la
    // mesa (hacia el origen); para una esquina cae siempre en 45/135/225/315°
    const bisector = Math.atan2(-tr.centro.y, -tr.centro.x)
    p.push({ x: tr.centro.x + radio * Math.cos(bisector - delta), y: tr.centro.y + radio * Math.sin(bisector - delta) })
    p.push({ x: tr.centro.x + radio * Math.cos(bisector + delta), y: tr.centro.y + radio * Math.sin(bisector + delta) })
  }
  return p
}

// Exportado para la pantalla de debug (app/juegos/debug-pool.tsx) — visualiza
// esta geometría invisible sobre la mesa real para diagnosticar de un vistazo.
export const POSTES: readonly Vec2[] = postes()
export const RADIO_COLISION_POSTE = R + PARAMETROS.radioPosteCeja

// Límite de colisión de banda — mitad del ancho/alto real de la mesa
// (constante física, no algo a calibrar contra el arte: a diferencia de
// las troneras, acá no hay "otra posición real" distinta a MX/MY que
// medir). Única fuente de verdad: chocarBandas() la usa para el rebote
// real, y MesaPool.tsx la usa para el rectángulo amarillo del debug —
// antes estaban duplicadas (mismo valor escrito dos veces), unificado
// jul 2026 para que nunca puedan desincronizarse.
export function limitesJuego() {
  return { lx: MX - R, ly: MY - R}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hipot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y)
}

function clonarBola(b: Bola): Bola {
  return { ...b, pos: { ...b.pos }, vel: { ...b.vel } }
}

export function clonarBolas(bolas: Bola[]): Bola[] {
  return bolas.map(clonarBola)
}

function bolaNueva(n: number, x: number, y: number): Bola {
  return {
    n, pos: { x, y }, vel: { x: 0, y: 0 }, wx: 0, wy: 0, wz: 0,
    viva: true, quieta: true, rot: 0, dirX: 0, dirY: 1,
    qx: 0, qy: 0, qz: 0, qw: 1, // cuaternión identidad: sin rotación
  }
}

export function esLisa(n: number): boolean {
  return n >= 1 && n <= 7
}

export function esRayada(n: number): boolean {
  return n >= 9 && n <= 15
}

// LCG determinista (mulberry32): mezcla el rack con seed compartida online y
// alimenta el ruido humano del bot (bot.ts) — reproducible en tests.
export function crearRng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── Posiciones iniciales ────────────────────────────────────────────────────

export const PIE: Vec2 = { x: 0, y: PARAMETROS.altoMesa / 4 } // apex del rack
export const CABECERA_Y = -PARAMETROS.altoMesa / 4 // línea de cabecera (break: y ≤ esto)

// Rack estándar: apex = bola 1 en el pie, 8 en el centro de la tercera fila,
// esquinas traseras de grupos distintos, resto mezclado con la seed.
// Holgura de empaquetado + tolerancia de jitter (ver JITTER_MAX más abajo):
// eps es el hueco base entre bochas vecinas; con eps >= 2*JITTER_MAX el jitter
// nunca puede generar solape aunque las dos bochas de un par se desplacen
// una hacia la otra al máximo — así el test de "sin solapes" no necesita
// tolerancia especial. Subido de 0.8mm a 2mm (feedback de juego, ago 2026:
// "las bochas quedan demasiado juntas") — medido que esto NO es lo que
// explica el "mini explosión" al rozar el rack (esa dispersión viene de la
// fricción/restitución actuales, ver comentario de PARAMETROS más arriba),
// pero separa un poco más el dibujo, que era el pedido puntual.
const eps = 0.002
const JITTER_MAX = 0.0003 // ±0.3mm por eje, por bocha (< eps/2: nunca solapa)

export function crearRack(seed: number): Bola[] {
  const rng = crearRng(seed)
  const dy = 2 * R * 0.8660254 + eps // filas hacia arriba (se alejan de la blanca)
  const dx = 2 * R + eps

  // slots por fila: fila f tiene f+1 bolas
  const slots: Vec2[] = []
  for (let f = 0; f < 5; f++) {
    for (let c = 0; c <= f; c++) {
      slots.push({ x: (c - f / 2) * dx, y: PIE.y + f * dy })
    }
  }
  const idxApex = 0
  const idxCentroFila3 = 4 // fila 2 (0-based) arranca en slot 3; centro = 3 + 1
  const idxEsq1 = 10 // primera de la fila 5
  const idxEsq2 = 14 // última de la fila 5

  const asignacion: number[] = new Array(15).fill(0)
  asignacion[idxApex] = 1
  asignacion[idxCentroFila3] = 8

  const resto = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]
  for (let i = resto.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = resto[i]
    resto[i] = resto[j]
    resto[j] = tmp
  }
  let k = 0
  for (let i = 0; i < 15; i++) {
    if (asignacion[i] === 0) asignacion[i] = resto[k++]
  }
  // esquinas traseras de grupos distintos (regla del rack)
  if (esLisa(asignacion[idxEsq1]) === esLisa(asignacion[idxEsq2])) {
    const grupoFaltante = esLisa(asignacion[idxEsq1]) ? esRayada : esLisa
    for (let i = 0; i < 15; i++) {
      if (i !== idxEsq1 && i !== idxEsq2 && i !== idxApex && i !== idxCentroFila3 && grupoFaltante(asignacion[i])) {
        const tmp = asignacion[idxEsq2]
        asignacion[idxEsq2] = asignacion[i]
        asignacion[i] = tmp
        break
      }
    }
  }

  // Ningún rack armado a mano es matemáticamente perfecto (hay medio
  // milímetro de tolerancia entre bochas reales). Sin este jitter, un break
  // apuntado exactamente al centro reparte la fuerza en dos cadenas
  // diagonales perfectamente simétricas y dejan "agujeros" — bochas del
  // medio (ej. la 8) que no se mueven un milímetro (bug real reportado
  // jugando: rompiendo derecho, la 8 y sus vecinas quedaban clavadas).
  // Se saca de la MISMA rng seedeada (después de barajar y balancear
  // grupos, así no altera qué número cae en qué posición) para no romper
  // el determinismo: misma seed ⇒ mismo rack, jitter incluido.
  const bolas: Bola[] = [bolaNueva(0, 0, CABECERA_Y)]
  for (let i = 0; i < 15; i++) {
    const jx = (rng() - 0.5) * 2 * JITTER_MAX
    const jy = (rng() - 0.5) * 2 * JITTER_MAX
    bolas.push(bolaNueva(asignacion[i], slots[i].x + jx, slots[i].y + jy))
  }
  return bolas
}

// ─── Golpe de taco ───────────────────────────────────────────────────────────

// Convierte el input del tiro en estado inicial de la blanca. Golpear a altura
// b·R del centro da ω/v = 5b/(2R): con b = 0.4 la bola sale rodando perfecta
// (el punto de rodadura natural real); b > 0.4 = topspin extra, b < 0 = backspin.
function aplicarTiro(bolas: Bola[], tiro: Tiro): void {
  const blanca = bolas.find(b => b.n === 0)
  if (!blanca) return
  if (tiro.posBlanca) {
    // bola en mano: colocarla revive a la blanca si venía de un scratch
    blanca.pos = { x: tiro.posBlanca.x, y: tiro.posBlanca.y }
    blanca.viva = true
  }
  if (!blanca.viva) return
  const V = Math.max(0.05, Math.min(1, tiro.fuerza)) * PARAMETROS.velMaxTaco
  const dx = Math.cos(tiro.angulo)
  const dy = Math.sin(tiro.angulo)
  const b = Math.max(-1, Math.min(1, tiro.efectoVertical))
  const a = Math.max(-1, Math.min(1, tiro.efectoLateral))

  blanca.vel = { x: V * dx, y: V * dy }
  // eje de rodadura: ω_roll = (-vy, vx)/R; el efecto vertical escala sobre él
  const s = (2.5 * b) / R
  blanca.wx = -V * dy * s
  blanca.wy = V * dx * s
  blanca.wz = ((2.5 * a) / R) * V * PARAMETROS.factorEnglish
  blanca.quieta = false
}

// ─── Integración de una bola (fricciones del paño) ───────────────────────────

function integrarBola(b: Bola, dt: number): void {
  const P = PARAMETROS
  // velocidad del punto de contacto con el paño: u = (vx − R·wy, vy + R·wx)
  const ux = b.vel.x - R * b.wy
  const uy = b.vel.y + R * b.wx
  const uMag = hipot(ux, uy)

  if (uMag > P.umbralDesliz) {
    // sliding: fricción cinética opuesta a u, sobre v y sobre ω. La reducción
    // de |u| por paso es (dv + R·dw) = 3.5·μ·g·dt (resultado clásico de
    // billar). Si esa reducción excede el deslizamiento ACTUAL, un paso de
    // tamaño fijo lo pasa de largo e invierte el signo de u — la corrección
    // vuelve a aplicarse en sentido contrario el paso siguiente y así para
    // siempre: la bola nunca se duerme (bug real, ver commit).
    // Se satura la reducción a como mucho uMag para converger siempre a 0.
    const iux = ux / uMag
    const iuy = uy / uMag
    const reduccionMax = 3.5 * P.muDesliz * P.g * dt
    const reduccion = Math.min(uMag, reduccionMax)
    const dv = reduccion / 3.5
    const dw = (2.5 * reduccion) / (3.5 * R)
    b.vel.x -= dv * iux
    b.vel.y -= dv * iuy
    b.wx -= dw * iuy
    b.wy += dw * iux
  } else {
    // rolling: acoplar ω a v (rodadura exacta) y decelerar suave
    b.wx = -b.vel.y / R
    b.wy = b.vel.x / R
    const vMag = hipot(b.vel.x, b.vel.y)
    if (vMag > 0) {
      const dv = Math.min(vMag, P.muRodadura * P.g * dt)
      b.vel.x -= (dv * b.vel.x) / vMag
      b.vel.y -= (dv * b.vel.y) / vMag
    }
  }

  // el english se disipa por fricción de pivote
  b.wz -= b.wz * P.decaimientoWz * dt

  // orientación real de la bocha (Fase C, ago 2026): integra el cuaternión
  // con la velocidad angular de este substep, ya convertida a convención de
  // PANTALLA. La mesa se dibuja con Y invertida respecto de la física (ver
  // aPantalla en mesaGeometria.ts: screen_y = cy − y·sy), y la rodadura
  // salía invertida (bug real, confirmado jugando: la bocha giraba al
  // revés de hacia dónde avanzaba) con la primera conversión probada — el
  // signo correcto, verificado contra el sentido real de giro, es
  // (wx,wy,wz) → (wx,−wy,wz). Se integra ya en esta convención para que el
  // consumidor (capa 3D) use qx/qy/qz/qw directo, sin reconvertir ejes.
  {
    const wxR = b.wx
    const wyR = -b.wy
    const wzR = b.wz
    const halfDt = 0.5 * dt
    const dqx = halfDt * (wxR * b.qw + wyR * b.qz - wzR * b.qy)
    const dqy = halfDt * (-wxR * b.qz + wyR * b.qw + wzR * b.qx)
    const dqz = halfDt * (wxR * b.qy - wyR * b.qx + wzR * b.qw)
    const dqw = halfDt * (-wxR * b.qx - wyR * b.qy - wzR * b.qz)
    b.qx += dqx
    b.qy += dqy
    b.qz += dqz
    b.qw += dqw
    const qLen = Math.sqrt(b.qx * b.qx + b.qy * b.qy + b.qz * b.qz + b.qw * b.qw)
    if (qLen > 1e-9) {
      b.qx /= qLen
      b.qy /= qLen
      b.qz /= qLen
      b.qw /= qLen
    }
  }

  b.pos.x += b.vel.x * dt
  b.pos.y += b.vel.y * dt
  const vMagFinal = hipot(b.vel.x, b.vel.y)
  b.rot += (vMagFinal * dt) / R
  if (vMagFinal > 0.03) {
    // dirección de rodadura para el render (el patrón avanza hacia acá)
    b.dirX = b.vel.x / vMagFinal
    b.dirY = b.vel.y / vMagFinal
  }
}

// ─── Colisiones ──────────────────────────────────────────────────────────────

interface Cooldowns {
  pares: Map<number, number>
  bandas: Map<number, number>
}

function chocarBolas(b1: Bola, b2: Bola, t: number, eventos: EventoFisica[], cd: Cooldowns): void {
  const dx = b2.pos.x - b1.pos.x
  const dy = b2.pos.y - b1.pos.y
  const d = hipot(dx, dy)
  if (d >= 2 * R + PARAMETROS.margenContacto || d === 0) return

  const nx = dx / d
  const ny = dy / d
  if (d < 2 * R) {
    // separar el solape simétricamente (nada que separar si todavía no se tocan)
    const solape = 2 * R - d + 0.000001
    b1.pos.x -= (solape / 2) * nx
    b1.pos.y -= (solape / 2) * ny
    b2.pos.x += (solape / 2) * nx
    b2.pos.y += (solape / 2) * ny
  }

  const vRelN = (b1.vel.x - b2.vel.x) * nx + (b1.vel.y - b2.vel.y) * ny
  if (vRelN <= 0) return // ya se separan

  const j = ((1 + PARAMETROS.restBola) / 2) * vRelN
  b1.vel.x -= j * nx
  b1.vel.y -= j * ny
  b2.vel.x += j * nx
  b2.vel.y += j * ny
  // las dos, no solo b2: en el rack, cuál de las dos estaba quieta antes de
  // este choque depende del orden del array (posición original en el rack),
  // no de quién pega — una bocha QUIETA que recibe impulso como b1 quedaba
  // con velocidad pero sin este flag, así que integrarBola la seguía
  // saltando (se "congelaba" con velocidad fantasma mientras el resto de la
  // física asumía que se había movido) — bug real, causa de fondo de las
  // bochas apiladas reportadas jugando.
  b1.quieta = false
  b2.quieta = false

  // Throw: fricción en el punto de contacto durante el choque. El punto de
  // contacto de cada bola es su superficie hacia la otra (r = R·n̂ para b1,
  // −R·n̂ para b2) — con las dos en el mismo plano, SOLO el spin vertical
  // (wz, el "efecto") mete velocidad tangencial ahí; wx/wy (el eje de
  // rodadura) no aportan porque su radio de contacto con el paño es vertical,
  // no horizontal. vRelT es esa velocidad de deslizamiento en el punto de
  // contacto (CM tangencial + el aporte de wz de las dos bolas):
  const tx = -ny
  const ty = nx
  const vt0 = (b1.vel.x - b2.vel.x) * tx + (b1.vel.y - b2.vel.y) * ty
  const vRelT = vt0 + R * (b1.wz + b2.wz)
  if (Math.abs(vRelT) > 1e-9) {
    // acotado por Coulomb (μ·j) y por lo que hace falta para frenar del todo
    // el deslizamiento (el factor 7 sale de la inercia de una esfera maciza:
    // I=(2/5)R² acoplando traslación y spin en esta geometría de contacto,
    // mismo tipo de derivación que el 3.5/2.5 de integrarBola con el paño)
    const limite = Math.min(PARAMETROS.friccionBolaBola * j, Math.abs(vRelT) / 7)
    const jt = -Math.sign(vRelT) * limite
    b1.vel.x += jt * tx
    b1.vel.y += jt * ty
    b2.vel.x -= jt * tx
    b2.vel.y -= jt * ty
    const dwz = (5 / (2 * R)) * jt
    b1.wz += dwz
    b2.wz += dwz
  }

  const clave = b1.n * 16 + b2.n
  const ultimo = cd.pares.get(clave) ?? -1
  if (t - ultimo >= PARAMETROS.cooldownEventos) {
    cd.pares.set(clave, t)
    eventos.push({ tipo: 'contacto_bola', t, a: b1.n, b: b2.n, energia: vRelN })
  }
}

// Exportada para guia.ts: la guía de tiro necesita saber si un punto de
// impacto cae en zona de boca (ahí no hay pared real — la bola cae o la
// escupe un poste, nunca rebota limpio) para no dibujar un rebote falso.
export function enBoca(pos: Vec2): Tronera | null {
  for (const tr of TRONERAS) {
    if (hipot(pos.x - tr.centro.x, pos.y - tr.centro.y) < tr.boca) return tr
  }
  return null
}

function chocarPostes(b: Bola): boolean {
  let choco = false
  for (const p of POSTES) {
    const dx = b.pos.x - p.x
    const dy = b.pos.y - p.y
    const d = hipot(dx, dy)
    const rMin = R + PARAMETROS.radioPosteCeja
    if (d >= rMin || d === 0) continue
    const nx = dx / d
    const ny = dy / d
    b.pos.x = p.x + nx * rMin
    b.pos.y = p.y + ny * rMin
    const vn = b.vel.x * nx + b.vel.y * ny
    if (vn < 0) {
      b.vel.x -= (1 + PARAMETROS.restBanda) * vn * nx
      b.vel.y -= (1 + PARAMETROS.restBanda) * vn * ny
      choco = true
    }
  }
  return choco
}

// Rebote contra una pared con normal (nx, ny) apuntando hacia adentro de la mesa.
function rebotarPared(b: Bola, nx: number, ny: number): number {
  const vn = b.vel.x * nx + b.vel.y * ny
  if (vn >= 0) return 0
  const tx = -ny
  const ty = nx
  let vt = b.vel.x * tx + b.vel.y * ty
  // english: velocidad tangencial del punto de contacto = vt − wz·R
  const vpt = vt - b.wz * R
  vt -= PARAMETROS.fricBanda * vpt * PARAMETROS.englishBanda
  vt -= PARAMETROS.fricBanda * vt * (1 - PARAMETROS.englishBanda)
  b.wz *= 1 - PARAMETROS.absorcionWzBanda
  const vnNuevo = -PARAMETROS.restBanda * vn
  b.vel.x = vnNuevo * nx + vt * tx
  b.vel.y = vnNuevo * ny + vt * ty
  return -vn
}

// Devuelve la energía del rebote (0 si no hubo) para el evento de banda.
function chocarBandas(b: Bola): number {
  let energia = 0
  const { lx, ly } = limitesJuego()
  if (b.pos.x < -lx) {
    b.pos.x = -lx
    energia = Math.max(energia, rebotarPared(b, 1, 0))
  } else if (b.pos.x > lx) {
    b.pos.x = lx
    energia = Math.max(energia, rebotarPared(b, -1, 0))
  }
  if (b.pos.y < -ly) {
    b.pos.y = -ly
    energia = Math.max(energia, rebotarPared(b, 0, 1))
  } else if (b.pos.y > ly) {
    b.pos.y = ly
    energia = Math.max(energia, rebotarPared(b, 0, -1))
  }
  return energia
}

// ─── Simulación de un tiro completo ──────────────────────────────────────────

export interface OpcionesSimulacion {
  sinMuestras?: boolean // el bot no necesita frames de animación
}

export function simularTiro(bolasIniciales: Bola[], tiro: Tiro, opts?: OpcionesSimulacion): ResultadoSimulacion {
  const P = PARAMETROS
  const bolas = clonarBolas(bolasIniciales)
  const eventos: EventoFisica[] = []
  const muestras: MuestraAnimacion[] = []
  const cd: Cooldowns = { pares: new Map(), bandas: new Map() }

  aplicarTiro(bolas, tiro)

  const pasosPorMuestra = Math.round(1 / P.dt / P.fpsMuestreo)
  let t = 0
  let paso = 0
  let enMovimiento = true

  const muestrear = () => {
    if (opts?.sinMuestras) return
    muestras.push({
      t,
      bolas: bolas
        .filter(b => b.viva)
        .map(b => ({
          n: b.n, x: b.pos.x, y: b.pos.y, rot: b.rot, dirX: b.dirX, dirY: b.dirY,
          qx: b.qx, qy: b.qy, qz: b.qz, qw: b.qw,
        })),
    })
  }
  muestrear()

  while (enMovimiento && t < P.tMax) {
    // substeps: ninguna bola avanza más de R/2 por subpaso (CCD simple)
    let vMax = 0
    for (const b of bolas) {
      if (!b.viva || b.quieta) continue
      vMax = Math.max(vMax, hipot(b.vel.x, b.vel.y))
    }
    const sub = Math.max(1, Math.min(8, Math.ceil((vMax * P.dt) / (R / 2))))
    const dtSub = P.dt / sub

    for (let s = 0; s < sub; s++) {
      const tSub = t + s * dtSub

      for (const b of bolas) {
        if (!b.viva || b.quieta) continue
        integrarBola(b, dtSub)
      }

      // colisiones bola-bola (16 cuerpos: O(n²) alcanza de sobra). Varias
      // pasadas por sub-paso (relajación de Gauss-Seidel, mismas posiciones,
      // velocidades ya actualizadas entre pasada y pasada): en un racimo muy
      // apretado (el rack recién armado) una sola pasada solo empuja la
      // cadena de contacto UN eslabón — la bocha que golpea se clava y le
      // pasa TODO el impulso a la siguiente, dejando a las demás sin nada
      // (bug real reportado jugando: rompiendo con la blanca apenas
      // descentrada, media mesa se quedaba clavada). Repetir la resolución
      // en el mismo instante deja que el impulso se reparta por TODA la
      // cadena en vez de un solo relevo — junto con margenContacto en
      // chocarBolas (si no, la segunda colisión de la cadena no cuenta como
      // "en contacto" hasta que la bocha recorra el huequito eps).
      for (let pasada = 0; pasada < PARAMETROS.pasadasColision; pasada++) {
        for (let i = 0; i < bolas.length; i++) {
          const b1 = bolas[i]
          if (!b1.viva) continue
          for (let j = i + 1; j < bolas.length; j++) {
            const b2 = bolas[j]
            if (!b2.viva) continue
            if (b1.quieta && b2.quieta) continue
            chocarBolas(b1, b2, tSub, eventos, cd)
          }
        }
      }

      for (const b of bolas) {
        if (!b.viva || b.quieta) continue

        // ¿capturada por una tronera?
        let capturada: Tronera | null = null
        for (const tr of TRONERAS) {
          if (hipot(b.pos.x - tr.centro.x, b.pos.y - tr.centro.y) < tr.captura) {
            capturada = tr
            break
          }
        }
        // failsafe: si se metió en la garganta de la boca, cae igual
        if (!capturada && (Math.abs(b.pos.x) > MX + R / 2 || Math.abs(b.pos.y) > MY + R / 2)) {
          let mejor = TRONERAS[0]
          let dMin = Infinity
          for (const tr of TRONERAS) {
            const d = hipot(b.pos.x - tr.centro.x, b.pos.y - tr.centro.y)
            if (d < dMin) {
              dMin = d
              mejor = tr
            }
          }
          capturada = mejor
        }
        if (capturada) {
          b.viva = false
          b.quieta = true
          b.vel = { x: 0, y: 0 }
          b.wx = 0
          b.wy = 0
          b.wz = 0
          eventos.push({ tipo: 'tronera', t: tSub, bola: b.n, tronera: capturada.id, x: b.pos.x, y: b.pos.y })
          continue
        }

        // dentro de una boca no hay pared (puede caer o ser escupida por la ceja)
        chocarPostes(b)
        if (!enBoca(b.pos)) {
          const energia = chocarBandas(b)
          if (energia > 0) {
            const ultimo = cd.bandas.get(b.n) ?? -1
            if (tSub - ultimo >= P.cooldownEventos) {
              cd.bandas.set(b.n, tSub)
              eventos.push({ tipo: 'banda', t: tSub, bola: b.n, energia })
            }
          }
        }

        // ¿se durmió? El wz (efecto vertical) no entra en esta condición a
        // propósito: no tiene ningún efecto visual ni físico una vez que la
        // bocha dejó de trasladarse (no se dibuja un giro en el lugar, y
        // wz no realimenta vel/wx/wy) — solo importa MIENTRAS la bocha
        // sigue en movimiento, para el próximo choque. Antes del throw
        // (ago 2026) esto no se notaba porque solo la blanca podía tener
        // wz, con valores chicos que decaían rápido; ahora cualquier bocha
        // golpeada puede acumular algo, y esperar a que decaiga por debajo
        // de 0.5 llegaba a estirar un tiro de 1.6s a 7s+ sin que se viera
        // nada distinto en pantalla (bug real, detectado midiendo breaks).
        if (hipot(b.vel.x, b.vel.y) < P.umbralReposo) {
          const ux = b.vel.x - R * b.wy
          const uy = b.vel.y + R * b.wx
          if (hipot(ux, uy) < P.umbralDesliz) {
            b.vel = { x: 0, y: 0 }
            b.wx = 0
            b.wy = 0
            b.wz = 0
            b.quieta = true
          }
        }
      }
    }

    t += P.dt
    paso++
    if (paso % pasosPorMuestra === 0) muestrear()

    enMovimiento = bolas.some(b => b.viva && !b.quieta)
  }

  // estado final exacto en la última muestra
  muestrear()

  return {
    eventos,
    muestras,
    bolas,
    snapshot: bolas.map(b => ({ n: b.n, x: b.pos.x, y: b.pos.y, viva: b.viva })),
    duracion: t,
  }
}

// ─── Utilidades para la UI / reglas ──────────────────────────────────────────

// ¿Es válida esta posición para colocar la blanca (bola en mano)?
export function posicionBlancaValida(bolas: Bola[], pos: Vec2, soloCabecera: boolean): boolean {
  const { lx, ly } = limitesJuego()
  if (Math.abs(pos.x) > lx || Math.abs(pos.y) > ly) return false
  if (soloCabecera && pos.y > CABECERA_Y) return false
  for (const b of bolas) {
    if (b.n === 0 || !b.viva) continue
    if (hipot(b.pos.x - pos.x, b.pos.y - pos.y) < 2 * R) return false
  }
  return true
}

// Aplica un snapshot autoritativo (online: verdad del tirador) sobre las bolas.
export function aplicarSnapshot(bolas: Bola[], snapshot: SnapshotBola[]): Bola[] {
  return snapshot.map(s => {
    const previa = bolas.find(b => b.n === s.n)
    const b = previa ? clonarBola(previa) : bolaNueva(s.n, s.x, s.y)
    b.pos = { x: s.x, y: s.y }
    b.viva = s.viva
    b.vel = { x: 0, y: 0 }
    b.wx = 0
    b.wy = 0
    b.wz = 0
    b.quieta = true
    return b
  })
}
