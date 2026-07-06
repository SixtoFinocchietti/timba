import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

export async function registrarPushToken(): Promise<void> {
  // expo-notifications eliminó el soporte de push remotas de Expo Go en SDK 53.
  // appOwnership === 'expo' significa que estamos corriendo en Expo Go.
  if (Constants.appOwnership === 'expo') return

  try {
    const Notifications = await import('expo-notifications')

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Timba',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      })
    }

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    })

    const { status: existente } = await Notifications.getPermissionsAsync()
    let status = existente

    if (existente !== 'granted') {
      const { status: nuevo } = await Notifications.requestPermissionsAsync()
      status = nuevo
    }

    if (status !== 'granted') return

    const token = await Notifications.getExpoPushTokenAsync()
    await supabase
      .from('usuarios')
      .update({ push_token: token.data })
      .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
  } catch {
    // No crítico. En Expo Go no corre; en dev builds y producción funciona.
  }
}
