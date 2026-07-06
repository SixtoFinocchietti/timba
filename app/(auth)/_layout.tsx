import { Stack } from 'expo-router'
import { useColores } from '@/lib/ThemeContext'

export default function AuthLayout() {
  const c = useColores()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.fondo },
        animation: 'slide_from_right',
      }}
    />
  )
}
