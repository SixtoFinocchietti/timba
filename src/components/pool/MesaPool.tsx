// Mesa de Pool en Skia. El fondo es el ARTE del usuario
// (assets/pool-assets/mesa.png: marco, bandas, troneras y línea de cabecera
// ya dibujados); encima van las capas dinámicas. La geometría física se mapea
// al paño del dibujo vía transform.ts.
//
// Bolas procedurales CON RODADURA (spec §13): el patrón (franja, número, punto
// de la blanca) orbita con la fase de rodadura que calcula el motor (rot) en
// la dirección del movimiento — avanza por la cara, se achica hacia el borde,
// desaparece adelante y reaparece atrás — mientras el sombreado esférico y el
// brillo especular quedan FIJOS (la luz no gira con la bola): ese contraste es
// lo que vende la esfera en 2D.
//
// Este archivo importa Skia: en web SOLO debe cargarse vía MesaPoolLazy
// (después de LoadSkiaWeb). No importar directo desde pantallas.

import { useMemo } from 'react'
import {
  Canvas, Circle, DashPathEffect, Group, Image as SkiaImage, Line, Oval, Path,
  RadialGradient, Rect, Skia, Text as SkiaText, useFont, useImage, vec,
} from '@shopify/react-native-skia'
import { PARAMETROS, POSTES, RADIO_COLISION_POSTE, TRONERAS } from '@/lib/pool/fisica'
import { calcularTrayectoriaGuia } from '@/lib/pool/guia'
import { ASSET_MESA, crearTransform, verticesOctagonoMesa } from '@/lib/pool/transform'
import { Bola, MuestraAnimacion, Vec2 } from '@/lib/pool/tipos'

// Path de Skia a partir de una polilínea cerrada (usado para el octágono
// real de la mesa: overlay de debug y clip de la capa de bolas).
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
  mostrarGuia: boolean
  bolaEnMano: boolean
  // debug temporal (spec de tuning jul 2026): dibuja la geometría invisible
  // de colisión encima de la mesa real — verde las bandas jugables, rojo las
  // troneras (captura sólida, boca punteada) y los postes de ceja
  debug?: boolean
  // ayuda de la dificultad Fácil (spec §10): línea de dirección de la bola
  // objetivo mucho más larga, en radios de bola (default: guía normal)
  longitudGuiaObjetivo?: number
}

const R = PARAMETROS.radioBola

// colores estándar de las bolas (9..15 comparten color con n−8)
const COLORES_BOLA: Record<number, string> = {
  1: '#F0B428', 2: '#1E5AA8', 3: '#C93430', 4: '#5B3E8F',
  5: '#E07B28', 6: '#1F7A4D', 7: '#8A3038', 8: '#161616',
}

const MARFIL = '#F2EFE8'

// assets/pool-assets/palo_pool.png: punta (virola blanca) a la IZQUIERDA,
// mango a la derecha — se dibuja rotado con la punta apoyada justo detrás
// de la blanca, apuntando hacia ella. El aspecto se lee del archivo real
// (taco.width()/height()) en vez de hardcodearlo: el asset se reemplazó
// más de una vez durante el tuning y una constante fija quedaba desincronizada,
// estirando la imagen (bug real detectado en auditoría, jul 2026).
const LARGO_TACO = 1.3 // unidades de mesa (antes 1.05: se pidió más grande)
const GROSOR_TACO_MULT = 1.3 // plus sobre la proporción real de la foto

interface BolaDibujadaProps {
  cx: number
  cy: number
  r: number
  n: number
  rot: number
  dirPx: number // dirección de avance en PANTALLA (y hacia abajo)
  dirPy: number
  fuente: ReturnType<typeof useFont>
}

