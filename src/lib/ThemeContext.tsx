import React, { createContext, useContext } from 'react'
import { ColoresTema, coloresOscuro, coloresClaros } from './colores'
import { useTemaStore } from '@/store/temaStore'

const ThemeContext = createContext<ColoresTema>(coloresOscuro)

export function useColores(): ColoresTema {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Para reactivar modo claro: descomentar las 2 líneas de abajo y eliminar la de coloresOscuro
  // const { tema } = useTemaStore()
  // const colores = tema === 'claro' ? coloresClaros : coloresOscuro
  const colores = coloresOscuro
  return (
    <ThemeContext.Provider value={colores}>
      {children}
    </ThemeContext.Provider>
  )
}
