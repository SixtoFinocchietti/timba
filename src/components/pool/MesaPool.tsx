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

import {
  Canvas, Circle, DashPathEffect, Group, Image as SkiaImage, Line, Oval,
  RadialGradient, Rect, Skia, Text as SkiaText, useFont, useImage, vec,
} from '@shopify/react-native-skia'
import { PARAMETROS, POSTES, RADIO_COLISION_POSTE, TRONERAS, limitesJuego } from '@/lib/pool/fisica'
import { calcularGuia } from '@/lib/pool/guia'
import { ASSET_MESA, crearTransform } from '@/lib/pool/transform'
import { Bola, MuestraAnimacion } from '@/lib/pool/tipos'

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

// assets/pool-assets/palo_pool.png: 1408×150, punta (virola blanca) a la
// IZQUIERDA, mango a la derecha — se dibuja rotado con la punta apoyada
// justo detrás de la blanca, apuntando hacia ella.
const ASPECTO_TACO = 150 / 1408

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

function BolaDibujada({ cx, cy, r, n, rot, dirPx, dirPy, fuente }: BolaDibujadaProps) {
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
          // parche blanco tipo "píldora": ancho según el texto (los números de
          // 2 dígitos, 10-15, necesitan más que un círculo fijo) sin desbordar
          const alturaParche = r * 0.66 * escala
          const anchoParche = Math.max(alturaParche, anchoTexto + r * 0.26)
          return (
            <Oval
              x={cx - anchoParche / 2}
              y={cy + offsetLocal - alturaParche / 2}
              width={anchoParche}
              height={alturaParche}
              color={MARFIL}
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
          <Circle cx={cx} cy={cy + offsetLocal} r={r * 0.14 * escala} color="#C93430" />
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
  const guia = !muestra && mostrarGuia && blanca ? calcularGuia(bolas, angulo) : null
  const objetivo = guia?.bolaObjetivo != null ? bolas.find(b => b.n === guia.bolaObjetivo) : null

  // taco: detrás de la blanca, retrocede con la fuerza
  const dirX = Math.cos(angulo)
  const dirY = Math.sin(angulo)
  const gap = 2.4 * R + fuerzaPreview * 0.34
  const largoTaco = 1.05 // feedback de juego: se pedía más grande

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
          Las 4 bandas se dibujan como líneas independientes (no un solo
          Rect) porque el arte real recorta la esquina en diagonal cerca de
          cada tronera: una línea recta hasta el borde exacto se superpone
          confusamente con esa diagonal. Los recortes/extensiones de cada
          punta (medidos en píxeles por el usuario sobre un canvas de
          513×770, acá como fracción para que escale con cualquier tamaño)
          solo prolijan el dibujo — la física sigue siendo el rectángulo
          completo (lx,ly), esto no cambia ningún cálculo de colisión. */}
      {debug && (() => {
        const { lx, ly } = limitesJuego()
        const esqSupIzq = tf.aPantalla({ x: -lx, y: ly })
        const anchoRectPx = 2 * lx * tf.sx
        const altoRectPx = 2 * ly * tf.sy
        const left = esqSupIzq.x
        const top = esqSupIzq.y
        const right = left + anchoRectPx
        const bottom = top + altoRectPx
        const supTrim = (20 / 513) * tf.anchoPx
        const infTrim = (23 / 513) * tf.anchoPx
        const izqExtArriba = (16 / 769.92) * tf.altoPx
        const izqExtAbajo = (12 / 769.92) * tf.altoPx
        const derExtArriba = (12 / 769.92) * tf.altoPx
        const derExtAbajo = (12 / 769.92) * tf.altoPx
        return (
          <Group>
            {/* verde: bandas jugables (donde rebota una bola normal) */}
            <Line p1={vec(left + supTrim, top)} p2={vec(right - supTrim, top)} strokeWidth={2.5} color="#22C55E" />
            <Line p1={vec(left + infTrim, bottom)} p2={vec(right - infTrim, bottom)} strokeWidth={2.5} color="#22C55E" />
            <Line p1={vec(left, top - izqExtArriba)} p2={vec(left, bottom + izqExtAbajo)} strokeWidth={2.5} color="#22C55E" />
            <Line p1={vec(right, top - derExtArriba)} p2={vec(right, bottom + derExtAbajo)} strokeWidth={2.5} color="#22C55E" />
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

      {/* guía de tiro */}
      {guia && (
        <Group>
          <Line
            p1={vec(tf.aPantalla(guia.origen).x, tf.aPantalla(guia.origen).y)}
            p2={vec(tf.aPantalla(guia.impacto).x, tf.aPantalla(guia.impacto).y)}
            color="rgba(255,255,255,0.75)" strokeWidth={2}
          >
            <DashPathEffect intervals={[9, 7]} />
          </Line>
          <Circle
            cx={tf.aPantalla(guia.impacto).x} cy={tf.aPantalla(guia.impacto).y} r={rPx}
            style="stroke" strokeWidth={1.6} color="rgba(255,255,255,0.75)"
          />
          {objetivo && guia.dirObjetivo && (
            <Line
              p1={vec(tf.aPantalla(objetivo.pos).x, tf.aPantalla(objetivo.pos).y)}
              p2={vec(
                tf.aPantalla({ x: objetivo.pos.x + guia.dirObjetivo.x * longitudGuiaObjetivo * R, y: objetivo.pos.y + guia.dirObjetivo.y * longitudGuiaObjetivo * R }).x,
                tf.aPantalla({ x: objetivo.pos.x + guia.dirObjetivo.x * longitudGuiaObjetivo * R, y: objetivo.pos.y + guia.dirObjetivo.y * longitudGuiaObjetivo * R }).y,
              )}
              color="#DFC47A" strokeWidth={2.5}
            />
          )}
          {guia.dirBlanca && (
            <Line
              p1={vec(tf.aPantalla(guia.impacto).x, tf.aPantalla(guia.impacto).y)}
              p2={vec(
                tf.aPantalla({ x: guia.impacto.x + guia.dirBlanca.x * 4 * R, y: guia.impacto.y + guia.dirBlanca.y * 4 * R }).x,
                tf.aPantalla({ x: guia.impacto.x + guia.dirBlanca.x * 4 * R, y: guia.impacto.y + guia.dirBlanca.y * 4 * R }).y,
              )}
              color="rgba(255,255,255,0.38)" strokeWidth={2}
            />
          )}
        </Group>
      )}

      {/* bolas */}
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
        const buttMesa = { x: blanca.pos.x - dirX * (gap + largoTaco), y: blanca.pos.y - dirY * (gap + largoTaco) }
        const tipPx = tf.aPantalla(tipMesa)
        const buttPx = tf.aPantalla(buttMesa)
        const largoPx = Math.hypot(buttPx.x - tipPx.x, buttPx.y - tipPx.y)
        const anguloPx = Math.atan2(buttPx.y - tipPx.y, buttPx.x - tipPx.x)
        // grosor con un plus sobre la proporción real de la foto (feedback:
        // se veía fino) para que se note bien en pantallas chicas
        const altoPx = Math.max(5, largoPx * ASPECTO_TACO * 1.3)

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
