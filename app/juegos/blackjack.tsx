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

type FichasVal = 5000 | 10000 | 20000

type Amigo = { id: string; nombre: string }

type InvBlackjack = {
  id: string
  emisor_id: string
  contenido: string
  created_at: string
  emisorNombre: string
}

export default function BlackjackConfig() {
  const c = useColores()
  const es = makeEstilos(c)
  const { usuario } = useAuthStore()

  const [fichas, setFichas] = useState<FichasVal>(5000)
  const [corona, setCorona] = useState(true)
  const [coronaPct, setCoronaPct] = useState(25)
  const [infoCorona, setInfoCorona] = useState(false)

  const [sheetVisible, setSheetVisible] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [amigos, setAmigos] = useState<Amigo[]>([])
  const [cargando, setCargando] = useState(false)
  const [seleccionado, setSeleccionado] = useState<Amigo | null>(null)
  const [invitaciones, setInvitaciones] = useState<InvBlackjack[]>([])

  useEffect(() => {
    if (!usuario?.id) return
    cargarInvitaciones()
    const canal = supabase
      .channel(`blackjack-lobby-${usuario.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensajes',
        filter: `receptor_id=eq.${usuario.id}`,
      }, (payload: any) => {
        if (payload.new?.tipo === 'invitacion_blackjack') cargarInvitaciones()
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
      .eq('tipo', 'invitacion_blackjack')
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
      fichas,
      corona,
      coronaPct,
      hostId: usuario.id,
      hostNombre: usuario.nombre ?? '',
    })
    const { error } = await supabase.from('mensajes').insert({
      emisor_id: usuario.id,
      receptor_id: seleccionado.id,
      tipo: 'invitacion_blackjack',
      contenido,
    })

    if (error) {
      Alert.alert('Error', 'No se pudo enviar la invitación. Probá de nuevo.')
      return
    }

    router.push({
      pathname: '/juegos/sala-blackjack',
      params: {
        amigo: seleccionado.nombre,
        amigoId: seleccionado.id,
        fichas: String(fichas),
        corona: corona ? '1' : '0',
        coronaPct: String(coronaPct),
        modo_sala: 'host',
      },
    } as any)
  }

  const amigosFiltrados = busqueda.trim()
    ? amigos.filter(a => a.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : amigos

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
        <Text style={[es.titulo, { color: c.texto }]}>Nueva mesa</Text>
        <View style={{ width: 18 }} />
      </View>

      <ScrollView style={es.scroll} showsVerticalScrollIndicator={false}>
        {invitaciones.length > 0 && (
          <>
            <View style={es.seccion}>
              <Text style={[es.seccionLabel, { color: c.textoSuave }]}>Te invitaron a jugar</Text>
              <View style={{ gap: 10 }}>
                {invitaciones.map(inv => {
                  let cfg = { fichas: 5000, corona: true, coronaPct: 25, hostId: '', hostNombre: '' }
                  try { Object.assign(cfg, JSON.parse(inv.contenido ?? '{}')) } catch {}
                  const resumen = `${cfg.fichas.toLocaleString('es-AR')} fichas · ${cfg.corona ? `Corona ${cfg.coronaPct}%` : 'Sin corona'}`
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
                          pathname: '/juegos/sala-blackjack',
                          params: {
                            amigo: cfg.hostNombre || inv.emisorNombre,
                            amigoId: cfg.hostId || inv.emisor_id,
                            fichas: String(cfg.fichas),
                            corona: cfg.corona ? '1' : '0',
                            coronaPct: String(cfg.coronaPct),
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
        <View style={[es.divider, { backgroundColor: c.borde }]} />

        <View style={es.seccion}>
          <View style={es.coronaTituloRow}>
            <Text style={[es.seccionTitulo, { color: c.texto, marginBottom: 0 }]}>Corona</Text>
            <TouchableOpacity
              onPress={() => setInfoCorona(true)}
              hitSlop={10}
              activeOpacity={0.7}
              style={[es.infoBtn, { borderColor: c.borde }]}
            >
              <Text style={[es.infoTxt, { color: c.primario }]}>i</Text>
            </TouchableOpacity>
          </View>
          <View style={[es.coronaRow, { marginBottom: corona ? 18 : 0 }]}>
            {[{ v: true, l: 'Con corona' }, { v: false, l: 'Sin corona' }].map(o => {
              const activo = corona === o.v
              return (
                <TouchableOpacity
                  key={o.l}
                  onPress={() => setCorona(o.v)}
                  activeOpacity={0.8}
                  style={[es.coronaPill, { flex: 1, borderColor: activo ? c.primario : c.borde, backgroundColor: activo ? 'rgba(201,168,76,0.1)' : c.fondoCard }]}
                >
                  <Text style={{ color: activo ? c.primario : c.textoSuave, fontSize: 15, fontWeight: '700' }}>{o.l}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          {corona && (
            <>
              <Text style={[es.seccionLabel, { color: c.textoSuave, marginBottom: 12 }]}>Bonus (% de la apuesta)</Text>
              <View style={es.coronaRow}>
                {[5, 10, 25, 50].map(p => {
                  const activo = coronaPct === p
                  return (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setCoronaPct(p)}
                      activeOpacity={0.8}
                      style={[es.coronaPill, { borderColor: activo ? c.primario : c.borde, backgroundColor: activo ? 'rgba(201,168,76,0.1)' : c.fondoCard }]}
                    >
                      <Text style={{ color: activo ? c.primario : c.textoSuave, fontSize: 15, fontWeight: '700' }}>{p}%</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </>
          )}
        </View>
        <View style={[es.divider, { backgroundColor: c.borde }]} />

        <View style={es.seccion}>
          <Text style={[es.seccionTitulo, { color: c.texto }]}>Cómo se juega</Text>
          <View style={{ gap: 10 }}>
            <Text style={[es.reglaTexto, { color: c.textoSuave }]}>
              • Los dos juegan contra el <Text style={{ color: c.primario, fontWeight: '700' }}>dealer</Text>, cada uno con su apuesta.
            </Text>
            <Text style={[es.reglaTexto, { color: c.textoSuave }]}>
              • Acercate a 21 sin pasarte: pedí carta, plantate o doblá la apuesta.
            </Text>
            <Text style={[es.reglaTexto, { color: c.textoSuave }]}>
              • Le ganás al dealer y cobrás; el blackjack natural paga 3:2.
            </Text>
            <Text style={[es.reglaTexto, { color: c.textoSuave }]}>
              • Con la <Text style={{ color: c.primario, fontWeight: '700' }}>corona</Text>, el de mejor mano se lleva un bonus del rival.
            </Text>
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
                  {seleccionado ? 'Crear mesa · 1 invitado' : 'Seleccioná un amigo'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Info: qué es la corona */}
      <Modal visible={infoCorona} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setInfoCorona(false)}>
        <Pressable style={es.infoOverlay} onPress={() => setInfoCorona(false)}>
          <Pressable style={[es.infoCard, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
            <Text style={[es.infoCardTitulo, { color: c.texto }]}>¿Qué es la corona? 👑</Text>
            <Text style={[es.infoCardCuerpo, { color: c.textoSuave }]}>
              Los dos juegan cada uno contra la banca. Además compiten entre sí: el que hace la mejor mano (más cerca de 21 sin pasarse) se lleva la corona.
              {'\n\n'}
              El ganador cobra un bonus igual a ese porcentaje de su apuesta, que le paga el rival. No afecta lo que ganás o perdés contra la banca.
              {'\n\n'}
              Si los dos se pasan o empatan, no hay corona.
            </Text>
            <TouchableOpacity style={[es.infoCardBtn, { backgroundColor: c.primario }]} onPress={() => setInfoCorona(false)} activeOpacity={0.85}>
              <Text style={{ color: c.fondo, fontWeight: '800', fontSize: 15 }}>Entendido</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
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
    opcionGrande: { fontSize: 18 },
    opcionActivaGrande: { fontSize: 18, fontWeight: '700' },
    reglaTexto: { fontSize: 14, lineHeight: 20 },
    coronaTituloRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    infoBtn: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    infoTxt: { fontSize: 13, fontWeight: '800', fontStyle: 'italic' },
    coronaRow: { flexDirection: 'row', gap: 10 },
    coronaPill: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, alignItems: 'center' },
    infoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 28 },
    infoCard: { width: '100%', maxWidth: 380, borderRadius: 20, borderWidth: 1, padding: 22 },
    infoCardTitulo: { fontSize: 19, fontWeight: '800', marginBottom: 12 },
    infoCardCuerpo: { fontSize: 14, lineHeight: 21 },
    infoCardBtn: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
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
