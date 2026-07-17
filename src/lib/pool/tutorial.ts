// Tutorial interactivo del Pool (spec §9) — el guion es una lib pura: cada
// lección arma la mesa, restringe controles y evalúa el resultado del tiro
// con los eventos reales del motor. La pantalla (tutorial-pool.tsx) solo
// ejecuta este guion. La lección 5 es un quiz de reglas (sin mesa).

import { Bola, ResultadoSimulacion } from './tipos'

function bola(n: number, x: number, y: number): Bola {
  return { n, pos: { x, y }, vel: { x: 0, y: 0 }, wx: 0, wy: 0, wz: 0, viva: true, quieta: true, rot: 0, dirX: 0, dirY: 1 }
}

// evaluación de un tiro: logrado, o un mensaje de por qué reintentar (null = seguí probando)
export type Evaluacion = { logrado: true } | { logrado: false; mensaje: string | null; reset: boolean }

export interface LeccionJugable {
  tipo: 'jugable'
  id: string
  titulo: string
  instruccion: string
  exito: string
  conSpin: boolean // habilita el botón de Efecto
  armar: () => Bola[]
  evaluar: (res: ResultadoSimulacion) => Evaluacion
}

export interface PreguntaQuiz {
  pregunta: string
  opciones: string[]
  correcta: number // índice
  explicacion: string
}

export interface LeccionQuiz {
  tipo: 'quiz'
  id: string
  titulo: string
  instruccion: string
  exito: string
  preguntas: PreguntaQuiz[]
}

export type Leccion = LeccionJugable | LeccionQuiz

// ─── helpers de evaluación ───────────────────────────────────────────────────

function embocada(res: ResultadoSimulacion, n: number): boolean {
  return res.eventos.some(e => e.tipo === 'tronera' && e.bola === n)
}

function blancaViva(res: ResultadoSimulacion): boolean {
  return res.bolas.find(b => b.n === 0)?.viva === true
}

// ─── las 6 lecciones ─────────────────────────────────────────────────────────

// geometría conocida: bola alineada a 45° con la tronera superior derecha
const DIAG = { bola: { x: 0.35, y: 0.91 }, blanca: { x: 0.15, y: 0.71 } }

