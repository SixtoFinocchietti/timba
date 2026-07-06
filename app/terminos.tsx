import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'

export default function Terminos() {
  const c = useColores()
  const es = makeEstilos(c)

  return (
    <View style={{ flex: 1, backgroundColor: c.fondo }}>
      <View style={es.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={{ color: c.primario, fontSize: 16, fontWeight: '600' }}>← Volver</Text>
        </TouchableOpacity>
        <Text style={es.titulo}>Términos y Condiciones</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={es.contenido}>
        <Text style={es.actualizado}>Última actualización: junio 2026</Text>

        <Text style={es.seccion}>1. Uso de la app</Text>
        <Text style={es.parrafo}>
          Timba es una plataforma para registrar apuestas informales entre amigos. No procesamos
          pagos dentro de la app. Los saldos son registros de acuerdos entre usuarios; la transferencia
          de dinero, si la hubiere, es responsabilidad exclusiva de las partes involucradas.
        </Text>

        <Text style={es.seccion}>2. Edad mínima</Text>
        <Text style={es.parrafo}>
          Debés tener al menos 18 años para usar Timba. Al registrarte, confirmás que cumplís este requisito.
        </Text>

        <Text style={es.seccion}>3. Responsabilidad</Text>
        <Text style={es.parrafo}>
          Timba no se responsabiliza por disputas entre usuarios, deudas no pagadas ni resultados declarados
          incorrectamente. La app es una herramienta de registro; la resolución de conflictos queda entre los usuarios.
        </Text>

        <Text style={es.seccion}>4. Conducta</Text>
        <Text style={es.parrafo}>
          Queda prohibido usar Timba para actividades ilegales, hostigar a otros usuarios o crear cuentas falsas.
          Nos reservamos el derecho de suspender cuentas que violen estas normas.
        </Text>

        <Text style={es.seccion}>5. Eliminación de cuenta</Text>
        <Text style={es.parrafo}>
          Podés eliminar tu cuenta en cualquier momento desde Configuración → Eliminar cuenta.
          La eliminación es permanente e irreversible.
        </Text>

        <Text style={es.seccion}>6. Cambios</Text>
        <Text style={es.parrafo}>
          Podemos actualizar estos términos. Si los cambios son significativos, te avisaremos dentro de la app.
          El uso continuado de Timba implica la aceptación de los términos vigentes.
        </Text>

        <Text style={es.seccion}>7. Contacto</Text>
        <Text style={es.parrafo}>
          Para cualquier consulta: sixtojosefinocchietti@gmail.com
        </Text>
      </ScrollView>
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    topBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
    },
    titulo: { color: c.texto, fontSize: 16, fontWeight: '700' },
    contenido: { paddingHorizontal: 24, paddingBottom: 48, gap: 12 },
    actualizado: { color: c.textoSuave, fontSize: 12, marginBottom: 8 },
    seccion: { color: c.texto, fontSize: 15, fontWeight: '700', marginTop: 8 },
    parrafo: { color: c.textoSuave, fontSize: 14, lineHeight: 22 },
  })
}
