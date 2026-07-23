// Sonido del Pool (spec §14). El motor ya resuelve el tiro por adelantado, así
// que los eventos traen timestamps exactos: se AGENDAN los sonidos con
// setTimeout en vez de detectarlos en caliente. Volumen y pitch escalan con la
// energía del impacto; un pool de players por efecto permite solapamiento (el
// break dispara ~20 colisiones en un segundo) con un techo de voces natural.
//
// Todo va envuelto en try/catch: si expo-audio no está disponible o un sample
// falla, el juego sigue en silencio sin romperse. Los .wav son placeholders
// sintetizados (assets/pool-assets/sfx) — reemplazables por samples CC0 con el
// mismo nombre sin tocar este código.

import { useEffect, useRef } from 'react'
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { ResultadoSimulacion } from './tipos'

type NombreSfx = 'tock' | 'clack' | 'thud' | 'pocket' | 'win' | 'foul'

const FUENTES: Record<NombreSfx, any> = {
  tock: require('../../../assets/pool-assets/sfx/tock.wav'),
  clack: require('../../../assets/pool-assets/sfx/clack.wav'),
  thud: require('../../../assets/pool-assets/sfx/thud.wav'),
  pocket: require('../../../assets/pool-assets/sfx/pocket.wav'),
  win: require('../../../assets/pool-assets/sfx/win.wav'),
  foul: require('../../../assets/pool-assets/sfx/foul.wav'),
}

// cuántas instancias por efecto (para solapamiento simultáneo)
const POOL: Record<NombreSfx, number> = { tock: 2, clack: 4, thud: 2, pocket: 3, win: 1, foul: 1 }

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))

interface CanalSfx { players: AudioPlayer[]; i: number }

export interface SonidoPool {
  reproducirTiro: (res: ResultadoSimulacion) => void
  simple: (nombre: NombreSfx, volumen?: number) => void
  cancelar: () => void
}

export function useSonidoPool(habilitado: boolean): SonidoPool {
  const canales = useRef<Partial<Record<NombreSfx, CanalSfx>>>({})
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const habRef = useRef(habilitado)
  habRef.current = habilitado

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
      p.volume = clamp(volumen, 0, 1)
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
        agendar(ms, () => tocar('clack', 0.25 + 0.75 * e, 0.9 + e * 0.35))
      } else if (ev.tipo === 'banda') {
        const e = clamp(ev.energia / 5, 0, 1)
        if (e < 0.1) continue
        agendar(ms, () => tocar('thud', 0.2 + 0.6 * e, 0.92 + e * 0.16))
      } else if (ev.tipo === 'tronera') {
        agendar(ms, () => tocar('pocket', 0.9, 0.97 + Math.random() * 0.08))
      }
    }
  }

  const simple = (nombre: NombreSfx, volumen = 0.9) => tocar(nombre, volumen)

  const cancelar = () => { timers.current.forEach(clearTimeout); timers.current = [] }

  return { reproducirTiro, simple, cancelar }
}
