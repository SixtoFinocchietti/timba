// Sonido del Pool (spec §14). El motor ya resuelve el tiro por adelantado, así
// que los eventos traen timestamps exactos: se AGENDAN los sonidos con
// setTimeout en vez de detectarlos en caliente. Un pool de players por efecto
// permite solapamiento (el break dispara ~20 colisiones en un segundo) con un
// techo de voces natural.
//
// Todo va envuelto en try/catch: si expo-audio no está disponible o un sample
// falla, el juego sigue en silencio sin romperse. tock/thud/win/foul son
// placeholders sintetizados (assets/pool-assets/sfx) — reemplazables por
// samples CC0 con el mismo nombre sin tocar este código. golpe_* y hueco ya
// son samples reales (recopilados de juegos de pool existentes, jul 2026):
// en vez de un único sample con pitch escalado por energía, se elige entre 3
// samples grabados a distinta intensidad — más creíble que estirar el pitch
// de una sola grabación de un extremo al otro.

import { useEffect, useRef } from 'react'
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { ResultadoSimulacion } from './tipos'

type NombreSfx = 'tock' | 'golpe_suave' | 'golpe_normal' | 'golpe_fuerte' | 'thud' | 'hueco' | 'win' | 'foul'

const FUENTES: Record<NombreSfx, any> = {
  tock: require('../../../assets/pool-assets/sfx/tock.wav'),
  golpe_suave: require('../../../assets/pool-assets/sfx/golpe_suave.mp3'),
  golpe_normal: require('../../../assets/pool-assets/sfx/golpe_normal.mp3'),
  golpe_fuerte: require('../../../assets/pool-assets/sfx/golpe_fuerte.mp3'),
  thud: require('../../../assets/pool-assets/sfx/thud.wav'),
  hueco: require('../../../assets/pool-assets/sfx/hueco.mp3'),
  win: require('../../../assets/pool-assets/sfx/win.wav'),
  foul: require('../../../assets/pool-assets/sfx/foul.wav'),
}

// cuántas instancias por efecto (para solapamiento simultáneo)
const POOL: Record<NombreSfx, number> = {
  tock: 2, golpe_suave: 3, golpe_normal: 3, golpe_fuerte: 3, thud: 2, hueco: 3, win: 1, foul: 1,
}

// umbral de energía normalizada (0..1) que separa suave/normal/fuerte
const UMBRAL_GOLPE_NORMAL = 0.35
const UMBRAL_GOLPE_FUERTE = 0.7

function golpeSegunEnergia(e: number): 'golpe_suave' | 'golpe_normal' | 'golpe_fuerte' {
  if (e < UMBRAL_GOLPE_NORMAL) return 'golpe_suave'
  if (e < UMBRAL_GOLPE_FUERTE) return 'golpe_normal'
  return 'golpe_fuerte'
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))

interface CanalSfx { players: AudioPlayer[]; i: number }

export interface SonidoPool {
  reproducirTiro: (res: ResultadoSimulacion) => void
  simple: (nombre: NombreSfx, volumen?: number) => void
  cancelar: () => void
}

export function useSonidoPool(habilitado: boolean, volumenMaestro = 1): SonidoPool {
  const canales = useRef<Partial<Record<NombreSfx, CanalSfx>>>({})
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const habRef = useRef(habilitado)
  habRef.current = habilitado
  const volRef = useRef(volumenMaestro)
  volRef.current = volumenMaestro

  useEffect(() => {
    try {
      setAudioModeAsync({ playsInSilentMode: true } as any).catch(() => {})
    } catch {}
    try {
      for (const nombre of Object.keys(FUENTES) as NombreSfx[]) {
        const players: AudioPlayer[] = []
        for (let i = 0; i < POOL[nombre]; i++) players.push(createAudioPlayer(FUENTES[nombre]))
        canales.current[nombre] = { players, i: 0 }
      }
    } catch {
      canales.current = {}
    }
    return () => {
      timers.current.forEach(clearTimeout)
      timers.current = []
      for (const canal of Object.values(canales.current)) {
        canal?.players.forEach(p => { try { p.remove() } catch {} })
      }
      canales.current = {}
    }
  }, [])

  function tocar(nombre: NombreSfx, volumen: number, rate = 1) {
    if (!habRef.current) return
    const canal = canales.current[nombre]
    if (!canal || canal.players.length === 0) return
    const p = canal.players[canal.i]
    canal.i = (canal.i + 1) % canal.players.length
    try {
      p.volume = clamp(volumen * volRef.current, 0, 1)
      try { (p as any).setPlaybackRate?.(clamp(rate, 0.5, 2)) } catch {}
      try { (p as any).seekTo?.(0) } catch {}
      p.play()
    } catch {}
  }

  function agendar(delayMs: number, fn: () => void) {
    const id = setTimeout(fn, Math.max(0, delayMs))
    timers.current.push(id)
  }

  const reproducirTiro = (res: ResultadoSimulacion) => {
    if (!habRef.current) return
    // el nuevo tiro cancela los sonidos pendientes del anterior
    timers.current.forEach(clearTimeout)
    timers.current = []

    // golpe de taco al inicio, con cuerpo según la fuerza del primer impacto
    tocar('tock', 0.85, 0.94 + Math.random() * 0.12)

    for (const ev of res.eventos) {
      const ms = ev.t * 1000
      if (ev.tipo === 'contacto_bola') {
        const e = clamp(ev.energia / 6, 0, 1)
        if (e < 0.06) continue // colisiones muy suaves: silencio (techo natural de voces)
        const golpe = golpeSegunEnergia(e)
        // jitter leve de pitch: variedad entre golpes del mismo sample sin
        // llegar a notarse como "estirado" (los samples ya son reales)
        agendar(ms, () => tocar(golpe, 0.55 + 0.45 * e, 0.96 + Math.random() * 0.08))
      } else if (ev.tipo === 'banda') {
        const e = clamp(ev.energia / 5, 0, 1)
        if (e < 0.1) continue
        agendar(ms, () => tocar('thud', 0.2 + 0.6 * e, 0.92 + e * 0.16))
      } else if (ev.tipo === 'tronera') {
        agendar(ms, () => tocar('hueco', 0.9, 0.97 + Math.random() * 0.08))
      }
    }
  }

  const simple = (nombre: NombreSfx, volumen = 0.9) => tocar(nombre, volumen)

  const cancelar = () => { timers.current.forEach(clearTimeout); timers.current = [] }

  return { reproducirTiro, simple, cancelar }
}
