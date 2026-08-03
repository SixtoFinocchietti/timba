// Pool con un amigo — configuración e invitaciones (spec §6, patrón blackjack.tsx):
// el host elige serie (suelta / mejor de 3) y timer por tiro (decisiones v1),
// selecciona un amigo y la invitación viaja como mensaje de chat
// 'invitacion_pool' (card con Unirse) + aparece acá para el invitado.

import { useState, useEffect, useMemo } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  TextInput, FlatList, ActivityIndicator, Pressable, Alert,
} from 'react-native'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { AppIcon } from '@/components/ui/AppIcon'
import { TimbaTipo } from '@/types'
import { useInvitacionesPendientes, InvitacionPendiente } from '@/hooks/useInvitacionesPendientes'
import {
  CLAVE_NIVEL_ASISTENCIA, NIVEL_ASISTENCIA_DEFAULT, NIVELES_ASISTENCIA, NivelAsistencia,
} from '@/lib/pool/asistencia'

type SerieVal = 1 | 3
type TimerVal = 0 | 30 | 45 | 60

type Amigo = { id: string; nombre: string }

// Timba pre-comprometida antes de jugar (feedback de juego real, jul 2026):
// antes se creaba DESPUÉS de terminar el partido, lo que permitía que el
// ganador "recién decida" armarla porque ganó. Ahora se crea acá, con las
// mismas opciones bloqueadas de siempre ("Gana {vos}"/"Gana {amigo}") y se
// resuelve sola al terminar (ver cerrar_timba_juego, migración 021) — sin
// el formulario avanzado de una Timba genérica: acá solo importa el tipo y
// el premio/prenda/monto, nada de cupos ni fechas.
function generarCodigo(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// Invitaciones: solo la más reciente por amigo distinto, de los últimos 10
// minutos, y de esas se muestra una sola card a la vez (spec §7.2) — una
// invitación a jugar pierde sentido rápido. El descarte (X) no borra el
// mensaje (es historial de chat): se guarda el id en un set local que
// persiste entre sesiones, y al filtrar sobre él aparece sola la siguiente
// si existe — no hace falta ninguna lógica extra de "avanzar a la próxima".
const VENTANA_INVITACION_MS = 10 * 60 * 1000
const CLAVE_INV_DESCARTADAS = '@timba:pool_inv_descartadas'

export default function PoolOnlineConfig() {
  const c = useColores()
  const es = makeEstilos(c)
  const { usuario } = useAuthStore()

  const [serie, setSerie] = useState<SerieVal>(1)
  const [timer, setTimer] = useState<TimerVal>(45)
  // Hándicap por jugador (Fase 8.2): el host fija el nivel de asistencia de
  // los DOS asientos al armar la invitación — dos amigos de nivel distinto
  // pueden timbear parejo. El propio arranca en el default personal del
  // host (lo que ya usa en práctica/bot); el del amigo arranca en Normal.
  const [asistenciaHost, setAsistenciaHost] = useState<NivelAsistencia>(NIVEL_ASISTENCIA_DEFAULT)
  const [asistenciaInvitado, setAsistenciaInvitado] = useState<NivelAsistencia>(NIVEL_ASISTENCIA_DEFAULT)

  useEffect(() => {
    AsyncStorage.getItem(CLAVE_NIVEL_ASISTENCIA).then(v => {
      if (v === 'sin' || v === 'baja' || v === 'normal' || v === 'maxima') setAsistenciaHost(v)
    })
  }, [])

  const [sheetVisible, setSheetVisible] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [amigos, setAmigos] = useState<Amigo[]>([])
  const [cargando, setCargando] = useState(false)
  // ventana corta + dedupe por emisor son específicos de Pool (spec §7.2 —
  // una invitación a jugar pierde sentido rápido); Blackjack/Poker usan el
  // hook con su comportamiento de siempre (48h, sin dedupe)
  const { invitaciones: candidatosInv } = useInvitacionesPendientes('invitacion_pool', {
    ventanaMs: VENTANA_INVITACION_MS, limite: 20,
  })
  const invitaciones = useMemo(() => {
    const vistos = new Set<string>()
    return candidatosInv.filter(m => {
      if (vistos.has(m.emisor_id)) return false
      vistos.add(m.emisor_id)
      return true
    })
  }, [candidatosInv])
  const [descartadas, setDescartadas] = useState<Set<string>>(new Set())
  const invitacionVisible = invitaciones.find(inv => !descartadas.has(inv.id)) ?? null

  useEffect(() => {
    AsyncStorage.getItem(CLAVE_INV_DESCARTADAS).then(v => {
      if (v) { try { setDescartadas(new Set(JSON.parse(v))) } catch {} }
    })
  }, [])

  function descartarInvitacion(id: string) {
    setDescartadas(prev => {
      const next = new Set(prev)
      next.add(id)
      AsyncStorage.setItem(CLAVE_INV_DESCARTADAS, JSON.stringify([...next]))
      return next
    })
  }

  // Timba opcional (ver nota arriba)
  const [conTimba, setConTimba] = useState(false)
  const [timbaTipo, setTimbaTipo] = useState<TimbaTipo>('amistosa')
  const [timbaPremio, setTimbaPremio] = useState('')
  const [timbaPrenda, setTimbaPrenda] = useState('')
  const [timbaMonto, setTimbaMonto] = useState('')

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

    // Timba (opcional): se crea ANTES de invitar, no después de jugar — así
    // ninguno de los dos sabe el resultado todavía cuando se fijan las
    // condiciones. Validación mínima, a propósito (esto es entre amigos).
    let timbaId: string | null = null
    if (conTimba) {
      if (timbaTipo === 'monetaria') {
        const monto = parseFloat(timbaMonto.replace(',', '.'))
        if (isNaN(monto) || monto <= 0) { Alert.alert('Poné un monto válido para la timba (mayor a 0)'); return }
      }
      const { data: timba, error } = await supabase.from('timbas').insert({
        creador_id: usuario.id,
        titulo: `Pool: ${usuario.nombre ?? 'Vos'} vs ${amigo.nombre}`,
        tipo: timbaTipo,
        opciones: [`Gana ${usuario.nombre ?? 'Vos'}`, `Gana ${amigo.nombre}`],
        estado: 'activa',
        codigo_invitacion: generarCodigo(),
        premio_descripcion: timbaTipo === 'amistosa' ? (timbaPremio.trim() || null) : null,
        prenda_descripcion: timbaTipo === 'amistosa' ? (timbaPrenda.trim() || null) : null,
        monto_minimo: timbaTipo === 'monetaria' ? parseFloat(timbaMonto.replace(',', '.')) : null,
        monto_maximo: timbaTipo === 'monetaria' ? parseFloat(timbaMonto.replace(',', '.')) : null,
      }).select('id').single()
      if (error || !timba) { Alert.alert('No se pudo crear la timba', error?.message ?? ''); return }
      timbaId = timba.id
      // sin voto humano (ago 2026): ningún jugador queda anotado como
      // participante hasta que cerrar_timba_juego() los anota a los DOS de
      // una sola vez, atómico, cuando la partida termina — 0% intervención.
    }

    const contenido = JSON.stringify({
      serie,
      timer,
      hostId: usuario.id,
      hostNombre: usuario.nombre ?? '',
      timbaId,
      asistenciaHost,
      asistenciaInvitado,
    })
    const { error: invitacionError } = await supabase.from('mensajes').insert({
      emisor_id: usuario.id,
      receptor_id: amigo.id,
      tipo: 'invitacion_pool',
      contenido,
      // columna dedicada (no solo el JSON de contenido): la usa la policy
      // RLS timbas_select_invitado_pool para que el invitado pueda leer la
      // timba en la sala antes de tener fila en participantes
      timba_id: timbaId,
    })
    if (invitacionError) {
      if (timbaId) {
        await supabase
          .from('timbas')
          .update({ estado: 'cancelada' })
          .eq('id', timbaId)
          .eq('creador_id', usuario.id)
          .eq('estado', 'activa')
      }
      Alert.alert('No se pudo enviar la invitación', invitacionError.message)
      return
    }
    setSheetVisible(false)
    router.push({
      pathname: '/juegos/sala-pool',
      params: {
        amigo: amigo.nombre,
        amigoId: amigo.id,
        serie: String(serie),
        timer: String(timer),
        modo_sala: 'host',
        asistenciaHost,
        asistenciaInvitado,
        ...(timbaId ? { timbaId } : {}),
      },
    } as any)
  }

  function unirse(inv: InvitacionPendiente) {
    let cfg = {
      serie: 1, timer: 45, hostId: inv.emisor_id, hostNombre: inv.emisorNombre, timbaId: null as string | null,
      asistenciaHost: NIVEL_ASISTENCIA_DEFAULT as NivelAsistencia, asistenciaInvitado: NIVEL_ASISTENCIA_DEFAULT as NivelAsistencia,
    }
    try { Object.assign(cfg, JSON.parse(inv.contenido)) } catch {}
    router.push({
      pathname: '/juegos/sala-pool',
      params: {
        amigo: cfg.hostNombre || inv.emisorNombre,
        amigoId: cfg.hostId || inv.emisor_id,
        serie: String(cfg.serie),
        timer: String(cfg.timer),
        modo_sala: 'invitado',
        asistenciaHost: cfg.asistenciaHost,
        asistenciaInvitado: cfg.asistenciaInvitado,
        ...(cfg.timbaId ? { timbaId: cfg.timbaId } : {}),
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

      {/* invitación recibida — una sola a la vez, la más reciente (spec §7.2) */}
      {invitacionVisible && (() => {
        const inv = invitacionVisible
        let cfg = { serie: 1, timer: 45, timbaId: null as string | null }
        try { Object.assign(cfg, JSON.parse(inv.contenido)) } catch {}
        return (
          <View style={es.seccion}>
            <Text style={[es.seccionTitulo, { color: c.textoSuave }]}>TE INVITARON</Text>
            <View style={[es.cardInv, { backgroundColor: c.fondoCard, borderColor: c.primario }]}>
              <AppIcon name="pool" size={26} color={c.primario} />
              <View style={{ flex: 1 }}>
                <Text style={[es.invNombre, { color: c.texto }]}>{inv.emisorNombre}</Text>
                <Text style={[es.invDetalle, { color: c.textoSuave }]}>
                  {cfg.serie === 3 ? 'Mejor de 3' : 'Partida suelta'} · {cfg.timer === 0 ? 'sin límite' : `${cfg.timer}s por tiro`}
                </Text>
                {cfg.timbaId && (
                  <Text style={[es.invDetalle, { color: c.primario, fontWeight: '700' }]}>🎲 Con timba</Text>
                )}
              </View>
              <TouchableOpacity
                style={[es.botonUnirse, { backgroundColor: c.primario }]}
                onPress={() => unirse(inv)}
                activeOpacity={0.8}
              >
                <Text style={[es.botonUnirseTexto, { color: c.fondo }]}>Unirse</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => descartarInvitacion(inv.id)}
                activeOpacity={0.7}
                hitSlop={10}
                style={{ marginLeft: 4 }}
              >
                <AppIcon name="xCirculo" size={20} color={c.textoSuave} />
              </TouchableOpacity>
            </View>
          </View>
        )
      })()}

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

      {/* Hándicap por jugador (Fase 8.2, §2.3): dos selectores independientes
          para que dos amigos de nivel distinto timbeen parejo — ninguno
          afecta al otro, cada uno ve solo su propia guía */}
      <View style={es.seccion}>
        <Text style={[es.seccionTitulo, { color: c.textoSuave }]}>TU ASISTENCIA AL APUNTADO</Text>
        <View style={es.filaOpciones}>
          {NIVELES_ASISTENCIA.map(n => (
            <TouchableOpacity
              key={n.id}
              style={[es.opcionChica, { backgroundColor: c.fondoCard, borderColor: asistenciaHost === n.id ? c.primario : c.borde }]}
              onPress={() => setAsistenciaHost(n.id)}
              activeOpacity={0.8}
            >
              <Text style={[es.opcionTexto, { color: asistenciaHost === n.id ? c.primario : c.textoSuave }]}>{n.nombre}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={es.seccion}>
        <Text style={[es.seccionTitulo, { color: c.textoSuave }]}>ASISTENCIA DE TU AMIGO</Text>
        <View style={es.filaOpciones}>
          {NIVELES_ASISTENCIA.map(n => (
            <TouchableOpacity
              key={n.id}
              style={[es.opcionChica, { backgroundColor: c.fondoCard, borderColor: asistenciaInvitado === n.id ? c.primario : c.borde }]}
              onPress={() => setAsistenciaInvitado(n.id)}
              activeOpacity={0.8}
            >
              <Text style={[es.opcionTexto, { color: asistenciaInvitado === n.id ? c.primario : c.textoSuave }]}>{n.nombre}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={es.seccion}>
        <Text style={[es.seccionTitulo, { color: c.textoSuave }]}>TIMBA (OPCIONAL)</Text>
        <View style={es.filaOpciones}>
          <TouchableOpacity
            style={[es.opcion, { backgroundColor: c.fondoCard, borderColor: !conTimba ? c.primario : c.borde }]}
            onPress={() => setConTimba(false)}
            activeOpacity={0.8}
          >
            <Text style={[es.opcionTexto, { color: !conTimba ? c.primario : c.textoSuave }]}>Solo jugar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[es.opcion, { backgroundColor: c.fondoCard, borderColor: conTimba ? c.primario : c.borde }]}
            onPress={() => setConTimba(true)}
            activeOpacity={0.8}
          >
            <Text style={[es.opcionTexto, { color: conTimba ? c.primario : c.textoSuave }]}>Con timba</Text>
          </TouchableOpacity>
        </View>

        {conTimba && (
          <View style={[es.timbaCard, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
            <View style={es.filaOpciones}>
              <TouchableOpacity
                style={[es.opcionChica, { backgroundColor: c.fondoInput, borderColor: timbaTipo === 'amistosa' ? c.primario : c.borde }]}
                onPress={() => setTimbaTipo('amistosa')}
                activeOpacity={0.8}
              >
                <Text style={[es.opcionTexto, { color: timbaTipo === 'amistosa' ? c.primario : c.textoSuave, fontSize: 13 }]}>Amistosa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[es.opcionChica, { backgroundColor: c.fondoInput, borderColor: timbaTipo === 'monetaria' ? c.primario : c.borde }]}
                onPress={() => setTimbaTipo('monetaria')}
                activeOpacity={0.8}
              >
                <Text style={[es.opcionTexto, { color: timbaTipo === 'monetaria' ? c.primario : c.textoSuave, fontSize: 13 }]}>Con plata</Text>
              </TouchableOpacity>
            </View>

            {timbaTipo === 'amistosa' ? (
              <View style={{ gap: 8, marginTop: 10 }}>
                <TextInput
                  style={[es.timbaInput, { backgroundColor: c.fondoInput, color: c.texto, borderColor: c.borde }]}
                  placeholder="Premio del ganador (opcional)"
                  placeholderTextColor={c.textoSuave}
                  value={timbaPremio}
                  onChangeText={setTimbaPremio}
                />
                <TextInput
                  style={[es.timbaInput, { backgroundColor: c.fondoInput, color: c.texto, borderColor: c.borde }]}
                  placeholder="Prenda del perdedor (opcional)"
                  placeholderTextColor={c.textoSuave}
                  value={timbaPrenda}
                  onChangeText={setTimbaPrenda}
                />
              </View>
            ) : (
              <View style={{ marginTop: 10 }}>
                <TextInput
                  style={[es.timbaInput, { backgroundColor: c.fondoInput, color: c.texto, borderColor: c.borde }]}
                  placeholder="Monto por jugador ($)"
                  placeholderTextColor={c.textoSuave}
                  value={timbaMonto}
                  onChangeText={setTimbaMonto}
                  keyboardType="numeric"
                />
              </View>
            )}
            <Text style={[es.timbaAviso, { color: c.textoSuave }]}>
              Al terminar la partida, la timba se resuelve sola con el resultado del juego.
            </Text>
          </View>
        )}
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
    timbaCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 4 },
    timbaInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
    timbaAviso: { fontSize: 11, marginTop: 10, lineHeight: 15 },
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
