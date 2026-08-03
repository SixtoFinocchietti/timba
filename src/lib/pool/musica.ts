// Música ambiental del Pool (Fase 10.2 del roadmap, §5.2). Loop de bajo
// volumen que se atenúa durante la animación de un tiro (para no tapar los
// efectos de sonido) y vuelve al volumen normal en reposo. Toggle propio
// (@timba:pool_musica), separado del de efectos — a la gente le molesta
// música de fondo mucho más que un efecto puntual, así que default OFF.
//
// ambiente.wav es un placeholder SINTETIZADO (pad de 4 tonos + tremolo lento,
// generado con frecuencias n/duración para que el loop cierre exacto, sin
// click) — reemplazable por un sample CC0 con el mismo nombre.

import { useEffect, useRef } from 'react'
import { createAudioPlayer, type AudioPlayer } from 'expo-audio'

const FUENTE = require('../../../assets/pool-assets/musica/ambiente.wav')
const VOLUMEN_NORMAL = 0.35
const VOLUMEN_REDUCIDO = 0.1

export interface MusicaPool {
  reducir: () => void
  restaurar: () => void
}

export function useMusicaPool(habilitada: boolean, volumenMaestro = 1): MusicaPool {
  const playerRef = useRef<AudioPlayer | null>(null)
  const volRef = useRef(volumenMaestro)
  volRef.current = volumenMaestro

  useEffect(() => {
    if (!habilitada) return
    let player: AudioPlayer | null = null
    try {
      player = createAudioPlayer(FUENTE)
      player.loop = true
      player.volume = VOLUMEN_NORMAL * volRef.current
      player.play()
      playerRef.current = player
    } catch {
      playerRef.current = null
    }
    return () => {
      try { player?.pause() } catch {}
      try { player?.remove() } catch {}
      playerRef.current = null
    }
  }, [habilitada])

  const reducir = () => { try { if (playerRef.current) playerRef.current.volume = VOLUMEN_REDUCIDO * volRef.current } catch {} }
  const restaurar = () => { try { if (playerRef.current) playerRef.current.volume = VOLUMEN_NORMAL * volRef.current } catch {} }

  return { reducir, restaurar }
}
