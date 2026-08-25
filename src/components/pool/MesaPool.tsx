// Orquestador de la mesa de Pool (Fase B, ago 2026). Antes este archivo
// dibujaba TODO en un único <Canvas> de Skia, incluidas las bochas
// procedurales (círculo + gradiente, ver historial de este archivo). Ahora
// las bochas son modelos 3D reales (FBX + textura por número, ver
// src/lib/pool/bochas3d.ts) — pedido explícito tras probar el rediseño 2D
// ("quiero lo que usa Plato"). Como un <Canvas> de Skia y un <GLView> de
// three.js son tecnologías de render distintas, no se puede seguir
// dibujando todo junto: este componente calcula el estado compartido UNA
// vez (transform, posiciones, guías) y apila 3 capas del mismo tamaño en
// píxeles, en el mismo orden pictórico que tenía el <Canvas> original:
//
//   MesaPoolFondo (Skia: mesa, debug, guías)
//   MesaPoolBochas3D (three.js: las 16 bochas)
//   MesaPoolFrente (Skia: glow de bola en mano, taco)
//
// El corte es exactamente el punto donde antes se dibujaban las bochas, así
// que el z-order visual no cambió. Ver plan completo:
// C:\Users\sixto\.claude\plans\robust-popping-koala.md
//
// Este archivo importa Skia (vía las capas Fondo/Frente): en web SOLO debe
// cargarse vía MesaPoolLazy (después de LoadSkiaWeb). No importar directo
// desde pantallas.

import { useMemo } from 'react'
import { View } from 'react-native'
import { Skia } from '@shopify/react-native-skia'
import { ALCANCE_BAJA, NIVEL_ASISTENCIA_DEFAULT, NivelAsistencia } from '@/lib/pool/asistencia'
import { TRONERAS } from '@/lib/pool/fisica'
import { calcularTrayectoriaGuia } from '@/lib/pool/guia'
import { MESA_DEFAULT, MesaSkinId, TACO_DEFAULT, TacoSkinId } from '@/lib/pool/skins'
import { crearTransform, verticesOctagonoMesa } from '@/lib/pool/mesaGeometria'
import { Bola, EventoFisica, MuestraAnimacion, Vec2 } from '@/lib/pool/tipos'
import MesaPoolFondo from './MesaPoolFondo'
import MesaPoolBochas3D from './MesaPoolBochas3D'
import MesaPoolFrente from './MesaPoolFrente'

// Path de Skia a partir de una polilínea cerrada (usado para el octágono
// real de la mesa: solo queda para el overlay de debug, ver MesaPoolFondo
// — antes también recortaba la capa de bolas, ya no hace falta porque esa
// capa es 3D).
function pathDePoligono(vertices: Vec2[]) {
  const p = Skia.Path.Make()
  p.moveTo(vertices[0].x, vertices[0].y)
  for (let i = 1; i < vertices.length; i++) p.lineTo(vertices[i].x, vertices[i].y)
  p.close()
  return p
}

export interface MesaPoolProps {
  anchoPx: number
  bolas: Bola[]
  muestra: MuestraAnimacion | null // si hay animación en curso, manda ella
  angulo: number
  fuerzaPreview: number // 0..1: retroceso del taco mientras se carga el tiro
  efectoLateral?: number // spin.a elegido (SelectorSpin): curva el rebote en banda (auditoría técnica, jul 2026)
  mostrarGuia: boolean
  // niveles de asistencia (auditoría técnica, jul 2026, spec §2): cuánta
  // trayectoria de la blanca se revela — default: NIVEL_ASISTENCIA_DEFAULT
  nivelAsistencia?: NivelAsistencia
  // sugerencia del bot en práctica libre (spec §3): ángulo del mejor tiro
  // detectado, se dibuja aparte de la guía propia con otro color — null =
  // no hay sugerencia activa
  anguloSugerido?: number | null
  bolaEnMano: boolean
  // debug temporal (spec de tuning jul 2026): dibuja la geometría invisible
  // de colisión encima de la mesa real — verde las bandas jugables, rojo las
  // troneras (captura sólida, boca punteada) y los postes de ceja
  debug?: boolean
  // ayuda de la dificultad Fácil (spec §10): línea de dirección de la bola
  // objetivo mucho más larga, en radios de bola (default: guía normal)
  longitudGuiaObjetivo?: number
  // variante visual del taco (spec skins, jul 2026) — default: TACO_DEFAULT
  tacoSkin?: TacoSkinId
  // variante visual de la mesa (ago 2026) — default: MESA_DEFAULT
  mesaSkin?: MesaSkinId
  // eventos del tiro en curso (ago 2026): solo se usan los 'tronera', para
  // animar la caída — sin esto, una bocha embocada desaparecía de golpe en
  // el frame exacto en que simularTiro la marca !viva (no había transición).
  // Opcional y sin uso fuera de una animación activa: las pantallas que no
  // pasan este prop (tutorial, debug) simplemente no muestran la caída.
  eventos?: EventoFisica[]
}

// duración de la animación de caída en tronera (ver "cayendo" más abajo)
const DURACION_CAIDA_TRONERA = 0.22 // s