function BolaDibujada({ cx: cxRaw, cy: cyRaw, r, n, rot, dirPx, dirPy, fuente }: BolaDibujadaProps) {
  // redondear a píxel: a los pocos px de radio que tiene una bola en mobile,
  // arrastrar coordenadas de subpíxel entre frames se ve como shimmering
  // (bug real de auditoría, jul 2026 — junto con el óvalo de tamaño fijo abajo)
  const cx = Math.round(cxRaw)
  const cy = Math.round(cyRaw)
  const rayada = n >= 9
  const color = n === 0 ? MARFIL : COLORES_BOLA[n <= 8 ? n : n - 8]

  // fase de rodadura: el patrón orbita la esfera; visible si cos > 0
  const fase = rot % (2 * Math.PI)
  const s = Math.sin(fase)
  const co = Math.cos(fase)
  const offsetLocal = -s * 0.55 * r // avance del patrón: -y local = dirección de movimiento
  const escala = 0.55 + 0.45 * Math.abs(co)
  const patronVisible = co > 0.05
  // marco local: -y local apunta hacia la dirección de avance en pantalla
  const angDir = Math.atan2(dirPy, dirPx) + Math.PI / 2

  const clip = Skia.Path.Make()
  clip.addCircle(cx, cy, r)

  const texto = n === 0 ? null : String(n)
  const anchoTexto = texto && fuente ? fuente.getTextWidth(texto) : 0

  return (
    <Group>
      {/* sombra proyectada (fija) */}
      <Circle cx={cx + r * 0.2} cy={cy + r * 0.32} r={r} color="rgba(0,0,0,0.30)" />
      {/* base */}
      <Circle cx={cx} cy={cy} r={r} color={rayada ? MARFIL : color} />

      {/* patrón que RUEDA (rotado hacia la dirección de avance) */}
      <Group origin={vec(cx, cy)} transform={[{ rotate: angDir }]}>
        {rayada && (
          <Group clip={clip}>
            <Rect
              x={cx - r}
              y={cy + offsetLocal - (r * 1.04 * (0.35 + 0.65 * Math.abs(co))) / 2}
              width={2 * r}
              height={r * 1.04 * (0.35 + 0.65 * Math.abs(co))}
              color={color}
            />
          </Group>
        )}
        {patronVisible && n !== 0 && fuente && texto && (() => {
          // parche blanco tipo "píldora": tamaño FIJO (no escala con la fase
          // de rotación) — escalarlo generaba un jitter visible de subpíxel
          // en bolas de pocos px de radio (bug real de auditoría, jul 2026).
          // El ancho sigue el texto (los números de 2 dígitos, 10-15,
          // necesitan más que un círculo) sin desbordar; el fundido de
          // entrada/salida ahora es solo por opacidad, junto con el texto.
          const alturaParche = r * 0.66
          const anchoParche = Math.max(alturaParche, anchoTexto + r * 0.26)
          return (
            <Oval
              x={cx - anchoParche / 2}
              y={cy + offsetLocal - alturaParche / 2}
              width={anchoParche}
              height={alturaParche}
              color={MARFIL}
              opacity={escala}
            />
          )
        })()}
        {patronVisible && texto && fuente && (
          <Group clip={clip}>
            <SkiaText
              x={cx - anchoTexto / 2}
              y={cy + offsetLocal + r * 0.1}
              text={texto}
              font={fuente}
              color={n === 8 ? MARFIL : '#161616'}
              opacity={escala}
            />
          </Group>
        )}
        {patronVisible && n === 0 && (
          <Circle cx={cx} cy={cy + offsetLocal} r={r * 0.14} color="#C93430" opacity={escala} />
        )}
      </Group>

      {/* sombreado esférico + brillo: FIJOS (la luz no gira con la bola) */}
      <Circle cx={cx} cy={cy} r={r}>
        <RadialGradient
          c={vec(cx - r * 0.35, cy - r * 0.4)}
          r={r * 1.9}
          colors={['rgba(255,255,255,0.32)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.34)']}
          positions={[0, 0.5, 1]}
        />
      </Circle>
      <Circle cx={cx - r * 0.34} cy={cy - r * 0.42} r={r * 0.15} color="rgba(255,255,255,0.85)" />
    </Group>
  )
}

