// Reglas del 8-Ball — máquina de estados pura, sin dependencias de UI ni física.
//
// resolverTiro(estado, eventos, bolasFinales) consume los eventos que produjo el
// motor (fisica.ts) y devuelve el estado siguiente + un resultado descriptivo
// para que la UI comunique lo ocurrido. Misma filosofía testeable que truco.ts.
//
// Fases: break → abierta (mesa abierta) → asignados → fin
//        (con desvío eleccion_rebreak si el break fue ilegal sin faltas)
//
// Perfil "amistoso" (WPA simplificado, spec §8). Simplificaciones documentadas:
// - Sin call pocket (queda para el "modo estricto" v2).
// - La 8 en el break ⇒ re-rack completo y repite el mismo breaker (sin opciones).
// - Break ilegal sin falta ⇒ el rival elige: re-romper ÉL o jugar como quedó.
// - En mesa abierta, la PRIMERA bola embocada legalmente asigna los grupos.
// - Timeout ⇒ falta simple: bola en mano para el rival.

import { EventoFisica } from './tipos'
import { esLisa, esRayada } from './fisica'

export type Jugador = 'A' | 'B'
export type Grupo = 'lisas' | 'rayadas'
export type FaseJuego = 'break' | 'eleccion_rebreak' | 'abierta' | 'asignados' | 'fin'
export type Falta = 'sin_contacto' | 'contacto_ilegal' | 'sin_banda' | 'blanca_embocada' | 'timeout'
export type MotivoFin = 'ocho_legal' | 'ocho_antes_de_tiempo' | 'ocho_con_falta' | 'abandono'

export interface EstadoJuego {
  fase: FaseJuego
  turno: Jugador
  grupos: { A: Grupo | null; B: Grupo | null } // null = mesa abierta
  bolaEnMano: boolean
  soloCabecera: boolean // la bola en mano está restringida (inicio o falta en el break)
  ganador: Jugador | null
  motivoFin: MotivoFin | null
}

export interface ResultadoTiro {
  faltas: Falta[]
  embocadas: number[] // en orden temporal, incluye la blanca (0) si cayó
  sigueTirando: boolean
  asignoGrupos: boolean
  rerack: boolean // la 8 cayó en el break: rehacer rack, repite el breaker
  breakIlegal: boolean // el rival debe elegir (fase pasa a eleccion_rebreak)
  ganador: Jugador | null
  motivoFin: MotivoFin | null
}

export function rival(j: Jugador): Jugador {
  return j === 'A' ? 'B' : 'A'
}

export function grupoDe(n: number): Grupo | null {
  if (esLisa(n)) return 'lisas'
  if (esRayada(n)) return 'rayadas'
  return null
}

export function esDelGrupo(n: number, grupo: Grupo): boolean {
  return grupoDe(n) === grupo
}

export function crearEstadoInicial(rompe: Jugador): EstadoJuego {
  return {
    fase: 'break',
    turno: rompe,
    grupos: { A: null, B: null },
    bolaEnMano: true, // el breaker acomoda la blanca detrás de la cabecera
    soloCabecera: true,
    ganador: null,
    motivoFin: null,
  }
}

// ─── Resolución de un tiro ───────────────────────────────────────────────────

interface BolaViva {
  n: number
  viva: boolean
}

