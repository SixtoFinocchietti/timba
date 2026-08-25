// Capa de fondo de la mesa de Pool (Fase B, ago 2026 — antes vivía todo
// junto en MesaPool.tsx). Mesa, overlay de debug y guías de tiro: todo lo
// que en el <Canvas> original se dibujaba ANTES del grupo de bochas, ahora
// separado porque las bochas pasaron a una capa 3D aparte
// (MesaPoolBochas3D) que se apila arriba de esta. Este archivo sigue
// siendo 100% Skia, sin cambios de comportamiento respecto a antes — es
// un corte, no un rediseño.
//
// Este archivo importa Skia: en web SOLO debe cargarse vía MesaPoolLazy
// (después de LoadSkiaWeb). No importar directo desde pantallas.

import {
  BlurMask, Canvas, Circle, DashPathEffect, Group, Image as SkiaImage, Line, Oval, Path, Rect,
  SkPath, useImage, vec,
} from '@shopify/react-native-skia'
import { PARAMETROS, POSTES, RADIO_COLISION_POSTE, TRONERAS, limitesJuego } from '@/lib/pool/fisica'
import { NivelAsistencia } from '@/lib/pool/asistencia'
import { MESA_DEFAULT, MesaSkinId } from '@/lib/pool/skins'
import { ASSET_MESA, TransformMesa } from '@/lib/pool/mesaGeometria'
import { TrayectoriaGuia } from '@/lib/pool/guia'
import { Bola } from '@/lib/pool/tipos'
import type { BolaCayendo, BolaPosicionada } from './MesaPoolBochas3D'

export interface MesaPoolFondoProps {
  tf: TransformMesa
  mesaSkin?: MesaSkinId
  debug?: boolean
  octagono: SkPath
  trayectoria: TrayectoriaGuia | null
  objetivo: Bola | null | undefined
  nivelAsistencia: NivelAsistencia
  longitudGuiaObjetivo: number
  trayectoriaSugerida: TrayectoriaGuia | null
  // sombra de contacto (Fase D del plan de bochas 3D, ago 2026): mismas
  // posiciones que consume MesaPoolBochas3D, para que la sombra 2D quede
  // sincronizada cuadro a cuadro con la bocha 3D de la capa de arriba.
  dibujables: BolaPosicionada[]
  cayendo: BolaCayendo[]
}

// elipse suave desplazada bajo una bocha — la mesa es 2D y no puede recibir
// una sombra proyectada real desde la capa 3D, así que se simula acá con la
// misma posición en pantalla. Desplazamiento hacia abajo-izquierda, como si
// la luz viniera de arriba a la derecha (confirmado a ojo por el usuario,
// ago 2026) — no es un cálculo físico, es una sombra de utilería.
function SombraBocha({ tf, cx, cy, escala = 1 }: { tf: TransformMesa; cx: number; cy: number; escala?: number }) {
  const ancho = tf.radioBolaPx * 1.9 * escala
  const alto = tf.radioBolaPx * 1.5 * escala
  const cxSombra = cx - tf.radioBolaPx * 0.45 * escala
  const cySombra = cy + tf.radioBolaPx * 0.42 * escala
  return (
    <Oval x={cxSombra - ancho / 2} y={cySombra - alto / 2} width={ancho} height={alto} color="rgba(0,0,0,0.32)">
      <BlurMask blur={tf.radioBolaPx * 0.22 * escala} style="normal" />
    </Oval>
  )
}

