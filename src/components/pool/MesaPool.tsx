// Mesa de Pool dibujada 100% en Skia (procedural, sin assets por ahora: cuando
// esté el arte final de la mesa, el paño/marco se reemplaza por una Image y las
// capas dinámicas quedan igual). Ver spec §13: las bolas son procedurales —
// color pleno o franja (rayadas), circulito del número, sombreado esférico y
// highlight FIJO arriba-izquierda (la luz no gira con la bola).
//
// Este archivo importa Skia, así que en web SOLO debe cargarse vía
// MesaPoolLazy (después de LoadSkiaWeb). No importar directo desde pantallas.

import {
  Canvas, Circle, DashPathEffect, Group, Line, RadialGradient, Rect, RoundedRect,
  Skia, vec,
} from '@shopify/react-native-skia'
import { PARAMETROS, TRONERAS, CABECERA_Y, PIE } from '@/lib/pool/fisica'
import { calcularGuia } from '@/lib/pool/guia'
import { ANCHO_BANDA, ANCHO_MARCO, crearTransform } from '@/lib/pool/transform'
import { Bola, MuestraAnimacion } from '@/lib/pool/tipos'

export interface MesaPoolProps {
  anchoPx: number
  bolas: Bola[]
  muestra: MuestraAnimacion | null // si hay animación en curso, manda ella
  angulo: number
  fuerzaPreview: number // 0..1: retroceso del taco mientras se carga el tiro
  mostrarGuia: boolean
  bolaEnMano: boolean
}

const R = PARAMETROS.radioBola

// colores estándar de las bolas (9..15 comparten color con n−8)
const COLORES_BOLA: Record<number, string> = {
  1: '#F0B428', 2: '#1E5AA8', 3: '#C93430', 4: '#5B3E8F',
  5: '#E07B28', 6: '#1F7A4D', 7: '#8A3038', 8: '#161616',
}

const MARFIL = '#F2EFE8'