export const LECCIONES: Leccion[] = [
  {
    tipo: 'jugable',
    id: 'primer_tiro',
    titulo: 'Tu primer tiro',
    instruccion:
      'Arrastrá el dedo sobre la mesa para apuntar: la línea punteada muestra el camino de la blanca. ' +
      'Cuando apunte a la bola amarilla, bajá la barra de la derecha y SOLTÁ para tirar. Embocala en la tronera de arriba a la derecha.',
    exito: '¡Ahí está! Apuntar y dosificar: el 80% del pool es eso.',
    conSpin: false,
    armar: () => [bola(0, DIAG.blanca.x, DIAG.blanca.y), bola(1, DIAG.bola.x, DIAG.bola.y)],
    evaluar: res => {
      if (embocada(res, 1)) return { logrado: true }
      if (!blancaViva(res)) return { logrado: false, mensaje: 'Se fue la blanca también — probá con menos fuerza.', reset: true }
      if (!res.eventos.some(e => e.tipo === 'contacto_bola')) {
        return { logrado: false, mensaje: 'No la tocaste: ajustá el ángulo con los botones ‹ › si hace falta.', reset: false }
      }
      return { logrado: false, mensaje: null, reset: false }
    },
  },
  {
    tipo: 'jugable',
    id: 'el_angulo',
    titulo: 'El ángulo',
    instruccion:
      'Ahora hay corte: la bola sale por la línea que une el punto de contacto con su centro. ' +
      'Mirá el circulito fantasma de la guía: cuando la flecha DORADA apunte a la tronera, ese es tu tiro.',
    exito: '¡Eso es leer el ángulo! La flecha dorada es tu mejor amiga.',
    conSpin: false,
    armar: () => [bola(0, -0.2, 0.2), bola(2, 0.2, 0.6)],
    evaluar: res => {
      if (embocada(res, 2)) return { logrado: true }
      if (!blancaViva(res)) return { logrado: false, mensaje: 'La blanca cayó — menos fuerza y mejor línea.', reset: true }
      return { logrado: false, mensaje: null, reset: false }
    },
  },
  {
    tipo: 'jugable',
    id: 'la_fuerza',
    titulo: 'La fuerza justa',
    instruccion:
      'Está todo alineado con la tronera del costado… demasiado alineado: si le pegás fuerte, la blanca la sigue y cae. ' +
      'Embocá la roja SIN que caiga la blanca (probá 35% o menos).',
    exito: 'Control de fuerza: la diferencia entre embocar y regalar el turno.',
    conSpin: false,
    armar: () => [bola(0, 0.05, 0), bola(3, 0.42, 0)],
    evaluar: res => {
      if (embocada(res, 3) && blancaViva(res)) return { logrado: true }
      if (embocada(res, 3) && !blancaViva(res)) {
        return { logrado: false, mensaje: 'La metiste… pero la blanca se fue atrás: eso es falta. Menos fuerza.', reset: true }
      }
      if (!blancaViva(res)) return { logrado: false, mensaje: 'Se fue la blanca — más suave.', reset: true }
      return { logrado: false, mensaje: null, reset: false }
    },
  },
  {
    tipo: 'jugable',
    id: 'efectos',
    titulo: 'Efectos',
    instruccion:
      'Tocá EFECTO y poné el punto bien ABAJO (retroceso). Embocá la bola y mirá cómo la blanca frena y VUELVE: ' +
      'con eso controlás dónde queda para el próximo tiro.',
    exito: '¡Retroceso dominado! Arriba es "sigue", abajo es "vuelve", los costados cambian los rebotes.',
    conSpin: true,
    armar: () => [bola(0, DIAG.blanca.x, DIAG.blanca.y), bola(4, DIAG.bola.x, DIAG.bola.y)],
    evaluar: res => {
      if (!embocada(res, 4)) {
        if (!blancaViva(res)) return { logrado: false, mensaje: 'Se fue la blanca — de nuevo.', reset: true }
        return { logrado: false, mensaje: null, reset: false }
      }
      if (!blancaViva(res)) {
        return { logrado: false, mensaje: 'La blanca siguió a la bola y cayó: más efecto abajo o menos fuerza.', reset: true }
      }
      // ¿la blanca retrocedió? proyección de su posición final sobre la línea de tiro
      const blanca = res.bolas.find(b => b.n === 0)
      const dir = { x: Math.SQRT1_2, y: Math.SQRT1_2 }
      const impacto = { x: DIAG.bola.x - 2 * 0.028575 * dir.x, y: DIAG.bola.y - 2 * 0.028575 * dir.y }
      const avance = blanca ? (blanca.pos.x - impacto.x) * dir.x + (blanca.pos.y - impacto.y) * dir.y : 0
      if (avance < -0.06) return { logrado: true }
      return { logrado: false, mensaje: 'La embocaste, pero la blanca no volvió: el punto va más ABAJO.', reset: true }
    },
  },
  {
    tipo: 'quiz',
    id: 'las_reglas',
    titulo: 'Las reglas',
    instruccion: 'Cuatro situaciones de partido. ¿Falta o no?',
    exito: 'Reglas claras: ya podés discutir con cualquiera en el bar.',
    preguntas: [
      {
        pregunta: 'Rompés y no cae ninguna bola ni llegan 4 a las bandas. ¿Qué pasa?',
        opciones: ['Falta: bola en mano', 'El rival elige: re-romper o jugar así', 'Nada, sigue el juego'],
        correcta: 1,
        explicacion: 'El break flojo no es falta: el rival decide si se rompe de nuevo o juega la mesa como quedó.',
      },
      {
        pregunta: 'Tus bolas son las lisas y la blanca toca PRIMERO una rayada.',
        opciones: ['No pasa nada si después tocás una lisa', 'Falta: el rival tiene bola en mano'],
        correcta: 1,
        explicacion: 'El primer contacto siempre tiene que ser con una bola de tu grupo (o la 8 si ya limpiaste).',
      },
      {
        pregunta: 'Embocás una bola tuya sin falta. ¿Quién tira ahora?',
        opciones: ['El rival, los turnos se alternan siempre', 'Seguís vos mientras emboques'],
        correcta: 1,
        explicacion: 'Embocar legal = seguís tirando. Las corridas largas ganan partidos.',
      },
      {
        pregunta: '¿Cuándo podés tirarle a la 8?',
        opciones: ['Cuando quieras, es una bola más', 'Cuando embocaste TODAS las de tu grupo'],
        correcta: 1,
        explicacion: 'La 8 va última. Meterla antes de tiempo es perder la partida.',
      },
    ],
  },
  {
    tipo: 'jugable',
    id: 'la_ocho',
    titulo: 'La 8 y el final',
    instruccion:
      'Tu grupo está completo: solo queda LA 8. Embocala y ganás… pero si la blanca cae con ella, PERDÉS. ' +
      'Todo lo que aprendiste, junto: ángulo, fuerza justa y sangre fría.',
    exito: '🎓 ¡Tutorial completo! Andá a "Jugar vs Bot" y arrancá por Fácil.',
    conSpin: true,
    armar: () => [bola(0, -0.1, 0.1), bola(8, 0.2, 0.6)],
    evaluar: res => {
      if (embocada(res, 8) && blancaViva(res)) return { logrado: true }
      if (embocada(res, 8) && !blancaViva(res)) {
        return { logrado: false, mensaje: '¡La blanca cayó con la 8! En partido eso es DERROTA. Otra vez.', reset: true }
      }
      if (!blancaViva(res)) return { logrado: false, mensaje: 'Scratch — en partido sería bola en mano del rival.', reset: true }
      return { logrado: false, mensaje: null, reset: false }
    },
  },
]

export const CLAVE_PROGRESO = '@timba:pool_tutorial'