export function resolverTiro(
  estado: EstadoJuego,
  eventos: EventoFisica[],
  bolasFinales: BolaViva[],
): { estado: EstadoJuego; resultado: ResultadoTiro } {
  const tirador = estado.turno
  const oponente = rival(tirador)

  const ordenados = [...eventos].sort((a, b) => a.t - b.t)
  const embocadas = ordenados.filter(e => e.tipo === 'tronera').map(e => (e as { bola: number }).bola)
  const embocadasObjetivo = embocadas.filter(n => n !== 0)
  const blancaEmbocada = embocadas.includes(0)

  const primerContacto = ordenados.find(e => e.tipo === 'contacto_bola' && (e.a === 0 || e.b === 0)) as
    | { tipo: 'contacto_bola'; t: number; a: number; b: number }
    | undefined
  const primeraTocada = primerContacto ? (primerContacto.a === 0 ? primerContacto.b : primerContacto.a) : null

  // bolas del grupo del tirador vivas ANTES de este tiro (vivas ahora + embocadas recién)
  const vivasAntesDe = (grupo: Grupo): number =>
    bolasFinales.filter(b => b.viva && esDelGrupo(b.n, grupo)).length +
    embocadasObjetivo.filter(n => esDelGrupo(n, grupo)).length

  // ── faltas ──
  const faltas: Falta[] = []

  if (!primerContacto) {
    faltas.push('sin_contacto')
  } else if (primeraTocada !== null && !contactoLegal(estado, tirador, primeraTocada, vivasAntesDe)) {
    faltas.push('contacto_ilegal')
  }

  if (blancaEmbocada) faltas.push('blanca_embocada')

  // tras el contacto, algo debe tocar banda o embocarse (no aplica al break,
  // que tiene su propia exigencia de legalidad)
  if (estado.fase !== 'break' && primerContacto && embocadas.length === 0) {
    const huboBandaTras = ordenados.some(e => e.tipo === 'banda' && e.t >= primerContacto.t)
    if (!huboBandaTras) faltas.push('sin_banda')
  }

  const resultado: ResultadoTiro = {
    faltas,
    embocadas,
    sigueTirando: false,
    asignoGrupos: false,
    rerack: false,
    breakIlegal: false,
    ganador: null,
    motivoFin: null,
  }

  // ── la 8 en el break: re-rack, repite el mismo breaker ──
  if (estado.fase === 'break' && embocadas.includes(8)) {
    resultado.rerack = true
    return { estado: crearEstadoInicial(tirador), resultado }
  }

  // ── la 8 embocada define la partida ──
  if (embocadas.includes(8)) {
    const grupoTirador = estado.grupos[tirador]
    let motivo: MotivoFin
    let ganador: Jugador
    if (grupoTirador === null || vivasAntesDe(grupoTirador) > 0) {
      motivo = 'ocho_antes_de_tiempo'
      ganador = oponente
    } else if (faltas.length > 0) {
      motivo = 'ocho_con_falta'
      ganador = oponente
    } else {
      motivo = 'ocho_legal'
      ganador = tirador
    }
    resultado.ganador = ganador
    resultado.motivoFin = motivo
    return {
      estado: { ...estado, fase: 'fin', ganador, motivoFin: motivo, bolaEnMano: false, soloCabecera: false },
      resultado,
    }
  }

  // ── break ──
  if (estado.fase === 'break') {
    const bolasABanda = new Set(
      ordenados.filter(e => e.tipo === 'banda' && e.bola !== 0).map(e => (e as { bola: number }).bola),
    ).size
    const breakLegal = embocadasObjetivo.length >= 1 || bolasABanda >= 4

    if (faltas.length > 0) {
      // scratch u otra falta en el break: bola en mano detrás de la cabecera
      return {
        estado: { ...estado, fase: 'abierta', turno: oponente, bolaEnMano: true, soloCabecera: true },
        resultado,
      }
    }
    if (!breakLegal) {
      // el rival elige: re-romper él, o jugar la mesa como quedó
      resultado.breakIlegal = true
      return {
        estado: { ...estado, fase: 'eleccion_rebreak', turno: oponente, bolaEnMano: false, soloCabecera: false },
        resultado,
      }
    }
    const sigue = embocadasObjetivo.length >= 1
    resultado.sigueTirando = sigue
    return {
      estado: {
        ...estado,
        fase: 'abierta',
        turno: sigue ? tirador : oponente,
        bolaEnMano: false,
        soloCabecera: false,
      },
      resultado,
    }
  }

  // ── falta fuera del break: bola en mano libre para el rival ──
  if (faltas.length > 0) {
    return {
      estado: { ...estado, turno: oponente, bolaEnMano: true, soloCabecera: false },
      resultado,
    }
  }

  // ── mesa abierta: la primera embocada legal asigna los grupos ──
  let estadoSiguiente: EstadoJuego = { ...estado, bolaEnMano: false, soloCabecera: false }
  if (estado.fase === 'abierta' && embocadasObjetivo.length >= 1) {
    const grupoTirador = grupoDe(embocadasObjetivo[0]) as Grupo
    estadoSiguiente = {
      ...estadoSiguiente,
      fase: 'asignados',
      grupos: {
        A: tirador === 'A' ? grupoTirador : grupoTirador === 'lisas' ? 'rayadas' : 'lisas',
        B: tirador === 'B' ? grupoTirador : grupoTirador === 'lisas' ? 'rayadas' : 'lisas',
      },
    }
    resultado.asignoGrupos = true
    resultado.sigueTirando = true
    return { estado: { ...estadoSiguiente, turno: tirador }, resultado }
  }

  // ── asignados: sigue si embocó al menos una propia ──
  if (estado.fase === 'asignados') {
    const grupoTirador = estado.grupos[tirador] as Grupo
    const embocoPropia = embocadasObjetivo.some(n => esDelGrupo(n, grupoTirador))
    resultado.sigueTirando = embocoPropia
    return { estado: { ...estadoSiguiente, turno: embocoPropia ? tirador : oponente }, resultado }
  }

  // mesa abierta sin emboque: turno al rival
  return { estado: { ...estadoSiguiente, turno: oponente }, resultado }
}

