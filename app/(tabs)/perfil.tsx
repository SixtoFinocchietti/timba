import { useState, useMemo, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  TextInput, Image, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { decode } from 'base64-arraybuffer'
import { useNavigation, router } from 'expo-router'
import { useAuthStore } from '@/store/authStore'
// Para reactivar modo claro: descomentar
// import { useTemaStore } from '@/store/temaStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { supabase } from '@/lib/supabase'
import { mensajeError } from '@/lib/errores'
import { NivelPrivacidad, RedSocial, Privacidad } from '@/types'
import { AppIcon } from '@/components/ui/AppIcon'

const PRIVACIDAD_CICLO: NivelPrivacidad[] = ['todos', 'amigos', 'nadie']
const PRIVACIDAD_LABEL: Record<NivelPrivacidad, string> = {
  todos: 'Todos',
  amigos: 'Amigos',
  nadie: 'Nadie',
}
// Debe coincidir con los defaults de la vista usuarios_publicos y perfil_publico()
// (migraciones 010/011): nombre/redes/margenes 'todos', el resto 'amigos'.
const PRIVACIDAD_DEFAULT: Privacidad = {
  email: 'amigos', telefono: 'amigos', redes: 'todos',
  nombre: 'todos', margenes: 'todos', timbas: 'amigos', historial: 'amigos',
}

export default function Perfil() {
  const { usuario, setUsuario, signOut } = useAuthStore()
  // Para reactivar modo claro: descomentar la línea de abajo
  // const { tema, toggleTema } = useTemaStore()
  const c = useColores()
  const es = useMemo(() => makeEstilos(c), [c])
  const navigation = useNavigation()

  // Para reactivar modo claro: descomentar esta función
  // async function cambiarTema() {
  //   const nuevoTema: import('@/types').TemaApp = tema === 'oscuro' ? 'claro' : 'oscuro'
  //   toggleTema()
  //   if (usuario?.id) {
  //     await supabase.from('usuarios').update({ tema: nuevoTema }).eq('id', usuario.id)
  //   }
  // }

  // Modo edición
  const [modoEdicion, setModoEdicion] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)

  // Campos del formulario
  const [nombre, setNombre] = useState('')
  const [apodo, setApodo] = useState('')
  const [telefono, setTelefono] = useState('')
  const [redes, setRedes] = useState<RedSocial[]>([])
  const [privacidad, setPrivacidad] = useState<Privacidad>(PRIVACIDAD_DEFAULT)

  // Historial de timbas
  type HistorialItem = {
    id: string
    titulo: string
    created_at: string
    cerrada_en?: string
    resultado: 'ganaste' | 'perdiste' | 'neutral'
  }
  const [historial, setHistorial] = useState<HistorialItem[]>([])
  const [mostrarTodoHistorial, setMostrarTodoHistorial] = useState(false)

  useEffect(() => { cargarHistorial() }, [usuario?.id])

  async function cargarHistorial() {
    if (!usuario?.id) return
    const [{ data: creadas }, { data: participadas }] = await Promise.all([
      supabase.from('timbas')
        .select('id, titulo, created_at, cerrada_en, resultado_ganador')
        .eq('creador_id', usuario.id)
        .eq('estado', 'cerrada'),
      supabase.from('participantes')
        .select('opcion_elegida, timba:timbas(id, titulo, created_at, cerrada_en, resultado_ganador, estado)')
        .eq('usuario_id', usuario.id),
    ])
    const mapa = new Map<string, HistorialItem>()
    ;(creadas ?? []).forEach((t: any) => {
      mapa.set(t.id, { id: t.id, titulo: t.titulo, created_at: t.created_at, cerrada_en: t.cerrada_en, resultado: 'neutral' })
    })
    ;(participadas ?? []).forEach((p: any) => {
      const t = p.timba
      if (!t || t.estado !== 'cerrada') return
      let resultado: HistorialItem['resultado'] = 'neutral'
      if (p.opcion_elegida && t.resultado_ganador) {
        resultado = p.opcion_elegida === t.resultado_ganador ? 'ganaste' : 'perdiste'
      }
      mapa.set(t.id, { id: t.id, titulo: t.titulo, created_at: t.created_at, cerrada_en: t.cerrada_en, resultado })
    })
    setHistorial(
      Array.from(mapa.values()).sort((a, b) =>
        new Date(b.cerrada_en ?? b.created_at).getTime() - new Date(a.cerrada_en ?? a.created_at).getTime()
      )
    )
  }

  function iniciarEdicion() {
    setNombre(usuario?.nombre ?? '')
    setApodo(usuario?.apodo ?? '')
    setTelefono(usuario?.telefono ?? '')
    setRedes(Array.isArray(usuario?.redes_sociales) ? [...(usuario.redes_sociales as RedSocial[])] : [])
    setPrivacidad({ ...PRIVACIDAD_DEFAULT, ...(usuario?.privacidad ?? {}) })
    setModoEdicion(true)
  }

  function ciclarPrivacidad(campo: keyof Privacidad) {
    setPrivacidad(prev => {
      const idx = PRIVACIDAD_CICLO.indexOf(prev[campo])
      return { ...prev, [campo]: PRIVACIDAD_CICLO[(idx + 1) % 3] }
    })
  }

  function agregarRed() {
    if (redes.length < 6) setRedes(prev => [...prev, { nombre: '', usuario: '' }])
  }

  function editarRed(i: number, campo: keyof RedSocial, val: string) {
    setRedes(prev => prev.map((r, idx) => idx === i ? { ...r, [campo]: val } : r))
  }

  function eliminarRed(i: number) {
    setRedes(prev => prev.filter((_, idx) => idx !== i))
  }

  async function guardar() {
    if (!nombre.trim()) { Alert.alert('El nombre no puede estar vacío'); return }
    setGuardando(true)

    const updates: Record<string, unknown> = {
      nombre: nombre.trim(),
      apodo: apodo.trim() || null,
      telefono: telefono.trim() || null,
      redes_sociales: redes.filter(r => r.nombre.trim() && r.usuario.trim()),
      privacidad,
    }

    const { data, error } = await supabase
      .from('usuarios')
      .update(updates)
      .eq('id', usuario?.id)
      .select()
      .single()

    if (error) { Alert.alert('Error al guardar', mensajeError(error)); setGuardando(false); return }
    setUsuario(data)
    setModoEdicion(false)
    setGuardando(false)
  }

  function eliminarCuenta() {
    Alert.alert(
      'Eliminar cuenta',
      'Esta acción es permanente e irreversible. Se borrarán tu cuenta, timbas, mensajes y saldos.\n\n¿Estás seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar para siempre',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('delete_own_account')
            if (error) {
              Alert.alert('Error', mensajeError(error))
              return
            }
            await signOut()
          },
        },
      ]
    )
  }

  async function seleccionarImagen() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permiso necesario'); return }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.7,
    })
    if (res.canceled) return
    subirImagen(res.assets[0].uri)
  }

  async function subirImagen(uri: string) {
    if (!usuario?.id) return
    setSubiendoFoto(true)
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
      const arrayBuffer = decode(base64)
      const filePath = `${usuario.id}/avatar.jpg`
      const { error: upErr } = await supabase.storage
        .from('avatars').upload(filePath, arrayBuffer, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) { Alert.alert('Error al subir foto', upErr.message); return }
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath)
      const { data: actualizado } = await supabase.from('usuarios')
        .update({ avatar_url: `${publicUrl}?v=${Date.now()}` })
        .eq('id', usuario.id).select().single()
      if (actualizado) setUsuario(actualizado)
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? String(e))
    } finally {
      setSubiendoFoto(false)
    }
  }

  const ganadas = historial.filter(h => h.resultado === 'ganaste').length
  const perdidas = historial.filter(h => h.resultado === 'perdiste').length
  const conResultado = ganadas + perdidas

  // ─── MODO EDICIÓN ─────────────────────────────────────────────────────────────
  if (modoEdicion) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: c.fondo }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={es.editContenedor} keyboardShouldPersistTaps="handled">

          <View style={es.editTopBar}>
            <TouchableOpacity onPress={() => setModoEdicion(false)}>
              <Text style={{ color: c.textoSuave, fontSize: 16, fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={{ color: c.texto, fontSize: 17, fontWeight: '700' }}>Editando perfil</Text>
            <TouchableOpacity onPress={guardar} disabled={guardando}>
              <Text style={{ color: c.primario, fontSize: 16, fontWeight: '700', opacity: guardando ? 0.4 : 1 }}>
                {guardando ? '...' : 'Guardar'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Avatar editable */}
          <TouchableOpacity style={es.avatarEdicion} onPress={seleccionarImagen} activeOpacity={0.8}>
            {subiendoFoto
              ? <View style={[es.avatarCircle, { backgroundColor: c.primario }]}>
                  <ActivityIndicator color={c.fondo} />
                </View>
              : usuario?.avatar_url
                ? <Image source={{ uri: usuario.avatar_url }} style={es.avatarImg} />
                : <View style={[es.avatarCircle, { backgroundColor: c.primario }]}>
                    <Text style={[es.avatarLetra, { color: c.fondo }]}>{(nombre[0] ?? '?').toUpperCase()}</Text>
                  </View>
            }
            <View style={[es.camaraIcon, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
              <AppIcon name="camara" size={14} color={c.texto} />
            </View>
          </TouchableOpacity>

          {/* Datos personales */}
          <SSection titulo="DATOS PERSONALES" c={c}>
            <Campo label="Nombre *" value={nombre} onChange={setNombre} c={c} />
            <Campo label="Apodo (opcional)" value={apodo} onChange={setApodo} placeholder="@alias visible para todos" c={c} />
            <CampoReadonly label="Email" value={usuario?.email ?? ''} c={c} />
            <Campo label="Teléfono" value={telefono} onChange={setTelefono} placeholder="+54 9 11 ..." keyboardType="phone-pad" c={c} />
          </SSection>

          {/* Redes sociales */}
          <SSection titulo="REDES SOCIALES" c={c}>
            {redes.map((r, i) => (
              <View key={i} style={es.filaRed}>
                <TextInput
                  style={[es.inputRed, { flex: 2, backgroundColor: c.fondoInput, borderColor: c.borde, color: c.texto }]}
                  value={r.nombre}
                  onChangeText={v => editarRed(i, 'nombre', v)}
                  placeholder="Instagram"
                  placeholderTextColor={c.textoSuave}
                />
                <TextInput
                  style={[es.inputRed, { flex: 3, backgroundColor: c.fondoInput, borderColor: c.borde, color: c.texto }]}
                  value={r.usuario}
                  onChangeText={v => editarRed(i, 'usuario', v)}
                  placeholder="@usuario"
                  placeholderTextColor={c.textoSuave}
                />
                <TouchableOpacity onPress={() => eliminarRed(i)} style={es.btnEliminarRed}>
                  <Text style={{ color: c.error, fontSize: 22, fontWeight: '700', lineHeight: 26 }}>−</Text>
                </TouchableOpacity>
              </View>
            ))}
            {redes.length < 6 && (
              <TouchableOpacity onPress={agregarRed} style={{ paddingVertical: 6 }}>
                <Text style={{ color: c.primario, fontSize: 14, fontWeight: '600' }}>+ Agregar red social</Text>
              </TouchableOpacity>
            )}
          </SSection>

          {/* Privacidad de perfil */}
          <SSection titulo="PRIVACIDAD DE PERFIL" c={c}>
            <Text style={{ color: c.textoSuave, fontSize: 13, marginBottom: 4 }}>
              Tocá para cambiar quién puede ver tu información
            </Text>
            {([
              { campo: 'nombre' as keyof Privacidad, label: 'Nombre real' },
              { campo: 'margenes' as keyof Privacidad, label: 'Estadísticas (victorias/derrotas)' },
              { campo: 'timbas' as keyof Privacidad, label: 'Timbas activas' },
              { campo: 'historial' as keyof Privacidad, label: 'Historial de timbas' },
            ]).map(({ campo, label }) => (
              <TouchableOpacity
                key={campo}
                style={[es.filaPrivacidad, { backgroundColor: c.fondoCard, borderColor: c.borde }]}
                onPress={() => ciclarPrivacidad(campo)}
                activeOpacity={0.75}
              >
                <Text style={{ color: c.texto, fontSize: 15, fontWeight: '500' }}>{label}</Text>
                <View style={[es.badge, { backgroundColor: c.primario + '22' }]}>
                  <Text style={{ color: c.primario, fontSize: 13, fontWeight: '600' }}>
                    {PRIVACIDAD_LABEL[privacidad[campo]]} ↻
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </SSection>

          {/* Privacidad de contacto */}
          <SSection titulo="PRIVACIDAD DE CONTACTO" c={c}>
            {([
              { campo: 'email' as keyof Privacidad, label: 'Email' },
              { campo: 'telefono' as keyof Privacidad, label: 'Teléfono' },
              { campo: 'redes' as keyof Privacidad, label: 'Redes sociales' },
            ]).map(({ campo, label }) => (
              <TouchableOpacity
                key={campo}
                style={[es.filaPrivacidad, { backgroundColor: c.fondoCard, borderColor: c.borde }]}
                onPress={() => ciclarPrivacidad(campo)}
                activeOpacity={0.75}
              >
                <Text style={{ color: c.texto, fontSize: 15, fontWeight: '500' }}>{label}</Text>
                <View style={[es.badge, { backgroundColor: c.primario + '22' }]}>
                  <Text style={{ color: c.primario, fontSize: 13, fontWeight: '600' }}>
                    {PRIVACIDAD_LABEL[privacidad[campo]]} ↻
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </SSection>

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  // ─── MODO VISTA ──────────────────────────────────────────────────────────────
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.fondo }} contentContainerStyle={{ paddingBottom: 48 }}>

      <View style={es.header}>
        {/* Hamburguesa */}
        <TouchableOpacity onPress={() => (navigation as any).openDrawer()} style={es.hamburger} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <View style={[es.linea, { backgroundColor: c.texto }]} />
          <View style={[es.linea, { backgroundColor: c.texto }]} />
          <View style={[es.linea, { backgroundColor: c.texto }]} />
        </TouchableOpacity>
        <Text style={[es.tituloPag, { color: c.texto }]}>Perfil</Text>
        {/* Para reactivar modo claro: descomentar este botón */}
        {/* <TouchableOpacity
          onPress={cambiarTema}
          style={[es.btnTema, { backgroundColor: c.fondoCard, borderColor: c.borde }]}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 20 }}>{tema === 'oscuro' ? '☀️' : '🌙'}</Text>
        </TouchableOpacity> */}
      </View>

      {/* Card principal */}
      <View style={[es.cardPrincipal, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
        {usuario?.avatar_url
          ? <Image source={{ uri: usuario.avatar_url }} style={es.avatarImg} />
          : <View style={[es.avatarCircle, { backgroundColor: c.primario }]}>
              <Text style={[es.avatarLetra, { color: c.fondo }]}>
                {(usuario?.nombre?.[0] ?? '?').toUpperCase()}
              </Text>
            </View>
        }
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: c.texto, fontSize: 20, fontWeight: '800' }}>
            {usuario?.nombre ?? 'Sin nombre'}
          </Text>
          {usuario?.apodo
            ? <Text style={{ color: c.primario, fontSize: 14, fontWeight: '600' }}>{usuario.apodo}</Text>
            : null}
          <Text style={{ color: c.textoSuave, fontSize: 13 }}>{usuario?.email}</Text>
          {usuario?.telefono
            ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <AppIcon name="telefono" size={13} color={c.textoSuave} />
                <Text style={{ color: c.textoSuave, fontSize: 13 }}>{usuario.telefono}</Text>
              </View>
            ) : null}
        </View>
      </View>

      {/* Estadísticas propias */}
      {historial.length > 0 && (
        <View style={[es.card, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
          <Text style={{ color: c.textoSuave, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
            Estadísticas
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={[es.statBox, { backgroundColor: c.exito + '18', borderColor: c.exito + '44', flex: 1 }]}>
              <Text style={{ color: c.exito, fontSize: 24, fontWeight: '900' }}>{ganadas}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <AppIcon name="ganadas" size={12} color={c.exito} />
                <Text style={{ color: c.exito + 'BB', fontSize: 12, fontWeight: '600' }}>Ganadas</Text>
              </View>
            </View>
            <View style={[es.statBox, { backgroundColor: c.error + '18', borderColor: c.error + '44', flex: 1 }]}>
              <Text style={{ color: c.error, fontSize: 24, fontWeight: '900' }}>{perdidas}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <AppIcon name="perdidas" size={12} color={c.error} />
                <Text style={{ color: c.error + 'BB', fontSize: 12, fontWeight: '600' }}>Perdidas</Text>
              </View>
            </View>
          </View>
          {conResultado > 0 && (
            <View>
              <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                <View style={{ flex: ganadas || 0.001, backgroundColor: c.exito }} />
                <View style={{ flex: perdidas || 0.001, backgroundColor: c.error }} />
              </View>
              <Text style={{ color: c.textoSuave, fontSize: 12, textAlign: 'center', marginTop: 6 }}>
                {Math.round((ganadas / conResultado) * 100)}% de victorias
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Redes sociales */}
      {Array.isArray(usuario?.redes_sociales) && (usuario.redes_sociales as RedSocial[]).length > 0 && (
        <View style={[es.card, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
          <Text style={{ color: c.textoSuave, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
            Redes sociales
          </Text>
          {(usuario.redes_sociales as RedSocial[]).map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Text style={{ color: c.textoSuave, fontSize: 13, fontWeight: '600', minWidth: 90 }}>{r.nombre}</Text>
              <Text style={{ color: c.texto, fontSize: 13 }}>{r.usuario}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Saldos */}
      <TouchableOpacity
        style={[es.btnSaldos, { backgroundColor: c.fondoCard, borderColor: c.borde }]}
        onPress={() => router.push('/saldos')}
        activeOpacity={0.8}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <AppIcon name="saldos" size={22} color={c.primario} />
          <View>
            <Text style={{ color: c.texto, fontSize: 16, fontWeight: '700' }}>Saldos</Text>
            <Text style={{ color: c.textoSuave, fontSize: 12 }}>Qué te deben y qué debés</Text>
          </View>
        </View>
        <Text style={{ color: c.textoSuave, fontSize: 18 }}>›</Text>
      </TouchableOpacity>

      {/* Historial de timbas */}
      {historial.length > 0 && (
        <View style={[es.card, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
          <Text style={{ color: c.textoSuave, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
            Historial de timbas
          </Text>
          {(historial.length > 4 && !mostrarTodoHistorial ? historial.slice(0, 3) : historial).map(item => (
            <TouchableOpacity
              key={item.id}
              style={[es.historialItem, { borderColor: c.borde }]}
              onPress={() => router.push(`/timba/${item.id}`)}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: c.texto, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{item.titulo}</Text>
                <Text style={{ color: c.textoSuave, fontSize: 11 }}>
                  Inicio: {formatearFecha(item.created_at)}
                </Text>
                {item.cerrada_en ? (
                  <Text style={{ color: c.textoSuave, fontSize: 11 }}>
                    Cierre: {formatearFecha(item.cerrada_en)}
                  </Text>
                ) : null}
              </View>
              {item.resultado === 'ganaste' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <AppIcon name="ganadas" size={12} color={c.exito} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.exito }}>Ganaste</Text>
                </View>
              ) : item.resultado === 'perdiste' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <AppIcon name="perdidas" size={12} color={c.error} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.error }}>Perdiste</Text>
                </View>
              ) : (
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.textoSuave }}>—</Text>
              )}
            </TouchableOpacity>
          ))}
          {historial.length > 4 && !mostrarTodoHistorial && (
            <TouchableOpacity onPress={() => setMostrarTodoHistorial(true)} activeOpacity={0.7} style={{ paddingTop: 8, alignItems: 'center' }}>
              <Text style={{ color: c.primario, fontSize: 14, fontWeight: '600' }}>
                Ver historial completo ({historial.length} timbas)
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <TouchableOpacity style={[es.btnEditar, { borderColor: c.primario }]} onPress={iniciarEdicion} activeOpacity={0.8}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <AppIcon name="editarPerfil" size={16} color={c.primario} />
          <Text style={{ color: c.primario, fontSize: 16, fontWeight: '600' }}>Editar perfil</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={[es.btnSalir, { borderColor: c.error }]} onPress={signOut} activeOpacity={0.8}>
        <Text style={{ color: c.error, fontSize: 16, fontWeight: '600' }}>Cerrar sesión</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[es.btnSalir, { borderColor: c.textoSuave + '44', marginTop: 8 }]}
        onPress={eliminarCuenta}
        activeOpacity={0.8}
      >
        <Text style={{ color: c.textoSuave, fontSize: 14, fontWeight: '500' }}>Eliminar cuenta</Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => router.push('/privacidad')}>
          <Text style={{ color: c.textoSuave, fontSize: 12 }}>Política de Privacidad</Text>
        </TouchableOpacity>
        <Text style={{ color: c.textoSuave, fontSize: 12 }}>·</Text>
        <TouchableOpacity onPress={() => router.push('/terminos')}>
          <Text style={{ color: c.textoSuave, fontSize: 12 }}>Términos y Condiciones</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatearFecha(iso: string) {
  const d = new Date(iso)
  const dd = d.getDate().toString().padStart(2, '0')
  const mm = (d.getMonth() + 1).toString().padStart(2, '0')
  const hh = d.getHours().toString().padStart(2, '0')
  const min = d.getMinutes().toString().padStart(2, '0')
  return `${dd}/${mm} ${hh}:${min}`
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function SSection({ titulo, c, children }: { titulo: string; c: ColoresTema; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: c.textoSuave, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
        {titulo}
      </Text>
      {children}
    </View>
  )
}

function Campo({ label, value, onChange, placeholder, secureTextEntry, keyboardType, c }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; secureTextEntry?: boolean; keyboardType?: any; c: ColoresTema
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: c.textoSuave, fontSize: 12, fontWeight: '500' }}>{label}</Text>
      <TextInput
        style={{
          height: 48, backgroundColor: c.fondoInput, borderRadius: 10,
          paddingHorizontal: 14, color: c.texto, fontSize: 15,
          borderWidth: 1.5, borderColor: c.borde,
        }}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? ''}
        placeholderTextColor={c.textoSuave}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType ?? 'default'}
        selectionColor={c.primario}
      />
    </View>
  )
}

function CampoReadonly({ label, value, c }: { label: string; value: string; c: ColoresTema }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: c.textoSuave, fontSize: 12, fontWeight: '500' }}>{label}</Text>
      <View style={{
        height: 48, backgroundColor: c.fondoInput, borderRadius: 10,
        paddingHorizontal: 14, justifyContent: 'center',
        borderWidth: 1.5, borderColor: c.borde, opacity: 0.65,
      }}>
        <Text style={{ color: c.textoSuave, fontSize: 15 }}>{value}</Text>
      </View>
    </View>
  )
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    // Edit mode
    editContenedor: { padding: 24, gap: 22 },
    editTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 44, marginBottom: 4 },
    avatarEdicion: { alignSelf: 'center', position: 'relative', marginBottom: 4 },
    camaraIcon: { position: 'absolute', bottom: -2, right: -2, borderRadius: 10, width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    filaRed: { flexDirection: 'row', gap: 6, alignItems: 'center' },
    inputRed: { height: 44, borderRadius: 10, paddingHorizontal: 10, fontSize: 14, borderWidth: 1.5 },
    btnEliminarRed: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
    filaPrivacidad: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1 },
    badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
    btnSecundario: { height: 44, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    // View mode
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16 },
    hamburger: { gap: 5, paddingVertical: 4 },
    linea: { width: 26, height: 2.5, borderRadius: 2 },
    tituloPag: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
    btnTema: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    cardPrincipal: { marginHorizontal: 24, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, marginBottom: 12 },
    card: { marginHorizontal: 24, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, marginBottom: 12 },
    avatarCircle: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
    avatarImg: { width: 66, height: 66, borderRadius: 33 },
    avatarLetra: { fontSize: 28, fontWeight: '800' },
    btnSaldos: {
      marginHorizontal: 24,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    historialItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
    statBox: { borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1 },
    btnEditar: { marginHorizontal: 24, borderWidth: 1.5, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    btnSalir: { marginHorizontal: 24, borderWidth: 1.5, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
  })
}
