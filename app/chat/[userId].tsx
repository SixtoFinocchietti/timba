import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Image, Alert, KeyboardAvoidingView, Platform, Modal, Pressable,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { AppIcon } from '@/components/ui/AppIcon'
import { ConfirmacionModal } from '@/components/ui/ConfirmacionModal'
import { Toast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { mensajeError } from '@/lib/errores'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'

const GIPHY_KEY = process.env.EXPO_PUBLIC_GIPHY_KEY ?? ''
const EMOJIS = ['❤️', '😂', '😮', '😢', '🔥', '👍']
const EMOJIS_TODOS = [
  '❤️', '😂', '😮', '😢', '🔥', '👍', '😀', '😁', '😅', '😭', '😍', '🥰', '😘', '🤩',
  '😎', '🤔', '😏', '🥺', '😤', '😡', '🤯', '🥴', '😴', '🤢', '🤡', '😬', '🙄', '😲',
  '😳', '🤫', '🤭', '👏', '🙌', '🤝', '👋', '✌️', '🤞', '👌', '🤙', '💪', '🙏', '👎',
  '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💕', '💯', '⭐', '💥', '💫', '✨',
  '🎉', '🎊', '🎯', '🏆', '👑', '💎', '🚀', '🌙', '☀️', '🐶', '🐱', '🦁', '🦊', '🐼',
  '🦋', '🦄', '🍕', '🍔', '🍦', '🍰', '☕', '🍺', '🍾', '🎮', '🎵', '🎬', '📸', '🔑',
]

type UsuarioSimple = { id: string; nombre: string; avatar_url?: string }

type Reaccion = {
  id: string
  mensaje_id: string
  usuario_id: string
  emoji: string
}

type TipoMensaje = 'texto' | 'imagen' | 'gif' | 'invitacion_timba' | 'invitacion_poker' | 'invitacion_truco' | 'invitacion_blackjack'

type EstadoBloqueo = 'ninguno' | 'bloqueaste' | 'te_bloqueo'

type Mensaje = {
  id: string
  emisor_id: string
  receptor_id: string
  contenido?: string
  tipo: TipoMensaje
  timba_id?: string
  imagen_url?: string
  gif_url?: string
  leido: boolean
  created_at: string
  reacciones: Reaccion[]
}

type TimbaSimple = { id: string; titulo: string; codigo_invitacion: string }

type GifItem = {
  id: string
  title: string
  images: {
    fixed_height_small: { url: string }
    downsized: { url: string }
  }
}

export default function ChatScreen() {
  const { userId: amigoId } = useLocalSearchParams<{ userId: string }>()
  const { usuario } = useAuthStore()
  const c = useColores()
  const es = makeEstilos(c)
  const insets = useSafeAreaInsets()
  const myId = usuario?.id ?? ''

  const [amigo, setAmigo] = useState<UsuarioSimple | null>(null)
  const [amistadId, setAmistadId] = useState<string | null>(null)
  const [campoFavorito, setCampoFavorito] = useState<'favorito_solicitante' | 'favorito_receptor'>('favorito_solicitante')
  const [favorito, setFavorito] = useState(false)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [cargando, setCargando] = useState(true)

  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  const [mostrarGiphy, setMostrarGiphy] = useState(false)
  const [tabGiphy, setTabGiphy] = useState<'gifs' | 'stickers'>('gifs')
  const [busquedaGiphy, setBusquedaGiphy] = useState('')
  const [gifResultados, setGifResultados] = useState<GifItem[]>([])
  const [cargandoGiphy, setCargandoGiphy] = useState(false)

  const [mostrarTimbas, setMostrarTimbas] = useState(false)
  const [timbas, setTimbas] = useState<TimbaSimple[]>([])
  const [mostrarTruco, setMostrarTruco] = useState(false)
  const [bloqueo, setBloqueo] = useState<EstadoBloqueo>('ninguno')

  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [menuContexto, setMenuContexto] = useState<{ id: string; mio: boolean } | null>(null)
  const [mostrarMenu, setMostrarMenu] = useState(false)
  const [confirmBloquear, setConfirmBloquear] = useState(false)
  const [confirmReportar, setConfirmReportar] = useState(false)
  const [toast, setToast] = useState<{ titulo: string; subtitulo: string } | null>(null)
  const [emojisRapidos, setEmojisRapidos] = useState<string[]>(EMOJIS)
  const [mostrarMasEmojis, setMostrarMasEmojis] = useState(false)
  const [mostrarEditarEmojis, setMostrarEditarEmojis] = useState(false)
  const [emojisEdicion, setEmojisEdicion] = useState<string[]>(EMOJIS)

  const canalRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const timerGiphyRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useFocusEffect(
    useCallback(() => {
      if (!amigoId || !myId) return
      cargar()
      suscribirRealtime()
      return () => {
        canalRef.current?.unsubscribe()
        canalRef.current = null
      }
    }, [amigoId, myId])
  )

  useEffect(() => {
    if (mostrarGiphy) {
      setBusquedaGiphy('')
      setGifResultados([])
      buscarGiphy('', tabGiphy)
    }
  }, [mostrarGiphy, tabGiphy])

  async function cargar() {
    setCargando(true)
    const filtroConv =
      `and(emisor_id.eq.${myId},receptor_id.eq.${amigoId}),` +
      `and(emisor_id.eq.${amigoId},receptor_id.eq.${myId})`
    const filtroAmistad =
      `and(solicitante_id.eq.${myId},receptor_id.eq.${amigoId}),` +
      `and(solicitante_id.eq.${amigoId},receptor_id.eq.${myId})`

    const [{ data: amigoData }, { data: amistadBasic }, { data: msgsData }, { data: ocultosData }] = await Promise.all([
      supabase.from('usuarios_publicos').select('id, nombre, avatar_url').eq('id', amigoId).single(),
      // Query básica — funciona siempre, independiente de la migración
      supabase
        .from('amistades')
        .select('id, solicitante_id')
        .or(filtroAmistad)
        .eq('estado', 'aceptada')
        .single(),
      supabase
        .from('mensajes')
        .select('*, reacciones:reacciones_mensajes(*)')
        .or(filtroConv)
        .order('created_at', { ascending: false })
        .limit(100),
      // Mensajes que este usuario eliminó "para mí"
      supabase
        .from('mensajes_ocultos')
        .select('mensaje_id')
        .eq('usuario_id', myId),
    ])

    // Estado de bloqueo (para el aviso y deshabilitar el envío)
    const { data: bloqueoData } = await supabase.rpc('estado_bloqueo', { p_otro: amigoId })
    setBloqueo((bloqueoData as EstadoBloqueo) ?? 'ninguno')

    setAmigo(amigoData)

    if (amistadBasic) {
      setAmistadId(amistadBasic.id)
      const esSolicitante = amistadBasic.solicitante_id === myId
      const campo = esSolicitante ? 'favorito_solicitante' : 'favorito_receptor'
      setCampoFavorito(campo)

      // Query de preferencias separada — falla silenciosamente si la migración no corrió
      const { data: prefs } = await supabase
        .from('amistades')
        .select('favorito_solicitante, favorito_receptor')
        .eq('id', amistadBasic.id)
        .single()
      if (prefs) {
        setFavorito(esSolicitante ? (prefs.favorito_solicitante ?? false) : (prefs.favorito_receptor ?? false))
      }
    }

    const ocultos = new Set((ocultosData ?? []).map((o: any) => o.mensaje_id as string))
    setMensajes(
      (msgsData ?? [])
        .filter((m: any) => !ocultos.has(m.id))
        .map((m: any) => ({ ...m, reacciones: m.reacciones ?? [] }))
    )
    setCargando(false)

    supabase
      .from('mensajes')
      .update({ leido: true })
      .eq('receptor_id', myId)
      .eq('emisor_id', amigoId)
      .eq('leido', false)
      .then(() => {})
  }

  function suscribirRealtime() {
    const canal = supabase
      .channel(`chat_${[myId, amigoId].sort().join('_')}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `receptor_id=eq.${myId}` },
        (payload) => {
          const nuevo = payload.new as any
          if (nuevo.emisor_id !== amigoId) return
          setMensajes(prev => [{ ...nuevo, reacciones: [] }, ...prev])
          supabase.from('mensajes').update({ leido: true }).eq('id', nuevo.id).then(() => {})
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reacciones_mensajes' },
        (payload) => {
          const r = payload.new as Reaccion
          setMensajes(prev => prev.map(m =>
            m.id === r.mensaje_id
              ? { ...m, reacciones: [...m.reacciones.filter(x => x.usuario_id !== r.usuario_id), r] }
              : m
          ))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'reacciones_mensajes' },
        (payload) => {
          const old = payload.old as { id: string; mensaje_id: string }
          setMensajes(prev => prev.map(m =>
            m.id === old.mensaje_id
              ? { ...m, reacciones: m.reacciones.filter(r => r.id !== old.id) }
              : m
          ))
        }
      )
      .subscribe()
    canalRef.current = canal
  }

  async function enviarTexto() {
    const t = texto.trim()
    if (!t || enviando) return
    setTexto('')
    setEnviando(true)
    const tempId = `temp_${Date.now()}`
    const tempMsg: Mensaje = {
      id: tempId, emisor_id: myId, receptor_id: amigoId,
      contenido: t, tipo: 'texto', leido: false,
      created_at: new Date().toISOString(), reacciones: [],
    }
    setMensajes(prev => [tempMsg, ...prev])

    const { data, error } = await supabase
      .from('mensajes')
      .insert({ emisor_id: myId, receptor_id: amigoId, contenido: t, tipo: 'texto' })
      .select('*')
      .single()

    if (error) {
      Alert.alert('Error al enviar', mensajeError(error))
      setMensajes(prev => prev.filter(m => m.id !== tempId))
    } else {
      setMensajes(prev => prev.map(m => m.id === tempId ? { ...data, reacciones: [] } : m))
    }
    setEnviando(false)
  }

  async function enviarGif(gifUrl: string) {
    setMostrarGiphy(false)
    const tempId = `temp_${Date.now()}`
    const tempMsg: Mensaje = {
      id: tempId, emisor_id: myId, receptor_id: amigoId,
      tipo: 'gif', gif_url: gifUrl, leido: false,
      created_at: new Date().toISOString(), reacciones: [],
    }
    setMensajes(prev => [tempMsg, ...prev])

    const { data, error } = await supabase
      .from('mensajes')
      .insert({ emisor_id: myId, receptor_id: amigoId, tipo: 'gif', gif_url: gifUrl })
      .select('*')
      .single()

    if (error) {
      Alert.alert('Error al enviar', mensajeError(error))
      setMensajes(prev => prev.filter(m => m.id !== tempId))
    } else {
      setMensajes(prev => prev.map(m => m.id === tempId ? { ...data, reacciones: [] } : m))
    }
  }

  function opcionesFoto() {
    // En web no hay diálogo de 3 opciones: directo a la galería
    if (Platform.OS === 'web') { subirFotoDesde('galeria'); return }
    Alert.alert(
      'Enviar foto',
      undefined,
      [
        { text: '📷  Cámara', onPress: () => subirFotoDesde('camara') },
        { text: '🖼️  Galería', onPress: () => subirFotoDesde('galeria') },
        { text: 'Cancelar', style: 'cancel' },
      ]
    )
  }

  async function subirFotoDesde(fuente: 'camara' | 'galeria') {
    if (fuente === 'camara') {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) { Alert.alert('Permisos', 'Necesitamos acceso a la cámara.'); return }
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) { Alert.alert('Permisos', 'Necesitamos acceso a tu galería.'); return }
    }

    const result = fuente === 'camara'
      ? await ImagePicker.launchCameraAsync({ quality: 0.75, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.75,
          allowsEditing: false,
        })

    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]

    try {
      // fetch + blob: sin FileSystem ni base64, compatible con Expo SDK 56
      const ext = (asset.uri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase()
      const path = `${myId}/${Date.now()}.${ext}`
      const contentType = ext === 'png' ? 'image/png' : 'image/jpeg'

      // XHR crea el blob nativo sin pasar por ArrayBuffer, evitando el error de Hermes
      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.onload = () => resolve(xhr.response)
        xhr.onerror = () => reject(new Error('No se pudo leer la imagen'))
        xhr.responseType = 'blob'
        xhr.open('GET', asset.uri, true)
        xhr.send()
      })

      const { error: uploadError } = await supabase.storage
        .from('chat-imagenes')
        .upload(path, blob, { contentType, upsert: false })

      if (uploadError) { Alert.alert('Error al subir foto', uploadError.message); return }

      const { data: { publicUrl } } = supabase.storage.from('chat-imagenes').getPublicUrl(path)

      const tempId = `temp_${Date.now()}`
      setMensajes(prev => [{
        id: tempId, emisor_id: myId, receptor_id: amigoId,
        tipo: 'imagen', imagen_url: publicUrl, leido: false,
        created_at: new Date().toISOString(), reacciones: [],
      }, ...prev])

      const { data, error } = await supabase
        .from('mensajes')
        .insert({ emisor_id: myId, receptor_id: amigoId, tipo: 'imagen', imagen_url: publicUrl })
        .select('*')
        .single()

      if (error) {
        Alert.alert('Error al enviar', mensajeError(error))
        setMensajes(prev => prev.filter(m => m.id !== tempId))
      } else {
        setMensajes(prev => prev.map(m => m.id === tempId ? { ...data, reacciones: [] } : m))
      }
    } catch (e: any) {
      Alert.alert('Error', e.message)
    }
  }

  async function cargarTimbas() {
    const { data } = await supabase
      .from('timbas')
      .select('id, titulo, codigo_invitacion')
      .eq('creador_id', myId)
      .eq('estado', 'activa')
      .order('created_at', { ascending: false })
    setTimbas((data ?? []) as TimbaSimple[])
  }

  async function enviarInvitacion(timba: TimbaSimple) {
    setMostrarTimbas(false)
    const contenido = JSON.stringify({ titulo: timba.titulo, codigo: timba.codigo_invitacion })
    const tempId = `temp_${Date.now()}`
    const tempMsg: Mensaje = {
      id: tempId, emisor_id: myId, receptor_id: amigoId,
      tipo: 'invitacion_timba', timba_id: timba.id, contenido,
      leido: false, created_at: new Date().toISOString(), reacciones: [],
    }
    setMensajes(prev => [tempMsg, ...prev])

    const { data, error } = await supabase
      .from('mensajes')
      .insert({ emisor_id: myId, receptor_id: amigoId, tipo: 'invitacion_timba', timba_id: timba.id, contenido })
      .select('*')
      .single()

    if (error) {
      Alert.alert('Error al enviar', mensajeError(error))
      setMensajes(prev => prev.filter(m => m.id !== tempId))
    } else {
      setMensajes(prev => prev.map(m => m.id === tempId ? { ...data, reacciones: [] } : m))
    }
  }

  async function toggleFavorito() {
    if (!amistadId) return
    const nuevoVal = !favorito
    setFavorito(nuevoVal)
    await supabase.from('amistades').update({ [campoFavorito]: nuevoVal }).eq('id', amistadId)
  }

  async function desbloquear() {
    const { error } = await supabase
      .from('bloqueados')
      .delete()
      .eq('bloqueador_id', myId)
      .eq('bloqueado_id', amigoId)
    if (error) { Alert.alert('Error', mensajeError(error)); return }
    setBloqueo('ninguno')
    setToast({ titulo: 'Usuario desbloqueado', subtitulo: 'Ya pueden volver a chatear.' })
  }

  // Crea la partida de Truco en estado 'esperando' (igual que el lobby del juego)
  // y manda la invitación como mensaje. El otro la acepta desde el lobby.
  async function enviarInvitacionTruco(conFlor: boolean) {
    setMostrarTruco(false)

    const { data: partida, error: errPartida } = await supabase
      .from('truco_partidas')
      .insert({ jugador1: myId, jugador2: amigoId, con_flor: conFlor })
      .select('id')
      .single()
    if (errPartida || !partida) {
      Alert.alert('Error', 'No se pudo crear la partida de Truco.')
      return
    }

    const contenido = JSON.stringify({ partidaId: partida.id, conFlor })
    const tempId = `temp_${Date.now()}`
    setMensajes(prev => [{
      id: tempId, emisor_id: myId, receptor_id: amigoId,
      tipo: 'invitacion_truco', contenido,
      leido: false, created_at: new Date().toISOString(), reacciones: [],
    }, ...prev])

    const { data, error } = await supabase
      .from('mensajes')
      .insert({ emisor_id: myId, receptor_id: amigoId, tipo: 'invitacion_truco', contenido })
      .select('*')
      .single()

    if (error) {
      Alert.alert('Error al enviar', mensajeError(error))
      setMensajes(prev => prev.filter(m => m.id !== tempId))
      await supabase.from('truco_partidas').delete().eq('id', partida.id).eq('estado', 'esperando')
    } else {
      setMensajes(prev => prev.map(m => m.id === tempId ? { ...data, reacciones: [] } : m))
    }
  }

  function abrirMenuContexto(mensajeId: string, esMio: boolean) {
    setModoSeleccion(true)
    setSeleccionados(prev => {
      const next = new Set(prev)
      next.add(mensajeId)
      return next
    })
    setMenuContexto({ id: mensajeId, mio: esMio })
  }

  function toggleSeleccion(mensajeId: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(mensajeId)) next.delete(mensajeId)
      else next.add(mensajeId)
      return next
    })
  }

  function seleccionarTodo() {
    setSeleccionados(new Set(mensajes.map(m => m.id)))
  }

  function salirModoSeleccion() {
    setModoSeleccion(false)
    setSeleccionados(new Set())
    setMenuContexto(null)
  }

  async function eliminarParaMi(mensajeId: string) {
    setMenuContexto(null)
    salirModoSeleccion()
    setMensajes(prev => prev.filter(m => m.id !== mensajeId))
    // Persistir para que no reaparezca al recargar (los temp_ todavía no existen en la BD)
    if (!mensajeId.startsWith('temp_')) {
      await supabase.from('mensajes_ocultos').insert({ mensaje_id: mensajeId, usuario_id: myId })
    }
  }

  async function eliminarParaTodos(mensajeId: string) {
    setMenuContexto(null)
    salirModoSeleccion()
    setMensajes(prev => prev.filter(m => m.id !== mensajeId))
    await supabase.from('mensajes').delete().eq('id', mensajeId)
  }

  async function toggleReaccion(mensajeId: string, emoji: string) {
    setMenuContexto(null)
    const msg = mensajes.find(m => m.id === mensajeId)
    if (!msg) return
    const mia = msg.reacciones.find(r => r.usuario_id === myId)

    if (mia && mia.emoji === emoji) {
      await supabase.from('reacciones_mensajes').delete().eq('id', mia.id)
      setMensajes(prev => prev.map(m =>
        m.id === mensajeId ? { ...m, reacciones: m.reacciones.filter(r => r.id !== mia.id) } : m
      ))
    } else {
      if (mia) {
        await supabase.from('reacciones_mensajes').delete().eq('id', mia.id)
      }
      const { data } = await supabase
        .from('reacciones_mensajes')
        .insert({ mensaje_id: mensajeId, usuario_id: myId, emoji })
        .select('*')
        .single()
      if (data) {
        setMensajes(prev => prev.map(m =>
          m.id === mensajeId
            ? { ...m, reacciones: [...m.reacciones.filter(r => r.usuario_id !== myId), data as Reaccion] }
            : m
        ))
      }
    }
  }

  async function buscarGiphy(query: string, tab: 'gifs' | 'stickers') {
    if (!GIPHY_KEY) return
    setCargandoGiphy(true)
    const tipo = tab === 'gifs' ? 'gifs' : 'stickers'
    const url = query.trim()
      ? `https://api.giphy.com/v1/${tipo}/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=24&rating=g`
      : `https://api.giphy.com/v1/${tipo}/trending?api_key=${GIPHY_KEY}&limit=24&rating=g`
    try {
      const res = await fetch(url)
      const json = await res.json()
      setGifResultados(json.data ?? [])
    } catch {
      // silently fail
    } finally {
      setCargandoGiphy(false)
    }
  }

  function onCambioGiphy(q: string) {
    setBusquedaGiphy(q)
    if (timerGiphyRef.current) clearTimeout(timerGiphyRef.current)
    timerGiphyRef.current = setTimeout(() => buscarGiphy(q, tabGiphy), 400)
  }

  function horaCorta(iso: string) {
    const d = new Date(iso)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  if (cargando) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.fondo, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primario} size="large" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.fondo }} edges={['top']}>
      {/* ── Header ── */}
      <View style={[es.header, { borderBottomColor: c.borde }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 8 }}
        >
          <Text style={{ color: c.primario, fontSize: 28, lineHeight: 32 }}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
          onPress={() => router.push(`/usuario/${amigoId}`)}
          activeOpacity={0.75}
        >
          <AvatarComp u={amigo} size={38} c={c} />
          <Text style={[es.headerNombre, { color: c.texto }]} numberOfLines={1}>
            {amigo?.nombre ?? '...'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={toggleFavorito}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 4 }}
          activeOpacity={0.6}
        >
          <AppIcon name={favorito ? 'favoritoLleno' : 'favoritoVacio'} size={20} color={favorito ? c.primario : c.textoSuave} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setMostrarMenu(true)}
          hitSlop={{ top: 12, bottom: 12, left: 4, right: 12 }}
          activeOpacity={0.6}
        >
          <Text style={{ color: c.textoSuave, fontSize: 20, letterSpacing: 2 }}>···</Text>
        </TouchableOpacity>
      </View>

      {/* ── Barra de selección ── */}
      {modoSeleccion && (
        <View style={[es.seleccionBar, { backgroundColor: c.fondoCard, borderBottomColor: c.borde }]}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            onPress={seleccionarTodo}
            activeOpacity={0.7}
          >
            <View style={[
              es.checkboxBase,
              seleccionados.size === mensajes.length
                ? { backgroundColor: c.primario, borderColor: c.primario }
                : { backgroundColor: 'transparent', borderColor: c.textoSuave },
            ]}>
              {seleccionados.size === mensajes.length && (
                <Text style={{ color: c.fondo, fontSize: 12, fontWeight: '800' }}>✓</Text>
              )}
            </View>
            <Text style={{ color: c.texto, fontWeight: '600', fontSize: 14 }}>Seleccionar todo</Text>
          </TouchableOpacity>
          <Text style={{ color: c.textoSuave, fontSize: 13 }}>
            Mensajes seleccionados: {seleccionados.size}
          </Text>
          <TouchableOpacity
            onPress={salirModoSeleccion}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          >
            <Text style={{ color: c.textoSuave, fontSize: 26, lineHeight: 28 }}>×</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Mensajes + Input ── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          data={mensajes}
          keyExtractor={m => m.id}
          inverted
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <BurbujaMensaje
              m={item}
              mio={item.emisor_id === myId}
              hora={horaCorta(item.created_at)}
              myId={myId}
              seleccionado={seleccionados.has(item.id)}
              modoSeleccion={modoSeleccion}
              onPress={() => modoSeleccion && toggleSeleccion(item.id)}
              onLongPress={() => abrirMenuContexto(item.id, item.emisor_id === myId)}
              onReaccion={(emoji) => toggleReaccion(item.id, emoji)}
              c={c}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 40 }}>💬</Text>
              <Text style={{ color: c.textoSuave, marginTop: 8 }}>
                Empezá la conversación
              </Text>
            </View>
          }
        />

        {/* ── Input bar (o aviso de bloqueo) ── */}
        {bloqueo !== 'ninguno' ? (
          <View style={[es.inputBar, { borderTopColor: c.borde, paddingBottom: Math.max(insets.bottom, 12), alignItems: 'center' }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: c.texto, fontSize: 14, fontWeight: '700' }}>
                {bloqueo === 'te_bloqueo' ? 'Este usuario te bloqueó' : 'Bloqueaste a este usuario'}
              </Text>
              <Text style={{ color: c.textoSuave, fontSize: 12 }}>
                {bloqueo === 'te_bloqueo'
                  ? 'No podés enviarle mensajes ni invitaciones.'
                  : 'No pueden enviarse mensajes ni invitaciones.'}
              </Text>
            </View>
            {bloqueo === 'bloqueaste' && (
              <TouchableOpacity
                onPress={desbloquear}
                style={{ backgroundColor: c.primario, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 }}
                activeOpacity={0.8}
              >
                <Text style={{ color: c.fondo, fontWeight: '700', fontSize: 13 }}>Desbloquear</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
        <View style={[es.inputBar, { borderTopColor: c.borde, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            onPress={() => setMostrarGiphy(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
          >
            <Text style={{ fontSize: 24 }}>🎬</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={opcionesFoto}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <AppIcon name="camara" size={24} color={c.textoSuave} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { setMostrarTimbas(true); cargarTimbas() }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <AppIcon name="timba" size={24} color={c.textoSuave} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setMostrarTruco(true)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <AppIcon name="machoEspada" size={24} color={c.textoSuave} />
          </TouchableOpacity>

          <TextInput
            style={[es.inputTexto, { backgroundColor: c.fondoInput, color: c.texto }]}
            placeholder="Mensaje..."
            placeholderTextColor={c.textoSuave}
            value={texto}
            onChangeText={setTexto}
            multiline
            maxLength={1000}
            selectionColor={c.primario}
          />

          <TouchableOpacity
            onPress={enviarTexto}
            disabled={!texto.trim() || enviando}
            style={[
              es.btnEnviar,
              { backgroundColor: texto.trim() && !enviando ? c.primario : c.fondoInput },
            ]}
            activeOpacity={0.8}
          >
            <Text style={{ color: texto.trim() && !enviando ? c.fondo : c.textoSuave, fontSize: 18, fontWeight: '700' }}>
              ↑
            </Text>
          </TouchableOpacity>
        </View>
        )}
      </KeyboardAvoidingView>

      {/* ── Menú de contexto de mensaje ── */}
      <Modal
        visible={!!menuContexto}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuContexto(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' }}
          onPress={() => setMenuContexto(null)}
        >
          <Pressable onPress={() => {}}>
            <View style={[es.menuContexto, { backgroundColor: c.fondoCard, margin: 14, marginBottom: Math.max(insets.bottom, 14) + 60 }]}>
              {/* Acciones principales */}
              {[
                {
                  label: 'Responder', icon: '↩️',
                  accion: () => { setMenuContexto(null); Alert.alert('Próximamente', 'La función de responder llegará pronto.') },
                },
                {
                  label: 'Reenviar', icon: '↪️',
                  accion: () => { setMenuContexto(null); Alert.alert('Próximamente', 'La función de reenviar llegará pronto.') },
                },
                {
                  label: 'Fijar', icon: '📌',
                  accion: () => { setMenuContexto(null); Alert.alert('Próximamente', 'La función de fijar llegará pronto.') },
                },
              ].map(opt => (
                <TouchableOpacity
                  key={opt.label}
                  style={[es.menuCtxOpt, { borderBottomColor: c.borde }]}
                  onPress={opt.accion}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 18, width: 28 }}>{opt.icon}</Text>
                  <Text style={{ color: c.texto, fontSize: 16 }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}

              {/* Fila de reacciones rápidas + botones + y ✏️ */}
              <View style={[es.menuCtxEmojis, { borderBottomColor: c.borde, borderTopColor: c.borde }]}>
                {emojisRapidos.map(e => (
                  <TouchableOpacity
                    key={e}
                    onPress={() => menuContexto && toggleReaccion(menuContexto.id, e)}
                    style={{ padding: 5 }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 24 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={() => setMostrarMasEmojis(true)}
                  style={[es.emojiExtraBtn, { backgroundColor: c.fondoInput }]}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: c.texto, fontSize: 18, fontWeight: '700' }}>+</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setEmojisEdicion(emojisRapidos); setMostrarEditarEmojis(true) }}
                  style={[es.emojiExtraBtn, { backgroundColor: c.fondoInput }]}
                  activeOpacity={0.7}
                >
                  <AppIcon name="editarPerfil" size={16} color={c.texto} />
                </TouchableOpacity>
              </View>

              {/* Eliminar para mí */}
              <TouchableOpacity
                style={[es.menuCtxOpt, { borderBottomColor: c.borde }]}
                onPress={() => menuContexto && eliminarParaMi(menuContexto.id)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 18, width: 28 }}>🗑️</Text>
                <Text style={{ color: c.error, fontSize: 16 }}>Eliminar para mí</Text>
              </TouchableOpacity>

              {/* Eliminar para todos — solo emisor */}
              {menuContexto?.mio && (
                <TouchableOpacity
                  style={[es.menuCtxOpt, { borderBottomWidth: 0 }]}
                  onPress={() => menuContexto && eliminarParaTodos(menuContexto.id)}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 18, width: 28 }}>🗑️</Text>
                  <Text style={{ color: c.error, fontSize: 16, fontWeight: '700' }}>Eliminar para todos</Text>
                </TouchableOpacity>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Más emojis (reacción completa) ── */}
      <Modal
        visible={mostrarMasEmojis}
        transparent
        animationType="slide"
        onRequestClose={() => setMostrarMasEmojis(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' }}
          onPress={() => setMostrarMasEmojis(false)}
        >
          <Pressable onPress={() => {}}>
            <View style={[es.sheet, { backgroundColor: c.fondoCard, paddingBottom: Math.max(insets.bottom, 20), maxHeight: '55%' }]}>
              <View style={{ width: 36, height: 4, backgroundColor: c.borde, borderRadius: 2, alignSelf: 'center', marginBottom: 10 }} />
              <Text style={{ color: c.textoSuave, fontSize: 13, textAlign: 'center', marginBottom: 10 }}>
                Más reacciones
              </Text>
              <FlatList
                data={EMOJIS_TODOS}
                numColumns={8}
                keyExtractor={(e, i) => `mas_${e}_${i}`}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={{ width: '12.5%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => {
                      if (menuContexto) toggleReaccion(menuContexto.id, item)
                      setMostrarMasEmojis(false)
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 28 }}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Editar emojis rápidos ── */}
      <Modal
        visible={mostrarEditarEmojis}
        transparent
        animationType="slide"
        onRequestClose={() => setMostrarEditarEmojis(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' }}
          onPress={() => setMostrarEditarEmojis(false)}
        >
          <Pressable onPress={() => {}}>
            <View style={[es.sheet, { backgroundColor: c.fondoCard, paddingBottom: Math.max(insets.bottom, 20), maxHeight: '65%' }]}>
              <View style={{ width: 36, height: 4, backgroundColor: c.borde, borderRadius: 2, alignSelf: 'center', marginBottom: 12 }} />

              {/* Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ color: c.texto, fontSize: 16, fontWeight: '800' }}>
                  Emojis rápidos ({emojisEdicion.length}/6)
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setEmojisRapidos(emojisEdicion.length > 0 ? emojisEdicion : EMOJIS)
                    setMostrarEditarEmojis(false)
                  }}
                  style={{ backgroundColor: c.primario, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 14 }}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: c.fondo, fontWeight: '700', fontSize: 14 }}>Guardar</Text>
                </TouchableOpacity>
              </View>

              {/* Vista previa de seleccionados */}
              <View style={[es.editPreview, { borderBottomColor: c.borde }]}>
                {emojisEdicion.length === 0
                  ? <Text style={{ color: c.textoSuave, fontSize: 13 }}>Seleccioná hasta 6 emojis</Text>
                  : emojisEdicion.map((e, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setEmojisEdicion(prev => prev.filter((_, j) => j !== i))}
                      activeOpacity={0.7}
                      style={{ padding: 4 }}
                    >
                      <Text style={{ fontSize: 28 }}>{e}</Text>
                    </TouchableOpacity>
                  ))
                }
              </View>

              {/* Grid de selección */}
              <FlatList
                data={EMOJIS_TODOS}
                numColumns={8}
                keyExtractor={(e, i) => `edit_${e}_${i}`}
                showsVerticalScrollIndicator={false}
                style={{ marginTop: 4 }}
                renderItem={({ item }) => {
                  const selec = emojisEdicion.includes(item)
                  return (
                    <TouchableOpacity
                      style={{
                        width: '12.5%', aspectRatio: 1,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: selec ? c.primario + '33' : 'transparent',
                        borderRadius: 8,
                      }}
                      onPress={() => {
                        if (selec) {
                          setEmojisEdicion(prev => prev.filter(e => e !== item))
                        } else if (emojisEdicion.length < 6) {
                          setEmojisEdicion(prev => [...prev, item])
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 26 }}>{item}</Text>
                      {selec && (
                        <View style={{
                          position: 'absolute', top: 2, right: 2,
                          backgroundColor: c.primario, borderRadius: 5,
                          width: 12, height: 12,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Text style={{ color: c.fondo, fontSize: 8, fontWeight: '800' }}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  )
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Giphy Modal ── */}
      <Modal visible={mostrarGiphy} animationType="slide" onRequestClose={() => setMostrarGiphy(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: c.fondo }}>
          <View style={[es.modalHeader, { borderBottomColor: c.borde }]}>
            <TouchableOpacity onPress={() => setMostrarGiphy(false)}>
              <Text style={{ color: c.textoSuave, fontSize: 15 }}>Cerrar</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 28 }}>
              {(['gifs', 'stickers'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTabGiphy(t)}
                  style={[
                    es.tab,
                    tabGiphy === t && { borderBottomColor: c.primario, borderBottomWidth: 2 },
                  ]}
                >
                  <Text style={{ color: tabGiphy === t ? c.primario : c.textoSuave, fontWeight: '700' }}>
                    {t === 'gifs' ? 'GIFs' : 'Stickers'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[es.giphySearch, { backgroundColor: c.fondoInput, margin: 12 }]}>
            <TextInput
              style={{ flex: 1, color: c.texto, fontSize: 15, paddingVertical: 10, paddingHorizontal: 12 }}
              placeholder={`Buscar ${tabGiphy === 'gifs' ? 'GIFs' : 'stickers'}...`}
              placeholderTextColor={c.textoSuave}
              value={busquedaGiphy}
              onChangeText={onCambioGiphy}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          {!GIPHY_KEY ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
              <Text style={{ color: c.textoSuave, textAlign: 'center', fontSize: 15 }}>
                {'Para usar GIFs y stickers, agregá tu clave de Giphy en el archivo .env:\nEXPO_PUBLIC_GIPHY_KEY=tu_clave'}
              </Text>
            </View>
          ) : cargandoGiphy ? (
            <ActivityIndicator color={c.primario} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={gifResultados}
              key={tabGiphy}
              numColumns={3}
              keyExtractor={g => g.id}
              columnWrapperStyle={{ gap: 3 }}
              contentContainerStyle={{ padding: 3, gap: 3 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={{ flex: 1, aspectRatio: 1 }}
                  onPress={() => enviarGif(item.images.downsized?.url ?? item.images.fixed_height_small?.url)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: item.images.fixed_height_small?.url ?? item.images.downsized?.url }}
                    style={{ width: '100%', height: '100%', borderRadius: 6 }}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingTop: 48 }}>
                  <Text style={{ color: c.textoSuave }}>Sin resultados</Text>
                </View>
              }
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* ── Timba invite modal ── */}
      <Modal visible={mostrarTimbas} animationType="slide" transparent onRequestClose={() => setMostrarTimbas(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          onPress={() => setMostrarTimbas(false)}
        >
          <Pressable>
            <View style={[es.sheet, { backgroundColor: c.fondoCard, paddingBottom: Math.max(insets.bottom, 20) }]}>
              <View style={{ width: 36, height: 4, backgroundColor: c.borde, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
              <Text style={[es.sheetTitulo, { color: c.texto }]}>Invitar a una Timba</Text>
              {timbas.length === 0 ? (
                <Text style={{ color: c.textoSuave, textAlign: 'center', paddingVertical: 24 }}>
                  No tenés Timbas activas
                </Text>
              ) : (
                timbas.map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={[es.timbaRow, { borderColor: c.borde }]}
                    onPress={() => enviarInvitacion(t)}
                    activeOpacity={0.7}
                  >
                    <AppIcon name="timba" size={20} />
                    <Text style={{ flex: 1, color: c.texto, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
                      {t.titulo}
                    </Text>
                    <Text style={{ color: c.primario, fontWeight: '600', fontSize: 13 }}>Invitar →</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Truco invite modal ── */}
      <Modal visible={mostrarTruco} animationType="slide" transparent onRequestClose={() => setMostrarTruco(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          onPress={() => setMostrarTruco(false)}
        >
          <Pressable>
            <View style={[es.sheet, { backgroundColor: c.fondoCard, paddingBottom: Math.max(insets.bottom, 20) }]}>
              <View style={{ width: 36, height: 4, backgroundColor: c.borde, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
              <Text style={[es.sheetTitulo, { color: c.texto }]}>Invitar al Truco</Text>
              <Text style={{ color: c.textoSuave, fontSize: 13, marginBottom: 8 }}>
                Elegí las reglas y le llega la invitación al chat
              </Text>
              <TouchableOpacity
                style={[es.timbaRow, { borderColor: c.borde }]}
                onPress={() => enviarInvitacionTruco(true)}
                activeOpacity={0.7}
              >
                <AppIcon name="machoEspada" size={20} color={c.primario} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.texto, fontWeight: '700', fontSize: 15 }}>Con flor</Text>
                  <Text style={{ color: c.textoSuave, fontSize: 12 }}>Se juega con flor y contraflor</Text>
                </View>
                <Text style={{ color: c.primario, fontWeight: '600', fontSize: 13 }}>Invitar →</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[es.timbaRow, { borderColor: c.borde }]}
                onPress={() => enviarInvitacionTruco(false)}
                activeOpacity={0.7}
              >
                <AppIcon name="machoEspada" size={20} color={c.textoSuave} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.texto, fontWeight: '700', fontSize: 15 }}>Sin flor</Text>
                  <Text style={{ color: c.textoSuave, fontSize: 12 }}>Clásico, sin flor</Text>
                </View>
                <Text style={{ color: c.primario, fontWeight: '600', fontSize: 13 }}>Invitar →</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 3-dot Menu ── */}
      <Modal visible={mostrarMenu} animationType="fade" transparent onRequestClose={() => setMostrarMenu(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          onPress={() => setMostrarMenu(false)}
        >
          <Pressable>
            <View style={[es.sheet, { backgroundColor: c.fondoCard, paddingBottom: Math.max(insets.bottom, 20) }]}>
              <View style={{ width: 36, height: 4, backgroundColor: c.borde, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />

              <TouchableOpacity
                style={[es.menuOpt, { borderColor: c.borde }]}
                onPress={() => { setMostrarMenu(false); router.push(`/usuario/${amigoId}`) }}
                activeOpacity={0.7}
              >
                <Text style={{ color: c.texto, fontSize: 16 }}>Ver perfil de {amigo?.nombre}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[es.menuOpt, { borderColor: c.borde }]}
                onPress={() => {
                  setMostrarMenu(false)
                  Alert.alert('Silenciar', 'Las notificaciones de este chat se pueden gestionar desde la pantalla de amigos.')
                }}
                activeOpacity={0.7}
              >
                <Text style={{ color: c.texto, fontSize: 16 }}>Silenciar notificaciones</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[es.menuOpt, { borderColor: c.borde }]}
                onPress={() => { setMostrarMenu(false); setConfirmReportar(true) }}
                activeOpacity={0.7}
              >
                <Text style={{ color: c.advertencia, fontSize: 16 }}>Reportar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[es.menuOpt, { borderColor: c.borde }]}
                onPress={() => { setMostrarMenu(false); setConfirmBloquear(true) }}
                activeOpacity={0.7}
              >
                <Text style={{ color: c.error, fontSize: 16 }}>Bloquear</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <ConfirmacionModal
        visible={confirmBloquear}
        onClose={() => setConfirmBloquear(false)}
        onConfirmar={async () => {
          setConfirmBloquear(false)
          const { error } = await supabase.from('bloqueados').insert({ bloqueador_id: myId, bloqueado_id: amigoId })
          if (error) {
            // La BD rechaza el bloqueo si hay deudas pendientes entre ambos
            Alert.alert('No se pudo bloquear', mensajeError(error))
            return
          }
          // La amistad se conserva: al desbloquear vuelve todo a la normalidad
          setBloqueo('bloqueaste')
        }}
        titulo="Bloquear usuario"
        descripcion={`¿Querés bloquear a ${amigo?.nombre ?? ''}? No van a poder chatear ni invitarse a jugar mientras dure el bloqueo. La amistad se conserva y al desbloquear vuelve todo a la normalidad.`}
        nombre={amigo?.nombre ?? ''}
        avatar_url={amigo?.avatar_url}
        labelConfirmar="Bloquear"
        icono="bloquear"
      />

      <ConfirmacionModal
        visible={confirmReportar}
        onClose={() => setConfirmReportar(false)}
        onConfirmar={async () => {
          setConfirmReportar(false)
          await supabase.from('reportes').insert({
            reportador_id: myId,
            reportado_id: amigoId,
            motivo: 'Reportado desde chat',
          })
          setToast({ titulo: 'Reporte enviado', subtitulo: 'Gracias, lo revisaremos pronto.' })
        }}
        titulo="Reportar"
        descripcion={`¿Querés reportar a ${amigo?.nombre ?? ''}?`}
        nombre={amigo?.nombre ?? ''}
        labelConfirmar="Reportar"
        icono="reportar"
      />

      <Toast
        visible={!!toast}
        titulo={toast?.titulo ?? ''}
        subtitulo={toast?.subtitulo}
        onHide={() => setToast(null)}
      />
    </SafeAreaView>
  )
}

// ─── BurbujaMensaje ───────────────────────────────────────────────────────────

function BurbujaMensaje({ m, mio, hora, myId, seleccionado, modoSeleccion, onPress, onLongPress, onReaccion, c }: {
  m: Mensaje
  mio: boolean
  hora: string
  myId: string
  seleccionado: boolean
  modoSeleccion: boolean
  onPress: () => void
  onLongPress: () => void
  onReaccion: (emoji: string) => void
  c: ColoresTema
}) {
  const reaccionesMap = m.reacciones.reduce((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  const miBurbuja = mio
    ? { backgroundColor: c.primario, borderBottomRightRadius: 4 }
    : { backgroundColor: c.fondoCard, borderColor: c.borde, borderWidth: 1, borderBottomLeftRadius: 4 }

  return (
    <Pressable
      onPress={modoSeleccion ? onPress : undefined}
      style={[
        { marginBottom: 6 },
        seleccionado && { backgroundColor: 'rgba(100,160,255,0.15)', marginHorizontal: -14, paddingHorizontal: 14 },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* Checkbox en modo selección */}
        {modoSeleccion && (
          <View style={{ width: 36, alignItems: 'center', justifyContent: 'center' }}>
            <View style={[
              { width: 22, height: 22, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
              seleccionado
                ? { borderColor: c.primario, backgroundColor: c.primario }
                : { borderColor: c.textoSuave, backgroundColor: 'transparent' },
            ]}>
              {seleccionado && <Text style={{ color: c.fondo, fontSize: 12, fontWeight: '800' }}>✓</Text>}
            </View>
          </View>
        )}

        <View style={{ flex: 1, alignItems: mio ? 'flex-end' : 'flex-start' }}>
          <TouchableOpacity
            onPress={modoSeleccion ? onPress : undefined}
            onLongPress={onLongPress}
            delayLongPress={400}
            activeOpacity={modoSeleccion ? 0.7 : 0.85}
            style={[
              {
                maxWidth: '78%', borderRadius: 18,
                padding: m.tipo === 'texto' ? 10 : 4,
              },
              miBurbuja,
              (m.tipo === 'invitacion_timba' || m.tipo === 'invitacion_poker' || m.tipo === 'invitacion_truco' || m.tipo === 'invitacion_blackjack') && { padding: 10 },
            ]}
          >
            {m.tipo === 'texto' && (
              <Text style={{ color: mio ? c.fondo : c.texto, fontSize: 15, lineHeight: 21 }}>
                {m.contenido}
              </Text>
            )}

            {m.tipo === 'imagen' && m.imagen_url && (
              <Image
                source={{ uri: m.imagen_url }}
                style={{ width: 220, height: 220, borderRadius: 14 }}
                resizeMode="cover"
              />
            )}

            {m.tipo === 'gif' && m.gif_url && (
              <Image
                source={{ uri: m.gif_url }}
                style={{ width: 200, height: 160, borderRadius: 12 }}
                resizeMode="cover"
              />
            )}

            {m.tipo === 'invitacion_poker' && (() => {
              let config = { modo: 'vivo', jugadores: 2, limite: 'sinLimite', fichas: 5000, hostId: '', hostNombre: '' }
              try { Object.assign(config, JSON.parse(m.contenido ?? '{}')) } catch {}
              const limiteLabel: Record<string, string> = { limitadas: 'Limitadas', bote: 'Al bote', sinLimite: 'Sin límite' }
              const modoLabel: Record<string, string> = { turno: 'Turno', vivo: 'En vivo' }
              const resumen = `${limiteLabel[config.limite] ?? config.limite} · ${config.fichas.toLocaleString('es-AR')} fichas · ${modoLabel[config.modo] ?? config.modo}`
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: 240 }}>
                  <AppIcon name="poker" size={26} color={mio ? c.fondoCard : c.primario} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: mio ? c.fondo : c.texto, fontWeight: '800', fontSize: 14 }}>
                      Sala de Póker
                    </Text>
                    <Text style={{ color: mio ? c.primarioSuave : c.textoSuave, fontSize: 12 }} numberOfLines={1}>
                      {resumen}
                    </Text>
                  </View>
                  {!mio && (
                    <TouchableOpacity
                      style={{
                        backgroundColor: c.primario,
                        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
                      }}
                      onPress={() => router.push({
                        pathname: '/juegos/sala-poker',
                        params: {
                          amigo: config.hostNombre,
                          amigoId: config.hostId,
                          modo: config.modo,
                          jugadores: String(config.jugadores),
                          limite: config.limite,
                          fichas: String(config.fichas),
                          modo_sala: 'invitado',
                        },
                      } as any)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: c.fondo, fontSize: 13, fontWeight: '700' }}>Unirse</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            })()}

            {m.tipo === 'invitacion_truco' && (() => {
              let conFlor = false
              try { conFlor = !!JSON.parse(m.contenido ?? '{}').conFlor } catch {}
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: 230 }}>
                  <AppIcon name="machoEspada" size={26} color={mio ? c.fondoCard : c.primario} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: mio ? c.fondo : c.texto, fontWeight: '800', fontSize: 14 }}>
                      Partida de Truco
                    </Text>
                    <Text style={{ color: mio ? c.primarioSuave : c.textoSuave, fontSize: 12 }}>
                      {conFlor ? 'Con flor' : 'Sin flor'} · Invitación
                    </Text>
                  </View>
                  {!mio && (
                    <TouchableOpacity
                      style={{
                        backgroundColor: c.primario,
                        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
                      }}
                      onPress={() => router.push('/juegos/truco-juego' as any)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: c.fondo, fontSize: 13, fontWeight: '700' }}>Jugar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            })()}

            {m.tipo === 'invitacion_blackjack' && (() => {
              let cfg = { fichas: 5000, hostId: '', hostNombre: '' }
              try { Object.assign(cfg, JSON.parse(m.contenido ?? '{}')) } catch {}
              const resumen = `${cfg.fichas.toLocaleString('es-AR')} fichas · Banca rotativa`
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: 240 }}>
                  <AppIcon name="poker" size={26} color={mio ? c.fondoCard : c.primario} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: mio ? c.fondo : c.texto, fontWeight: '800', fontSize: 14 }}>
                      Blackjack
                    </Text>
                    <Text style={{ color: mio ? c.primarioSuave : c.textoSuave, fontSize: 12 }} numberOfLines={1}>
                      {resumen}
                    </Text>
                  </View>
                  {!mio && (
                    <TouchableOpacity
                      style={{
                        backgroundColor: c.primario,
                        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
                      }}
                      onPress={() => router.push({
                        pathname: '/juegos/sala-blackjack',
                        params: {
                          amigo: cfg.hostNombre || 'Amigo',
                          amigoId: cfg.hostId || m.emisor_id,
                          fichas: String(cfg.fichas),
                          modo_sala: 'invitado',
                        },
                      } as any)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: c.fondo, fontSize: 13, fontWeight: '700' }}>Unirse</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            })()}

            {m.tipo === 'invitacion_timba' && (() => {
              let titulo = 'Timba'
              let codigo = ''
              try {
                const p = JSON.parse(m.contenido ?? '{}')
                titulo = p.titulo ?? 'Timba'
                codigo = p.codigo ?? ''
              } catch {}
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: 220 }}>
                  <AppIcon name="timba" size={26} color={mio ? c.fondoCard : c.primario} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: mio ? c.fondo : c.texto, fontWeight: '800', fontSize: 14 }} numberOfLines={2}>
                      {titulo}
                    </Text>
                    <Text style={{ color: mio ? c.primarioSuave : c.textoSuave, fontSize: 12 }}>
                      Invitación a Timba
                    </Text>
                  </View>
                  {codigo ? (
                    <TouchableOpacity
                      style={{
                        backgroundColor: mio ? 'rgba(255,255,255,0.2)' : c.primario,
                        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
                      }}
                      onPress={() => router.push(`/join/${codigo}` as any)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: c.fondo, fontSize: 13, fontWeight: '700' }}>
                        Unirse
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )
            })()}

            <Text style={{
              color: mio ? c.fondo + 'AA' : c.textoSuave,
              fontSize: 10,
              alignSelf: 'flex-end',
              marginTop: m.tipo === 'texto' ? 3 : 4,
              paddingHorizontal: m.tipo !== 'texto' ? 4 : 0,
              paddingBottom: m.tipo !== 'texto' ? 2 : 0,
            }}>
              {hora}{mio && (m.leido ? ' ✓✓' : ' ✓')}
            </Text>
          </TouchableOpacity>

          {Object.entries(reaccionesMap).length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
              {Object.entries(reaccionesMap).map(([emoji, count]) => (
                <TouchableOpacity
                  key={emoji}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: c.fondoInput, borderColor: c.borde, borderWidth: 1,
                    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 12,
                  }}
                  onPress={() => onReaccion(emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13 }}>{emoji}</Text>
                  {count > 1 && (
                    <Text style={{ color: c.textoSuave, fontSize: 11, marginLeft: 3 }}>{count}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  )
}

// ─── AvatarComp ───────────────────────────────────────────────────────────────

function AvatarComp({ u, size, c }: { u: UsuarioSimple | null; size: number; c: ColoresTema }) {
  if (!u) return null
  return u.avatar_url
    ? <Image source={{ uri: u.avatar_url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    : <View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: c.primario + '2A',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ color: c.primario, fontSize: size * 0.38, fontWeight: '800' }}>
          {(u.nombre?.[0] ?? '?').toUpperCase()}
        </Text>
      </View>
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 14, paddingVertical: 10,
      borderBottomWidth: 1, gap: 8,
    },
    headerNombre: { fontSize: 16, fontWeight: '700' },
    inputBar: {
      flexDirection: 'row', alignItems: 'flex-end',
      paddingHorizontal: 10, paddingTop: 8,
      borderTopWidth: 1, gap: 6,
    },
    inputTexto: {
      flex: 1, borderRadius: 22,
      paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10,
      fontSize: 15, maxHeight: 120, minHeight: 40,
    },
    btnEnviar: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center', marginBottom: 2,
    },
    seleccionBar: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14, paddingVertical: 10,
      borderBottomWidth: 1,
    },
    checkboxBase: {
      width: 22, height: 22, borderRadius: 4, borderWidth: 2,
      alignItems: 'center', justifyContent: 'center',
    },
    menuContexto: {
      borderRadius: 18,
      overflow: 'hidden',
      shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
      elevation: 12,
    },
    menuCtxOpt: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 18, paddingVertical: 15,
      gap: 12, borderBottomWidth: 1,
    },
    menuCtxEmojis: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-evenly',
      paddingVertical: 8, paddingHorizontal: 6,
      borderTopWidth: 1, borderBottomWidth: 1,
    },
    emojiExtraBtn: {
      width: 34, height: 34, borderRadius: 17,
      alignItems: 'center', justifyContent: 'center',
    },
    editPreview: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 4,
      paddingVertical: 10, marginBottom: 8, borderBottomWidth: 1,
      minHeight: 52,
    },
    modalHeader: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1,
    },
    tab: { paddingVertical: 8, paddingHorizontal: 4 },
    giphySearch: { borderRadius: 12 },
    sheet: {
      borderTopLeftRadius: 22, borderTopRightRadius: 22,
      padding: 20,
    },
    sheetTitulo: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
    timbaRow: {
      flexDirection: 'row', alignItems: 'center',
      gap: 12, paddingVertical: 14, borderTopWidth: 1,
    },
    menuOpt: { paddingVertical: 15, borderTopWidth: 1 },
  })
}
