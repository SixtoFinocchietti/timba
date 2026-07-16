import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { AppIcon } from '@/components/ui/AppIcon'

// Menú del Pool (spec §2.1). Fase 2: práctica libre jugable; tutorial, bot y
// amigos llegan en las fases 3-5 — se muestran como próximamente para que el
// menú ya comunique el alcance del juego.

const MODOS: {
  id: string
  nombre: string
  descripcion: string
  disponible: boolean
}[] = [
  { id: 'practica', nombre: 'Práctica libre', descripcion: 'Mesa sola, sin reglas: tirá y probá efectos', disponible: true },
  { id: 'tutorial', nombre: 'Tutorial', descripcion: 'Aprendé controles, reglas y efectos', disponible: false },
  { id: 'bot', nombre: 'Jugar vs Bot', descripcion: 'Fácil, Normal o Difícil', disponible: false },
  { id: 'amigo', nombre: 'Con un amigo', descripcion: 'Partida online con invitación', disponible: false },
]

export default function PoolMenu() {
  const c = useColores()
  const es = makeEstilos(c)

  function abrir(id: string) {
    if (id === 'practica') router.push('/juegos/partida-pool' as any)
  }

  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <View style={es.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={[es.volver, { color: c.primario }]}>‹ Volver</Text>
        </TouchableOpacity>
      </View>

      <View style={es.tituloFila}>
        <AppIcon name="pool" size={34} />
        <Text style={[es.titulo, { color: c.texto }]}>Pool · 8-Ball</Text>
      </View>

      <View style={es.lista}>
        {MODOS.map(m => (
          <TouchableOpacity
            key={m.id}
            style={[
              es.card,
              { backgroundColor: c.fondoCard, borderColor: m.disponible ? c.primario : c.borde },
              !m.disponible && es.cardApagada,
            ]}
            onPress={() => abrir(m.id)}
            activeOpacity={m.disponible ? 0.8 : 1}
            disabled={!m.disponible}
          >
            <View style={es.cardTexto}>
              <Text style={[es.cardNombre, { color: c.texto }]}>{m.nombre}</Text>
              <Text style={[es.cardDesc, { color: c.textoSuave }]}>{m.descripcion}</Text>
            </View>
            {m.disponible ? (
              <Text style={[es.chevron, { color: c.primario }]}>›</Text>
            ) : (
              <View style={[es.badge, { borderColor: c.borde }]}>
                <Text style={[es.badgeTexto, { color: c.textoSuave }]}>Pronto</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1 },
    header: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 },
    volver: { fontSize: 18, fontWeight: '700' },
    tituloFila: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24,
    },
    titulo: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
    lista: { paddingHorizontal: 24, gap: 12 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 16,
      padding: 20, borderRadius: 16, borderWidth: 1,
    },
    cardApagada: { opacity: 0.55 },
    cardTexto: { flex: 1, gap: 2 },
    cardNombre: { fontSize: 17, fontWeight: '700' },
    cardDesc: { fontSize: 13 },
    chevron: { fontSize: 24, fontWeight: '700' },
    badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    badgeTexto: { fontSize: 11, fontWeight: '700' },
  })
}
