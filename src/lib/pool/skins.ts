// Catálogo de skins (variantes visuales) del Pool. Hoy solo taco — pensado
// para sumar "mesa" más adelante (el usuario ya lo pidió) sin rehacer el
// patrón: un id por variante, un nombre visible, persistido en AsyncStorage.
//
// Las imágenes en sí NO viven acá: los require() de assets deben ser
// literales estáticos para que Metro los resuelva, así que se cargan
// directo en MesaPool.tsx (vía useImage) — este archivo es solo metadata.

export type TacoSkinId = 'oscuro' | 'claro' | 'premium'

export const TACOS: { id: TacoSkinId; nombre: string }[] = [
  { id: 'oscuro', nombre: 'Taco oscuro' },
  { id: 'claro', nombre: 'Taco claro' },
  { id: 'premium', nombre: 'Taco premium de Timba' },
]

export const TACO_DEFAULT: TacoSkinId = 'oscuro'

export const CLAVE_TACO_SKIN = '@timba:pool_taco_skin'