function contactoLegal(
  estado: EstadoJuego,
  tirador: Jugador,
  primeraTocada: number,
  vivasAntesDe: (g: Grupo) => number,
): boolean {
  if (estado.fase === 'break') return true // vale golpear el rack donde sea
  if (estado.fase === 'abierta') return primeraTocada !== 8
  const grupo = estado.grupos[tirador]
  if (grupo === null) return primeraTocada !== 8
  if (vivasAntesDe(grupo) === 0) return primeraTocada === 8
  return esDelGrupo(primeraTocada, grupo)
}

// ─── Acciones fuera del tiro ─────────────────────────────────────────────────

// El turno venció: falta simple, bola en mano para el rival.
export function resolverTimeout(estado: EstadoJuego): EstadoJuego {
  if (estado.fase === 'fin') return estado
  const oponente = rival(estado.turno)
  if (estado.fase === 'break' || estado.fase === 'eleccion_rebreak') {
    // ni siquiera rompió / no eligió: el rival pasa a romper
    return { ...crearEstadoInicial(oponente) }
  }
  return { ...estado, turno: oponente, bolaEnMano: true, soloCabecera: false }
}

export function resolverAbandono(estado: EstadoJuego, abandona: Jugador): EstadoJuego {
  return {
    ...estado,
    fase: 'fin',
    ganador: rival(abandona),
    motivoFin: 'abandono',
    bolaEnMano: false,
    soloCabecera: false,
  }
}

// Tras un break ilegal, decide el rival (que ya tiene el turno).
export function aplicarEleccionRebreak(estado: EstadoJuego, eleccion: 'rebreak' | 'jugar'): EstadoJuego {
  if (estado.fase !== 'eleccion_rebreak') return estado
  if (eleccion === 'rebreak') {
    // rompe él; la UI debe rehacer el rack (crearRack) antes del tiro
    return crearEstadoInicial(estado.turno)
  }
  return { ...estado, fase: 'abierta', bolaEnMano: false, soloCabecera: false }
}

// ─── Helpers para UI / bot ───────────────────────────────────────────────────

export function bolasObjetivoDe(estado: EstadoJuego, jugador: Jugador, bolas: BolaViva[]): number[] {
  const grupo = estado.grupos[jugador]
  const vivas = bolas.filter(b => b.viva && b.n !== 0)
  if (estado.fase === 'fin') return []
  if (grupo === null) return vivas.filter(b => b.n !== 8).map(b => b.n)
  const propias = vivas.filter(b => esDelGrupo(b.n, grupo))
  if (propias.length === 0) return vivas.some(b => b.n === 8) ? [8] : []
  return propias.map(b => b.n)
}