export default function MesaPool({
  anchoPx, bolas, muestra, angulo, fuerzaPreview, mostrarGuia, bolaEnMano,
  longitudGuiaObjetivo = 6, debug = false,
}: MesaPoolProps) {
  const tf = crearTransform(anchoPx)
  const rPx = tf.radioBolaPx
  const fondo = useImage(require('../../../assets/pool-assets/mesa.png'))
  const taco = useImage(require('../../../assets/pool-assets/palo_pool.png'))
  // feedback de juego: los números quedaban grandes; se achican de nuevo acá
  // (y un poco más, "ligeramente") — ojo que rPx ya creció con radioBola
  const fuenteNumero = useFont(require('../../../assets/pool-assets/fonts/Merriweather-Bold.ttf'), Math.max(7, rPx * 0.48))

  // qué bolas dibujar: la animación manda, si no el estado quieto
  const dibujables = muestra
    ? muestra.bolas
    : bolas
        .filter(b => b.viva)
        .map(b => ({ n: b.n, x: b.pos.x, y: b.pos.y, rot: b.rot, dirX: b.dirX, dirY: b.dirY }))

  const blanca = bolas.find(b => b.n === 0 && b.viva)
  // guía con 1 rebote en banda (auditoría técnica, jul 2026): muestra el
  // primer tramo y, si terminó en banda, el tramo posterior a la reflexión
  // — solo si de verdad hay algo dentro del alcance (ver guia.ts).
  const trayectoria = !muestra && mostrarGuia && blanca
    ? calcularTrayectoriaGuia(bolas, angulo, { maxRebotes: 1 })
    : null
  const objetivo = trayectoria?.bolaObjetivo != null ? bolas.find(b => b.n === trayectoria.bolaObjetivo) : null

  // taco: detrás de la blanca, retrocede con la fuerza
  const dirX = Math.cos(angulo)
  const dirY = Math.sin(angulo)
  const gap = 2.4 * R + fuerzaPreview * 0.34

  // octágono real de la mesa (paño recortado en diagonal en cada esquina):
  // recorta la capa de bolas para que ninguna se dibuje sobre la banda/madera
  // (bug real, auditoría jul 2026 — ver nota en transform.ts). Memoizado: solo
  // depende del ancho del canvas, no hace falta reconstruir el Path cada frame.
  const octagono = useMemo(() => pathDePoligono(verticesOctagonoMesa(tf)), [anchoPx])

  return (
    <Canvas style={{ width: tf.anchoPx, height: tf.altoPx }}>
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

      {/* DEBUG temporal: geometría invisible de colisión sobre la mesa real.
          El borde verde es el mismo octágono (verticesOctagonoMesa) que ahora
          también recorta la capa de bolas más abajo — acá solo se dibuja su
          contorno para diagnosticar troneras/postes de un vistazo. La física
          sigue siendo el rectángulo completo (lx,ly) de siempre, esto no
          cambia ningún cálculo de colisión. */}
      {debug && (() => {
        return (
          <Group>
            {/* verde: bandas jugables (donde rebota una bola normal) */}
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

      {/* guía de tiro: 1+ segmentos (blanca→impacto, y tras un rebote en
          banda, el tramo reflejado) — el tramo post-rebote se dibuja más
          tenue porque es una aproximación geométrica, sin fricción ni spin. */}
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
            <Circle
              cx={finUltimoPx.x} cy={finUltimoPx.y} r={rPx}
              style="stroke" strokeWidth={1.6} color="rgba(255,255,255,0.75)"
            />
            {objetivo && trayectoria.dirObjetivo && (
              <Line
                p1={vec(tf.aPantalla(objetivo.pos).x, tf.aPantalla(objetivo.pos).y)}
                p2={vec(
                  tf.aPantalla({ x: objetivo.pos.x + trayectoria.dirObjetivo.x * longitudGuiaObjetivo * R, y: objetivo.pos.y + trayectoria.dirObjetivo.y * longitudGuiaObjetivo * R }).x,
                  tf.aPantalla({ x: objetivo.pos.x + trayectoria.dirObjetivo.x * longitudGuiaObjetivo * R, y: objetivo.pos.y + trayectoria.dirObjetivo.y * longitudGuiaObjetivo * R }).y,
                )}
                color="#DFC47A" strokeWidth={2.5}
              />
            )}
            {trayectoria.dirBlanca && (
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

      {/* bolas: recortadas al octágono real de la mesa (ver nota arriba y en
          transform.ts) — ninguna se dibuja fuera del paño, sin importar qué
          tan cerca de una esquina permita llegar la física rectangular. */}
      <Group clip={octagono}>
        {dibujables.map(b => {
          const p = tf.aPantalla({ x: b.x, y: b.y })
          return (
            <BolaDibujada
              key={b.n}
              cx={p.x}
              cy={p.y}
              r={rPx}
              n={b.n}
              rot={b.rot}
              dirPx={b.dirX}
              dirPy={-b.dirY}
              fuente={fuenteNumero}
            />
          )
        })}
      </Group>

      {/* glow de bola en mano */}
      {bolaEnMano && blanca && !muestra && (
        <Circle
          cx={tf.aPantalla(blanca.pos).x} cy={tf.aPantalla(blanca.pos).y} r={rPx * 1.7}
          style="stroke" strokeWidth={2.5} color="rgba(223,196,122,0.85)"
        />
      )}

      {/* taco: imagen del usuario, rotada con la punta apoyada tras la blanca */}
      {!muestra && blanca && !bolaEnMano && (() => {
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
              color="#B9884A" strokeWidth={Math.max(4, rPx * 0.55)} strokeCap="round"
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
