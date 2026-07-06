import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'

interface BotonProps {
  titulo: string
  onPress: () => void
  variante?: 'primario' | 'secundario' | 'fantasma'
  cargando?: boolean
  deshabilitado?: boolean
  style?: ViewStyle
}

export function Boton({ titulo, onPress, variante = 'primario', cargando, deshabilitado, style }: BotonProps) {
  const c = useColores()
  const es = makeEstilos(c)

  return (
    <TouchableOpacity
      style={[es.base, es[variante], (deshabilitado || cargando) && es.deshabilitado, style]}
      onPress={onPress}
      disabled={deshabilitado || cargando}
      activeOpacity={0.8}
    >
      {cargando
        ? <ActivityIndicator color={variante === 'primario' ? c.fondo : c.primario} />
        : <Text style={[es.texto, variante !== 'primario' && es.textoAlternativo]}>{titulo}</Text>
      }
    </TouchableOpacity>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    base: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    primario: { backgroundColor: c.primario },
    secundario: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: c.primario },
    fantasma: { backgroundColor: 'transparent' },
    deshabilitado: { opacity: 0.4 },
    texto: { color: c.fondo, fontSize: 16, fontWeight: '700' },
    textoAlternativo: { color: c.primario },
  })
}
