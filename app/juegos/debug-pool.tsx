// DEBUG TEMPORAL (tuning jul 2026) — muestra la geometría invisible de
// colisión sobre la mesa real: verde = bandas jugables, rojo = troneras
// (captura sólida, boca punteada) y postes de ceja. Arrastrá la bola blanca
// cerca de una esquina para ver si tu posición cae dentro de la zona roja
// (debería entrar) o si roza un punto rojo de poste (reportar con captura
// de pantalla). Sacar esta pantalla y su entrada de menú antes de pasar a
// producción — ver docs/POOL_8BALL_SPEC.md.

import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import MesaPoolLazy from '@/components/pool/MesaPoolLazy'
import { crearTransform, RELACION_ASPECTO } from '@/lib/pool/transform'
import { Bola } from '@/lib/pool/tipos'

function bolaBlanca(x: number, y: number): Bola {
  return { n: 0, pos: { x, y }, vel: { x: 0, y: 0 }, wx: 0, wy: 0, wz: 0, viva: true, quieta: true, rot: 0, dirX: 0, dirY: 1 }
}

export default function DebugPool() {
  const c = useColores()
  const es = makeEstilos(c)
  const [bola, setBola] = useState<Bola>(() => bolaBlanca(0.3, 0.9))
  const [anchoMesa, setAnchoMesa] = useState(0)
  const bolaRef = useRef(bola)
  bolaRef.current = bola
  const zonaRef = useRef<View>(null)

  // fallback de medición: en web, un tab en segundo plano no dispara onLayout
  useEffect(() => {
    const timer = setTimeout(() => {
      if (anchoMesa > 0) return
      const el = zonaRef.current as unknown as { getBoundingClientRect?: () => { width: number; height: number } }
      const rect = el?.getBoundingClientRect?.()
      if (rect && rect.width > 0 && rect.height > 0) {
        const ancho = Math.min(rect.width - 24, rect.height / RELACION_ASPECTO)
        setAnchoMesa(Math.max(120, Math.floor(ancho)))
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [anchoMesa])

  const tf = anchoMesa > 0 ? crearTransform(anchoMesa) : null

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onChange(e => {
      if (!tf) return
      const m = tf.aMesa(e.x, e.y)
      setBola({ ...bolaRef.current, pos: { x: m.x, y: m.y } })
    })

  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <View style={es.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={12}>
          <Text style={[es.volver, { color: c.primario }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[es.titulo, { color: c.texto }]}>Debug · geometría de la mesa</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={es.leyenda}>
        <View style={es.leyendaItem}>
          <View style={[es.chip, { backgroundColor: '#22C55E' }]} />
          <Text style={[es.leyendaTexto, { color: c.textoSuave }]}>Bandas jugables</Text>
        </View>
        <View style={es.leyendaItem}>
          <View style={[es.chip, { backgroundColor: 'rgba(220,38,38,0.7)' }]} />
          <Text style={[es.leyendaTexto, { color: c.textoSuave }]}>Captura tronera</Text>
        </View>
        <View style={es.leyendaItem}>
          <View style={[es.chip, { backgroundColor: '#B91C1C' }]} />
          <Text style={[es.leyendaTexto, { color: c.textoSuave }]}>Poste de ceja</Text>
        </View>
      </View>
      <Text style={[es.ayuda, { color: c.textoSuave }]}>
        Arrastrá la bola blanca. El punteado rojo es donde deja de haber pared (boca de la tronera).
      </Text>

      <View
        ref={zonaRef}
        style={es.zonaJuego}
        onLayout={ev => {
          const { width, height } = ev.nativeEvent.layout
          const ancho = Math.min(width - 24, height / RELACION_ASPECTO)
          setAnchoMesa(Math.max(120, Math.floor(ancho)))
        }}
      >
        {anchoMesa > 0 && (
          <GestureDetector gesture={pan}>
            <View>
              <MesaPoolLazy
                anchoPx={anchoMesa}
                bolas={[bola]}
                muestra={null}
                angulo={Math.PI / 2}
                fuerzaPreview={0}
                mostrarGuia={false}
                bolaEnMano={false}
                debug
              />
            </View>
          </GestureDetector>
        )}
      </View>
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1 },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 54, paddingBottom: 6,
    },
    volver: { fontSize: 26, fontWeight: '700', width: 24 },
    titulo: { fontSize: 16, fontWeight: '800' },
    leyenda: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingVertical: 6 },
    leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    chip: { width: 12, height: 12, borderRadius: 6 },
    leyendaTexto: { fontSize: 11, fontWeight: '600' },
    ayuda: { fontSize: 11, textAlign: 'center', paddingHorizontal: 24, paddingBottom: 6 },
    zonaJuego: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingBottom: 16 },
  })
}
