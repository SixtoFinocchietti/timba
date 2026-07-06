export type ColoresTema = {
  fondo: string
  fondoCard: string
  fondoInput: string
  primario: string
  primarioSuave: string
  texto: string
  textoSuave: string
  borde: string
  error: string
  exito: string
  advertencia: string
}

export const coloresOscuro: ColoresTema = {
  fondo: '#141210',
  fondoCard: '#1E1C18',
  fondoInput: '#272420',
  primario: '#C9A84C',
  primarioSuave: '#DFC47A',
  texto: '#FFFFFF',
  textoSuave: '#9A8E7E',
  borde: '#2A2520',
  error: '#E05252',
  exito: '#5ABF8A',
  advertencia: '#E0A030',
}

export const coloresClaros: ColoresTema = {
  fondo: '#F5F0E8',
  fondoCard: '#FFFFFF',
  fondoInput: '#EDE8DC',
  primario: '#8B6914',
  primarioSuave: '#B8902A',
  texto: '#1A1410',
  textoSuave: '#6B5F50',
  borde: '#D4C8B0',
  error: '#CC2222',
  exito: '#1E7A1E',
  advertencia: '#CC6600',
}

// Backward compat — siempre oscuro para imports directos legacy
export const colores = coloresOscuro
