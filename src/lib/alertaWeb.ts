// react-native-web NO implementa Alert: en el navegador Alert.alert() no hace
// nada, así que todos los diálogos de confirmación y errores desaparecían en
// silencio. Este polyfill lo reemplaza en web por los diálogos del navegador.
// Se importa una sola vez desde app/_layout.tsx.
import { Alert, AlertButton, Platform } from 'react-native'

if (Platform.OS === 'web') {
  Alert.alert = (titulo: string, mensaje?: string, botones?: AlertButton[]) => {
    const texto = mensaje ? `${titulo}\n\n${mensaje}` : titulo

    // Sin botones (o uno solo): alerta informativa
    if (!botones || botones.length <= 1) {
      window.alert(texto)
      botones?.[0]?.onPress?.()
      return
    }

    // Con botones: confirm() del navegador. "Aceptar" ejecuta la acción
    // principal (el último botón que no sea 'cancel'), "Cancelar" la de cancel.
    const principal = [...botones].reverse().find(b => b.style !== 'cancel')
    const cancelar = botones.find(b => b.style === 'cancel')
    if (window.confirm(texto)) principal?.onPress?.()
    else cancelar?.onPress?.()
  }
}
