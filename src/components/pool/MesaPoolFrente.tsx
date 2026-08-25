// Capa de frente de la mesa de Pool (Fase B, ago 2026 — antes vivía todo
// junto en MesaPool.tsx). Glow de "bola en mano" y el taco: todo lo que en
// el <Canvas> original se dibujaba DESPUÉS del grupo de bochas — ahora se
// apila arriba de la capa 3D de bochas (MesaPoolBochas3D), mismo z-order
// visual que antes. 100% Skia, sin cambios de comportamiento respecto a
// antes — es un corte, no un rediseño.
//
// Este archivo importa Skia: en web SOLO debe cargarse vía MesaPoolLazy
// (después de LoadSkiaWeb). No importar directo desde pantallas.

import { Canvas, Circle, Group, Image as SkiaImage, Line, useImage, vec } from '@shopify/react-native-skia'
import { PARAMETROS } from '@/lib/pool/fisica'
import { TACO_DEFAULT, TacoSkinId } from '@/lib/pool/skins'
import { TransformMesa } from '@/lib/pool/mesaGeometria'
import { Bola } from '@/lib/pool/tipos'
import { BolaPosicionada } from './MesaPoolBochas3D'

const R = PARAMETROS.radioBola

// assets/pool-assets/palo_pool.png: punta (virola blanca) a la IZQUIERDA,
// mango a la derecha — se dibuja rotado con la punta apoyada justo detrás
// de la blanca, apuntando hacia ella. El aspecto se lee del archivo real
// (taco.width()/height()) en vez de hardcodearlo: el asset se reemplazó
// más de una vez durante el tuning y una constante fija quedaba desincronizada,
// estirando la imagen (bug real detectado en auditoría, jul 2026).
const LARGO_TACO = 1.3 // unidades de mesa (antes 1.05: se pidió más grande)
const GROSOR_TACO_MULT = 1.3 // plus sobre la proporción real de la foto

export interface MesaPoolFrenteProps {
  tf: TransformMesa
  blanca: Bola | null | undefined
  animando: boolean // true si hay una animación de tiro en curso (muestra != null en el padre)
  bolaEnMano: boolean
  angulo: number
  fuerzaPreview: number
  tacoSkin?: TacoSkinId
  // debug (ago 2026): dibuja el hitbox real de colisión (radioBolaPx, el
  // mismo círculo que usaban las bochas 2D) encima de cada modelo 3D — para
  // comparar a ojo si el modelo se ve más chico/grande que su colisión real
  // y decidir un multiplicador de tamaño visual sin tocar la física.
  debug?: boolean
  dibujables?: BolaPosicionada[]
}

export default function MesaPoolFrente({
  tf, blanca, animando, bolaEnMano, angulo, fuerzaPreview, tacoSkin = TACO_DEFAULT,
  debug = false, dibujables = [],
}: MesaPoolFrenteProps) {
  const tacoPremium = useImage(require('../../../assets/pool-assets/palo_pool.png'))
  const tacoOscuro = useImage(require('../../../assets/pool-assets/palo_pool_1.png'))
  const tacoClaro = useImage(require('../../../assets/pool-assets/palo_pool_2.png'))
  const taco = tacoSkin === 'premium' ? tacoPremium : tacoSkin === 'claro' ? tacoClaro : tacoOscuro

  const dirX = Math.cos(angulo)
  const dirY = Math.sin(angulo)
  const gap = 2.4 * R + fuerzaPreview * 0.34

  return (
    <Canvas style={{ width: tf.anchoPx, height: tf.altoPx, position: 'absolute', top: 0, left: 0 }}>
      {/* debug: hitbox real (radioBolaPx) de cada bocha, para comparar
          contra el tamaño visual del modelo 3D — ver nota arriba */}
      {debug && dibujables.map(b => {
        const p = tf.aPantalla({ x: b.x, y: b.y })
        return (
          <Circle
            key={b.n}
            cx={p.x} cy={p.y} r={tf.radioBolaPx}
            style="stroke" strokeWidth={1.5} color="rgba(255,220,0,0.9)"
          />
        )
      })}

      {/* glow de bola en mano */}
      {bolaEnMano && blanca && !animando && (
        <Circle
          cx={tf.aPantalla(blanca.pos).x} cy={tf.aPantalla(blanca.pos).y} r={tf.radioBolaPx * 1.7}
          style="stroke" strokeWidth={2.5} color="rgba(223,196,122,0.85)"
        />
      )}

      {/* taco: imagen del usuario, rotada con la punta apoyada tras la blanca */}
      {!animando && blanca && !bolaEnMano && (() => {
        const tipMesa = { x: blanca.pos.x - dirX * gap, y: blanca.pos.y - dirY * gap }
        const buttMesa = { x: blanca.pos.x - dirX * (gap + LARGO_TACO), y: blanca.pos.y - dirY * (gap + LARGO_TACO) }
        const tipPx = tf.aPantalla(tipMesa)
        const buttPx = tf.aPantalla(buttMesa)
        const largoPx = Math.hypot(buttPx.x - tipPx.x, buttPx.y - tipPx.y)
        const anguloPx = Math.atan2(buttPx.y - tipPx.y, buttPx.x - tipPx.x)
        // aspecto real del asset cargado (no hardcodeado: ver nota arriba)
        const aspectoTaco = taco ? taco.height() / taco.width() : 150 / 1408
        const altoPx = Math.max(5, largoPx * aspectoTaco * GROSOR_TACO_MULT)

        if (!taco) {
          // fallback mientras carga: dos líneas simples (mismo aspecto que antes)
          return (
            <Line
              p1={vec(tipPx.x, tipPx.y)} p2={vec(buttPx.x, buttPx.y)}
              color="#B9884A" strokeWidth={Math.max(4, tf.radioBolaPx * 0.55)} strokeCap="round"
            />
          )
        }
        return (
          <Group origin={vec(tipPx.x, tipPx.y)} transform={[{ rotate: anguloPx }]}>
            <SkiaImage
              image={taco}
              x={tipPx.x} y={tipPx.y - altoPx / 2}
              width={largoPx} height={altoPx}
              fit="fill"
            />
          </Group>
        )
      })()}
    </Canvas>
  )
}
