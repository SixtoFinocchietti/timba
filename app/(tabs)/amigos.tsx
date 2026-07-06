import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Image, Alert, RefreshControl, ActivityIndicator,
  Modal, Pressable,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { mensajeError } from '@/lib/errores'
import { AppHeader } from '@/components/ui/AppHeader'
import { AppIcon } from '@/components/ui/AppIcon'
import { ConfirmacionModal } from '@/components/ui/ConfirmacionModal'
import { Toast } from '@/components/ui/Toast'

type UsuarioSimple = { id: string; nombre: string; avatar_url?: string }

type AmigoItem = {
  amistadId: string
  amigo: UsuarioSimple
  esSolicitante: boolean
  favorito: boolean
  silenciado: boolean
}

type SolicitudItem = { amistadId: string; solicitante: UsuarioSimple }

export default function Amigos() {
  const { usuario } = useAuthStore()
  const c = useColores()
  const es = makeEstilos(c)
  const userId = usuario?.id

  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<UsuarioSimple[]>([])
  const [buscando, setBuscando] = useState(false)
  const [amigos, setAmigos] = useState<AmigoItem[]>([])
  const [solicitudes, setSolicitudes] = useState<SolicitudItem[]>([])
  const [enviados, setEnviados] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(true)
  const [menuAmigo, setMenuAmigo] = useState<AmigoItem | null>(null)
  const [confirmBloquear, setConfirmBloquear] = useState<AmigoItem | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<AmigoItem | null>(null)
  const [confirmReportar, setConfirmReportar] = useState<AmigoItem | null>(null)
  const [toast, setToast] = useState<{ titulo: string; subtitulo: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useFocusEffect(
    useCallback(() => {
      cargar()
    }, [userId])
  )

  async function cargar() {
    if (!userId) return
    setCargando(true)

    // Primero cargamos la lista de amigos con la query básica (siempre funciona)
    const [{ data: aceptadas }, { data: entrantes }, { data: salientes }, { data: bloqueadosData }] = await Promise.all([
      supabase
        .from('amistades')
        .select(`
          id,
          solicitante:usuarios_publicos!amistades_solicitante_id_fkey(id, nombre, avatar_url),
          receptor:usuarios_publicos!amistades_receptor_id_fkey(id, nombre, avatar_url)
        `)
        .eq('estado', 'aceptada')
        .or(`solicitante_id.eq.${userId},receptor_id.eq.${userId}`),
      supabase
        .from('amistades')
        .select('id, solicitante:usuarios_publicos!amistades_solicitante_id_fkey(id, nombre, avatar_url)')
        .eq('receptor_id', userId)
        .eq('estado', 'pendiente'),
      supabase
        .from('amistades')
        .select('receptor_id')
        .eq('solicitante_id', userId)
        .eq('estado', 'pendiente'),
      // Bloqueados por mí: la amistad se conserva pero no se muestran en la lista
      supabase
        .from('bloqueados')
        .select('bloqueado_id')
        .eq('bloqueador_id', userId),
    ])

    const bloqueadosSet = new Set((bloqueadosData ?? []).map((b: any) => b.bloqueado_id as string))

    // Intentamos cargar las preferencias (favorito/silenciado) — solo disponibles después de correr la migración 002
    const { data: prefs } = await supabase
      .from('amistades')
      .select('id, solicitante_id, favorito_solicitante, favorito_receptor, silenciado_solicitante, silenciado_receptor')
      .eq('estado', 'aceptada')
      .or(`solicitante_id.eq.${userId},receptor_id.eq.${userId}`)

    const prefsMap = new Map((prefs ?? []).map((p: any) => [p.id as string, p]))

    const lista: AmigoItem[] = (aceptadas ?? []).filter((a: any) => {
      const otro = a.solicitante.id === userId ? a.receptor : a.solicitante
      return !bloqueadosSet.has(otro.id)
    }).map((a: any) => {
      const esSolicitante = a.solicitante.id === userId
      const pref = prefsMap.get(a.id) as any
      return {
        amistadId: a.id,
        amigo: esSolicitante ? a.receptor : a.solicitante,
        esSolicitante,
        favorito: pref
          ? (esSolicitante ? (pref.favorito_solicitante ?? false) : (pref.favorito_receptor ?? false))
          : false,
        silenciado: pref
          ? (esSolicitante ? (pref.silenciado_solicitante ?? false) : (pref.silenciado_receptor ?? false))
          : false,
      }
    })

    lista.sort((a, b) => {
      if (a.favorito !== b.favorito) return a.favorito ? -1 : 1
      return a.amigo.nombre.localeCompare(b.amigo.nombre, 'es')
    })

    setAmigos(lista)
    setSolicitudes((entrantes ?? []).map((s: any) => ({ amistadId: s.id, solicitante: s.solicitante })))
    setEnviados(new Set((salientes ?? []).map((s: any) => s.receptor_id as string)))
    setCargando(false)
  }

  function onCambioBusqueda(texto: string) {
    setBusqueda(texto)
    if (timer.current) clearTimeout(timer.current)
    if (!texto.trim()) { setResultados([]); return }
    timer.current = setTimeout(() => buscar(texto.trim()), 350)
  }

  async function buscar(texto: string) {
    if (!userId) return
    setBuscando(true)
    // Busca por nombre visible o apodo (si alguien oculta su nombre,
    // se lo puede encontrar por el apodo)
    const { data } = await supabase
      .from('usuarios_publicos')
      .select('id, nombre, avatar_url')
      .or(`nombre.ilike.%${texto}%,apodo.ilike.%${texto}%`)
      .neq('id', userId)
      .limit(20)
    setResultados(data ?? [])
    setBuscando(false)
  }

  async function enviarSolicitud(receptorId: string) {
    const { error } = await supabase
      .from('amistades')
      .insert({ solicitante_id: userId, receptor_id: receptorId })
    if (error) { Alert.alert('Error', mensajeError(error)); return }
    setEnviados(prev => new Set([...prev, receptorId]))
  }

  async function aceptar(amistadId: string) {
    await supabase.from('amistades').update({ estado: 'aceptada' }).eq('id', amistadId)
    cargar()
  }

  async function rechazar(amistadId: string) {
    await supabase.from('amistades').delete().eq('id', amistadId)
    setSolicitudes(prev => prev.filter(s => s.amistadId !== amistadId))
  }

  function eliminarAmigo(item: AmigoItem) {
    setMenuAmigo(null)
    setConfirmEliminar(item)
  }

  async function ejecutarEliminacion(item: AmigoItem) {
    setConfirmEliminar(null)
    await supabase.from('amistades').delete().eq('id', item.amistadId)
    setAmigos(prev => prev.filter(a => a.amistadId !== item.amistadId))
    setToast({ titulo: 'Amigo eliminado', subtitulo: `${item.amigo.nombre.split(' ')[0]} ya no está en tu lista.` })
  }

  async function toggleFavorito(item: AmigoItem) {
    const campo = item.esSolicitante ? 'favorito_solicitante' : 'favorito_receptor'
    const nuevoVal = !item.favorito
    await supabase.from('amistades').update({ [campo]: nuevoVal }).eq('id', item.amistadId)
    setAmigos(prev => {
      const updated = prev.map(a =>
        a.amistadId === item.amistadId ? { ...a, favorito: nuevoVal } : a
      )
      updated.sort((a, b) => {
        if (a.favorito !== b.favorito) return a.favorito ? -1 : 1
        return a.amigo.nombre.localeCompare(b.amigo.nombre, 'es')
      })
      return updated
    })
  }

  async function silenciarAmigo(item: AmigoItem) {
    const campo = item.esSolicitante ? 'silenciado_solicitante' : 'silenciado_receptor'
    const nuevoVal = !item.silenciado
    await supabase.from('amistades').update({ [campo]: nuevoVal }).eq('id', item.amistadId)
    setAmigos(prev => prev.map(a =>
      a.amistadId === item.amistadId ? { ...a, silenciado: nuevoVal } : a
    ))
    setMenuAmigo(null)
  }

  function bloquearAmigo(item: AmigoItem) {
    setMenuAmigo(null)
    setConfirmBloquear(item)
  }

  async function ejecutarBloqueo(item: AmigoItem) {
    setConfirmBloquear(null)
    const { error } = await supabase.from('bloqueados').insert({
      bloqueador_id: userId,
      bloqueado_id: item.amigo.id,
    })
    if (error) {
      // La BD rechaza el bloqueo si hay deudas pendientes entre ambos
      Alert.alert('No se pudo bloquear', mensajeError(error))
      return
    }
    // La amistad se conserva "congelada": al desbloquear vuelve todo a la normalidad
    setAmigos(prev => prev.filter(a => a.amistadId !== item.amistadId))
    setToast({ titulo: 'Usuario bloqueado', subtitulo: `Podés desbloquear a ${item.amigo.nombre.split(' ')[0]} desde tu perfil.` })
  }

  function reportarAmigo(item: AmigoItem) {
    setMenuAmigo(null)
    setConfirmReportar(item)
  }

  async function ejecutarReporte(item: AmigoItem) {
    setConfirmReportar(null)
    await supabase.from('reportes').insert({
      reportador_id: userId,
      reportado_id: item.amigo.id,
      motivo: 'Reportado desde lista de amigos',
    })
    setToast({ titulo: 'Reporte enviado', subtitulo: 'Gracias, lo revisaremos pronto.' })
  }

  const amigoIds = new Set(amigos.map(a => a.amigo.id))
  const solicitudIds = new Set(solicitudes.map(s => s.solicitante.id))

  function estadoDe(uid: string): 'amigo' | 'enviado' | 'entrante' | 'ninguno' {
    if (amigoIds.has(uid)) return 'amigo'
    if (solicitudIds.has(uid)) return 'entrante'
    if (enviados.has(uid)) return 'enviado'
    return 'ninguno'
  }

  const buscando_ = busqueda.trim().length > 0

  return (
    <View style={es.contenedor}>
      <AppHeader mostrarSaludo={false} />

      <View style={[es.searchBar, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
        <AppIcon name="busqueda" size={16} color={c.textoSuave} />
        <TextInput
          style={[es.searchInput, { color: c.texto }]}
          placeholder="Buscar usuarios..."
          placeholderTextColor={c.textoSuave}
          value={busqueda}
          onChangeText={onCambioBusqueda}
          returnKeyType="search"
          selectionColor={c.primario}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => { setBusqueda(''); setResultados([]) }}>
            <Text style={{ color: c.textoSuave, fontSize: 20, paddingHorizontal: 2 }}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {buscando_ ? (
        <View style={{ flex: 1, paddingHorizontal: 20 }}>
          {buscando
            ? <ActivityIndicator color={c.primario} style={{ marginTop: 32 }} />
            : resultados.length === 0
              ? <Text style={[es.textoVacio, { color: c.textoSuave, marginTop: 32 }]}>
                  Sin resultados para "{busqueda}"
                </Text>
              : resultados.map(u => {
                  const estado = estadoDe(u.id)
                  return (
                    <CardUsuario
                      key={u.id}
                      usuario={u}
                      estado={estado}
                      onAgregar={() => enviarSolicitud(u.id)}
                      onAceptar={() => {
                        const s = solicitudes.find(s => s.solicitante.id === u.id)
                        if (s) aceptar(s.amistadId)
                      }}
                      c={c}
                      es={es}
                    />
                  )
                })
          }
        </View>
      ) : (
        <FlatList
          data={amigos}
          keyExtractor={item => item.amistadId}
          contentContainerStyle={es.lista}
          refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={c.primario} />}
          ListHeaderComponent={
            <>
              <Text style={[es.tituloPag, { color: c.texto }]}>Amigos</Text>

              {solicitudes.length > 0 && (
                <View style={es.seccion}>
                  <View style={es.seccionHeader}>
                    <Text style={[es.seccionTitulo, { color: c.textoSuave }]}>Solicitudes</Text>
                    <View style={[es.badge, { backgroundColor: c.primario + '22' }]}>
                      <Text style={{ color: c.primario, fontSize: 12, fontWeight: '700' }}>
                        {solicitudes.length}
                      </Text>
                    </View>
                  </View>
                  {solicitudes.map(s => (
                    <CardSolicitud
                      key={s.amistadId}
                      solicitud={s}
                      onAceptar={() => aceptar(s.amistadId)}
                      onRechazar={() => rechazar(s.amistadId)}
                      c={c}
                      es={es}
                    />
                  ))}
                </View>
              )}

              {amigos.length > 0 && (
                <View style={es.seccionHeader}>
                  <Text style={[es.seccionTitulo, { color: c.textoSuave }]}>Mis amigos</Text>
                  <Text style={{ color: c.textoSuave, fontSize: 13, fontWeight: '600' }}>
                    {amigos.length}
                  </Text>
                </View>
              )}
            </>
          }
          renderItem={({ item }) => (
            <CardAmigo
              item={item}
              onChat={() => router.push(`/chat/${item.amigo.id}` as any)}
              onToggleFavorito={() => toggleFavorito(item)}
              onMenu={() => setMenuAmigo(item)}
              c={c}
              es={es}
            />
          )}
          ListEmptyComponent={
            !cargando && solicitudes.length === 0 ? (
              <View style={es.vacioCentro}>
                <AppIcon name="amigos" size={52} color={c.textoSuave} />
                <Text style={[es.vacioTitulo, { color: c.texto }]}>Sin amigos todavía</Text>
                <Text style={[es.textoVacio, { color: c.textoSuave }]}>
                  Buscá un usuario arriba para agregar
                </Text>
              </View>
            ) : null
          }
        />
      )}

      <MenuAmigo
        item={menuAmigo}
        onClose={() => setMenuAmigo(null)}
        onVerPerfil={() => {
          const item = menuAmigo
          setMenuAmigo(null)
          if (item) router.push(`/usuario/${item.amigo.id}`)
        }}
        onEliminar={() => menuAmigo && eliminarAmigo(menuAmigo)}
        onSilenciar={() => menuAmigo && silenciarAmigo(menuAmigo)}
        onBloquear={() => menuAmigo && bloquearAmigo(menuAmigo)}
        onReportar={() => menuAmigo && reportarAmigo(menuAmigo)}
        c={c}
      />

      <ConfirmacionModal
        visible={!!confirmBloquear}
        onClose={() => setConfirmBloquear(null)}
        onConfirmar={() => confirmBloquear && ejecutarBloqueo(confirmBloquear)}
        titulo="Bloquear usuario"
        descripcion={`¿Querés bloquear a ${confirmBloquear?.amigo.nombre ?? ''}? No van a poder chatear ni invitarse a jugar mientras dure el bloqueo. La amistad se conserva y al desbloquear vuelve todo a la normalidad.`}
        nombre={confirmBloquear?.amigo.nombre ?? ''}
        avatar_url={confirmBloquear?.amigo.avatar_url}
        labelConfirmar="Bloquear"
        icono="bloquear"
      />

      <ConfirmacionModal
        visible={!!confirmEliminar}
        onClose={() => setConfirmEliminar(null)}
        onConfirmar={() => confirmEliminar && ejecutarEliminacion(confirmEliminar)}
        titulo="Eliminar amigo"
        descripcion={`¿Querés eliminar a ${confirmEliminar?.amigo.nombre ?? ''} de tus amigos?`}
        nombre={confirmEliminar?.amigo.nombre ?? ''}
        avatar_url={confirmEliminar?.amigo.avatar_url}
        labelConfirmar="Eliminar"
        icono="eliminar"
      />

      <ConfirmacionModal
        visible={!!confirmReportar}
        onClose={() => setConfirmReportar(null)}
        onConfirmar={() => confirmReportar && ejecutarReporte(confirmReportar)}
        titulo="Reportar"
        descripcion={`¿Querés reportar a ${confirmReportar?.amigo.nombre ?? ''}?`}
        nombre={confirmReportar?.amigo.nombre ?? ''}
        labelConfirmar="Reportar"
        icono="reportar"
      />

      <Toast
        visible={!!toast}
        titulo={toast?.titulo ?? ''}
        subtitulo={toast?.subtitulo}
        onHide={() => setToast(null)}
        bottom={90}
      />
    </View>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function Avatar({ u, size = 46, c }: { u: UsuarioSimple; size?: number; c: ColoresTema }) {
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

function CardUsuario({ usuario: u, estado, onAgregar, onAceptar, c, es }: {
  usuario: UsuarioSimple
  estado: 'amigo' | 'enviado' | 'entrante' | 'ninguno'
  onAgregar: () => void
  onAceptar: () => void
  c: ColoresTema
  es: ReturnType<typeof makeEstilos>
}) {
  return (
    <View style={[es.card, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
      <TouchableOpacity
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        onPress={() => router.push(`/usuario/${u.id}`)}
        activeOpacity={0.7}
      >
        <Avatar u={u} c={c} />
        <Text style={[es.nombre, { color: c.texto }]} numberOfLines={1}>{u.nombre}</Text>
      </TouchableOpacity>
      {estado === 'amigo' && (
        <View style={[es.pill, { backgroundColor: c.primario + '22' }]}>
          <Text style={{ color: c.primario, fontSize: 13, fontWeight: '600' }}>Amigos ✓</Text>
        </View>
      )}
      {estado === 'enviado' && (
        <View style={[es.pill, { backgroundColor: c.fondoInput }]}>
          <Text style={{ color: c.textoSuave, fontSize: 13, fontWeight: '600' }}>Enviado</Text>
        </View>
      )}
      {estado === 'entrante' && (
        <TouchableOpacity style={[es.pill, { backgroundColor: c.primario }]} onPress={onAceptar} activeOpacity={0.8}>
          <Text style={{ color: c.fondo, fontSize: 13, fontWeight: '700' }}>Aceptar</Text>
        </TouchableOpacity>
      )}
      {estado === 'ninguno' && (
        <TouchableOpacity style={[es.pill, { backgroundColor: c.primario }]} onPress={onAgregar} activeOpacity={0.8}>
          <Text style={{ color: c.fondo, fontSize: 13, fontWeight: '700' }}>+ Agregar</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

function CardSolicitud({ solicitud: s, onAceptar, onRechazar, c, es }: {
  solicitud: SolicitudItem
  onAceptar: () => void
  onRechazar: () => void
  c: ColoresTema
  es: ReturnType<typeof makeEstilos>
}) {
  return (
    <View style={[es.card, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
      <Avatar u={s.solicitante} c={c} />
      <View style={{ flex: 1 }}>
        <Text style={[es.nombre, { color: c.texto }]} numberOfLines={1}>{s.solicitante.nombre}</Text>
        <Text style={{ color: c.textoSuave, fontSize: 12, marginTop: 2 }}>Te envió una solicitud</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          style={[es.btnMini, { backgroundColor: c.error + '18', borderColor: c.error + '44' }]}
          onPress={onRechazar}
          activeOpacity={0.8}
        >
          <AppIcon name="rechazar" size={16} color={c.error} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[es.btnMini, { backgroundColor: c.primario }]}
          onPress={onAceptar}
          activeOpacity={0.8}
        >
          <AppIcon name="aceptar" size={16} color={c.fondo} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

function CardAmigo({ item, onChat, onToggleFavorito, onMenu, c, es }: {
  item: AmigoItem
  onChat: () => void
  onToggleFavorito: () => void
  onMenu: () => void
  c: ColoresTema
  es: ReturnType<typeof makeEstilos>
}) {
  return (
    <View style={[es.card, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
      <TouchableOpacity
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        onPress={onChat}
        activeOpacity={0.7}
      >
        <Avatar u={item.amigo} c={c} />
        <View style={{ flex: 1 }}>
          <Text style={[es.nombre, { color: c.texto }]} numberOfLines={1}>{item.amigo.nombre}</Text>
          {item.silenciado && (
            <Text style={{ color: c.textoSuave, fontSize: 11, marginTop: 1 }}>🔕 Silenciado</Text>
          )}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onToggleFavorito}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 4 }}
        activeOpacity={0.6}
      >
        <AppIcon name={item.favorito ? 'favoritoLleno' : 'favoritoVacio'} size={18} color={c.primario} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onMenu}
        hitSlop={{ top: 12, bottom: 12, left: 4, right: 16 }}
        activeOpacity={0.6}
      >
        <Text style={{ color: c.textoSuave, fontSize: 20, letterSpacing: 1, marginLeft: 4 }}>···</Text>
      </TouchableOpacity>
    </View>
  )
}

function MenuAmigo({ item, onClose, onVerPerfil, onEliminar, onSilenciar, onBloquear, onReportar, c }: {
  item: AmigoItem | null
  onClose: () => void
  onVerPerfil: () => void
  onEliminar: () => void
  onSilenciar: () => void
  onBloquear: () => void
  onReportar: () => void
  c: ColoresTema
}) {
  return (
    <Modal visible={!!item} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable>
          <View style={{
            backgroundColor: c.fondoCard,
            borderTopLeftRadius: 22, borderTopRightRadius: 22,
            padding: 20, paddingBottom: 36,
          }}>
            <View style={{ width: 36, height: 4, backgroundColor: c.borde, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
            {item && (
              <Text style={{ color: c.texto, fontWeight: '800', fontSize: 17, marginBottom: 4 }}>{item.amigo.nombre}</Text>
            )}

            <TouchableOpacity
              style={{ paddingVertical: 15, borderTopWidth: 1, borderColor: c.borde }}
              onPress={onVerPerfil}
              activeOpacity={0.7}
            >
              <Text style={{ color: c.texto, fontSize: 16 }}>Ver perfil</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ paddingVertical: 15, borderTopWidth: 1, borderColor: c.borde }}
              onPress={onSilenciar}
              activeOpacity={0.7}
            >
              <Text style={{ color: c.texto, fontSize: 16 }}>
                {item?.silenciado ? 'Activar notificaciones' : 'Silenciar notificaciones'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ paddingVertical: 15, borderTopWidth: 1, borderColor: c.borde }}
              onPress={onEliminar}
              activeOpacity={0.7}
            >
              <Text style={{ color: c.error, fontSize: 16 }}>Eliminar amigo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ paddingVertical: 15, borderTopWidth: 1, borderColor: c.borde }}
              onPress={onBloquear}
              activeOpacity={0.7}
            >
              <Text style={{ color: c.error, fontSize: 16 }}>Bloquear</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ paddingVertical: 15, borderTopWidth: 1, borderColor: c.borde }}
              onPress={onReportar}
              activeOpacity={0.7}
            >
              <Text style={{ color: c.advertencia, fontSize: 16 }}>Reportar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: c.fondo },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 20,
      marginBottom: 16,
      borderRadius: 14,
      paddingHorizontal: 14,
      borderWidth: 1,
      height: 48,
      gap: 8,
    },
    searchIcono: { fontSize: 15 },
    searchInput: { flex: 1, fontSize: 15, height: 48 },
    lista: { paddingHorizontal: 20, paddingBottom: 48 },
    tituloPag: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginBottom: 20 },
    seccion: { marginBottom: 20 },
    seccionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    seccionTitulo: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      flex: 1,
    },
    badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      marginBottom: 8,
    },
    nombre: { fontSize: 15, fontWeight: '700' },
    pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
    btnMini: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    vacioCentro: { alignItems: 'center', justifyContent: 'center', paddingTop: 64, gap: 10 },
    vacioTitulo: { fontSize: 18, fontWeight: '700' },
    textoVacio: { fontSize: 14, textAlign: 'center' },
  })
}
