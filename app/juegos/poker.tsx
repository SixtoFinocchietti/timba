import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  TextInput, FlatList, ScrollView, ActivityIndicator,
  Pressable, Alert,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { AppIcon } from '@/components/ui/AppIcon'

type Modo = 'turno' | 'vivo'
type Limite = 'limitadas' | 'bote' | 'sinLimite'
type FichasVal = 5000 | 10000 | 20000

type Amigo = { id: string; nombre: string }

type InvPoker = {
  id: string
  emisor_id: string
  contenido: string
  created_at: string
  emisorNombre: string
}

const INV_LIMITE_LABELS: Record<string, string> = { limitadas: 'Limitadas', bote: 'Al bote', sinLimite: 'Sin límite' }
const INV_MODO_LABELS: Record<string, string> = { turno: 'Turno', vivo: 'En vivo' }

export default function PokerConfig() {
  const c = useColores()
  const es = makeEstilos(c)
  const { usuario } = useAuthStore()

  const [modo, setModo] = useState<Modo>('vivo')
  const [jugadores, setJugadores] = useState(2)
  const [limite, setLimite] = useState<Limite>('sinLimite')
  const [fichas, setFichas] = useState<FichasVal>(5000)

  const [sheetVisible, setSheetVisible] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [amigos, setAmigos] = useState<Amigo[]>([])
  const [cargando, setCargando] = useState(false)
  const [seleccionado, setSeleccionado] = useState<Amigo | null>(null)
  const [invitaciones, setInvitaciones] = useState<InvPoker[]>([])

  useEffect(() => {
    if (!usuario?.id) return
    cargarInvitaciones()
    const canal = supabase
      .channel(`poker-lobby-${usuario.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensajes',
        filter: `receptor_id=eq.${usuario.id}`,
      }, (payload: any) => {
        if (payload.new?.tipo === 'invitacion_poker') cargarInvitaciones()
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [usuario?.id])

  async function cargarInvitaciones() {
    if (!usuario?.id) return
    const hace48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const { data: msgs } = await supabase
      .from('mensajes')
      .select('id, emisor_id, contenido, created_at')
      .eq('receptor_id', usuario.id)
      .eq('tipo', 'invitacion_poker')
      .gte('created_at', hace48h)
      .order('created_at', { ascending: false })
      .limit(5)

    if (!msgs?.length) { setInvitaciones([]); return }

    const emisorIds = [...new Set((msgs as any[]).map((m: any) => m.emisor_id))]
    const { data: users } = await supabase
      .from('usuarios_publicos')
      .select('id, nombre')
      .in('id', emisorIds)

    const nameMap: Record<string, string> = Object.fromEntries(
      (users ?? []).map((u: any) => [u.id, u.nombre])
    )
    setInvitaciones((msgs as any[]).map((m: any) => ({
      ...m,
      emisorNombre: nameMap[m.emisor_id] ?? 'Amigo',
    })))
  }

  async function cargarAmigos() {
    if (!usuario?.id) return
    setCargando(true)
    const [{ data }, { data: bloqueadosData }] = await Promise.all([
      supabase
        .from('amistades')
        .select(`
          id,
          solicitante:usuarios_publicos!amistades_solicitante_id_fkey(id, nombre),
          receptor:usuarios_publicos!amistades_receptor_id_fkey(id, nombre)
        `)
        .eq('estado', 'aceptada')
        .or(`solicitante_id.eq.${usuario.id},receptor_id.eq.${usuario.id}`),
      supabase.from('bloqueados').select('bloqueado_id').eq('bloqueador_id', usuario.id),
    ])
    const bloqueados = new Set((bloqueadosData ?? []).map((b: any) => b.bloqueado_id as string))
    const lista: Amigo[] = (data ?? []).map((a: any) => {
      const esSolicitante = a.solicitante.id === usuario.id
      return esSolicitante ? a.receptor : a.solicitante
    }).filter((a: Amigo) => !bloqueados.has(a.id))
    lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    setAmigos(lista)
    setCargando(false)
  }

  function abrirSheet() {
    setSeleccionado(null)
    setBusqueda('')
    setSheetVisible(true)
    cargarAmigos()
  }

  async function crearSala() {
    if (!seleccionado || !usuario?.id) return
    setSheetVisible(false)

    const contenido = JSON.stringify({
      modo,
      jugadores,
      limite,
      fichas,
      hostId: usuario.id,
      hostNombre: usuario.nombre ?? '',
    })
    const { error } = await supabase.from('mensajes').insert({
      emisor_id: usuario.id,
      receptor_id: seleccionado.id,
      tipo: 'invitacion_poker',
      contenido,
    })

    if (error) {
      Alert.alert('Error', 'No se pudo enviar la invitación. Probá de nuevo.')
      return
    }

    router.push({
      pathname: '/juegos/sala-poker',
      params: {
        amigo: seleccionado.nombre,
        amigoId: seleccionado.id,
        modo,
        jugadores: String(jugadores),
        limite,
        fichas: String(fichas),
        modo_sala: 'host',
      },
    })
  }

  const amigosFiltrados = busqueda.trim()
    ? amigos.filter(a => a.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : amigos

  const MODOS: { valor: Modo; label: string }[] = [
    { valor: 'turno', label: 'Basado en turnos' },
    { valor: 'vivo', label: 'En vivo' },
  ]
  const LIMITES: { valor: Limite; label: string }[] = [
    { valor: 'limitadas', label: 'Limitadas' },
    { valor: 'bote', label: 'Al bote' },
    { valor: 'sinLimite', label: 'Sin límite' },
  ]
  const FICHAS: { valor: FichasVal; label: string }[] = [
    { valor: 5000, label: '5.000' },
    { valor: 10000, label: '10.000' },
    { valor: 20000, label: '20.000' },
  ]

  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <View style={es.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={12}>
          <Text style={[es.volver, { color: c.primario }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[es.titulo, { color: c.texto }]}>Nueva sala</Text>
        <View style={{ width: 18 }} />
      </View>

      <ScrollView style={es.scroll} showsVerticalScrollIndicator={false}>
        {invitaciones.length > 0 && (
          <>
            <View style={es.seccion}>
              <Text style={[es.seccionLabel, { color: c.textoSuave }]}>Te invitaron a jugar</Text>
              <View style={{ gap: 10 }}>
                {invitaciones.map(inv => {
                  let cfg = { modo: 'vivo', jugadores: 2, limite: 'sinLimite', fichas: 5000, hostId: '', hostNombre: '' }
                  try { Object.assign(cfg, JSON.parse(inv.contenido ?? '{}')) } catch {}
                  const resumen = `${INV_LIMITE_LABELS[cfg.limite] ?? cfg.limite} · ${cfg.fichas.toLocaleString('es-AR')} fichas · ${INV_MODO_LABELS[cfg.modo] ?? cfg.modo}`
                  const inicial = (inv.emisorNombre?.[0] ?? '?').toUpperCase()
                  return (
                    <View key={inv.id} style={[es.invCard, { backgroundColor: 'rgba(201,168,76,0.08)', borderColor: c.primario }]}>
                      <View style={[es.invAvatar, { backgroundColor: c.primario }]}>
                        <Text style={{ color: c.fondo, fontWeight: '800', fontSize: 17 }}>{inicial}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: c.texto, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
                          {inv.emisorNombre}
                        </Text>
                        <Text style={{ color: c.textoSuave, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                          {resumen}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={{ backgroundColor: c.primario, borderRadius: 11, paddingVertical: 9, paddingHorizontal: 16 }}
                        onPress={() => router.push({
                          pathname: '/juegos/sala-poker',
                          params: {
                            amigo: cfg.hostNombre || inv.emisorNombre,
                            amigoId: cfg.hostId || inv.emisor_id,
                            modo: cfg.modo,
                            jugadores: String(cfg.jugadores),
                            limite: cfg.limite,
                            fichas: String(cfg.fichas),
                            modo_sala: 'invitado',
                          },
                        } as any)}
                        activeOpacity={0.8}
                      >
                        <Text style={{ color: c.fondo, fontWeight: '800', fontSize: 14 }}>Unirse</Text>
                      </TouchableOpacity>
                    </View>
                  )
                })}
              </View>
            </View>
            <View style={[es.divider, { backgroundColor: c.borde }]} />
          </>
        )}

        <View style={es.seccion}>
          <Text style={[es.seccionTitulo, { color: c.texto }]}>Modo de Juego</Text>
          <View style={es.opcionesRow}>
            {MODOS.map(m => (
              <TouchableOpacity key={m.valor} onPress={() => setModo(m.valor)} activeOpacity={0.7}>
                <Text style={modo === m.valor
                  ? [es.opcion, es.opcionActiva, { color: c.primario }]
                  : [es.opcion, { color: c.textoSuave }]}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={[es.divider, { backgroundColor: c.borde }]} />

        <View style={es.seccion}>
          <Text style={[es.seccionTitulo, { color: c.texto }]}>Número de jugadores</Text>
          <View style={es.opcionesRow}>
            {[2, 3, 4, 5, 6].map(n => (
              <TouchableOpacity key={n} onPress={() => setJugadores(n)} activeOpacity={0.7}>
                <Text style={jugadores === n
                  ? [es.opcion, es.opcionActivaGrande, { color: c.primario }]
                  : [es.opcion, es.opcionGrande, { color: c.textoSuave }]}
                >
                  {n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={[es.divider, { backgroundColor: c.borde }]} />

        <View style={es.seccion}>
          <Text style={[es.seccionTitulo, { color: c.texto }]}>Límite de apuestas</Text>
          <View style={es.opcionesRow}>
            {LIMITES.map(l => (
              <TouchableOpacity key={l.valor} onPress={() => setLimite(l.valor)} activeOpacity={0.7}>
                <Text style={limite === l.valor
                  ? [es.opcion, es.opcionActiva, { color: c.primario }]
                  : [es.opcion, { color: c.textoSuave }]}
                >
                  {l.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={[es.divider, { backgroundColor: c.borde }]} />

        <View style={es.seccion}>
          <Text style={[es.seccionTitulo, { color: c.texto }]}>Fichas iniciales</Text>
          <View style={es.opcionesRow}>
            {FICHAS.map(f => (
              <TouchableOpacity key={f.valor} onPress={() => setFichas(f.valor)} activeOpacity={0.7}>
                <Text style={fichas === f.valor
                  ? [es.opcion, es.opcionActivaGrande, { color: c.primario }]
                  : [es.opcion, es.opcionGrande, { color: c.textoSuave }]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={[es.footer, { backgroundColor: c.fondo }]}>
        <TouchableOpacity
          style={[es.botonPrimario, { backgroundColor: c.primario }]}
          onPress={abrirSheet}
          activeOpacity={0.85}
        >
          <AppIcon name="amigos" size={20} color={c.fondo} />
          <Text style={[es.botonTexto, { color: c.fondo }]}>Invitar amigos</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={sheetVisible}
        transparent
        statusBarTranslucent
        animationType="slide"
        onRequestClose={() => setSheetVisible(false)}
      >
        <View style={es.modalWrap}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
            onPress={() => setSheetVisible(false)}
          />
          <View style={[es.sheet, { backgroundColor: '#1A1815' }]}>
            <View style={es.handle} />

            <View style={es.sheetHeader}>
              <Text style={[es.sheetTitulo, { color: c.texto }]}>Invitar amigos</Text>
              <TouchableOpacity
                onPress={() => setSheetVisible(false)}
                activeOpacity={0.7}
                style={[es.cerrarBtn, { backgroundColor: c.fondoInput }]}
              >
                <AppIcon name="rechazar" size={13} color={c.textoSuave} />
              </TouchableOpacity>
            </View>

            <View style={[es.buscadorWrap, { backgroundColor: c.fondoInput, borderColor: c.borde }]}>
              <AppIcon name="busqueda" size={18} color={c.textoSuave} />
              <TextInput
                style={[es.buscadorInput, { color: c.texto }]}
                placeholder="Buscar amigos…"
                placeholderTextColor={c.textoSuave}
                value={busqueda}
                onChangeText={setBusqueda}
                autoCorrect={false}
              />
            </View>

            <Text style={[es.resultadosLabel, { color: c.textoSuave }]}>Resultados</Text>

            {cargando ? (
              <View style={es.loadingWrap}>
                <ActivityIndicator color={c.primario} />
              </View>
            ) : (
              <FlatList
                data={amigosFiltrados}
                keyExtractor={a => a.id}
                style={es.lista}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const activo = seleccionado?.id === item.id
                  const inicial = item.nombre.charAt(0).toUpperCase()
                  return (
                    <TouchableOpacity
                      style={[es.amigoItem, activo && { backgroundColor: c.fondoCard, borderRadius: 14 }]}
                      onPress={() => setSeleccionado(activo ? null : item)}
                      activeOpacity={0.7}
                    >
                      <View style={[es.avatar, { backgroundColor: activo ? c.primario : c.fondoInput }]}>
                        <Text style={[es.avatarTexto, { color: activo ? c.fondo : c.primario }]}>{inicial}</Text>
                      </View>
                      <Text style={[es.amigoNombre, { color: c.texto }]}>{item.nombre}</Text>
                      <View style={[es.checkCircle, activo
                        ? { backgroundColor: c.primario }
                        : { borderWidth: 1.5, borderColor: c.borde }]}
                      >
                        {activo && <AppIcon name="aceptar" size={14} color={c.fondo} />}
                      </View>
                    </TouchableOpacity>
                  )
                }}
                ListEmptyComponent={
                  <Text style={[es.vacio, { color: c.textoSuave }]}>
                    {busqueda.trim() ? 'Sin resultados' : 'No tenés amigos agregados aún'}
                  </Text>
                }
              />
            )}

            <View style={[es.sheetFooter, { borderTopColor: c.fondoCard }]}>
              <TouchableOpacity
                style={[es.botonPrimario, { backgroundColor: seleccionado ? c.primario : c.fondoInput }]}
                onPress={crearSala}
                activeOpacity={seleccionado ? 0.85 : 1}
              >
                <Text style={[es.botonTexto, { color: seleccionado ? c.fondo : c.textoSuave }]}>
                  {seleccionado ? 'Crear sala · 1 invitado' : 'Seleccioná un amigo'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 10,
    },
    volver: { fontSize: 32, fontWeight: '700', lineHeight: 36, marginRight: 4 },
    titulo: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
    scroll: { flex: 1 },
    seccion: { paddingHorizontal: 24, paddingVertical: 18 },
    seccionTitulo: { fontSize: 20, fontWeight: '600', marginBottom: 14, letterSpacing: -0.2 },
    opcionesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, alignItems: 'center' },
    opcion: { fontSize: 16, fontWeight: '500' },
    opcionActiva: { fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
    opcionGrande: { fontSize: 18 },
    opcionActivaGrande: { fontSize: 18, fontWeight: '700' },
    divider: { height: 1, marginHorizontal: 24 },
    footer: {
      paddingHorizontal: 24,
      paddingTop: 18,
      paddingBottom: 36,
    },
    botonPrimario: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      height: 58,
      borderRadius: 16,
    },
    botonTexto: { fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
    // Modal
    modalWrap: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      maxHeight: '88%',
      paddingBottom: 30,
    },
    handle: {
      width: 42, height: 5, borderRadius: 3, backgroundColor: '#3a342c',
      alignSelf: 'center', marginTop: 12, marginBottom: 4,
    },
    sheetHeader: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 24, paddingVertical: 12,
    },
    sheetTitulo: { flex: 1, fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },
    cerrarBtn: {
      width: 30, height: 30, borderRadius: 15,
      alignItems: 'center', justifyContent: 'center',
    },
    buscadorWrap: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      height: 48, borderWidth: 1, borderRadius: 14,
      marginHorizontal: 24, paddingHorizontal: 14, marginBottom: 16,
    },
    buscadorInput: { flex: 1, fontSize: 16, fontWeight: '500' },
    resultadosLabel: {
      fontSize: 12, fontWeight: '700', letterSpacing: 1.2,
      textTransform: 'uppercase', paddingHorizontal: 24, marginBottom: 4,
    },
    loadingWrap: { height: 80, alignItems: 'center', justifyContent: 'center' },
    lista: { paddingHorizontal: 16, flexGrow: 0, maxHeight: 280 },
    amigoItem: {
      flexDirection: 'row', alignItems: 'center', gap: 14, padding: 11,
    },
    avatar: {
      width: 46, height: 46, borderRadius: 23,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarTexto: { fontSize: 17, fontWeight: '700' },
    amigoNombre: { flex: 1, fontSize: 16, fontWeight: '600' },
    checkCircle: {
      width: 30, height: 30, borderRadius: 15,
      alignItems: 'center', justifyContent: 'center',
    },
    vacio: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
    sheetFooter: {
      borderTopWidth: 1, paddingHorizontal: 24, paddingTop: 14,
    },
    seccionLabel: {
      fontSize: 12, fontWeight: '700', letterSpacing: 1.5,
      textTransform: 'uppercase', marginBottom: 12,
    },
    invCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderRadius: 16, borderWidth: 1.5, padding: 12, paddingHorizontal: 14,
    },
    invAvatar: {
      width: 44, height: 44, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
  })
}
