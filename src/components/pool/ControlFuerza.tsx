// Slider vertical de fuerza (spec §4): arrastrar hacia abajo carga el tiro,
// SOLTAR dispara. Cancelación: volver arriba del 6% antes de soltar.
// Regla de oro mobile: nunca puede salir un tiro accidental — el gesto es un
// drag deliberado, no un tap.

import { View, Text, StyleSheet } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useColores } from '@/lib/ThemeContext'

interface ControlFuerzaProps {
  habilitado: boolean
  fuerza: number // 0..1 (lo guarda el padre: mueve también el taco en la mesa)
  onCambio: (f: number) => void
  onSoltar: () => void
  alto?: number
}

const UMBRAL_CANCELACION = 0.06

export default function ControlFuerza({ habilitado, fuerza, onCambio, onSoltar, alto = 300 }: ControlFuerzaProps) {
  const c = useColores()
  const altoUtil = alto - 44

  const pan = Gesture.Pan()
    .enabled(habilitado)
    .runOnJS(true)
    .onUpdate(e => {
      const f = Math.max(0, Math.min(1, e.translationY / altoUtil))
      onCambio(f)
    })
    .onEnd(() => onSoltar())
    .onFinalize((_e, exito) => { if (!exito) onCambio(0) })

  const pct = Math.round(fuerza * 100)
  const cargando = fuerza >= UMBRAL_CANCELACION

  return (
    <GestureDetector gesture={pan}>
      <View style={[es.contenedor, { height: alto, borderColor: c.borde, backgroundColor: c.fondoCard, opacity: habilitado ? 1 : 0.4 }]}>
        <Text style={[es.pct, { color: cargando ? c.primario : c.textoSuave }]}>
          {cargando ? `${pct}%` : '▼'}
        </Text>
        <View style={[es.track, { borderColor: c.borde }]}>
          <View
            style={[
              es.relleno,
              { height: `${pct}%` as const, backgroundColor: cargando ? c.primario : c.textoSuave },
            ]}
          />
        </View>
        <Text style={[es.hint, { color: c.textoSuave }]}>{cargando ? 'soltá' : 'tirar'}</Text>
      </View>
    </GestureDetector>
  )
}

const es = StyleSheet.create({
  contenedor: {
    width: 52, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', paddingVertical: 8, gap: 6,
  },
  pct: { fontSize: 11, fontWeight: '800', height: 14 },
  track: {
    flex: 1, width: 18, borderRadius: 9, borderWidth: 1, overflow: 'hidden',
    justifyContent: 'flex-start',
  },
  relleno: { width: '100%', borderRadius: 8 },
  hint: { fontSize: 10, fontWeight: '600' },
})