export default function MesaPool({
  anchoPx, bolas, muestra, angulo, fuerzaPreview, efectoLateral = 0, mostrarGuia,
  nivelAsistencia = NIVEL_ASISTENCIA_DEFAULT, anguloSugerido = null, bolaEnMano,
  longitudGuiaObjetivo = 6, debug = false, tacoSkin = TACO_DEFAULT, mesaSkin = MESA_DEFAULT,
  eventos = [],
}: MesaPoolProps) {
  const tf = crearTransform(anchoPx)

  // qué bolas dibujar: la animación manda, si no el estado quieto. qx/qy/qz/qw
  // (Fase C, ago 2026): orientación real de cada bocha, integrada en
  // fisica.ts a partir de wx/wy/wz — la capa 3D la aplica directo.
  const dibujables = muestra
    ? muestra.bolas.map(b => ({ n: b.n, x: b.x, y: b.y, qx: b.qx, qy: b.qy, qz: b.qz, qw: b.qw }))
    : bolas.filter(b => b.viva).map(b => ({ n: b.n, x: b.pos.x, y: b.pos.y, qx: b.qx, qy: b.qy, qz: b.qz, qw: b.qw }))

  // bochas cayendo en una tronera: simularTiro las excluye de "dibujables"
  // en el instante exacto en que dejan de estar vivas (bug real reportado
  // jugando: desaparecían de golpe, sin transición) — durante los
  // DURACION_CAIDA segundos siguientes al evento, se interpolan a mano
  // desde la posición de captura hasta el centro de la tronera, encogiendo.
  // Solo tiene sentido con una animación en curso (muestra != null); en el
  // estado quieto no hay nada cayendo.
  const cayendo = muestra
    ? eventos
        .filter((e): e is Extract<EventoFisica, { tipo: 'tronera' }> => e.tipo === 'tronera')
        .map(e => ({ e, avance: (muestra.t - e.t) / DURACION_CAIDA_TRONERA }))
        .filter(({ avance }) => avance >= 0 && avance < 1)
        .map(({ e, avance }) => {
          const t = avance * avance // ease-in: arranca despacio, acelera hacia el agujero
          const centro = TRONERAS[e.tronera].centro
          return {
            n: e.bola,
            x: e.x + (centro.x - e.x) * t,
            y: e.y + (centro.y - e.y) * t,
            escala: 1 - avance,
          }
        })
    : []

  const blanca = bolas.find(b => b.n === 0 && b.viva)
  // niveles de asistencia (spec §2): "sin" no dibuja nada; "baja" trunca el
  // alcance a un adelanto corto sin llegar al impacto real; "normal" llega
  // completo hasta el primer evento; "maxima" además agrega el rebote en
  // banda. El círculo del impacto y la flecha/tangente se filtran en
  // MesaPoolFondo, no acá — ver nota ahí.
  const trayectoria = !muestra && mostrarGuia && blanca && nivelAsistencia !== 'sin'
    ? calcularTrayectoriaGuia(bolas, angulo, {
        maxRebotes: nivelAsistencia === 'maxima' ? 1 : 0,
        alcanceTotal: nivelAsistencia === 'baja' ? ALCANCE_BAJA : undefined,
        efectoLateral,
        fuerza: fuerzaPreview,
      })
    : null
  const objetivo = trayectoria?.bolaObjetivo != null ? bolas.find(b => b.n === trayectoria.bolaObjetivo) : null

  // sugerencia del bot en práctica libre (spec §3): trayectoria aparte, sin
  // rebote (solo "hacia dónde apuntar"), independiente del nivel de
  // asistencia del jugador — es una jugada sugerida, no parte de su guía.
  const trayectoriaSugerida = !muestra && anguloSugerido != null && blanca
    ? calcularTrayectoriaGuia(bolas, anguloSugerido, { maxRebotes: 0 })
    : null

  // octágono real de la mesa: solo se usa para el overlay de debug ahora
  // (ver nota en pathDePoligono). Memoizado: solo depende del ancho del
  // canvas, no hace falta reconstruir el Path cada frame.
  const octagono = useMemo(() => pathDePoligono(verticesOctagonoMesa(tf)), [anchoPx])

  return (
    <View style={{ width: tf.anchoPx, height: tf.altoPx }}>
      <MesaPoolFondo
        tf={tf}
        mesaSkin={mesaSkin}
        debug={debug}
        octagono={octagono}
        trayectoria={trayectoria}
        objetivo={objetivo}
        nivelAsistencia={nivelAsistencia}
        longitudGuiaObjetivo={longitudGuiaObjetivo}
        trayectoriaSugerida={trayectoriaSugerida}
        dibujables={dibujables}
        cayendo={cayendo}
      />
      <MesaPoolBochas3D tf={tf} dibujables={dibujables} cayendo={cayendo} />
      <MesaPoolFrente
        tf={tf}
        blanca={blanca}
        animando={!!muestra}
        bolaEnMano={bolaEnMano}
        angulo={angulo}
        fuerzaPreview={fuerzaPreview}
        tacoSkin={tacoSkin}
        debug={debug}
        dibujables={dibujables}
      />
    </View>
  )
}
