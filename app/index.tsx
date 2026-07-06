import { Redirect } from 'expo-router'
import { View, ActivityIndicator } from 'react-native'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'

export default function Index() {
  const { session, cargando } = useAuthStore()
  const c = useColores()

  if (cargando) {
    return (
      <View style={{ flex: 1, backgroundColor: c.fondo, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primario} size="large" />
      </View>
    )
  }

  if (session) return <Redirect href="/(tabs)/home" />
  return <Redirect href="/(auth)/login" />
}
