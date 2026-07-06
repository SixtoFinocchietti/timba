import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { AppIcon } from '@/components/ui/AppIcon'

type HistorialItem = {
  id: string
  titulo: string
  created_at: string
  cerrada_en?: string
  resultado: 'ganaste' | 'perdiste' | 'neutral'
}

// La vista usuarios_publicos ya aplica la privacidad en el servidor:
// nombre llega filtrado (apodo si está oculto) y email/telefono/redes vienen
// en null cuando este usuario no puede verlos.
type PerfilPublico = {
  id: string
  nombre: string
  apodo?: string
  avatar_url?: string
  email?: string | null
  telefono?: string | null
  redes_sociales?: { nombre: string; usuario: string }[] | null
}

function formatearFecha(iso: string) {
  const d = new Date(iso)
  const dd = d.getDate().toString().padStart(2, '0')
  const mm = (d.getMonth() + 1).toString().padStart(2, '0')
  const hh = d.getHours().toString().padStart(2, '0')
  const min = d.getMinutes().toString().padStart(2, '0')
  return `${dd}/${mm} ${hh}:${min}`
}

export default function PerfilUsuario() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { usuario: yo } = useAuthStore()
  const c = useColores()
  const es = makeEstilos(c)

  const [cargando, setCargando] = useState(true)
  const [perfil, setPerfil] = useState<PerfilPublico | null>(null)
  const [esAmigo, setEsAmigo] = useState(false)
  // null = sin permiso para ver esa sección (la privacidad se aplica en el servidor)
  const [timbas, setTimbas] = useState<any[] | null>(null)
  const [historial, setHistorial] = useState<HistorialItem[] | null>(null)
  const [ganancias, setGanancias] = useState<{ ganadas: number; perdidas: number; total: number } | null>(null)

  useEffect(() => { if (id && yo?.id) cargar() }, [id])

  async function cargar() {
    setCargando(true)

    // perfil_publico() aplica la privacidad en el servidor: devuelve null en las
    // secciones que este usuario no puede ver (migración 010).
    const [{ data: u }, { data: publico }] = await Promise.all([
      supabase
        .from('usuarios_publicos')
        .select('id, nombre, apodo, avatar_url, email, telefono, redes_sociales')
        .eq('id', id)
        .single(),
      supabase.rpc('perfil_publico', { p_usuario_id: id }),
    ])

    setPerfil(u ?? null)

    if (publico) {
      setEsAmigo(!!publico.es_amigo)
      setTimbas(publico.timbas ?? null)
      setHistorial(publico.historial ?? null)
      setGanancias(publico.stats ?? null)
    }

    setCargando(false)
  }

  if (cargando) {
    return (
      <View style={[es.centrado, { backgroundColor: c.fondo }]}>
        <ActivityIndicator color={c.primario} size="large" />
      </View>
    )
  }

  if (!perfil) {
    return (
      <View style={[es.centrado, { backgroundColor: c.fondo }]}>
        <Text style={{ color: c.textoSuave, fontSize: 16 }}>Usuario no encontrado</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: c.primario, fontSize: 15, fontWeight: '600' }}>← Volver</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const nombreVisible = perfil.nombre ?? perfil.apodo ?? 'Usuario'
  const inicial = (nombreVisible[0] ?? '?').toUpperCase()
  const conResultado = ganancias ? ganancias.ganadas + ganancias.perdidas : 0
  const redes = perfil.redes_sociales ?? []
  const hayContacto = !!perfil.email || !!perfil.telefono || redes.length > 0

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.fondo }} contentContainerStyle={{ paddingBottom: 48 }}>

      <View style={es.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={es.btnVolver} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={{ color: c.primario, fontSize: 24, fontWeight: '600' }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: c.texto, fontSize: 17, fontWeight: '700' }}>Perfil</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Avatar + info */}
      <View style={[es.cardPerfil, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
        {perfil.avatar_url
          ? <Image source={{ uri: perfil.avatar_url }} style={es.avatar} />
          : <View style={[es.avatarCircle, { backgroundColor: c.primario }]}>
              <Text style={{ color: c.fondo, fontSize: 34, fontWeight: '800' }}>{inicial}</Text>
            </View>
        }
        <Text style={{ color: c.texto, fontSize: 22, fontWeight: '800', marginTop: 14 }}>
          {nombreVisible}
        </Text>
        {perfil.apodo && perfil.apodo !== nombreVisible ? (
          <Text style={{ color: c.primario, fontSize: 14, fontWeight: '600', marginTop: 2 }}>{perfil.apodo}</Text>
        ) : null}
        {esAmigo && (
          <View style={[es.pill, { backgroundColor: c.primario + '22', marginTop: 10 }]}>
            <Text style={{ color: c.primario, fontSize: 13, fontWeight: '600' }}>Amigos ✓</Text>
          </View>
        )}
      </View>

      {/* Contacto (solo lo que la privacidad del usuario permite ver) */}
      {hayContacto && (
        <View style={[es.seccion, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
          <Text style={es.labelSeccion}>Contacto</Text>
          {perfil.email ? (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Text style={{ color: c.textoSuave, fontSize: 13, fontWeight: '600', minWidth: 90 }}>Email</Text>
              <Text style={{ color: c.texto, fontSize: 13, flex: 1 }} numberOfLines={1}>{perfil.email}</Text>
            </View>
          ) : null}
          {perfil.telefono ? (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Text style={{ color: c.textoSuave, fontSize: 13, fontWeight: '600', minWidth: 90 }}>Teléfono</Text>
              <Text style={{ color: c.texto, fontSize: 13, flex: 1 }} numberOfLines={1}>{perfil.telefono}</Text>
            </View>
          ) : null}
          {redes.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Text style={{ color: c.textoSuave, fontSize: 13, fontWeight: '600', minWidth: 90 }} numberOfLines={1}>{r.nombre}</Text>
              <Text style={{ color: c.texto, fontSize: 13, flex: 1 }} numberOfLines={1}>{r.usuario}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Estadísticas */}
      {ganancias !== null && (
        <View style={[es.seccion, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
          <Text style={es.labelSeccion}>Estadísticas</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={[es.statBox, { backgroundColor: c.exito + '18', borderColor: c.exito + '44' }]}>
              <Text style={{ color: c.exito, fontSize: 26, fontWeight: '900' }}>{ganancias.ganadas}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <AppIcon name="ganadas" size={12} color={c.exito} />
                <Text style={{ color: c.exito + 'BB', fontSize: 12, fontWeight: '600' }}>Ganadas</Text>
              </View>
            </View>
            <View style={[es.statBox, { backgroundColor: c.error + '18', borderColor: c.error + '44' }]}>
              <Text style={{ color: c.error, fontSize: 26, fontWeight: '900' }}>{ganancias.perdidas}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <AppIcon name="perdidas" size={12} color={c.error} />
                <Text style={{ color: c.error + 'BB', fontSize: 12, fontWeight: '600' }}>Perdidas</Text>
              </View>
            </View>
          </View>
          {conResultado > 0 && (
            <View>
              <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                <View style={{ flex: ganancias.ganadas || 0.001, backgroundColor: c.exito }} />
                <View style={{ flex: ganancias.perdidas || 0.001, backgroundColor: c.error }} />
              </View>
              <Text style={{ color: c.textoSuave, fontSize: 12, textAlign: 'center', marginTop: 6 }}>
                {Math.round((ganancias.ganadas / conResultado) * 100)}% de victorias · {ganancias.total} timbas
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Timbas activas */}
      {timbas !== null && (
        <View style={[es.seccion, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
          <Text style={es.labelSeccion}>Timbas activas</Text>
          {timbas.length === 0
            ? <Text style={{ color: c.textoSuave, fontSize: 14 }}>Sin timbas activas</Text>
            : timbas.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[es.fila, { borderColor: c.borde }]}
                  // Las timbas ajenas no son legibles por id (RLS): se entra por el
                  // flujo de invitación, que además te deja unirte con un toque.
                  onPress={() =>
                    t.codigo_invitacion
                      ? router.push(`/join/${t.codigo_invitacion}` as any)
                      : router.push(`/timba/${t.id}`)
                  }
                  activeOpacity={0.75}
                >
                  <Text style={{ color: c.texto, fontSize: 14, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                    {t.titulo}
                  </Text>
                  <Text style={{ color: c.textoSuave, fontSize: 16 }}>›</Text>
                </TouchableOpacity>
              ))
          }
        </View>
      )}

      {/* Historial */}
      {historial !== null && historial.length > 0 && (
        <View style={[es.seccion, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
          <Text style={es.labelSeccion}>Historial de timbas</Text>
          {historial.slice(0, 6).map(item => (
            <View key={item.id} style={[es.fila, { borderColor: c.borde }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: c.texto, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                  {item.titulo}
                </Text>
                {item.cerrada_en && (
                  <Text style={{ color: c.textoSuave, fontSize: 11 }}>{formatearFecha(item.cerrada_en)}</Text>
                )}
              </View>
              {item.resultado === 'ganaste' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <AppIcon name="ganadas" size={12} color={c.exito} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.exito }}>Ganó</Text>
                </View>
              ) : item.resultado === 'perdiste' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <AppIcon name="perdidas" size={12} color={c.error} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.error }}>Perdió</Text>
                </View>
              ) : (
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.textoSuave }}>—</Text>
              )}
            </View>
          ))}
        </View>
      )}

    </ScrollView>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    centrado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    topBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16,
    },
    btnVolver: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    cardPerfil: {
      marginHorizontal: 24, borderRadius: 20, padding: 24,
      alignItems: 'center', borderWidth: 1, marginBottom: 12,
    },
    avatar: { width: 90, height: 90, borderRadius: 45 },
    avatarCircle: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
    pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
    seccion: { marginHorizontal: 24, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, marginBottom: 12 },
    labelSeccion: { color: c.textoSuave, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    statBox: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1 },
    fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  })
}
