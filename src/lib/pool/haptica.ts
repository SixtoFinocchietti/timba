// Háptica del Pool (spec §14). Solo nativo (en web expo-haptics no aplica);
// todo envuelto en try/catch para no romper si el dispositivo no la soporta.
// El llamador decide si está habilitada (mismo toggle que el sonido).

import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'

const nativo = Platform.OS === 'ios' || Platform.OS === 'android'

export const haptica = {
  golpe() {
    if (!nativo) return
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
  },
  tronera() {
    if (!nativo) return
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}
  },
  victoria() {
    if (!nativo) return
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
  },
  falta() {
    if (!nativo) return
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error) } catch {}
  },
}
