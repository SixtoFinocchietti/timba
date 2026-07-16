// Selector de efecto (spec §4): modal con la bola blanca en grande; se arrastra
// el punto de contacto (limitado al 70% del radio — sin miscue en v1).
// El efecto persiste un tiro y el padre lo resetea a centro después.

import { useEffect, useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useColores } from '@/lib/ThemeContext'

export interface Spin {
  a: number // lateral (english): − izquierda / + derecha
  b: number // vertical: − draw / + follow
}

interface SelectorSpinProps {
  visible: boolean
  spin: Spin
  onCerrar: () => void
  onElegir: (spin: Spin) => void
}

const DIAMETRO = 210
const RADIO_MAX = (DIAMETRO / 2) * 0.7

export default function SelectorSpin({ visible, spin, onCerrar, onElegir }: SelectorSpinProps) {
  const c = useColores()
  // posición del punto en px relativos al centro de la bola (pantalla: y abajo = draw)
  const [punto, setPunto] = useState({ x: spin.a * RADIO_MAX, y: -spin.b * RADIO_MAX })
  const base = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (visible) setPunto({ x: spin.a * RADIO_MAX, y: -spin.b * RADIO_MAX })
  }, [visible, spin.a, spin.b])

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => { base.current = punto })
    .onUpdate(e => {
      let x = base.current.x + e.translationX
      let y = base.current.y + e.translationY
      const d = Math.hypot(x, y)
      if (d > RADIO_MAX) {
        x = (x / d) * RADIO_MAX
        y = (y / d) * RADIO_MAX
      }
      setPunto({ x, y })
    })

  function confirmar() {
    onElegir({ a: punto.x / RADIO_MAX, b: -punto.y / RADIO_MAX })
    onCerrar()
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={es.overlay} onPress={onCerrar} />
      <View style={[es.panel, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
        <Text style={[es.titulo, { color: c.texto }]}>Efecto</Text>
        <Text style={[es.sub, { color: c.textoSuave }]}>Arriba sigue · abajo retrocede · costados cambian el rebote</Text>

        <GestureDetector gesture={pan}>
          <View style={es.bolaWrap}>
            <View style={[es.bola, { borderColor: c.borde }]}>
              {/* cruz de referencia */}
              <View style={[es.cruzV, { backgroundColor: 'rgba(0,0,0,0.12)' }]} />
              <View style={[es.cruzH, { backgroundColor: 'rgba(0,0,0,0.12)' }]} />
              <View
                style={[
                  es.punto,
                  { backgroundColor: '#C93430', transform: [{ translateX: punto.x }, { translateY: punto.y }] },
                ]}
              />
            </View>
          </View>
        </GestureDetector>

        <View style={es.fila}>
          <TouchableOpacity
            style={[es.boton, { borderColor: c.borde }]}
            onPress={() => setPunto({ x: 0, y: 0 })}
            activeOpacity={0.8}
          >
            <Text style={[es.botonTexto, { color: c.textoSuave }]}>Centro</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[es.botonPrimario, { backgroundColor: c.primario }]}
            onPress={confirmar}
            activeOpacity={0.8}
          >
            <Text style={[es.botonTexto, { color: c.fondo }]}>Listo</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const es = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  panel: {
    position: 'absolute', left: 24, right: 24, top: '18%',
    borderRadius: 24, borderWidth: 1, padding: 24, alignItems: 'center',
  },
  titulo: { fontSize: 20, fontWeight: '800' },
  sub: { fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 18 },
  bolaWrap: { padding: 8 },
  bola: {
    width: DIAMETRO, height: DIAMETRO, borderRadius: DIAMETRO / 2,
    backgroundColor: '#F2EFE8', borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  cruzV: { position: 'absolute', width: 1.5, height: DIAMETRO },
  cruzH: { position: 'absolute', height: 1.5, width: DIAMETRO },
  punto: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)',
  },
  fila: { flexDirection: 'row', gap: 12, marginTop: 20 },
  boton: {
    paddingVertical: 12, paddingHorizontal: 28, borderRadius: 14, borderWidth: 1,
  },
  botonPrimario: { paddingVertical: 12, paddingHorizontal: 28, borderRadius: 14 },
  botonTexto: { fontSize: 15, fontWeight: '800' },
})
