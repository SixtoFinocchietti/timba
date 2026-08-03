// Catálogo de skins (variantes visuales) del Pool. Hoy solo taco — pensado
// para sumar "mesa" más adelante (el usuario ya lo pidió) sin rehacer el
// patrón: un id por variante, un nombre visible, persistido en AsyncStorage.
//
// El render real en la mesa (Skia, vía useImage) sigue viviendo en
// MesaPool.tsx — un hook no puede vivir en un módulo estático. Pero el
// preview plano para `SelectorSkins` (imagen común, sin Skia) sí puede
// centralizarse acá: antes se duplicaba el mismo require() en cada pantalla
// que abría el selector (partida-pool.tsx, y de nuevo en pool.tsx al sumar
// el engranaje de ajustes, auditoría técnica jul 2026) — un solo lugar para
// ese require() estático evita que las tres copias se desincronicen si se
// agrega/saca un skin.

export type TacoSkinId = 'oscuro' | 'claro' | 'premium'

export const TACOS: { id: TacoSkinId; nombre: string }[] = [
  { id: 'oscuro', nombre: 'Taco oscuro' },
  { id: 'claro', nombre: 'Taco claro' },
  { id: 'premium', nombre: 'Taco premium de Timba' },
]

export const TACO_DEFAULT: TacoSkinId = 'oscuro'

export const CLAVE_TACO_SKIN = '@timba:pool_taco_skin'

const IMAGENES_TACO: Record<TacoSkinId, any> = {
  oscuro: require('../../../assets/pool-assets/palo_pool_1.png'),
  claro: require('../../../assets/pool-assets/palo_pool_2.png'),
  premium: require('../../../assets/pool-assets/palo_pool.png'),
}

export const OPCIONES_TACO = TACOS.map(t => ({ id: t.id, nombre: t.nombre, preview: IMAGENES_TACO[t.id] }))
