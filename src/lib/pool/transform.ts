// Punto de entrada de geometría de mesa + lo que depende de Platform
// (react-native). La geometría en sí (100% pura) vive en mesaGeometria.ts —
// separada para poder testearla en Node sin arrastrar react-native/index.js
// (ver esa nota ahí). Reexportada acá para no romper ningún import existente.

import { Platform } from 'react-native'

export * from './mesaGeometria'

// Sensibilidad del apuntado por arrastre (rad por metro de arrastre
// tangencial). Feedback real de usuario: en web (mouse) 2.2 quedaba alto;
// en Android quedaba tan bajo que un giro de 180° necesitaba varios
// arrastres con el dedo levantado — no hay un único valor que sirva para
// ambos por cómo RNGH reporta los deltas en cada plataforma.
export const SENSIBILIDAD_APUNTADO = Platform.select({ web: 1.7, default: 6.5 })!
