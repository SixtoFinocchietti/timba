import { Drawer } from 'expo-router/drawer'
import { useColores } from '@/lib/ThemeContext'
import DrawerContent from '@/components/ui/DrawerContent'

export default function TabsLayout() {
  const c = useColores()
  return (
    <Drawer
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: c.fondoCard,
          width: '78%',
        },
        overlayColor: '#00000070',
        swipeEnabled: true,
        swipeEdgeWidth: 60,
      }}
    >
      <Drawer.Screen name="home" />
      <Drawer.Screen name="amigos" />
      <Drawer.Screen name="perfil" />
    </Drawer>
  )
}
