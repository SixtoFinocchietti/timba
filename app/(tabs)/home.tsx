import { useCallback, useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { Timba } from '@/types'
import { CardTimba } from '@/components/timba/CardTimba'
import { AppHeader } from '@/components/ui/AppHeader'
import { AppIcon } from '@/components/ui/AppIcon'
import { mensajeError } from '@/lib/errores'

export default function Home() {
  const { usuario } = useAuthStore()
  const [timbas, setTimbas] = useState<Timba[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const c = useColores()
  const es = makeEstilos(c)

  // Recarga cada vez que la pantalla vuelve a tener foco (ej: después de crear una timba)
  useFocusEffect(
    useCallback(() => {
      cargarTimbas()
    }, [usuario?.id])
  )

  async function cargarTimbas() {
    setCargando(true)
    setErrorCarga(null)
    try {
      const userId = usuario?.id
      const [{ data: creadas, error: e1 }, { data: unidas, error: e2 }] = await Promise.all([
        supabase.from('timbas').select('*').eq('creador_id', userId).neq('estado', 'cerrada'),
        supabase.from('participantes').select('timba:timbas(*)').eq('usuario_id', userId),
      ])
      if (e1 || e2) throw e1 ?? e2
      const ahora = new Date()
      function visible(t: Timba) {
        return !t.fecha_inicio || new Date(t.fecha_inicio) <= ahora
      }
      const mapa = new Map<string, Timba>()
      ;(creadas ?? []).forEach((t: Timba) => { if (visible(t)) mapa.set(t.id, t) })
      ;(unidas ?? []).forEach((p: any) => {
        const t = p.timba as Timba | undefined
        if (t && t.estado !== 'cerrada' && visible(t)) mapa.set(t.id, t)
      })
      setTimbas(
        Array.from(mapa.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      )
    } catch (err) {
      setErrorCarga(mensajeError(err))
    } finally {
      setCargando(false)
    }
  }

  return (
    <View style={es.contenedor}>
      <AppHeader />

      <FlatList
        data={timbas}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CardTimba timba={item} onPress={() => router.push(`/timba/${item.id}`)} />
        )}
        contentContainerStyle={es.lista}
        ListHeaderComponent={
          <Text style={es.titulo}>Tus timbas</Text>
        }
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargarTimbas} tintColor={c.primario} />}
        ListEmptyComponent={
          !cargando ? (
            errorCarga ? (
              <View style={es.vacio}>
                <AppIcon name="xCirculo" size={40} color={c.error} />
                <Text style={[es.vacioTitulo, { color: c.error }]}>No se pudo cargar</Text>
                <Text style={es.vacioSubtitulo}>{errorCarga}</Text>
                <TouchableOpacity onPress={cargarTimbas} style={{ marginTop: 8 }}>
                  <Text style={{ color: c.primario, fontWeight: '700' }}>Reintentar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={es.vacio}>
                <AppIcon name="timba" size={48} />
                <Text style={es.vacioTitulo}>Sin timbas todavía</Text>
                <Text style={es.vacioSubtitulo}>Creá una o pedile el link a un amigo</Text>
              </View>
            )
          ) : null
        }
      />

      <TouchableOpacity style={es.fab} onPress={() => router.push('/timba/nueva')} activeOpacity={0.85}>
        <Text style={es.fabTexto}>+ Nueva timba</Text>
      </TouchableOpacity>
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: c.fondo },
    titulo: { color: c.texto, fontSize: 32, fontWeight: '800', letterSpacing: -0.5, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
    lista: { paddingHorizontal: 24, paddingBottom: 110, gap: 12 },
    vacio: { marginTop: 80, alignItems: 'center', gap: 8 },
    vacioTitulo: { color: c.texto, fontSize: 18, fontWeight: '700' },
    vacioSubtitulo: { color: c.textoSuave, fontSize: 14, textAlign: 'center' },
    fab: {
      position: 'absolute',
      bottom: 36,
      left: 24,
      right: 24,
      backgroundColor: c.primario,
      borderRadius: 16,
      height: 56,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fabTexto: { color: c.fondo, fontSize: 16, fontWeight: '800' },
  })
}
