import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Alert } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { Timba } from '@/types'
import { Boton } from '@/components/ui/Boton'
import { AppIcon } from '@/components/ui/AppIcon'
import { mensajeError } from '@/lib/errores'

export default function JoinTimba() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const { usuario, session } = useAuthStore()
  const [timba, setTimba] = useState<Timba | null>(null)
  const [cargando, setCargando] = useState(true)
  const [uniendose, setUniendose] = useState(false)
  const [rateLimited, setRateLimited] = useState(false)
  const c = useColores()
  const es = makeEstilos(c)

  useEffect(() => { buscarTimba() }, [code, session, usuario?.id])

  async function buscarTimba() {
    // Si no hay sesión, mostrar pantalla de login antes de buscar
    if (!session) {
      setCargando(false)
      return
    }

    // Esperar a que cargue el perfil (evita insertar con usuario_id undefined)
    if (!usuario) return

    // Registrar intento — el trigger de la DB bloquea si supera 10/hora
    const { error: limiteError } = await supabase
      .from('join_intentos')
      .insert({ usuario_id: usuario.id })

    if (limiteError?.message?.includes('RATE_LIMIT_EXCEEDED')) {
      setCargando(false)
      setRateLimited(true)
      return
    }

    // La búsqueda por código pasa por un RPC seguro (migración 010):
    // ya no se pueden listar timbas ajenas por API.
    const { data } = await supabase.rpc('buscar_timba_por_codigo', { p_codigo: code })
    const encontrada: Timba | null = data?.[0] ?? null

    // Si ya soy participante, ir directo al detalle sin pasar por "Unirme"
    if (encontrada) {
      const { data: yaParticipo } = await supabase
        .from('participantes')
        .select('id')
        .eq('timba_id', encontrada.id)
        .eq('usuario_id', usuario.id)
        .maybeSingle()
      if (yaParticipo) {
        router.replace(`/timba/${encontrada.id}`)
        return
      }
    }

    setTimba(encontrada)
    setCargando(false)
  }

  async function unirse() {
    if (!session) { router.push('/(auth)/login'); return }
    if (!timba) return
    setUniendose(true)

    const { error } = await supabase
      .from('participantes')
      .insert({ timba_id: timba.id, usuario_id: usuario?.id, opcion_elegida: null })

    // Código 23505 = unique_violation: ya era participante, ir directo a la timba
    if (!error || error.code === '23505') {
      router.replace(`/timba/${timba.id}`)
      return
    }

    Alert.alert('No se pudo unir', mensajeError(error))
    setUniendose(false)
  }

  if (cargando) return <View style={{ flex: 1, backgroundColor: c.fondo }} />

  if (!session) {
    return (
      <View style={es.contenedor}>
        <Text style={es.invitacion}>Te invitaron a una timba</Text>
        <Text style={[es.errorTitulo, { fontSize: 17, fontWeight: '500' }]}>
          Necesitás iniciar sesión para ver la invitación.
        </Text>
        <Boton titulo="Iniciar sesión" onPress={() => router.push('/(auth)/login')} />
        <Boton titulo="Cancelar" onPress={() => router.back()} variante="fantasma" />
      </View>
    )
  }

  if (rateLimited) {
    return (
      <View style={es.contenedor}>
        <View style={{ alignItems: 'center' }}>
          <AppIcon name="xCirculo" size={52} color={c.error} />
        </View>
        <Text style={es.errorTitulo}>Demasiados intentos</Text>
        <Text style={{ color: c.textoSuave, fontSize: 15, textAlign: 'center' }}>
          Esperá una hora antes de volver a intentar unirte por código.
        </Text>
        <Boton titulo="Ir al inicio" onPress={() => router.replace('/(tabs)/home')} variante="secundario" />
      </View>
    )
  }

  if (!timba) {
    return (
      <View style={es.contenedor}>
        <View style={{ alignItems: 'center' }}>
          <AppIcon name="xCirculo" size={52} color={c.error} />
        </View>
        <Text style={es.errorTitulo}>Timba no encontrada</Text>
        <Boton titulo="Ir al inicio" onPress={() => router.replace('/(tabs)/home')} variante="secundario" />
      </View>
    )
  }

  return (
    <View style={es.contenedor}>
      <Text style={es.invitacion}>Te invitaron a una timba</Text>
      <Text style={es.titulo}>{timba.titulo}</Text>
      {timba.descripcion && <Text style={es.descripcion}>{timba.descripcion}</Text>}
      <View style={es.opciones}>
        {timba.opciones.map((op, i) => (
          <View key={i} style={es.opcion}>
            <Text style={es.opcionTexto}>{op}</Text>
          </View>
        ))}
      </View>
      <Boton titulo="Unirme a la timba" onPress={unirse} cargando={uniendose} />
      <Boton titulo="Cancelar" onPress={() => router.back()} variante="fantasma" />
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: c.fondo, paddingHorizontal: 24, justifyContent: 'center', gap: 16 },
    invitacion: { color: c.textoSuave, fontSize: 14 },
    titulo: { color: c.texto, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
    descripcion: { color: c.textoSuave, fontSize: 15, lineHeight: 22 },
    opciones: { gap: 8, marginVertical: 8 },
    opcion: { backgroundColor: c.fondoCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.borde },
    opcionTexto: { color: c.texto, fontSize: 15, fontWeight: '600' },
    errorTitulo: { color: c.texto, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  })
}
