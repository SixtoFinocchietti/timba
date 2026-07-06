import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'

export default function Privacidad() {
  const c = useColores()
  const es = makeEstilos(c)

  return (
    <View style={{ flex: 1, backgroundColor: c.fondo }}>
      <View style={es.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={{ color: c.primario, fontSize: 16, fontWeight: '600' }}>← Volver</Text>
        </TouchableOpacity>
        <Text style={es.titulo}>Política de Privacidad</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={es.contenido}>
        <Text style={es.actualizado}>Última actualización: junio 2026</Text>

        <Text style={es.seccion}>1. Datos que recopilamos</Text>
        <Text style={es.parrafo}>
          Recopilamos tu nombre, dirección de email, foto de perfil (opcional), número de teléfono (opcional)
          y redes sociales (opcional). También guardamos las timbas que creás o en las que participás,
          y los mensajes del chat con otros usuarios.
        </Text>

        <Text style={es.seccion}>2. Para qué usamos tus datos</Text>
        <Text style={es.parrafo}>
          Usamos tus datos únicamente para hacer funcionar la app: identificarte, mostrarte tus timbas,
          calcular tus saldos y permitirte comunicarte con tus amigos dentro de Timba.
          No vendemos ni compartimos tus datos con terceros.
        </Text>

        <Text style={es.seccion}>3. Almacenamiento y seguridad</Text>
        <Text style={es.parrafo}>
          Tus datos se guardan en servidores de Supabase (supabase.com), protegidos con cifrado en tránsito (HTTPS/TLS)
          y reglas de acceso por filas (Row Level Security) que aseguran que solo vos y los participantes
          de cada timba puedan ver sus datos.
        </Text>

        <Text style={es.seccion}>4. Terceros</Text>
        <Text style={es.parrafo}>
          La app utiliza la API de Giphy para buscar GIFs en el chat. Giphy puede registrar las búsquedas
          según su propia política de privacidad (giphy.com/privacy).
        </Text>

        <Text style={es.seccion}>5. Tus derechos</Text>
        <Text style={es.parrafo}>
          Podés eliminar tu cuenta en cualquier momento desde Configuración → Eliminar cuenta.
          Esto borra permanentemente todos tus datos, timbas, mensajes y saldos asociados.{'\n\n'}
          Para consultas sobre tus datos, escribinos a: sixtojosefinocchietti@gmail.com
        </Text>

        <Text style={es.seccion}>6. Menores de edad</Text>
        <Text style={es.parrafo}>
          Timba está destinada a mayores de 18 años. No recopilamos intencionalmente datos de menores.
        </Text>

        <Text style={es.seccion}>7. Cambios a esta política</Text>
        <Text style={es.parrafo}>
          Si actualizamos esta política, te avisaremos dentro de la app antes de que los cambios entren en vigor.
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
