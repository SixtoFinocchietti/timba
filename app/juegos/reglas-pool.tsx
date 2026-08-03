import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { AppIcon } from '@/components/ui/AppIcon'
import { LECCIONES, LeccionQuiz } from '@/lib/pool/tutorial'

// Reglas y ayuda (roadmap Pool §6.2, Fase 10.3): referencia rápida para
// consultar a mitad de una partida real ("¿esto fue falta o no?"), separada
// del tutorial de una sola pasada. Reutiliza el contenido del quiz de
// tutorial.ts (ya tiene pregunta + explicación en prosa) en vez de escribir
// las reglas de nuevo — es la misma info en un formato de referencia en
// lugar de pregunta interactiva.
const QUIZ_REGLAS = LECCIONES.find((l): l is LeccionQuiz => l.id === 'las_reglas')!

const CONSEJOS = [
  'No le pegues siempre al máximo — más fuerza es más error de puntería, no más control.',
  'Mirá primero el ángulo de corte y recién después la fuerza: un tiro fácil mal pensado se complica solo.',
  'Pensá dónde va a quedar la blanca DESPUÉS de embocar, no solo en meter la bola de ahora.',
  'Con la mesa abierta, priorizá el grupo que te deje más tiros fáciles seguidos, no el primero que veas.',
  'Si no tenés un tiro claro, jugar una seguridad (dejar la blanca difícil para el rival) es mejor que forzar uno imposible.',
]

export default function ReglasPool() {
  const c = useColores()
  const es = makeEstilos(c)

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
        <Text style={es.titulo}>Reglas y ayuda</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={es.scroll} showsVerticalScrollIndicator={false}>
        <Text style={es.seccionTitulo}>Faltas y situaciones comunes</Text>
        <View style={{ gap: 10 }}>
          {QUIZ_REGLAS.preguntas.map((p, i) => (
            <View key={i} style={[es.card, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
              <Text style={[es.pregunta, { color: c.textoSuave }]}>{p.pregunta}</Text>
              <Text style={[es.explicacion, { color: c.texto }]}>{p.explicacion}</Text>
            </View>
          ))}
        </View>

        <Text style={[es.seccionTitulo, { marginTop: 24 }]}>Consejos para principiantes</Text>
        <View style={[es.card, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
          {CONSEJOS.map((tip, i) => (
            <View key={i} style={[es.tipFila, i > 0 && { marginTop: 10 }]}>
              <Text style={[es.tipViñeta, { color: c.primario }]}>•</Text>
              <Text style={[es.tipTexto, { color: c.texto }]}>{tip}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[es.tutorialBtn, { backgroundColor: c.fondoCard, borderColor: c.primario }]}
          onPress={() => router.push('/juegos/tutorial-pool' as any)}
          activeOpacity={0.8}
        >
          <AppIcon name="pool" size={20} color={c.primario} />
          <Text style={[es.tutorialBtnTexto, { color: c.primario }]}>
            ¿Preferís aprender jugando? Mirá el tutorial interactivo
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: c.fondo },
    topBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20,
    },
    btnVolver: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    btnVolverTexto: { color: c.primario, fontSize: 24, fontWeight: '600' },
    titulo: { color: c.texto, fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
    scroll: { paddingHorizontal: 20, paddingBottom: 40 },
    seccionTitulo: {
      color: c.textoSuave, fontSize: 12, fontWeight: '800', textTransform: 'uppercase',
      letterSpacing: 0.8, marginBottom: 8,
    },
    card: { borderRadius: 16, borderWidth: 1, padding: 16 },
    pregunta: { fontSize: 12, fontStyle: 'italic', marginBottom: 6 },
    explicacion: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
    tipFila: { flexDirection: 'row', gap: 8 },
    tipViñeta: { fontSize: 15, fontWeight: '900', lineHeight: 20 },
    tipTexto: { flex: 1, fontSize: 14, lineHeight: 20 },
    tutorialBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderRadius: 14, borderWidth: 1.5, padding: 16, marginTop: 20,
    },
    tutorialBtnTexto: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  })
}
