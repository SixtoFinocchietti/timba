import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native'
import { useNavigation, router } from 'expo-router'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { AppIcon } from '@/components/ui/AppIcon'

interface AppHeaderProps {
  mostrarSaludo?: boolean
}

export function AppHeader({ mostrarSaludo = true }: AppHeaderProps) {
  const navigation = useNavigation()
  const { usuario } = useAuthStore()
  const c = useColores()
  const es = makeEstilos(c)

  function abrirDrawer() {
    ;(navigation as any).openDrawer()
  }

  return (
    <View style={[es.header, { backgroundColor: c.fondo }]}>
      {/* Hamburguesa */}
      <TouchableOpacity onPress={abrirDrawer} style={es.hamburger} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <View style={[es.linea, { backgroundColor: c.texto }]} />
        <View style={[es.linea, { backgroundColor: c.texto }]} />
        <View style={[es.linea, { backgroundColor: c.texto }]} />
      </TouchableOpacity>

      {/* Saludo + avatar */}
      {mostrarSaludo && (
        <View style={es.derecha}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppIcon name="saludo" size={14} color={c.texto} />
            <Text style={[es.saludo, { color: c.texto }]}>
              Hola, {usuario?.nombre?.split(' ')[0]}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/perfil')} activeOpacity={0.8}>
            {usuario?.avatar_url
              ? <Image source={{ uri: usuario.avatar_url }} style={es.avatar} />
              : <View style={[es.avatarCircle, { backgroundColor: c.primario }]}>
                  <Text style={[es.avatarLetra, { color: c.fondo }]}>
                    {(usuario?.nombre?.[0] ?? '?').toUpperCase()}
                  </Text>
                </View>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingTop: 56,
      paddingBottom: 8,
    },
    hamburger: {
      gap: 5,
      paddingVertical: 4,
    },
    linea: {
      width: 26,
      height: 2.5,
      borderRadius: 2,
    },
    derecha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    saludo: {
      fontSize: 14,
      fontWeight: '600',
    },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
    },
    avatarCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarLetra: {
      fontSize: 16,
      fontWeight: '800',
    },
  })
}
