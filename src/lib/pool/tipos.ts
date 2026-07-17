// Tipos del dominio Pool 8-Ball. Sin dependencias.
//
// Coordenadas en "unidades de mesa" (metros de una mesa de 9 pies):
// x ∈ [-0.56, 0.56] (ancho), y ∈ [-1.12, 1.12] (largo). La mesa se juega
// VERTICAL en pantalla: la cabecera (donde rompe la blanca) está abajo
// (y negativo, línea de cabecera en y = -0.56) y el rack arriba (pie en y = +0.56).
//
// Numeración: 0 = blanca, 1..7 = lisas, 8 = negra, 9..15 = rayadas.

export interface Vec2 {
  x: number
  y: number
}

export interface Bola {
  n: number // 0..15
  pos: Vec2
  vel: Vec2 // m/s
  // Velocidad angular (rad/s): wx/wy = rodadura y follow/draw (ejes horizontales),
  // wz = english (eje vertical, + = antihorario visto desde arriba)
  wx: number
  wy: number
  wz: number
  viva: boolean // false = embocada
  quieta: boolean
  rot: number // ángulo de rodadura acumulado (rad), solo para animar el patrón
  // última dirección de movimiento (unitaria, coords de mesa): define hacia
  // dónde "avanza" el patrón al rodar; persiste al frenar
  dirX: number
  dirY: number
}

// Input completo de un tiro. Es lo ÚNICO que viaja por la red (más el snapshot
// final de verificación): ambos clientes re-simulan la misma trayectoria.
export interface Tiro {
  angulo: number // radianes, dirección del golpe (convención matemática)
  fuerza: number // 0..1, se escala a PARAMETROS.velMaxTaco
  efectoLateral: number // a ∈ [-1..1]: english (− izquierda / + derecha del centro)
  efectoVertical: number // b ∈ [-1..1]: − draw (retroceso) / + follow (sigue)
  posBlanca?: Vec2 // si había bola en mano: dónde se colocó (ya validada por la UI)
}

export type EventoFisica =
  | { tipo: 'contacto_bola'; t: number; a: number; b: number; energia: number }
  | { tipo: 'banda'; t: number; bola: number; energia: number }
  | { tipo: 'tronera'; t: number; bola: number; tronera: number }

// Una muestra de animación por frame de render (60 fps): posiciones de bolas vivas.
export interface MuestraAnimacion {
  t: number
  bolas: { n: number; x: number; y: number; rot: number; dirX: number; dirY: number }[]
}

export interface SnapshotBola {
  n: number
  x: number
  y: number
  viva: boolean
}

export interface ResultadoSimulacion {
  eventos: EventoFisica[]
  muestras: MuestraAnimacion[] // vacío si se pidió sinMuestras (bot)
  bolas: Bola[] // estado final completo
  snapshot: SnapshotBola[] // compacto, para persistir / verificar online
  duracion: number // segundos simulados
}