function BolaDibujada({ cx, cy, r, n }: { cx: number; cy: number; r: number; n: number }) {
  const rayada = n >= 9
  const color = n === 0 ? MARFIL : COLORES_BOLA[n <= 8 ? n : n - 8]
  const clip = Skia.Path.Make()
  clip.addCircle(cx, cy, r)
  return (
    <Group>
      <Circle cx={cx + r * 0.2} cy={cy + r * 0.32} r={r} color="rgba(0,0,0,0.30)" />
      <Circle cx={cx} cy={cy} r={r} color={rayada ? MARFIL : color} />
      {rayada && (
        <Group clip={clip}>
          <Rect x={cx - r} y={cy - r * 0.52} width={2 * r} height={r * 1.04} color={color} />
        </Group>
      )}
      {n !== 0 && <Circle cx={cx} cy={cy} r={r * 0.42} color={MARFIL} />}
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
}: MesaPoolProps) {
  const tf = crearTransform(anchoPx)
  const e = tf.escala
  const rPx = R * e

  // superficie jugable en px
  const supIzq = tf.aPantalla({ x: -PARAMETROS.anchoMesa / 2, y: PARAMETROS.altoMesa / 2 })
  const supAncho = PARAMETROS.anchoMesa * e
  const supAlto = PARAMETROS.altoMesa * e
  const bandaPx = ANCHO_BANDA * e
  const marcoPx = ANCHO_MARCO * e

  // qué bolas dibujar: la animación manda, si no el estado quieto
  const dibujables = muestra
    ? muestra.bolas
    : bolas.filter(b => b.viva).map(b => ({ n: b.n, x: b.pos.x, y: b.pos.y, rot: b.rot }))

  const blanca = bolas.find(b => b.n === 0 && b.viva)
  const guia = !muestra && mostrarGuia && blanca ? calcularGuia(bolas, angulo) : null
  const objetivo = guia?.bolaObjetivo != null ? bolas.find(b => b.n === guia.bolaObjetivo) : null

  // taco: detrás de la blanca, retrocede con la fuerza
  const dirX = Math.cos(angulo)
  const dirY = Math.sin(angulo)
  const gap = 2.4 * R + fuerzaPreview * 0.34
  const largoTaco = 0.86

  const cabeceraY = tf.aPantalla({ x: 0, y: CABECERA_Y }).y
  const pie = tf.aPantalla(PIE)

  return (
    <Canvas style={{ width: tf.anchoPx, height: tf.altoPx }}>
      {/* marco de madera */}
      <RoundedRect x={0} y={0} width={tf.anchoPx} height={tf.altoPx} r={marcoPx * 1.2} color="#4A2E15" />
      <RoundedRect
        x={marcoPx * 0.25} y={marcoPx * 0.25}
        width={tf.anchoPx - marcoPx * 0.5} height={tf.altoPx - marcoPx * 0.5}
        r={marcoPx} color="#5D3A1C"
      />
      {/* banda + paño con viñeta de lámpara */}
      <Rect
        x={supIzq.x - bandaPx} y={supIzq.y - bandaPx}
        width={supAncho + 2 * bandaPx} height={supAlto + 2 * bandaPx}
        color="#0E4634"
      />
      <Rect x={supIzq.x} y={supIzq.y} width={supAncho} height={supAlto}>
        <RadialGradient
          c={vec(tf.anchoPx / 2, tf.altoPx / 2)}
          r={supAlto * 0.62}
          colors={['#1B6B50', '#155843', '#0F4636']}
          positions={[0, 0.6, 1]}
        />
      </Rect>
      {/* línea de cabecera y punto del pie */}
      <Line
        p1={vec(supIzq.x + 4, cabeceraY)} p2={vec(supIzq.x + supAncho - 4, cabeceraY)}
        color="rgba(255,255,255,0.16)" strokeWidth={1.5}
      />
      <Circle cx={pie.x} cy={pie.y} r={3} color="rgba(255,255,255,0.20)" />

      {/* troneras */}
      {TRONERAS.map(t => {
        const p = tf.aPantalla(t.centro)
        return (
          <Group key={t.id}>
            <Circle cx={p.x} cy={p.y} r={t.boca * e * 0.95} color="#241505" />
            <Circle cx={p.x} cy={p.y} r={t.boca * e * 0.78} color="#0A0A0A" />
          </Group>
        )
      })}

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
          {/* ghost ball en el punto de contacto */}
          <Circle
            cx={tf.aPantalla(guia.impacto).x} cy={tf.aPantalla(guia.impacto).y} r={rPx}
            style="stroke" strokeWidth={1.6} color="rgba(255,255,255,0.75)"
          />
          {objetivo && guia.dirObjetivo && (
            <Line
              p1={vec(tf.aPantalla(objetivo.pos).x, tf.aPantalla(objetivo.pos).y)}
              p2={vec(
                tf.aPantalla({ x: objetivo.pos.x + guia.dirObjetivo.x * 6 * R, y: objetivo.pos.y + guia.dirObjetivo.y * 6 * R }).x,
                tf.aPantalla({ x: objetivo.pos.x + guia.dirObjetivo.x * 6 * R, y: objetivo.pos.y + guia.dirObjetivo.y * 6 * R }).y,
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
        return <BolaDibujada key={b.n} cx={p.x} cy={p.y} r={rPx} n={b.n} />
      })}

      {/* glow de bola en mano */}
      {bolaEnMano && blanca && !muestra && (
        <Circle
          cx={tf.aPantalla(blanca.pos).x} cy={tf.aPantalla(blanca.pos).y} r={rPx * 1.7}
          style="stroke" strokeWidth={2.5} color="rgba(223,196,122,0.85)"
        />
      )}

      {/* taco */}
      {!muestra && blanca && !bolaEnMano && (
        <Group>
          <Line
            p1={vec(
              tf.aPantalla({ x: blanca.pos.x - dirX * gap, y: blanca.pos.y - dirY * gap }).x,
              tf.aPantalla({ x: blanca.pos.x - dirX * gap, y: blanca.pos.y - dirY * gap }).y,
            )}
            p2={vec(
              tf.aPantalla({ x: blanca.pos.x - dirX * (gap + largoTaco), y: blanca.pos.y - dirY * (gap + largoTaco) }).x,
              tf.aPantalla({ x: blanca.pos.x - dirX * (gap + largoTaco), y: blanca.pos.y - dirY * (gap + largoTaco) }).y,
            )}
            color="#B9884A" strokeWidth={Math.max(4, rPx * 0.55)} strokeCap="round"
          />
          <Line
            p1={vec(
              tf.aPantalla({ x: blanca.pos.x - dirX * gap, y: blanca.pos.y - dirY * gap }).x,
              tf.aPantalla({ x: blanca.pos.x - dirX * gap, y: blanca.pos.y - dirY * gap }).y,
            )}
            p2={vec(
              tf.aPantalla({ x: blanca.pos.x - dirX * (gap + 0.055), y: blanca.pos.y - dirY * (gap + 0.055) }).x,
              tf.aPantalla({ x: blanca.pos.x - dirX * (gap + 0.055), y: blanca.pos.y - dirY * (gap + 0.055) }).y,
            )}
            color="#E8E2D4" strokeWidth={Math.max(4, rPx * 0.55)} strokeCap="round"
          />
        </Group>
      )}
    </Canvas>
  )
}
