import '@/lib/alertaWeb'
import { useEffect, useState } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import { useTemaStore } from '@/store/temaStore'
import { ThemeProvider, useColores } from '@/lib/ThemeContext'
import { registrarPushToken } from '@/lib/notificaciones'

function AppStack() {
  const { cargando } = useAuth()
  const { session } = useAuthStore()
  const { tema } = useTemaStore()
  const colores = useColores()
  const [onboardingVisto, setOnboardingVisto] = useState<boolean | null>(null)

  useEffect(() => {
    AsyncStorage.getItem('@timba:onboarding_visto').then(val => {
      setOnboardingVisto(!!val)
    })
  }, [])

  useEffect(() => {
    if (session) registrarPushToken()
  }, [session])

  useEffect(() => {
    if (cargando || onboardingVisto === null) return
    if (!session) {
      router.replace(onboardingVisto ? '/(auth)/login' : '/onboarding')
    }
  }, [session, cargando, onboardingVisto])

  return (
    <>
      <StatusBar style={tema === 'oscuro' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colores.fondo },
          animation: 'fade',
        }}
      />
    </>
  )
}

export default function RootLayout() {
  const { cargarTema } = useTemaStore()

  useEffect(() => {
    cargarTema()
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppStack />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
