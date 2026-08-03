import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native'
import Slider from '@react-native-community/slider'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'

// Ajustes app-wide (roadmap Pool §5.2, Fase 10.1): hoy solo Pool consume
// estas claves (es el único juego con sonido/háptica), pero viven acá porque
// conceptualmente aplican a cualquier juego futuro. Sin control de tema
// claro/oscuro a propósito — ver ThemeContext.tsx y (tabs)/perfil.tsx.
const CLAVE_SONIDO = '@timba:pool_sonido'
const CLAVE_MUSICA = '@timba:pool_musica'
const CLAVE_HAPTICA = '@timba:pool_haptica'
const CLAVE_VOL_SONIDO = '@timba:pool_volumen_sonido'
const CLAVE_VOL_MUSICA = '@timba:pool_volumen_musica'

export default function Ajustes() {
  const c = useColores()
  const es = makeEstilos(c)
  const [sonido, setSonido] = useState(true)
  const [musica, setMusica] = useState(false)
  const [haptica, setHaptica] = useState(true)
  const [volSonido, setVolSonido] = useState(1)
  const [volMusica, setVolMusica] = useState(1)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(CLAVE_SONIDO),
      AsyncStorage.getItem(CLAVE_MUSICA),
      AsyncStorage.getItem(CLAVE_HAPTICA),
      AsyncStorage.getItem(CLAVE_VOL_SONIDO),
      AsyncStorage.getItem(CLAVE_VOL_MUSICA),
    ]).then(([s, m, h, vs, vm]) => {
      if (s === '0') setSonido(false)
      if (m === '1') setMusica(true)
      if (h === '0') setHaptica(false)
      if (vs) setVolSonido(parseFloat(vs))
      if (vm) setVolMusica(parseFloat(vm))
      setListo(true)
    })
  }, [])

  function toggle(clave: string, valor: boolean, set: (v: boolean) => void) {
    set(valor)
    AsyncStorage.setItem(clave, valor ? '1' : '0')
  }

  function guardarVolumen(clave: string, valor: number) {
    AsyncStorage.setItem(clave, String(valor))
  }

  if (!listo) return <View style={es.contenedor} />

  return (
    <View style={es.contenedor}>
      <View style={es.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={es.btnVolver}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={es.btnVolverTexto}>←</Text>
        </TouchableOpacity>
        <Text style={es.titulo}>Ajustes</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={es.scroll} showsVerticalScrollIndicator={false}>
        <Text style={es.seccionTitulo}>Sonido y música</Text>
        <View style={[es.card, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
          <Fila
            titulo="Efectos de sonido"
            subtitulo="Golpes, troneras, victoria"
            valor={sonido}
            onValueChange={v => toggle(CLAVE_SONIDO, v, setSonido)}
            c={c}
          />
          <FilaVolumen
            valor={volSonido}
            deshabilitado={!sonido}
            onValueChange={setVolSonido}
            onSlidingComplete={v => guardarVolumen(CLAVE_VOL_SONIDO, v)}
            c={c}
          />
          <View style={[es.separador, { backgroundColor: c.borde }]} />
          <Fila
            titulo="Música ambiental"
            subtitulo="Se baja sola mientras corre un tiro"
            valor={musica}
            onValueChange={v => toggle(CLAVE_MUSICA, v, setMusica)}
            c={c}
          />
          <FilaVolumen
            valor={volMusica}
            deshabilitado={!musica}
            onValueChange={setVolMusica}
            onSlidingComplete={v => guardarVolumen(CLAVE_VOL_MUSICA, v)}
            c={c}
          />
          <View style={[es.separador, { backgroundColor: c.borde }]} />
          <Fila
            titulo="Vibración"
            subtitulo="Al pegarle, embocar o ganar"
            valor={haptica}
            onValueChange={v => toggle(CLAVE_HAPTICA, v, setHaptica)}
            c={c}
          />
        </View>
        <Text style={es.nota}>
          Por ahora estos ajustes solo aplican en Pool — a medida que otros juegos sumen sonido
          van a usar la misma configuración de acá.
        </Text>
      </ScrollView>
    </View>
  )
}

function Fila({ titulo, subtitulo, valor, onValueChange, c }: {
  titulo: string; subtitulo: string; valor: boolean
  onValueChange: (v: boolean) => void; c: ColoresTema
}) {
  return (
    <View style={filaEstilos.fila}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={[filaEstilos.titulo, { color: c.texto }]}>{titulo}</Text>
        <Text style={[filaEstilos.subtitulo, { color: c.textoSuave }]}>{subtitulo}</Text>
      </View>
      <Switch
        value={valor}
        onValueChange={onValueChange}
        trackColor={{ false: c.borde, true: c.primarioSuave }}
        thumbColor={valor ? c.primario : c.fondoInput}
      />
    </View>
  )
}

function FilaVolumen({ valor, deshabilitado, onValueChange, onSlidingComplete, c }: {
  valor: number; deshabilitado: boolean
  onValueChange: (v: number) => void; onSlidingComplete: (v: number) => void; c: ColoresTema
}) {
  return (
    <View style={[filaEstilos.filaVolumen, deshabilitado && { opacity: 0.4 }]}>
      <Text style={[filaEstilos.iconoVolumen, { color: c.textoSuave }]}>🔈</Text>
      <Slider
        style={{ flex: 1, height: 32 }}
        value={valor}
        minimumValue={0}
        maximumValue={1}
        disabled={deshabilitado}
        onValueChange={onValueChange}
        onSlidingComplete={onSlidingComplete}
        minimumTrackTintColor={c.primario}
        maximumTrackTintColor={c.borde}
        thumbTintColor={c.primario}
      />
      <Text style={[filaEstilos.iconoVolumen, { color: c.textoSuave }]}>🔊</Text>
    </View>
  )
}

const filaEstilos = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  titulo: { fontSize: 15, fontWeight: '700' },
  subtitulo: { fontSize: 12, marginTop: 2 },
  filaVolumen: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingBottom: 12, marginTop: -6,
  },
  iconoVolumen: { fontSize: 13 },
})

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: c.fondo },
    topBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20,
    },
    btnVolver: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    btnVolverTexto: { color: c.primario, fontSize: 24, fontWeight: '600' },
    titulo: { color: c.texto, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
    scroll: { paddingHorizontal: 20, paddingBottom: 40 },
    seccionTitulo: {
      color: c.textoSuave, fontSize: 12, fontWeight: '800', textTransform: 'uppercase',
      letterSpacing: 0.8, marginBottom: 8, marginTop: 4,
    },
    card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    separador: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
    nota: { color: c.textoSuave, fontSize: 12, marginTop: 14, lineHeight: 17, paddingHorizontal: 4 },
  })
}
