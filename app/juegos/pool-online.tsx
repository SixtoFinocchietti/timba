// Pool con un amigo — configuración e invitaciones (spec §6, patrón blackjack.tsx):
// el host elige serie (suelta / mejor de 3) y timer por tiro (decisiones v1),
// selecciona un amigo y la invitación viaja como mensaje de chat
// 'invitacion_pool' (card con Unirse) + aparece acá para el invitado.

import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  TextInput, FlatList, ActivityIndicator, Pressable,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { AppIcon } from '@/components/ui/AppIcon'

type SerieVal = 1 | 3
type TimerVal = 0 | 30 | 45 | 60

type Amigo = { id: string; nombre: string }

type InvPool = {
  id: string
  emisor_id: string
  contenido: string
  created_at: string
  emisorNombre: string
}

export default function PoolOnlineConfig() {
  const c = useColores()
  const es = makeEstilos(c)
  const { usuario } = useAuthStore()

  const [serie, setSerie] = useState<SerieVal>(1)
  const [timer, setTimer] = useState<TimerVal>(45)

  const [sheetVisible, setSheetVisible] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [amigos, setAmigos] = useState<Amigo[]>([])
  const [cargando, setCargando] = useState(false)
  const [invitaciones, setInvitaciones] = useState<InvPool[]>([])

  useEffect(() => {
    if (!usuario?.id) return
    cargarInvitaciones()
    const canal = supabase
      .channel(`pool-lobby-${usuario.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensajes',
        filter: `receptor_id=eq.${usuario.id}`,
      }, (payload: any) => {
        if (payload.new?.tipo === 'invitacion_pool') cargarInvitaciones()
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
      .eq('tipo', 'invitacion_pool')
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

  async function invitar(amigo: Amigo) {
    if (!usuario?.id) return
    setSheetVisible(false)
    const contenido = JSON.stringify({
      serie,
      timer,
      hostId: usuario.id,
      hostNombre: usuario.nombre ?? '',
    })
    await supabase.from('mensajes').insert({
      emisor_id: usuario.id,
      receptor_id: amigo.id,
      tipo: 'invitacion_pool',
      contenido,
    })
    router.push({
      pathname: '/juegos/sala-pool',
      params: {
        amigo: amigo.nombre,
        amigoId: amigo.id,
        serie: String(serie),
        timer: String(timer),
        modo_sala: 'host',
      },
    } as any)
  }

  function unirse(inv: InvPool) {
    let cfg = { serie: 1, timer: 45, hostId: inv.emisor_id, hostNombre: inv.emisorNombre }
    try { Object.assign(cfg, JSON.parse(inv.contenido)) } catch {}
    router.push({
      pathname: '/juegos/sala-pool',
      params: {
        amigo: cfg.hostNombre || inv.emisorNombre,
        amigoId: cfg.hostId || inv.emisor_id,
        serie: String(cfg.serie),
        timer: String(cfg.timer),
        modo_sala: 'invitado',
      },
    } as any)
  }

  const amigosFiltrados = amigos.filter(a =>
    a.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()),
  )

  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <View style={es.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={[es.volver, { color: c.primario }]}>‹ Volver</Text>
        </TouchableOpacity>
      </View>
      <Text style={[es.titulo, { color: c.texto }]}>Pool con un amigo</Text>

      {/* invitaciones recibidas */}
      {invitaciones.length > 0 && (
        <View style={es.seccion}>
          <Text style={[es.seccionTitulo, { color: c.textoSuave }]}>TE INVITARON</Text>
          {invitaciones.map(inv => {
            let cfg = { serie: 1, timer: 45 }
            try { Object.assign(cfg, JSON.parse(inv.contenido)) } catch {}
            return (
              <View key={inv.id} style={[es.cardInv, { backgroundColor: c.fondoCard, borderColor: c.primario }]}>
                <AppIcon name="pool" size={26} color={c.primario} />
                <View style={{ flex: 1 }}>
                  <Text style={[es.invNombre, { color: c.texto }]}>{inv.emisorNombre}</Text>
                  <Text style={[es.invDetalle, { color: c.textoSuave }]}>
                    {cfg.serie === 3 ? 'Mejor de 3' : 'Partida suelta'} · {cfg.timer === 0 ? 'sin límite' : `${cfg.timer}s por tiro`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[es.botonUnirse, { backgroundColor: c.primario }]}
                  onPress={() => unirse(inv)}
                  activeOpacity={0.8}
                >
                  <Text style={[es.botonUnirseTexto, { color: c.fondo }]}>Unirse</Text>
                </TouchableOpacity>
              </View>
            )
          })}
        </View>
      )}

      {/* configuración */}
      <View style={es.seccion}>
        <Text style={[es.seccionTitulo, { color: c.textoSuave }]}>SERIE</Text>
        <View style={es.filaOpciones}>
          {([1, 3] as SerieVal[]).map(v => (
            <TouchableOpacity
              key={v}
              style={[es.opcion, { backgroundColor: c.fondoCard, borderColor: serie === v ? c.primario : c.borde }]}
              onPress={() => setSerie(v)}
              activeOpacity={0.8}
            >
              <Text style={[es.opcionTexto, { color: serie === v ? c.primario : c.textoSuave }]}>
                {v === 1 ? 'Partida suelta' : 'Mejor de 3'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={es.seccion}>
        <Text style={[es.seccionTitulo, { color: c.textoSuave }]}>TIEMPO POR TIRO</Text>
        <View style={es.filaOpciones}>
          {([0, 30, 45, 60] as TimerVal[]).map(v => (
            <TouchableOpacity
              key={v}
              style={[es.opcionChica, { backgroundColor: c.fondoCard, borderColor: timer === v ? c.primario : c.borde }]}
              onPress={() => setTimer(v)}
              activeOpacity={0.8}
            >
              <Text style={[es.opcionTexto, { color: timer === v ? c.primario : c.textoSuave }]}>
                {v === 0 ? '∞' : `${v}s`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[es.botonInvitar, { backgroundColor: c.primario }]}
        onPress={() => { setBusqueda(''); setSheetVisible(true); cargarAmigos() }}
        activeOpacity={0.85}
      >
        <AppIcon name="amigos" size={20} color={c.fondo} />
        <Text style={[es.botonInvitarTexto, { color: c.fondo }]}>Elegir amigo e invitar</Text>
      </TouchableOpacity>

      {/* sheet selector de amigos */}
      <Modal visible={sheetVisible} transparent animationType="slide" onRequestClose={() => setSheetVisible(false)}>
        <Pressable style={es.sheetOverlay} onPress={() => setSheetVisible(false)} />
        <View style={[es.sheet, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
          <View style={[es.sheetHandle, { backgroundColor: c.borde }]} />
          <Text style={[es.sheetTitulo, { color: c.texto }]}>¿A quién invitás?</Text>
          <TextInput
            style={[es.buscador, { backgroundColor: c.fondoInput, color: c.texto, borderColor: c.borde }]}
            placeholder="Buscar amigo…"
            placeholderTextColor={c.textoSuave}
            value={busqueda}
            onChangeText={setBusqueda}
          />
          {cargando ? (
            <ActivityIndicator color={c.primario} style={{ marginVertical: 24 }} />
          ) : (
            <FlatList
              data={amigosFiltrados}
              keyExtractor={a => a.id}
              style={{ maxHeight: 320 }}
              ListEmptyComponent={
                <Text style={[es.vacio, { color: c.textoSuave }]}>
                  {amigos.length === 0 ? 'Todavía no tenés amigos agregados' : 'Sin resultados'}
                </Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[es.filaAmigo, { borderColor: c.borde }]}
                  onPress={() => invitar(item)}
                  activeOpacity={0.8}
                >
                  <View style={[es.avatar, { backgroundColor: c.fondoInput, borderColor: c.borde }]}>
                    <Text style={[es.avatarLetra, { color: c.primario }]}>
                      {item.nombre.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[es.amigoNombre, { color: c.texto }]}>{item.nombre}</Text>
                  <Text style={[es.chevron, { color: c.primario }]}>›</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1 },
    header: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 },
    volver: { fontSize: 18, fontWeight: '700' },
    titulo: {
      fontSize: 28, fontWeight: '800', letterSpacing: -0.5,
      paddingHorizontal: 24, paddingTop: 4, paddingBottom: 12,
    },
    seccion: { paddingHorizontal: 24, marginTop: 14, gap: 8 },
    seccionTitulo: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    filaOpciones: { flexDirection: 'row', gap: 10 },
    opcion: {
      flex: 1, borderWidth: 1.5, borderRadius: 14,
      paddingVertical: 14, alignItems: 'center',
    },
    opcionChica: {
      flex: 1, borderWidth: 1.5, borderRadius: 14,
      paddingVertical: 12, alignItems: 'center',
    },
    opcionTexto: { fontSize: 14, fontWeight: '800' },
    botonInvitar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      marginHorizontal: 24, marginTop: 28, borderRadius: 16, paddingVertical: 16,
    },
    botonInvitarTexto: { fontSize: 16, fontWeight: '800' },
    cardInv: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: 1.5, borderRadius: 16, padding: 14,
    },
    invNombre: { fontSize: 15, fontWeight: '800' },
    invDetalle: { fontSize: 12, marginTop: 2 },
    botonUnirse: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    botonUnirseTexto: { fontSize: 13, fontWeight: '800' },
    sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: {
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      borderWidth: 1, borderBottomWidth: 0,
      padding: 20, paddingBottom: 36,
    },
    sheetHandle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
    sheetTitulo: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
    buscador: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
    vacio: { textAlign: 'center', marginVertical: 24, fontSize: 14 },
    filaAmigo: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 12, borderBottomWidth: 1,
    },
    avatar: {
      width: 40, height: 40, borderRadius: 20, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarLetra: { fontSize: 16, fontWeight: '800' },
    amigoNombre: { flex: 1, fontSize: 15, fontWeight: '600' },
    chevron: { fontSize: 22, fontWeight: '700' },
  })
}
