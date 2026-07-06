import { TouchableOpacity, View, Text, StyleSheet } from 'react-native'
import { Timba } from '@/types'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'

interface CardTimbaProps {
  timba: Timba
  onPress: () => void
}

export function CardTimba({ timba, onPress }: CardTimbaProps) {
  const c = useColores()
  const es = makeEstilos(c)

  const ETIQUETAS = {
    activa: { texto: 'Activa', color: c.exito },
    en_disputa: { texto: 'En disputa', color: c.advertencia },
    cerrada: { texto: 'Cerrada', color: c.textoSuave },
  }
  const etiqueta = ETIQUETAS[timba.estado]

  return (
    <TouchableOpacity style={es.card} onPress={onPress} activeOpacity={0.8}>
      <View style={es.fila}>
        <Text style={es.titulo} numberOfLines={1}>{timba.titulo}</Text>
        <View style={[es.badge, { backgroundColor: etiqueta.color + '22' }]}>
          <Text style={[es.badgeTexto, { color: etiqueta.color }]}>{etiqueta.texto}</Text>
        </View>
      </View>
      {timba.descripcion && (
        <Text style={es.descripcion} numberOfLines={2}>{timba.descripcion}</Text>
      )}
      <View style={es.opciones}>
        {timba.opciones.map((op, i) => (
          <View key={i} style={es.opcion}>
            <Text style={es.opcionTexto}>{op}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    card: { backgroundColor: c.fondoCard, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: c.borde },
    fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    titulo: { color: c.texto, fontSize: 16, fontWeight: '700', flex: 1 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    badgeTexto: { fontSize: 12, fontWeight: '600' },
    descripcion: { color: c.textoSuave, fontSize: 13, lineHeight: 18 },
    opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    opcion: { backgroundColor: c.fondoInput, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    opcionTexto: { color: c.texto, fontSize: 12, fontWeight: '500' },
  })
}