export default function MesaPoolFondo({
  tf, mesaSkin = MESA_DEFAULT, debug = false, octagono,
  trayectoria, objetivo, nivelAsistencia, longitudGuiaObjetivo, trayectoriaSugerida,
  dibujables, cayendo,
}: MesaPoolFondoProps) {
  const R = PARAMETROS.radioBola
  // las variantes se cargan siempre (reglas de hooks: no se puede llamar
  // useImage condicionalmente) y se elige cuál dibujar más abajo — evita
  // requires dinámicos, que Metro no puede resolver.
  const mesaClasica = useImage(require('../../../assets/pool-assets/mesa_1.png'))
  const mesaClara = useImage(require('../../../assets/pool-assets/mesa_2.png'))
  const mesaPremium = useImage(require('../../../assets/pool-assets/mesa_3.png'))
  const mesaOriginal = useImage(require('../../../assets/pool-assets/mesa.png'))
  const fondo = mesaSkin === 'clara' ? mesaClara
    : mesaSkin === 'premium' ? mesaPremium
    : mesaSkin === 'original' ? mesaOriginal
    : mesaClasica

  return (
    <Canvas style={{ width: tf.anchoPx, height: tf.altoPx, position: 'absolute', top: 0, left: 0 }}>
      {/* fondo: el arte de la mesa (fallback procedural mientras carga) */}
      {fondo ? (
        <SkiaImage image={fondo} x={0} y={0} width={tf.anchoPx} height={tf.altoPx} fit="fill" />
      ) : (
        <Group>
          <Rect x={0} y={0} width={tf.anchoPx} height={tf.altoPx} color="#3A2412" />
          <Rect
            x={tf.anchoPx * ASSET_MESA.fx0}
            y={tf.altoPx * ASSET_MESA.fy0}
            width={tf.anchoPx * (ASSET_MESA.fx1 - ASSET_MESA.fx0)}
            height={tf.altoPx * (ASSET_MESA.fy1 - ASSET_MESA.fy0)}
            color="#155843"
          />
        </Group>
      )}

      {/* sombra de contacto (Fase D del plan de bochas 3D, ago 2026): una
          por cada bocha viva, más una por cada bocha cayendo en una tronera
          (se achica junto con ella, mismo criterio que usa la capa 3D). */}
      <Group>
        {dibujables.map(b => {
          const p = tf.aPantalla({ x: b.x, y: b.y })
          return <SombraBocha key={b.n} tf={tf} cx={p.x} cy={p.y} />
        })}
        {cayendo.map(c => {
          const p = tf.aPantalla({ x: c.x, y: c.y })
          return <SombraBocha key={`cae-${c.n}`} tf={tf} cx={p.x} cy={p.y} escala={c.escala} />
        })}
      </Group>

      {/* DEBUG temporal: geometría invisible de colisión sobre la mesa real.
          El borde verde es el mismo octágono (verticesOctagonoMesa) que ANTES
          también recortaba la capa de bolas — ahora esa capa es 3D y ya no
          necesita este clip, acá solo se dibuja el contorno para
          diagnosticar troneras/postes de un vistazo. La física sigue siendo
          el rectángulo completo (lx,ly) de siempre, esto no cambia ningún
          cálculo de colisión. */}
      {debug && (() => {
        // amarillo: rectángulo de colisión REAL (fisica.ts: limitesJuego, lx/ly)
        // — donde el CENTRO de una bola rebota de verdad. Es más grande que el
        // octágono verde en las esquinas a propósito: ese octágono es solo el
        // recorte visual (más generoso que la física para no cortar bolas en
        // tramos rectos), no la colisión en sí. Compararlos de un vistazo sirve
        // para calibrar el chaflán sin adivinar.
        const { lx, ly } = limitesJuego()
        const esqSupIzq = tf.aPantalla({ x: -lx, y: ly })
        const esqInfDer = tf.aPantalla({ x: lx, y: -ly })

        return (
          <Group>
            <Rect
              x={esqSupIzq.x} y={esqSupIzq.y}
              width={esqInfDer.x - esqSupIzq.x} height={esqInfDer.y - esqSupIzq.y}
              style="stroke" strokeWidth={2} color="#F5B301"
            >
              <DashPathEffect intervals={[4, 4]} />
            </Rect>
            {/* verde: recorte visual histórico de bolas (ver nota arriba) */}
            <Path path={octagono} style="stroke" strokeWidth={2.5} color="#22C55E" />
            {/* rojo: troneras — sólido = captura, punteado = boca (sin pared) */}
            {TRONERAS.map(t => {
              const p = tf.aPantalla(t.centro)
              const rCaptura = t.captura * ((tf.sx + tf.sy) / 2)
              const rBoca = t.boca * ((tf.sx + tf.sy) / 2)
              return (
                <Group key={t.id}>
                  <Circle cx={p.x} cy={p.y} r={rCaptura} color="rgba(220,38,38,0.45)" />
                  <Circle cx={p.x} cy={p.y} r={rBoca} style="stroke" strokeWidth={2} color="rgba(220,38,38,0.9)">
                    <DashPathEffect intervals={[6, 5]} />
                  </Circle>
                </Group>
              )
            })}
            {/* rojo sólido: postes de ceja con su radio de colisión real */}
            {POSTES.map((poste, i) => {
              const p = tf.aPantalla(poste)
              const rPoste = RADIO_COLISION_POSTE * ((tf.sx + tf.sy) / 2)
              return <Circle key={i} cx={p.x} cy={p.y} r={rPoste} color="rgba(185,28,28,0.95)" />
            })}
          </Group>
        )
      })()}

      {/* guía de tiro (spec §2): cuánto se dibuja depende del nivel de
          asistencia — "baja" corta en un adelanto y no muestra el círculo de
          impacto (el punto no es real, es solo la punta del adelanto);
          "normal" agrega el círculo (marca dónde termina lo que ya se está
          dibujando, no es información extra); "maxima" suma la flecha del
          objetivo, la tangente de la blanca y, si hubo, el rebote (ya viene
          filtrado desde el cálculo de arriba vía maxRebotes). */}
      {trayectoria && trayectoria.segmentos.length > 0 && (() => {
        const ultimo = trayectoria.segmentos[trayectoria.segmentos.length - 1]
        const finUltimoPx = tf.aPantalla(ultimo.fin)
        return (
          <Group>
            {trayectoria.segmentos.map((seg, i) => (
              <Line
                key={i}
                p1={vec(tf.aPantalla(seg.origen).x, tf.aPantalla(seg.origen).y)}
                p2={vec(tf.aPantalla(seg.fin).x, tf.aPantalla(seg.fin).y)}
                color={i === 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)'}
                strokeWidth={2}
              >
                <DashPathEffect intervals={[9, 7]} />
              </Line>
            ))}
            {nivelAsistencia !== 'baja' && (
              <Circle
                cx={finUltimoPx.x} cy={finUltimoPx.y} r={tf.radioBolaPx}
                style="stroke" strokeWidth={1.6} color="rgba(255,255,255,0.75)"
              />
            )}
            {nivelAsistencia === 'maxima' && objetivo && trayectoria.dirObjetivo && (
              <Line
                p1={vec(tf.aPantalla(objetivo.pos).x, tf.aPantalla(objetivo.pos).y)}
                p2={vec(
                  tf.aPantalla({ x: objetivo.pos.x + trayectoria.dirObjetivo.x * longitudGuiaObjetivo * R, y: objetivo.pos.y + trayectoria.dirObjetivo.y * longitudGuiaObjetivo * R }).x,
                  tf.aPantalla({ x: objetivo.pos.x + trayectoria.dirObjetivo.x * longitudGuiaObjetivo * R, y: objetivo.pos.y + trayectoria.dirObjetivo.y * longitudGuiaObjetivo * R }).y,
                )}
                color="#DFC47A" strokeWidth={2.5}
              />
            )}
            {nivelAsistencia === 'maxima' && trayectoria.dirBlanca && (
              <Line
                p1={vec(finUltimoPx.x, finUltimoPx.y)}
                p2={vec(
                  tf.aPantalla({ x: ultimo.fin.x + trayectoria.dirBlanca.x * 4 * R, y: ultimo.fin.y + trayectoria.dirBlanca.y * 4 * R }).x,
                  tf.aPantalla({ x: ultimo.fin.x + trayectoria.dirBlanca.x * 4 * R, y: ultimo.fin.y + trayectoria.dirBlanca.y * 4 * R }).y,
                )}
                color="rgba(255,255,255,0.38)" strokeWidth={2}
              />
            )}
          </Group>
        )
      })()}

      {/* sugerencia del bot en práctica libre (spec §3): mismo tipo de línea
          que la guía propia pero en celeste, para no confundirse — queda
          dibujada hasta que se tira (o se pide otra), a propósito: el
          jugador la usa de referencia para alinear su propio apuntado
          (feedback de juego real, jul 2026) — el padre (partida-pool.tsx)
          la limpia recién en ejecutarTiro()/nuevaPartida(). */}
      {trayectoriaSugerida && trayectoriaSugerida.segmentos.length > 0 && (
        <Group>
          {trayectoriaSugerida.segmentos.map((seg, i) => (
            <Line
              key={i}
              p1={vec(tf.aPantalla(seg.origen).x, tf.aPantalla(seg.origen).y)}
              p2={vec(tf.aPantalla(seg.fin).x, tf.aPantalla(seg.fin).y)}
              color="rgba(90,200,223,0.85)"
              strokeWidth={2.5}
            >
              <DashPathEffect intervals={[6, 4]} />
            </Line>
          ))}
        </Group>
      )}
    </Canvas>
  )
}
