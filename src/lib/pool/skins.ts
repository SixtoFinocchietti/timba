// Catálogo de skins (variantes visuales) del Pool: taco y mesa. Un id por
// variante, un nombre visible, persistido en AsyncStorage.
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

// ─── Mesa ────────────────────────────────────────────────────────────────────
//
// Los 4 assets son 1234×1852 y — verificado midiendo el paño en píxeles sobre
// cada PNG — 'clasica', 'premium' y 'original' tienen el borde del paño
// EXACTAMENTE en el mismo lugar, así que la calibración única de ASSET_MESA
// (mesaGeometria.ts) les sirve tal cual. 'clara' difiere hasta 9px de 1234
// (~0.7%: el paño es apenas más angosto), que en pantalla es menos que el
// radio de una bocha — tolerable, pero si esa mesa se rediseña con bandas de
// otro grosor hay que darle su propia calibración (hoy ASSET_MESA es una
// constante global, habría que volverla por-skin).
export type MesaSkinId = 'clasica' | 'clara' | 'premium' | 'original'

export const MESAS: { id: MesaSkinId; nombre: string }[] = [
  { id: 'clasica', nombre: 'Mesa clásica' },
  { id: 'clara', nombre: 'Mesa de madera clara' },
  { id: 'premium', nombre: 'Mesa premium de Timba' },
  { id: 'original', nombre: 'Mesa original' },
]

export const MESA_DEFAULT: MesaSkinId = 'clasica'

export const CLAVE_MESA_SKIN = '@timba:pool_mesa_skin'

// 'clasica' y 'premium' son hoy el MISMO dibujo (el usuario todavía está
// diseñando la premium y le puso una skin temporal) — son dos entradas del
// catálogo a propósito, no un copy-paste por error.
const IMAGENES_MESA: Record<MesaSkinId, any> = {
  clasica: require('../../../assets/pool-assets/mesa_1.png'),
  clara: require('../../../assets/pool-assets/mesa_2.png'),
  premium: require('../../../assets/pool-assets/mesa_3.png'),
  // el dibujo con el que se calibró ASSET_MESA: se mantiene como opción
  original: require('../../../assets/pool-assets/mesa.png'),
}

export const OPCIONES_MESA = MESAS.map(m => ({ id: m.id, nombre: m.nombre, preview: IMAGENES_MESA[m.id] }))
