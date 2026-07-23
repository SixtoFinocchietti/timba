// Pool online — helpers puros de sincronización (patrón blackjackClasicoOnline).
//
// Modelo "autoridad del tirador" (spec D4): el que tira simula localmente y
// escribe en la fila { ultimo_tiro: {input, num}, estado_bolas: snapshot,
// estado_juego }. El rival recibe el UPDATE por Realtime, RE-SIMULA el mismo
// input sobre sus bolas (mismo motor determinista ⇒ misma animación) y al
// terminar aplica el snapshot como verdad. Turnos secuenciales: escribe solo
// el cliente al que le toca. El host es SIEMPRE el jugador 'A' de reglas.ts.

import { crearRack } from './fisica'
import { EstadoJuego, Jugador, crearEstadoInicial } from './reglas'
import { Bola, SnapshotBola, Tiro } from './tipos'

export type AsientoPool = 'host' | 'invitado'

export interface PartidaPoolFila {
  id: string
  host_id: string
  invitado_id: string
  fase: 'en_juego' | 'terminada' | 'abandonada'
  estado_bolas: SnapshotBola[]
  estado_juego: EstadoJuego
  ultimo_tiro: { input: Tiro; num: number } | null
  num_tiro: number
  serie_max: 1 | 3
  victorias_host: number
  victorias_invitado: number
  rompe_host: boolean
  timer_seg: number
  ganador_serie: AsientoPool | null
  updated_at: string
}

export function jugadorDe(asiento: AsientoPool): Jugador {
  return asiento === 'host' ? 'A' : 'B'
}

export function asientoDe(jugador: Jugador): AsientoPool {
  return jugador === 'A' ? 'host' : 'invitado'
}

// snapshot persistido → bolas completas en reposo (carga inicial / reconexión)
export function bolasDeSnapshot(snapshot: SnapshotBola[]): Bola[] {
  return snapshot.map(s => ({
    n: s.n,
    pos: { x: s.x, y: s.y },
    vel: { x: 0, y: 0 },
    wx: 0, wy: 0, wz: 0,
    viva: s.viva,
    quieta: true,
    rot: 0,
    dirX: 0,
    dirY: 1,
  }))
}

// lo que inserta el host al arrancar la partida (el rack viaja como snapshot,
// el invitado no necesita la seed)
export function estadoInicialOnline(
  serieMax: 1 | 3,
  timerSeg: number,
  seed: number,
): Pick<PartidaPoolFila, 'estado_bolas' | 'estado_juego' | 'serie_max' | 'timer_seg' | 'rompe_host' | 'num_tiro'> {
  const rack = crearRack(seed)
  return {
    estado_bolas: rack.map(b => ({ n: b.n, x: b.pos.x, y: b.pos.y, viva: b.viva })),
    estado_juego: crearEstadoInicial('A'), // rompe el host en el primer juego
    serie_max: serieMax,
    timer_seg: timerSeg,
    rompe_host: true,
    num_tiro: 0,
  }
}

export function victoriasNecesarias(serieMax: number): number {
  return Math.ceil(serieMax / 2)
}

// Un juego de la serie terminó: lo escribe el cliente que resolvió el tiro.
// Devuelve el update de la fila: o la serie sigue (rack nuevo, rompe el otro)
// o terminó (fase, ganador_serie).
export function avanzarSerie(
  fila: Pick<PartidaPoolFila, 'serie_max' | 'victorias_host' | 'victorias_invitado' | 'rompe_host'>,
  ganadorJuego: Jugador,
  seedNuevoRack: number,
): Partial<PartidaPoolFila> {
  const asiento = asientoDe(ganadorJuego)
  const victorias_host = fila.victorias_host + (asiento === 'host' ? 1 : 0)
  const victorias_invitado = fila.victorias_invitado + (asiento === 'invitado' ? 1 : 0)
  const meta = victoriasNecesarias(fila.serie_max)

  if (victorias_host >= meta || victorias_invitado >= meta) {
    return {
      victorias_host,
      victorias_invitado,
      fase: 'terminada',
      ganador_serie: victorias_host >= meta ? 'host' : 'invitado',
    }
  }

  // la serie sigue: rack nuevo y rompe el otro
  const rompe_host = !fila.rompe_host
  const rack = crearRack(seedNuevoRack)
  return {
    victorias_host,
    victorias_invitado,
    rompe_host,
    estado_bolas: rack.map(b => ({ n: b.n, x: b.pos.x, y: b.pos.y, viva: b.viva })),
    estado_juego: crearEstadoInicial(rompe_host ? 'A' : 'B'),
    ultimo_tiro: null,
  }
}
