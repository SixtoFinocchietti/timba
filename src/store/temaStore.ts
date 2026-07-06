import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { TemaApp } from '@/types'

interface TemaState {
  tema: TemaApp
  setTema: (tema: TemaApp) => Promise<void>
  toggleTema: () => void
  cargarTema: () => Promise<void>
}

export const useTemaStore = create<TemaState>((set, get) => ({
  tema: 'oscuro',
  setTema: async (tema) => {
    set({ tema })
    await AsyncStorage.setItem('timba_tema', tema)
  },
  toggleTema: () => {
    const siguiente: TemaApp = get().tema === 'oscuro' ? 'claro' : 'oscuro'
    get().setTema(siguiente)
  },
  cargarTema: async () => {
    const guardado = await AsyncStorage.getItem('timba_tema')
    if (guardado === 'claro' || guardado === 'oscuro') set({ tema: guardado })
  },
}))
