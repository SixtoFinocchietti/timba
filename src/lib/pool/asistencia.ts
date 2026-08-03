// Niveles de asistencia al apuntado (auditoría técnica, jul 2026): un solo
// eje — cuánta trayectoria de la bocha blanca se revela, y hasta qué evento.
// Ver docs/POOL_REVISION_TECNICA_Y_ROADMAP.md §2. MesaPool.tsx traduce cada
// nivel a los parámetros que calcularTrayectoriaGuia() ya expone
// (maxRebotes, alcanceTotal) y a qué piezas del resultado dibuja — no hace
// falta ningún cálculo nuevo en guia.ts.

export type NivelAsistencia = 'sin' | 'baja' | 'normal' | 'maxima'

export interface OpcionNivelAsistencia {
  id: NivelAsistencia
  nombre: string
  descripcion: string
}

export const NIVELES_ASISTENCIA: OpcionNivelAsistencia[] = [
  { id: 'sin', nombre: 'Sin asistencia', descripcion: 'Ninguna línea: apuntás por intuición' },
  { id: 'baja', nombre: 'Baja', descripcion: 'Un adelanto corto de tu trayectoria inicial' },
  { id: 'normal', nombre: 'Normal', descripcion: 'Trayectoria completa hasta el primer impacto' },
  { id: 'maxima', nombre: 'Máxima', descripcion: 'Incluye el rebote en banda y a dónde va la bola objetivo' },
]

export const NIVEL_ASISTENCIA_DEFAULT: NivelAsistencia = 'normal'
export const CLAVE_NIVEL_ASISTENCIA = '@timba:pool_asistencia'

// alcance corto y fijo del nivel "Baja" — un adelanto, no el camino completo
// (unidades de mesa; ALCANCE_TOTAL_DEFAULT en guia.ts es 6)
export const ALCANCE_BAJA = 0.2
