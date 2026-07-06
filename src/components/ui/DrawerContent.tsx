import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native'
import { DrawerContentScrollView } from 'expo-router/drawer'
import { router, usePathname } from 'expo-router'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { AppIcon, IconName } from '@/components/ui/AppIcon'

const ITEMS: { name: string; label: string; icono: IconName; ruta: string }[] = [
  { name: 'home', label: 'Timbas', icono: 'timba', ruta: '/(tabs)/home' },
  { name: 'juegos', label: 'Juegos', icono: 'juegos', ruta: '/juegos' },
  { name: 'amigos', label: 'Amigos', icono: 'amigos', ruta: '/(tabs)/amigos' },
  { name: 'perfil', label: 'Perfil', icono: 'perfil', ruta: '/(tabs)/perfil' },
]

export default function DrawerContent(props: any) {
  const { usuario } = useAuthStore()
  const c = useColores()
  const pathname = usePathname()
  const es = makeEstilos(c)

  function navegar(ruta: string) {
    router.push(ruta as any)
    props.navigation.closeDrawer()
  }

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={[es.contenedor, { backgroundColor: c.fondoCard }]}
      scrollEnabled={false}
    >
      {/* Items principales */}
      <View style={es.items}>
        {ITEMS.map(item => {
          const activo = pathname.endsWith(item.name) || pathname.includes(`(tabs)/${item.name}`)
          return (
            <TouchableOpacity
              key={item.name}
              style={es.item}
              onPress={() => navegar(item.ruta)}
              activeOpacity={0.65}
            >
              <AppIcon name={item.icono} size={26} color={activo ? c.primario : c.texto} />
              <Text style={[es.itemLabel, { color: activo ? c.primario : c.texto }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Soporte al pie */}
      <TouchableOpacity
        style={es.soporte}
        onPress={() => { props.navigation.closeDrawer() }}
        activeOpacity={0.65}
      >
        <Text style={[es.soporteLabel, { color: c.textoSuave }]}>Soporte</Text>
      </TouchableOpacity>
    </DrawerContentScrollView>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: {
      flex: 1,
      paddingTop: 56,
    },
    items: {
      flex: 1,
      gap: 4,
      paddingHorizontal: 8,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderRadius: 14,
    },
    itemLabel: {
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    soporte: {
      padding: 32,
      paddingBottom: 48,
    },
    soporteLabel: {
      fontSize: 18,
      fontWeight: '700',
    },
  })
}
