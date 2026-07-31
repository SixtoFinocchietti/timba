import React, { createContext, useContext } from 'react'
import { ColoresTema, coloresOscuro, coloresClaros } from './colores'
import { useTemaStore } from '@/store/temaStore'

const ThemeContext = createContext<ColoresTema>(coloresOscuro)

export function useColores(): ColoresTema {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Modo claro/oscuro: el modo claro estuvo activo en la app, pero al Jefe del
  // proyecto no lo convenció y se decidió ocultar la opción (no borrar el
  // trabajo) hasta que se retome en el futuro — toggleTema, cargarTema y
  // coloresClaros siguen intactos en temaStore.ts/colores.ts.
  // Para reactivar: descomentar las 2 líneas de abajo y eliminar la de coloresOscuro
  // const { tema } = useTemaStore()
  // const colores = tema === 'claro' ? coloresClaros : coloresOscuro
  const colores = coloresOscuro
  return (
    <ThemeContext.Provider value={colores}>
      {children}
    </ThemeContext.Provider>
  )
}
