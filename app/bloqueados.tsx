import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { AppIcon } from '@/components/ui/AppIcon'
import { ConfirmacionModal } from '@/components/ui/ConfirmacionModal'
import { Toast } from '@/components/ui/Toast'

type Bloqueado = {
  id: string            // id de la fila en bloqueados
  created_at: string
  usuario: { id: string; nombre: string; apodo?: string; avatar_url?: string }
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function Bloqueados() {
  const { usuario } = useAuthStore()
  const c = useColores()
  const es = makeEstilos(c)

  const [lista, setLista] = useState<Bloqueado[]>([])
  const [cargando, setCargando] = useState(true)
  const [confirmar, setConfirmar] = useState<Bloqueado | null>(null)
  const [toast, setToast] = useState<{ titulo: string; subtitulo: string } | null>(null)

  useFocusEffect(
    useCallback(() => {
      cargar()
    }, [usuario?.id])
  )

  async function cargar() {
    if (!usuario?.id) return
    setCargando(true)
    const { data } = await supabase
      .from('bloqueados')
      .select('id, created_at, usuario:usuarios_publicos!bloqueados_bloqueado_id_fkey(id, nombre, apodo, avatar_url)')
      .eq('bloqueador_id', usuario.id)
      .order('created_at', { ascending: false })
    setLista((data as any[])?.map(b => ({ ...b, usuario: b.usuario })) ?? [])
    setCargando(false)
  }

  async function desbloquear(item: Bloqueado) {
    setConfirmar(null)
    const { error } = await supabase.from('bloqueados').delete().eq('id', item.id)
    if (error) return
    setLista(prev => prev.filter(b => b.id !== item.id))
    setToast({
      titulo: 'Usuario desbloqueado',
      subtitulo: `${item.usuario.nombre.split(' ')[0]} ya puede volver a interactuar con vos.`,
    })
  }

  return (
    <View style={es.contenedor}>
      <View style={es.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={es.btnVolver}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={es.btnVolverTexto}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={es.titulo}>Bloqueados</Text>
          <Text style={es.subtitulo}>Usuarios que bloqueaste</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={es.scroll}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={c.primario} />}
        showsVerticalScrollIndicator={false}
      >
        {!cargando && lista.length === 0 && (
          <View style={es.vacio}>
            <AppIcon name="rechazar" size={48} color={c.textoSuave} />
            <Text style={es.vacioTitulo}>No bloqueaste a nadie</Text>
            <Text style={es.vacioSubtitulo}>
              Cuando bloquees a un usuario va a aparecer acá,{'\n'}y desde acá lo podés desbloquear.
            </Text>
          </View>
        )}

        {lista.map(item => (
          <View key={item.id} style={[es.card, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
            {item.usuario.avatar_url
              ? <Image source={{ uri: item.usuario.avatar_url }} style={es.avatar} />
              : <View style={[es.avatarCircle, { backgroundColor: c.primario + '2A' }]}>
                  <Text style={{ color: c.primario, fontSize: 17, fontWeight: '800' }}>
                    {(item.usuario.nombre?.[0] ?? '?').toUpperCase()}
                  </Text>
                </View>
            }
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: c.texto, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
                {item.usuario.nombre}
              </Text>
              <Text style={{ color: c.textoSuave, fontSize: 12 }}>
                Bloqueado el {fechaCorta(item.created_at)}
              </Text>
            </View>
            <TouchableOpacity
              style={[es.btnDesbloquear, { borderColor: c.primario }]}
              onPress={() => setConfirmar(item)}
              activeOpacity={0.8}
            >
              <Text style={{ color: c.primario, fontSize: 13, fontWeight: '700' }}>Desbloquear</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={{ height: 48 }} />
      </ScrollView>

      <ConfirmacionModal
        visible={!!confirmar}
        onClose={() => setConfirmar(null)}
        onConfirmar={() => confirmar && desbloquear(confirmar)}
        titulo="Desbloquear usuario"
        descripcion={`¿Querés desbloquear a ${confirmar?.usuario.nombre ?? ''}? Van a poder volver a chatear y enviarse invitaciones.`}
        nombre={confirmar?.usuario.nombre ?? ''}
        avatar_url={confirmar?.usuario.avatar_url}
        labelConfirmar="Desbloquear"
        icono="bloquear"
      />

      <Toast
        visible={!!toast}
        titulo={toast?.titulo ?? ''}
        subtitulo={toast?.subtitulo}
        onHide={() => setToast(null)}
      />
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: c.fondo },
    topBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20,
    },
    btnVolver: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    btnVolverTexto: { color: c.primario, fontSize: 24, fontWeight: '600' },
    titulo: { color: c.texto, fontSize: 26, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' },
    subtitulo: { color: c.textoSuave, fontSize: 13, textAlign: 'center', marginTop: 1 },
    scroll: { paddingHorizontal: 20, paddingTop: 4 },
    vacio: { alignItems: 'center', paddingVertical: 48, gap: 12 },
    vacioTitulo: { color: c.texto, fontSize: 18, fontWeight: '700' },
    vacioSubtitulo: { color: c.textoSuave, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 10,
    },
    avatar: { width: 44, height: 44, borderRadius: 22 },
    avatarCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    btnDesbloquear: {
      borderWidth: 1.5, borderRadius: 12,
      paddingHorizontal: 12, paddingVertical: 8,
    },
  })
}
