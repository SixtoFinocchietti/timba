import { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native'
import { Image } from 'expo-image'
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withDelay,
} from 'react-native-reanimated'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { mensajeError } from '@/lib/errores'
import {
  Carta, Equipo, EstadoJuego, Accion, Evento, Palo,
  estadoInicial, reducir, rivalDe, equipoDe, miembrosDe, normalizarEstado,
  accionesDisponibles, subidasEnvido, etiquetaEnvido, valorEnvidoChain,
} from '@/lib/truco'

type Fase = 'setup' | 'flor' | 'waiting' | 'game'
type Modo = 'mano' | 'parejas' | 'trios'
type ModoJuego = 'mano' | 'parejas'
type Amigo = { id: string; nombre: string; avatar_url?: string }
type Invitacion = {
  id: string; conFlor: boolean; modo: ModoJuego
  de: Amigo; jugadores: Amigo[]; miAsiento: number
}
type MesaEspera = {
  id: string; conFlor: boolean; modo: ModoJuego
  jugadores: Amigo[]; miAsiento: number; aceptados: string[]
}
type PartidaActiva = { id: string; miAsiento: number; jugadores: Amigo[]; estadoJuego: EstadoJuego; version: number }
type Partida = { id: string; miAsiento: number; jugadores: Amigo[]; conFlor: boolean; modo: ModoJuego }

const PALILLOS = {
  1: require('../../assets/truco/palillos/palillos_1.png'),
  2: require('../../assets/truco/palillos/palillos_2.png'),
  3: require('../../assets/truco/palillos/palillos_3.png'),
  4: require('../../assets/truco/palillos/palillos_4.png'),
  5: require('../../assets/truco/palillos/palillos_5.png'),
} as const

const MESA = require('../../assets/truco/mesa-truco.png')

const MODO_LABELS: Record<Modo, string> = {
  mano: 'Mano a mano',
  parejas: 'Parejas',
  trios: 'Tríos',
}

const COLORES_AVATAR = ['#7a4bd0', '#1f8a5b', '#c9573b', '#2a6fdb', '#b0852f', '#c93b7a']

function colorAvatar(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return COLORES_AVATAR[h % COLORES_AVATAR.length]
}

function inicial(nombre: string) {
  return nombre.trim().charAt(0).toUpperCase()
}

function palillosFor(score: number): { key: string; n: 1 | 2 | 3 | 4 | 5 }[] {
  const out: { key: string; n: 1 | 2 | 3 | 4 | 5 }[] = []
  let s = Math.max(0, Math.min(30, score))
  let i = 0
  while (s >= 5) { out.push({ key: 'p' + i, n: 5 }); i++; s -= 5 }
  if (s > 0) out.push({ key: 'p' + i, n: s as 1 | 2 | 3 | 4 })
  return out
}

/** Jugadores por asiento a partir de una fila de truco_partidas (con embeds j1..j4). */
function jugadoresDeRow(row: any): Amigo[] {
  const ids = [row.jugador1, row.jugador2, row.jugador3, row.jugador4]
  const perfiles = [row.j1, row.j2, row.j3, row.j4]
  const n = row.modo === 'parejas' ? 4 : 2
  return ids.slice(0, n).map((id: string, i: number) => ({
    id, nombre: perfiles[i]?.nombre ?? 'Jugador',
  }))
}

// ─── Animated dot ─────────────────────────────────────────────────────────────

function PuntitoCargando({ delay }: { delay: number }) {
  const op = useSharedValue(0.28)
  useEffect(() => {
    op.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1, { duration: 500 }),
        withTiming(0.28, { duration: 500 }),
      ), -1, false,
    ))
  }, [])
  const style = useAnimatedStyle(() => ({ opacity: op.value }))
  return <Animated.View style={[{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#DFC47A' }, style]} />
}

// ─── Canto toast ──────────────────────────────────────────────────────────────

function CantoToast({ canto }: { canto: string }) {
  const op = useSharedValue(0)
  const sc2 = useSharedValue(0.85)
  useEffect(() => {
    op.value = withTiming(1, { duration: 180 })
    sc2.value = withTiming(1, { duration: 180 })
  }, [])
  const animStyle = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ scale: sc2.value }] }))
  return (
    <Animated.View style={[ct.box, animStyle]}>
      <Text style={ct.texto}>{canto}</Text>
    </Animated.View>
  )
}

const ct = StyleSheet.create({
  box: {
    backgroundColor: 'rgba(20,14,8,0.92)',
    borderWidth: 1.5, borderColor: '#C9A84C',
    borderRadius: 18, paddingVertical: 16, paddingHorizontal: 28,
    maxWidth: '86%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.6, shadowRadius: 50,
    elevation: 20,
  },
  texto: { color: '#DFC47A', fontSize: 23, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center', lineHeight: 30 },
})

// ─── Cartas (placeholder de texto — se reemplazan por assets después) ─────────

const PALO_COLOR: Record<Palo, string> = {
  espada: '#2c5faa', basto: '#2e7d4f', oro: '#b8860b', copa: '#b03a3a',
}
const PALO_LABEL: Record<Palo, string> = {
  espada: 'Espada', basto: 'Basto', oro: 'Oro', copa: 'Copa',
}

function CartaView({ carta, onPress, dim }: { carta: Carta; onPress?: () => void; dim?: boolean }) {
  const color = PALO_COLOR[carta.palo]
  const body = (
    <View style={[cv.carta, dim && { opacity: 0.55 }]}>
      <Text style={[cv.numEsq, { color }]}>{carta.numero}</Text>
      <Text style={[cv.num, { color }]}>{carta.numero}</Text>
      <Text style={[cv.palo, { color }]}>{PALO_LABEL[carta.palo]}</Text>
    </View>
  )
  if (!onPress) return body
  return <TouchableOpacity onPress={onPress} activeOpacity={0.75}>{body}</TouchableOpacity>
}

function CartaSlot({ carta }: { carta: Carta | null }) {
  if (carta) return <CartaView carta={carta} />
  return <View style={cv.slotVacio} />
}

function CartaDorso() {
  return (
    <View style={cv.dorso}>
      <View style={cv.dorsoInterior} />
    </View>
  )
}

const cv = StyleSheet.create({
  carta: {
    width: 62, height: 90, borderRadius: 9,
    backgroundColor: '#faf5e8',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 6,
    elevation: 5,
  },
  numEsq: { position: 'absolute', top: 4, left: 6, fontSize: 12, fontWeight: '800' },
  num: { fontSize: 30, fontWeight: '900', lineHeight: 34 },
  palo: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  slotVacio: {
    width: 62, height: 90, borderRadius: 9,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', borderStyle: 'dashed',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  dorso: {
    width: 22, height: 32, borderRadius: 4,
    backgroundColor: '#1e3a5f',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  dorsoInterior: {
    width: 12, height: 20, borderRadius: 2,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
})

// ─── Setup screen ─────────────────────────────────────────────────────────────

function PantallaSetup({
  c, modo, setModo, amigos, cargando, invitaciones, mesas, partidasActivas, seleccion,
  onSeleccionarAmigo, onToggleSeleccion, onContinuarParejas,
  onAceptarInv, onRechazarInv, onEntrarMesa, onContinuar, onBack,
}: {
  c: ColoresTema
  modo: Modo
  setModo: (m: Modo) => void
  amigos: Amigo[]
  cargando: boolean
  invitaciones: Invitacion[]
  mesas: MesaEspera[]
  partidasActivas: PartidaActiva[]
  seleccion: Amigo[]
  onSeleccionarAmigo: (a: Amigo) => void
  onToggleSeleccion: (a: Amigo) => void
  onContinuarParejas: () => void
  onAceptarInv: (inv: Invitacion) => void
  onRechazarInv: (inv: Invitacion) => void
  onEntrarMesa: (m: MesaEspera) => void
  onContinuar: (p: PartidaActiva) => void
  onBack: () => void
}) {
  const es = setupEstilos(c)
  const esParejas = modo === 'parejas'
  const rolDe = (a: Amigo) => {
    const i = seleccion.findIndex(s => s.id === a.id)
    return i === -1 ? null : i === 0 ? 'Compañero' : 'Rival'
  }
  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={es.volverBtn}>
        <Text style={[es.volver, { color: c.primario }]}>‹ Volver</Text>
      </TouchableOpacity>
      <Text style={[es.titulo, { color: c.texto }]}>Invitar jugador</Text>
      <Text style={[es.subtitulo, { color: c.textoSuave }]}>Elegí el modo y a quién invitás a la mesa.</Text>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={es.lista} showsVerticalScrollIndicator={false}>
        {partidasActivas.length > 0 && (
          <>
            <Text style={[es.seccion, { color: c.textoSuave }]}>Partida en curso</Text>
            {partidasActivas.map(p => {
              const rivales = p.jugadores.filter((_, a) => equipoDe(a) !== equipoDe(p.miAsiento))
              const miEq = equipoDe(p.miAsiento)
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[es.invCard, { backgroundColor: 'rgba(201,168,76,0.08)', borderColor: c.primario }]}
                  onPress={() => onContinuar(p)}
                  activeOpacity={0.8}
                >
                  <View style={[es.amigoAvatar, { backgroundColor: colorAvatar(rivales[0].id) }]}>
                    <Text style={es.amigoIniciales}>{inicial(rivales[0].nombre)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[es.amigoNombre, { color: c.texto }]} numberOfLines={1}>
                      vs {rivales.map(r => r.nombre).join(' y ')}
                    </Text>
                    <Text style={[es.invDesc, { color: c.primarioSuave }]}>
                      {p.estadoJuego.puntos[miEq]} — {p.estadoJuego.puntos[rivalDe(miEq)]} · Tocá para volver
                    </Text>
                  </View>
                  <Text style={[es.chevron, { color: c.primario }]}>›</Text>
                </TouchableOpacity>
              )
            })}
          </>
        )}

        {mesas.length > 0 && (
          <>
            <Text style={[es.seccion, { color: c.textoSuave }]}>Mesa esperando jugadores</Text>
            {mesas.map(m => (
              <TouchableOpacity
                key={m.id}
                style={[es.invCard, { backgroundColor: c.fondoCard, borderColor: c.borde }]}
                onPress={() => onEntrarMesa(m)}
                activeOpacity={0.8}
              >
                <View style={[es.amigoAvatar, { backgroundColor: colorAvatar(m.jugadores[0].id) }]}>
                  <Text style={es.amigoIniciales}>{inicial(m.jugadores[0].nombre)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[es.amigoNombre, { color: c.texto }]} numberOfLines={1}>
                    {m.modo === 'parejas' ? 'Truco de parejas' : `vs ${m.jugadores[1].nombre}`}
                  </Text>
                  <Text style={[es.invDesc, { color: c.textoSuave }]}>
                    {m.aceptados.length + 1}/{m.jugadores.length} listos · Tocá para entrar
                  </Text>
                </View>
                <Text style={[es.chevron, { color: c.primario }]}>›</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {invitaciones.length > 0 && (
          <>
            <Text style={[es.seccion, { color: c.textoSuave }]}>Te invitaron a jugar</Text>
            {invitaciones.map(inv => (
              <View key={inv.id} style={[es.invCard, { backgroundColor: c.fondoCard, borderColor: c.primario }]}>
                <View style={[es.amigoAvatar, { backgroundColor: colorAvatar(inv.de.id) }]}>
                  <Text style={es.amigoIniciales}>{inicial(inv.de.nombre)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[es.amigoNombre, { color: c.texto }]} numberOfLines={1}>{inv.de.nombre}</Text>
                  <Text style={[es.invDesc, { color: c.textoSuave }]}>
                    Truco {inv.conFlor ? 'con flor' : 'sin flor'} · {inv.modo === 'parejas' ? 'Parejas' : 'Mano a mano'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[es.invitarBtn, { backgroundColor: c.primario }]}
                  onPress={() => onAceptarInv(inv)}
                  activeOpacity={0.8}
                >
                  <Text style={[es.invitarTexto, { color: c.fondo }]}>Jugar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onRechazarInv(inv)} activeOpacity={0.7} style={es.rechazarBtn}>
                  <Text style={[es.rechazarTexto, { color: c.textoSuave }]}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        <Text style={[es.seccion, { color: c.textoSuave }]}>Modo</Text>
        <View style={[es.modoRow, { backgroundColor: c.fondoInput, borderColor: c.borde }]}>
          {(['mano', 'parejas', 'trios'] as Modo[]).map(m => {
            const disponible = m !== 'trios'
            return (
              <TouchableOpacity
                key={m}
                disabled={!disponible}
                style={[es.modoBtn, modo === m && { backgroundColor: c.primario }, !disponible && { opacity: 0.4 }]}
                onPress={() => setModo(m)}
                activeOpacity={0.8}
              >
                <Text style={[es.modoBtnTexto, { color: modo === m ? c.fondo : c.textoSuave }]}>
                  {MODO_LABELS[m]}
                </Text>
                {!disponible && <Text style={[es.modoPronto, { color: c.textoSuave }]}>Pronto</Text>}
              </TouchableOpacity>
            )
          })}
        </View>

        {esParejas && (
          <View style={[es.parejasResumen, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
            <Text style={[es.parejasTexto, { color: c.texto }]}>
              <Text style={{ color: c.primario }}>Vos{seleccion[0] ? ` y ${seleccion[0].nombre}` : ' y …'}</Text>
              {'  contra  '}
              <Text style={{ color: c.textoSuave }}>
                {seleccion[1]?.nombre ?? '…'} y {seleccion[2]?.nombre ?? '…'}
              </Text>
            </Text>
            <Text style={[es.parejasHint, { color: c.textoSuave }]}>
              El primero que elijas es tu compañero; los otros dos, los rivales.
            </Text>
          </View>
        )}

        <Text style={[es.seccion, { color: c.textoSuave }]}>Amigos en Timba</Text>
        {cargando ? (
          <ActivityIndicator color={c.primario} style={{ marginTop: 32 }} />
        ) : amigos.length === 0 ? (
          <Text style={[es.vacio, { color: c.textoSuave }]}>Todavía no tenés amigos en Timba.</Text>
        ) : (
          amigos.map(a => {
            const rol = rolDe(a)
            return (
              <View key={a.id} style={[es.amigoCard, { backgroundColor: c.fondoCard, borderColor: rol ? c.primario : c.borde }]}>
                <View style={[es.amigoAvatar, { backgroundColor: colorAvatar(a.id) }]}>
                  <Text style={es.amigoIniciales}>{inicial(a.nombre)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[es.amigoNombre, { color: c.texto }]} numberOfLines={1}>{a.nombre}</Text>
                  {rol && <Text style={[es.invDesc, { color: c.primarioSuave }]}>{rol}</Text>}
                </View>
                {esParejas ? (
                  <TouchableOpacity
                    style={[es.invitarBtn, rol ? { backgroundColor: c.fondoInput, borderWidth: 1, borderColor: c.borde } : { backgroundColor: c.primario }]}
                    onPress={() => onToggleSeleccion(a)}
                    activeOpacity={0.8}
                  >
                    <Text style={[es.invitarTexto, { color: rol ? c.textoSuave : c.fondo }]}>
                      {rol ? 'Sacar' : 'Sumar'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[es.invitarBtn, { backgroundColor: c.primario }]}
                    onPress={() => onSeleccionarAmigo(a)}
                    activeOpacity={0.8}
                  >
                    <Text style={[es.invitarTexto, { color: c.fondo }]}>Invitar</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          })
        )}

        {esParejas && (
          <TouchableOpacity
            style={[es.continuarBtn, { backgroundColor: c.primario }, seleccion.length < 3 && { opacity: 0.4 }]}
            disabled={seleccion.length < 3}
            onPress={onContinuarParejas}
            activeOpacity={0.8}
          >
            <Text style={[es.continuarTexto, { color: c.fondo }]}>
              {seleccion.length < 3 ? `Elegí ${3 - seleccion.length} más` : 'Armar la mesa'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  )
}

function setupEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1, paddingHorizontal: 22 },
    volverBtn: { paddingTop: 56, paddingBottom: 6 },
    volver: { fontSize: 17, fontWeight: '600' },
    titulo: { fontSize: 30, fontWeight: '800', marginTop: 6, marginBottom: 4 },
    subtitulo: { fontSize: 14, marginBottom: 14 },
    seccion: {
      fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase',
      marginBottom: 10, marginTop: 10,
    },
    modoRow: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 4, gap: 4, marginBottom: 6 },
    modoBtn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
    modoBtnTexto: { fontSize: 14, fontWeight: '700' },
    modoPronto: { fontSize: 10, fontWeight: '600', marginTop: 2 },
    parejasResumen: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6, marginBottom: 6 },
    parejasTexto: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
    parejasHint: { fontSize: 12, textAlign: 'center' },
    lista: { gap: 10, paddingBottom: 24 },
    amigoCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderRadius: 16, borderWidth: 1, padding: 12, paddingHorizontal: 14,
    },
    invCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderRadius: 16, borderWidth: 1.5, padding: 12, paddingHorizontal: 14,
    },
    invDesc: { fontSize: 12, marginTop: 2 },
    amigoAvatar: {
      width: 44, height: 44, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)',
    },
    amigoIniciales: { color: '#fff', fontWeight: '800', fontSize: 18 },
    amigoNombre: { flex: 1, fontSize: 16, fontWeight: '700' },
    invitarBtn: { borderRadius: 11, paddingVertical: 9, paddingHorizontal: 16 },
    invitarTexto: { fontSize: 14, fontWeight: '800' },
    rechazarBtn: { padding: 6 },
    rechazarTexto: { fontSize: 16, fontWeight: '700' },
    continuarBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
    continuarTexto: { fontSize: 16, fontWeight: '800' },
    vacio: { textAlign: 'center', marginTop: 48, fontSize: 15 },
    chevron: { fontSize: 24, fontWeight: '700' },
  })
}

// ─── Flor screen ──────────────────────────────────────────────────────────────

function PantallaFlor({
  c, descripcion, onConfirmar, onBack,
}: {
  c: ColoresTema
  descripcion: string
  onConfirmar: (conFlor: boolean) => void
  onBack: () => void
}) {
  return (
    <View style={[fl.contenedor, { backgroundColor: c.fondo }]}>
      <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={fl.volverBtn}>
        <Text style={[fl.volver, { color: c.primario }]}>‹ Volver</Text>
      </TouchableOpacity>

      <View style={fl.centro}>
        <View style={[fl.iconoWrap, { borderColor: c.primario }]}>
          <Text style={fl.icono}>🌸</Text>
        </View>

        <Text style={[fl.titulo, { color: c.texto }]}>¿Con flor?</Text>
        <Text style={[fl.subtitulo, { color: c.textoSuave }]}>{descripcion}</Text>

        <View style={fl.opciones}>
          <TouchableOpacity
            style={[fl.btn, { backgroundColor: c.primario }]}
            onPress={() => onConfirmar(true)}
            activeOpacity={0.8}
          >
            <Text style={[fl.btnTexto, { color: c.fondo }]}>Sí, con flor</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[fl.btn, { backgroundColor: c.fondoCard, borderColor: c.borde, borderWidth: 1 }]}
            onPress={() => onConfirmar(false)}
            activeOpacity={0.8}
          >
            <Text style={[fl.btnTexto, { color: c.texto }]}>No, sin flor</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const fl = StyleSheet.create({
  contenedor: { flex: 1, paddingHorizontal: 32 },
  volverBtn: { paddingTop: 56, paddingBottom: 6 },
  volver: { fontSize: 17, fontWeight: '600' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingBottom: 60 },
  iconoWrap: {
    width: 80, height: 80, borderRadius: 24, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  icono: { fontSize: 42 },
  titulo: { fontSize: 36, fontWeight: '900', letterSpacing: -0.5 },
  subtitulo: { fontSize: 17, fontWeight: '500', textAlign: 'center', lineHeight: 24 },
  opciones: { width: '100%', gap: 12, marginTop: 12 },
  btn: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  btnTexto: { fontSize: 20, fontWeight: '800' },
})

// ─── Waiting screen ───────────────────────────────────────────────────────────

function PantallaWaiting({
  c, jugadores, aceptados, miAsiento, onSalir,
}: {
  c: ColoresTema
  jugadores: Amigo[]
  aceptados: string[]
  miAsiento: number
  onSalir: () => void
}) {
  const es = waitEstilos(c)
  const esCreador = miAsiento === 0
  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <TouchableOpacity onPress={onSalir} activeOpacity={0.7} style={es.volverBtn}>
        <Text style={[es.volver, { color: c.primario }]}>‹ {esCreador ? 'Cancelar mesa' : 'Volver'}</Text>
      </TouchableOpacity>
      <Text style={[es.titulo, { color: c.texto }]}>Sala de Truco</Text>
      <Text style={[es.sala, { color: c.textoSuave }]}>
        {jugadores.length === 4 ? 'Parejas · La partida arranca cuando acepten todos.' : 'Invitación enviada'}
      </Text>

      <View style={es.centro}>
        <View style={{ width: '100%', gap: 10 }}>
          {jugadores.map((j, asiento) => {
            const ok = asiento === 0 || aceptados.includes(j.id)
            const esRival = equipoDe(asiento) !== equipoDe(miAsiento)
            return (
              <View key={j.id} style={[es.jugadorCard, { backgroundColor: c.fondoCard, borderColor: ok ? c.primario : c.borde }]}>
                <View style={[es.avatarChico, { backgroundColor: colorAvatar(j.id) }]}>
                  <Text style={es.avatarChicoLetra}>{inicial(j.nombre)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[es.nombreChico, { color: c.texto }]} numberOfLines={1}>
                    {asiento === miAsiento ? 'Vos' : j.nombre}
                  </Text>
                  {jugadores.length === 4 && (
                    <Text style={[es.equipoChico, { color: c.textoSuave }]}>{esRival ? 'Ellos' : 'Nos'}</Text>
                  )}
                </View>
                <Text style={[es.estadoChip, { color: ok ? '#3dbb7e' : c.textoSuave }]}>
                  {ok ? 'Listo' : 'Esperando…'}
                </Text>
              </View>
            )
          })}
        </View>

        <View style={{ alignItems: 'center', gap: 14, marginTop: 22 }}>
          <View style={es.dotsRow}>
            <PuntitoCargando delay={0} />
            <PuntitoCargando delay={250} />
            <PuntitoCargando delay={500} />
          </View>
          <Text style={[es.hint, { color: c.textoSuave }]}>
            Tienen que entrar a Juegos › Truco › Juego para ver la invitación.
          </Text>
        </View>
      </View>
    </View>
  )
}

function waitEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1, paddingHorizontal: 22 },
    volverBtn: { paddingTop: 56, paddingBottom: 6 },
    volver: { fontSize: 17, fontWeight: '600' },
    titulo: { fontSize: 30, fontWeight: '800', marginTop: 6, marginBottom: 2 },
    sala: { fontSize: 14, marginBottom: 8 },
    centro: { flex: 1, justifyContent: 'center', paddingBottom: 30 },
    jugadorCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderRadius: 16, borderWidth: 1.5, padding: 12, paddingHorizontal: 14,
    },
    avatarChico: {
      width: 44, height: 44, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: 'rgba(255,255,255,0.14)',
    },
    avatarChicoLetra: { color: '#fff', fontWeight: '800', fontSize: 18 },
    nombreChico: { fontSize: 16, fontWeight: '700' },
    equipoChico: { fontSize: 12, marginTop: 1 },
    estadoChip: { fontSize: 13, fontWeight: '700' },
    dotsRow: { flexDirection: 'row', gap: 7, alignItems: 'center' },
    hint: { fontSize: 12, textAlign: 'center', paddingHorizontal: 30, lineHeight: 17 },
  })
}

// ─── Game screen ──────────────────────────────────────────────────────────────

function formatearEvento(ev: Evento, yo: number, jugadores: Amigo[], n: number): string {
  const nombreAsiento = (a: number) => (a === yo ? 'Vos' : jugadores[a]?.nombre ?? 'Rival')
  const miEquipo = equipoDe(yo)
  const nombreEquipo = (e: Equipo) =>
    n === 2
      ? (e === miEquipo ? 'Vos' : nombreAsiento(e === 'p1' ? 0 : 1))
      : (e === miEquipo ? 'Nos' : 'Ellos')
  const prefijo = n === 4 && ev.por !== yo ? `${nombreAsiento(ev.por)}\n` : ''
  switch (ev.tipo) {
    case 'canto': return prefijo + ev.texto
    case 'respuesta': return prefijo + (ev.quiero ? '¡QUIERO!' : 'NO QUIERO')
    case 'envido': {
      const d = ev.datos
      return `Envido: ${nombreEquipo('p1')} ${d.p1} · ${nombreEquipo('p2')} ${d.p2}\n+${d.valor} ${nombreEquipo(d.ganador)}`
    }
    case 'flor': {
      const d = ev.datos
      return d.doble ? `¡FLOR Y FLOR!\n+${d.valor} ${nombreEquipo(d.ganador)}` : `¡FLOR!\n+${d.valor} ${nombreEquipo(d.ganador)}`
    }
    case 'mazo': return ev.por === yo ? 'Te fuiste al mazo' : `${nombreAsiento(ev.por)} se fue al mazo`
  }
}

function AccionBtn({ label, onPress, enabled }: { label: string; onPress: () => void; enabled: boolean }) {
  return (
    <TouchableOpacity
      style={[jg.accionBtn, !enabled && jg.accionBtnOff]}
      onPress={onPress}
      disabled={!enabled}
      activeOpacity={0.8}
    >
      <Text style={[jg.accionTexto, !enabled && { opacity: 0.5 }]}>{label}</Text>
    </TouchableOpacity>
  )
}

function PanelScore({ label, puntos, lado }: { label: string; puntos: number; lado: 'left' | 'right' }) {
  const pals = palillosFor(puntos)
  return (
    <View style={[jg.panel, lado === 'left' ? jg.panelLeft : jg.panelRight]}>
      <Text style={jg.panelLabel}>{label}</Text>
      <Text style={jg.panelPuntos}>{puntos}</Text>
      <View style={jg.panelPalillos}>
        {pals.map(p => (
          <Image key={p.key} source={PALILLOS[p.n]} style={jg.palilloSide} contentFit="contain" />
        ))}
      </View>
    </View>
  )
}

function ZonaJugador({ j, cartas, esTurno, mini }: { j: Amigo; cartas: number; esTurno: boolean; mini?: boolean }) {
  return (
    <View style={[jg.rivalZonaItem, mini && { flex: 1 }]}>
      <View style={[
        jg.rivalAvatar, mini && jg.rivalAvatarMini,
        { backgroundColor: colorAvatar(j.id) },
        esTurno && jg.avatarTurno,
      ]}>
        <Text style={[jg.rivalLetra, mini && { fontSize: 14 }]}>{inicial(j.nombre)}</Text>
      </View>
      <Text style={jg.rivalNombre} numberOfLines={1}>{j.nombre}</Text>
      <View style={jg.dorsosRow}>
        {Array.from({ length: cartas }).map((_, i) => <CartaDorso key={i} />)}
      </View>
    </View>
  )
}

function PantallaJuego({
  c, jugadores, miAsiento, estado: s, onAccion, onSalir,
}: {
  c: ColoresTema
  jugadores: Amigo[]
  miAsiento: number
  estado: EstadoJuego
  onAccion: (a: Accion) => void
  onSalir: () => void
}) {
  const n = s.numJugadores
  const miEquipo = equipoDe(miAsiento)
  const equipoRival = rivalDe(miEquipo)
  const [toast, setToast] = useState<string | null>(null)
  const [envidoPicker, setEnvidoPicker] = useState(false)
  // Arranca en el evento actual para no mostrar un toast viejo al entrar/reconectar
  const ultimoEvento = useRef(s.evento?.id ?? 0)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Asientos de los demás en la mesa: izquierda, al frente (compañero en parejas), derecha
  const izq = (miAsiento + 1) % 4
  const frente = n === 4 ? (miAsiento + 2) % 4 : miAsiento === 0 ? 1 : 0
  const der = (miAsiento + 3) % 4

  // Toast de cantos/eventos (llega por el estado sincronizado)
  useEffect(() => {
    const ev = s.evento
    if (!ev || ev.id <= ultimoEvento.current) return
    ultimoEvento.current = ev.id
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(formatearEvento(ev, miAsiento, jugadores, n))
    toastTimer.current = setTimeout(() => setToast(null), 1900)
  }, [s.evento?.id])

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const acciones = accionesDisponibles(s, miAsiento)
  const pendienteParaMi = !!s.pendiente && s.pendiente.por !== miEquipo
  const pendienteMio = !!s.pendiente && s.pendiente.por === miEquipo

  useEffect(() => {
    if (!acciones.envidoOk && envidoPicker) setEnvidoPicker(false)
  }, [acciones.envidoOk])

  // Baza visible: la actual si tiene cartas, si no la anterior (para ver cómo terminó)
  const b = s.bazaActual
  const hayCartaEnBaza = s.mesa.some(m => m[b])
  const bazaVisible = hayCartaEnBaza || b === 0 ? b : b - 1

  const misCartas = s.cartas[miAsiento]
  const nombreAsiento = (a: number) => (a === miAsiento ? 'Vos' : jugadores[a]?.nombre ?? 'Rival')

  const textoTurno = s.resumenMano || s.ganador
    ? ''
    : pendienteMio
      ? 'Esperando respuesta…'
      : pendienteParaMi
        ? '¡Respondé el canto!'
        : s.turno === miAsiento ? 'ES TU TURNO' : `TURNO DE ${nombreAsiento(s.turno).toUpperCase()}`

  function renderRespuesta() {
    const pend = s.pendiente!
    let titulo: string
    let subidas: { label: string; accion: Accion }[] = []
    if (pend.tipo === 'truco') {
      titulo = pend.nivel === 2 ? 'Te cantaron TRUCO' : pend.nivel === 3 ? 'Te cantaron RETRUCO' : 'Te cantaron VALE CUATRO'
      if (pend.nivel < 4) {
        subidas.push({
          label: pend.nivel === 2 ? 'Retruco' : 'Vale 4',
          accion: { tipo: 'cantarTruco' },
        })
      }
    } else {
      const valor = valorEnvidoChain(pend.chain, s.puntos, true)
      titulo = `Te cantaron ${etiquetaEnvido(pend.chain[pend.chain.length - 1]).replace(/[¡!]/g, '')} (${valor} pts)`
      subidas = subidasEnvido(pend.chain).map(canto => ({
        label: canto === 'envido' ? 'Envido' : canto === 'real' ? 'Real envido' : 'Falta envido',
        accion: { tipo: 'cantarEnvido', canto },
      }))
      if (acciones.florOk) subidas.push({ label: '¡Flor!', accion: { tipo: 'cantarFlor' } })
    }
    return (
      <View style={jg.respuestaBox}>
        <Text style={jg.respuestaTitulo}>{titulo}</Text>
        <View style={jg.respuestaRow}>
          <TouchableOpacity style={[jg.respBtn, jg.respBtnSi]} onPress={() => onAccion({ tipo: 'responder', quiero: true })} activeOpacity={0.8}>
            <Text style={jg.respBtnTx}>Quiero</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[jg.respBtn, jg.respBtnNo]} onPress={() => onAccion({ tipo: 'responder', quiero: false })} activeOpacity={0.8}>
            <Text style={jg.respBtnTx}>No quiero</Text>
          </TouchableOpacity>
          {subidas.map(su => (
            <TouchableOpacity key={su.label} style={jg.respBtn} onPress={() => onAccion(su.accion)} activeOpacity={0.8}>
              <Text style={jg.respBtnTx}>{su.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    )
  }

  const abandonoTexto = !s.abandonadoPor
    ? null
    : s.abandonadoPorAsiento === miAsiento
      ? 'Abandonaste la partida'
      : `${nombreAsiento(s.abandonadoPorAsiento ?? (s.abandonadoPor === 'p1' ? 0 : 1))} abandonó la partida`

  return (
    <View style={{ flex: 1, backgroundColor: '#141210' }}>
      {/* Top bar */}
      <View style={jg.topBar}>
        <TouchableOpacity onPress={onSalir} activeOpacity={0.7}>
          <Text style={jg.salirTexto}>‹ Salir</Text>
        </TouchableOpacity>
        <Text style={jg.barTitulo}>Truco · {n === 4 ? 'Parejas' : 'Mano a mano'}</Text>
        <Text style={jg.salaTexto} numberOfLines={1}>
          {n === 4 ? `con ${jugadores[frente]?.nombre}` : `vs ${jugadores[frente]?.nombre}`}
        </Text>
      </View>

      {/* Game area */}
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <Image source={MESA} style={StyleSheet.absoluteFill} contentFit="cover" />

        {/* Paneles laterales de puntos */}
        <PanelScore label="NOS" puntos={s.puntos[miEquipo]} lado="left" />
        <PanelScore label="ELLOS" puntos={s.puntos[equipoRival]} lado="right" />

        <View style={jg.contenido}>
          {/* Los demás jugadores */}
          {n === 4 ? (
            <View style={jg.rivales4Row}>
              <ZonaJugador j={jugadores[izq]} cartas={s.cartas[izq].length} esTurno={s.turno === izq} mini />
              <ZonaJugador j={jugadores[frente]} cartas={s.cartas[frente].length} esTurno={s.turno === frente} mini />
              <ZonaJugador j={jugadores[der]} cartas={s.cartas[der].length} esTurno={s.turno === der} mini />
            </View>
          ) : (
            <View style={jg.rivalZona}>
              <ZonaJugador j={jugadores[frente]} cartas={s.cartas[frente].length} esTurno={s.turno === frente} />
            </View>
          )}

          {/* Mesa: cartas jugadas de la baza visible */}
          <View style={jg.mesaZona}>
            <CartaSlot carta={s.mesa[frente][bazaVisible]} />
            <View style={jg.mesaFilaMedia}>
              {n === 4 && <CartaSlot carta={s.mesa[izq][bazaVisible]} />}
              <View style={jg.bazasRow}>
                {[0, 1, 2].map(i => {
                  const res = s.bazas[i]
                  const color = !res ? 'rgba(255,255,255,0.25)'
                    : res === 'parda' ? '#9A8E7E'
                      : res === miEquipo ? '#3dbb7e' : '#d05050'
                  return <View key={i} style={[jg.bazaDot, { backgroundColor: color }]} />
                })}
              </View>
              {n === 4 && <CartaSlot carta={s.mesa[der][bazaVisible]} />}
            </View>
            <CartaSlot carta={s.mesa[miAsiento][bazaVisible]} />
          </View>

          {/* Turno */}
          {!!textoTurno && (
            <View style={jg.turnoBadge}>
              <Text style={jg.turnoTexto}>{textoTurno}</Text>
            </View>
          )}

          {/* Mi mano */}
          <View style={jg.manoRow}>
            {misCartas.length === 0 ? (
              <Text style={jg.sinCartas}>Sin cartas</Text>
            ) : (
              misCartas.map((carta, i) => (
                <CartaView
                  key={`${carta.numero}-${carta.palo}`}
                  carta={carta}
                  dim={!acciones.jugarOk}
                  onPress={acciones.jugarOk ? () => onAccion({ tipo: 'jugarCarta', idx: i }) : undefined}
                />
              ))
            )}
          </View>

          {/* Acciones / respuesta / picker de envido */}
          {pendienteParaMi ? (
            renderRespuesta()
          ) : envidoPicker ? (
            <View style={jg.respuestaBox}>
              <Text style={jg.respuestaTitulo}>¿Qué cantás?</Text>
              <View style={jg.respuestaRow}>
                {(['envido', 'real', 'falta'] as const).map(canto => (
                  <TouchableOpacity
                    key={canto}
                    style={jg.respBtn}
                    onPress={() => { setEnvidoPicker(false); onAccion({ tipo: 'cantarEnvido', canto }) }}
                    activeOpacity={0.8}
                  >
                    <Text style={jg.respBtnTx}>
                      {canto === 'envido' ? 'Envido' : canto === 'real' ? 'Real envido' : 'Falta envido'}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={[jg.respBtn, jg.respBtnNo]} onPress={() => setEnvidoPicker(false)} activeOpacity={0.8}>
                  <Text style={jg.respBtnTx}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={jg.accionesRow}>
              <AccionBtn label={acciones.trucoLabel} onPress={() => onAccion({ tipo: 'cantarTruco' })} enabled={acciones.trucoOk} />
              <AccionBtn label="Envido" onPress={() => setEnvidoPicker(true)} enabled={acciones.envidoOk} />
              {s.conFlor && (
                <AccionBtn label="Flor" onPress={() => onAccion({ tipo: 'cantarFlor' })} enabled={acciones.florOk} />
              )}
              <AccionBtn label="Mazo" onPress={() => onAccion({ tipo: 'irAlMazo' })} enabled={acciones.mazoOk} />
            </View>
          )}
        </View>

        {/* Toast de cantos */}
        {toast && (
          <View style={[StyleSheet.absoluteFill, jg.centrado]} pointerEvents="none">
            <CantoToast canto={toast} />
          </View>
        )}

        {/* Resumen de mano */}
        {s.resumenMano && !s.ganador && (
          <View style={[StyleSheet.absoluteFill, jg.centrado]} pointerEvents="none">
            <View style={jg.resumenCard}>
              <Text style={jg.resumenTitulo}>
                {s.resumenMano.ganador === miEquipo
                  ? (n === 4 ? '¡Ganamos la mano!' : '¡Ganaste la mano!')
                  : (n === 4 ? 'La mano es de ellos' : `La mano es de ${jugadores[frente]?.nombre}`)}
              </Text>
              <Text style={jg.resumenPuntos}>+{s.resumenMano.puntos}</Text>
              {s.resumenMano.razon === 'noQuerido' && <Text style={jg.resumenRazon}>No quisieron</Text>}
              {s.resumenMano.razon === 'mazo' && <Text style={jg.resumenRazon}>Mazo</Text>}
              <Text style={jg.resumenSub}>Mezclando de nuevo…</Text>
            </View>
          </View>
        )}

        {/* Fin de partida */}
        {s.ganador && (
          <View style={[StyleSheet.absoluteFill, jg.finOverlay]}>
            <Text style={jg.finTitulo}>
              {s.ganador === miEquipo ? (n === 4 ? '¡GANAMOS!' : '¡GANASTE!') : (n === 4 ? 'PERDIMOS' : 'PERDISTE')}
            </Text>
            <Text style={jg.finPuntos}>{s.puntos[miEquipo]} — {s.puntos[equipoRival]}</Text>
            {abandonoTexto && <Text style={jg.finAbandono}>{abandonoTexto}</Text>}
            <TouchableOpacity style={jg.finBtn} onPress={onSalir} activeOpacity={0.8}>
              <Text style={jg.finBtnTx}>Salir</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  )
}

const PANEL_W = 54
const PANEL_MARGIN = 8
const ZONA_LATERAL = PANEL_MARGIN + PANEL_W + 8 // margen para no pisar los paneles

const jg = StyleSheet.create({
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 10,
    backgroundColor: '#141210', borderBottomWidth: 1, borderColor: '#2A2520',
  },
  salirTexto: { color: '#C9A84C', fontSize: 16, fontWeight: '600' },
  barTitulo: { color: '#fff', fontSize: 15, fontWeight: '700' },
  salaTexto: { color: '#9A8E7E', fontSize: 13, maxWidth: 110 },

  // Paneles laterales
  panel: {
    position: 'absolute', top: 12, bottom: 224, width: PANEL_W,
    backgroundColor: 'rgba(18,12,7,0.9)',
    borderWidth: 1, borderColor: 'rgba(201,168,76,0.28)',
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 4,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14,
    elevation: 8,
  },
  panelLeft: { left: PANEL_MARGIN },
  panelRight: { right: PANEL_MARGIN },
  panelLabel: { color: '#9A8E7E', fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  panelPuntos: { color: '#DFC47A', fontSize: 18, fontWeight: '900', marginTop: 2 },
  panelPalillos: { flexDirection: 'column', alignItems: 'center', gap: 1, marginTop: 4, flex: 1, overflow: 'hidden' },
  palilloSide: { width: 32, height: 32 },

  contenido: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    paddingTop: 10, paddingBottom: 12, paddingHorizontal: 12,
  },
  centrado: { alignItems: 'center', justifyContent: 'center' },

  // Rivales / compañero
  rivalZona: { alignItems: 'center', marginHorizontal: ZONA_LATERAL },
  rivales4Row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginHorizontal: ZONA_LATERAL, gap: 6,
  },
  rivalZonaItem: { alignItems: 'center', gap: 3 },
  rivalAvatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)',
  },
  rivalAvatarMini: { width: 34, height: 34, borderRadius: 17 },
  avatarTurno: { borderColor: '#DFC47A' },
  rivalLetra: { color: '#fff', fontWeight: '800', fontSize: 17 },
  rivalNombre: {
    color: '#fff', fontSize: 12, fontWeight: '700', maxWidth: 90,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  dorsosRow: { flexDirection: 'row', gap: 5, marginTop: 2, minHeight: 32 },

  // Mesa
  mesaZona: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 8, marginHorizontal: ZONA_LATERAL,
  },
  mesaFilaMedia: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  bazasRow: { flexDirection: 'row', gap: 8 },
  bazaDot: { width: 11, height: 11, borderRadius: 6 },

  turnoBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(20,14,8,0.66)',
    borderWidth: 1.5, borderColor: 'rgba(201,168,76,0.6)',
    borderRadius: 999, paddingVertical: 6, paddingHorizontal: 16,
    marginBottom: 8,
  },
  turnoTexto: { color: '#DFC47A', fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },

  // Mi mano
  manoRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 10, minHeight: 92, marginBottom: 8,
  },
  sinCartas: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },

  // Acciones
  accionesRow: { flexDirection: 'row', gap: 6, minHeight: 46 },
  accionBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    backgroundColor: '#1e1508',
    borderWidth: 1.5, borderColor: 'rgba(201,168,76,0.5)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.5, shadowRadius: 12,
    elevation: 6,
  },
  accionBtnOff: { borderColor: 'rgba(201,168,76,0.18)', backgroundColor: 'rgba(30,21,8,0.55)' },
  accionTexto: { color: '#DFC47A', fontWeight: '800', fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },

  // Respuesta a cantos / picker envido
  respuestaBox: {
    backgroundColor: 'rgba(18,12,7,0.92)',
    borderWidth: 1.5, borderColor: 'rgba(201,168,76,0.5)',
    borderRadius: 14, padding: 10, gap: 8,
  },
  respuestaTitulo: { color: '#DFC47A', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  respuestaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  respBtn: {
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: '#1e1508',
    borderWidth: 1.5, borderColor: 'rgba(201,168,76,0.5)',
  },
  respBtnSi: { borderColor: '#3dbb7e' },
  respBtnNo: { borderColor: '#d05050' },
  respBtnTx: { color: '#DFC47A', fontWeight: '800', fontSize: 13 },

  // Resumen de mano
  resumenCard: {
    backgroundColor: 'rgba(18,12,7,0.94)',
    borderWidth: 1.5, borderColor: '#C9A84C',
    borderRadius: 18, paddingVertical: 20, paddingHorizontal: 32,
    alignItems: 'center', gap: 4,
  },
  resumenTitulo: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  resumenPuntos: { color: '#DFC47A', fontSize: 30, fontWeight: '900' },
  resumenRazon: { color: '#9A8E7E', fontSize: 13, fontWeight: '600' },
  resumenSub: { color: '#9A8E7E', fontSize: 12, marginTop: 6 },

  // Fin de partida
  finOverlay: {
    backgroundColor: 'rgba(10,7,4,0.9)',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  finTitulo: { color: '#DFC47A', fontSize: 38, fontWeight: '900', letterSpacing: 1 },
  finPuntos: { color: '#fff', fontSize: 22, fontWeight: '800' },
  finAbandono: { color: '#9A8E7E', fontSize: 14, fontWeight: '600' },
  finBtn: {
    marginTop: 18, backgroundColor: '#C9A84C',
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 48,
  },
  finBtnTx: { color: '#1a140a', fontSize: 17, fontWeight: '800' },
})

// ─── Root component ───────────────────────────────────────────────────────────

export default function TrucoJuego() {
  const { usuario } = useAuthStore()
  const c = useColores()

  const [fase, setFase] = useState<Fase>('setup')
  const [modo, setModo] = useState<Modo>('mano')
  const [amigos, setAmigos] = useState<Amigo[]>([])
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([])
  const [mesas, setMesas] = useState<MesaEspera[]>([])
  const [partidasActivas, setPartidasActivas] = useState<PartidaActiva[]>([])
  const [cargando, setCargando] = useState(true)
  const [amigoPendiente, setAmigoPendiente] = useState<Amigo | null>(null)
  const [seleccion, setSeleccion] = useState<Amigo[]>([])
  const [aceptados, setAceptados] = useState<string[]>([])

  const [partida, setPartida] = useState<Partida | null>(null)
  const [estadoJuego, setEstadoJuego] = useState<EstadoJuego | null>(null)

  const estadoRef = useRef<EstadoJuego | null>(null)
  const versionRef = useRef(0)
  const faseRef = useRef<Fase>('setup')
  const partidaRef = useRef<Partida | null>(null)

  useEffect(() => { estadoRef.current = estadoJuego }, [estadoJuego])
  useEffect(() => { faseRef.current = fase }, [fase])
  useEffect(() => { partidaRef.current = partida }, [partida])

  const yo: Amigo | null = usuario ? { id: usuario.id, nombre: usuario.apodo || usuario.nombre || 'Vos' } : null

  // ── Carga inicial + realtime del lobby ─────────────────────────────────────
  useEffect(() => {
    cargarAmigos()
    cargarPendientes()
    if (!usuario?.id) return
    const recargarLobby = () => { if (faseRef.current === 'setup') cargarPendientes() }
    const ch = supabase.channel(`truco-lobby-${usuario.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'truco_partidas', filter: `jugador2=eq.${usuario.id}` }, recargarLobby)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'truco_partidas', filter: `jugador3=eq.${usuario.id}` }, recargarLobby)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'truco_partidas', filter: `jugador4=eq.${usuario.id}` }, recargarLobby)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'truco_partidas', filter: `jugador1=eq.${usuario.id}` }, recargarLobby)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'truco_partidas' }, recargarLobby)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [usuario?.id])

  async function cargarAmigos() {
    if (!usuario?.id) { setCargando(false); return }
    setCargando(true)
    const [{ data }, { data: bloqueadosData }] = await Promise.all([
      supabase
        .from('amistades')
        .select(`
          solicitante:usuarios_publicos!amistades_solicitante_id_fkey(id, nombre),
          receptor:usuarios_publicos!amistades_receptor_id_fkey(id, nombre)
        `)
        .eq('estado', 'aceptada')
        .or(`solicitante_id.eq.${usuario.id},receptor_id.eq.${usuario.id}`),
      supabase.from('bloqueados').select('bloqueado_id').eq('bloqueador_id', usuario.id),
    ])

    if (data) {
      const bloqueados = new Set((bloqueadosData ?? []).map((b: any) => b.bloqueado_id as string))
      const lista: Amigo[] = data.map((row: any) => {
        const esSolicitante = row.solicitante?.id === usuario.id
        const amigo = esSolicitante ? row.receptor : row.solicitante
        return { id: amigo?.id ?? '', nombre: amigo?.nombre ?? '' }
      }).filter(a => a.id && !bloqueados.has(a.id))
      setAmigos(lista)
    }
    setCargando(false)
  }

  // Invitaciones que me mandaron, mesas en espera y partidas en curso donde participo
  async function cargarPendientes() {
    if (!usuario?.id) return
    const { data } = await supabase
      .from('truco_partidas')
      .select(`
        id, estado, con_flor, modo, aceptados, jugador1, jugador2, jugador3, jugador4, estado_juego, version,
        j1:usuarios_publicos!truco_partidas_jugador1_fkey(id, nombre),
        j2:usuarios_publicos!truco_partidas_jugador2_fkey(id, nombre),
        j3:usuarios_publicos!truco_partidas_jugador3_fkey(id, nombre),
        j4:usuarios_publicos!truco_partidas_jugador4_fkey(id, nombre)
      `)
      .or(`jugador1.eq.${usuario.id},jugador2.eq.${usuario.id},jugador3.eq.${usuario.id},jugador4.eq.${usuario.id}`)
      .in('estado', ['esperando', 'jugando'])
      .order('created_at', { ascending: false })

    if (!data) return
    const invs: Invitacion[] = []
    const mesasEspera: MesaEspera[] = []
    const activas: PartidaActiva[] = []
    for (const row of data as any[]) {
      const jugadores = jugadoresDeRow(row)
      const miAsiento = jugadores.findIndex(j => j.id === usuario.id)
      if (miAsiento === -1) continue
      const modoRow: ModoJuego = row.modo === 'parejas' ? 'parejas' : 'mano'
      const acept: string[] = row.aceptados ?? []
      if (row.estado === 'esperando') {
        if (miAsiento > 0 && !acept.includes(usuario.id)) {
          invs.push({
            id: row.id, conFlor: row.con_flor, modo: modoRow,
            de: jugadores[0], jugadores, miAsiento,
          })
        } else {
          mesasEspera.push({
            id: row.id, conFlor: row.con_flor, modo: modoRow,
            jugadores, miAsiento, aceptados: acept,
          })
        }
      } else if (row.estado === 'jugando' && row.estado_juego) {
        activas.push({
          id: row.id, miAsiento, jugadores,
          estadoJuego: normalizarEstado(row.estado_juego),
          version: row.version,
        })
      }
    }
    setInvitaciones(invs)
    setMesas(mesasEspera)
    setPartidasActivas(activas)
  }

  // ── Canal realtime de la partida activa ───────────────────────────────────
  useEffect(() => {
    if (!partida) return
    const ch = supabase.channel(`truco-partida-${partida.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'truco_partidas', filter: `id=eq.${partida.id}` }, payload => {
        const row: any = payload.new
        if (typeof row.version === 'number' && row.version < versionRef.current) return
        versionRef.current = row.version ?? versionRef.current
        if (row.estado_juego) {
          setEstadoJuego(normalizarEstado(row.estado_juego))
          if (faseRef.current === 'waiting') setFase('game')
        } else if (Array.isArray(row.aceptados)) {
          setAceptados(row.aceptados)
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'truco_partidas' }, payload => {
        const oldRow: any = payload.old
        if (oldRow?.id !== partidaRef.current?.id) return
        if (faseRef.current === 'waiting') {
          const eraCreador = partidaRef.current?.miAsiento === 0
          setPartida(null)
          setEstadoJuego(null)
          setFase('setup')
          cargarPendientes()
          Alert.alert(
            eraCreador ? 'Invitación rechazada' : 'Mesa cancelada',
            eraCreador ? 'Un amigo no aceptó la partida.' : 'La mesa ya no está disponible.',
          )
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [partida?.id])

  // ── Arranque de la partida de parejas ──────────────────────────────────────
  // El último en aceptar reparte (desde aceptarInvitacion). Este efecto es el
  // respaldo: si ese cliente se cayó entre el RPC y el reparto, cualquiera de
  // los que están en la sala intenta iniciar (guardado por estado='esperando').
  useEffect(() => {
    if (fase !== 'waiting' || !partida || partida.modo !== 'parejas') return
    if (aceptados.length < 3) return
    const t = setTimeout(() => iniciarPartida(partida), 1500 + partida.miAsiento * 1200)
    return () => clearTimeout(t)
  }, [fase, aceptados, partida])

  async function iniciarPartida(p: Partida) {
    if (faseRef.current === 'game') return
    const inicialJuego = estadoInicial(p.conFlor, 4)
    const { data } = await supabase
      .from('truco_partidas')
      .update({ estado: 'jugando', estado_juego: inicialJuego, version: 1, updated_at: new Date().toISOString() })
      .eq('id', p.id)
      .eq('estado', 'esperando')
      .select('id')
    if (data?.length) {
      versionRef.current = 1
      estadoRef.current = inicialJuego
      setEstadoJuego(inicialJuego)
      setFase('game')
    }
    // Si perdió la carrera, el realtime trae el reparto del que la ganó.
  }

  // ── Nueva mano automática tras el resumen ──────────────────────────────────
  useEffect(() => {
    const s = estadoJuego
    if (!s?.resumenMano || s.ganador || !partida || fase !== 'game') return
    // Reparte el equipo que ganó la mano; los demás quedan de respaldo,
    // escalonados por asiento (la versión deduplica).
    const miEquipo = equipoDe(partida.miAsiento)
    const orden = miembrosDe(miEquipo, s.numJugadores).indexOf(partida.miAsiento)
    const delay = (s.resumenMano.ganador === miEquipo ? 2800 : 7000) + orden * 1800
    const t = setTimeout(() => dispatch({ tipo: 'nuevaMano' }), delay)
    return () => clearTimeout(t)
  }, [estadoJuego, partida, fase])

  // ── Acciones del juego (optimista + versión) ───────────────────────────────
  async function dispatch(accion: Accion) {
    const prev = estadoRef.current
    const p = partidaRef.current
    if (!prev || !p || !usuario?.id) return
    const nuevo = reducir(prev, accion, p.miAsiento)
    if (nuevo === prev) return

    const v = versionRef.current
    versionRef.current = v + 1
    estadoRef.current = nuevo
    setEstadoJuego(nuevo)

    const upd: Record<string, unknown> = {
      estado_juego: nuevo,
      version: v + 1,
      updated_at: new Date().toISOString(),
    }
    if (nuevo.ganador) {
      upd.estado = 'terminada'
      upd.equipo_ganador = nuevo.ganador
      upd.ganador = p.jugadores[miembrosDe(nuevo.ganador, nuevo.numJugadores)[0]].id
    }

    const { data, error } = await supabase
      .from('truco_partidas')
      .update(upd)
      .eq('id', p.id)
      .eq('version', v)
      .select('version')

    if (error || !data?.length) {
      // Conflicto de versión (otro escribió primero): resincronizar
      const { data: row } = await supabase
        .from('truco_partidas')
        .select('estado_juego, version')
        .eq('id', p.id)
        .single()
      if (row?.estado_juego) {
        const sincronizado = normalizarEstado(row.estado_juego)
        versionRef.current = row.version
        estadoRef.current = sincronizado
        setEstadoJuego(sincronizado)
      }
    }
  }

  // ── Flujo de invitación ────────────────────────────────────────────────────
  function seleccionarAmigo(a: Amigo) {
    setAmigoPendiente(a)
    setFase('flor')
  }

  function toggleSeleccion(a: Amigo) {
    setSeleccion(prev => {
      if (prev.some(s => s.id === a.id)) return prev.filter(s => s.id !== a.id)
      if (prev.length >= 3) return prev
      return [...prev, a]
    })
  }

  async function confirmarFlor(cf: boolean) {
    if (!usuario?.id || !yo) return

    // Mano a mano
    if (amigoPendiente) {
      const { data, error } = await supabase
        .from('truco_partidas')
        .insert({ jugador1: usuario.id, jugador2: amigoPendiente.id, con_flor: cf })
        .select('id')
        .single()
      if (error || !data) {
        Alert.alert('Error', mensajeError(error, 'No se pudo crear la partida. Probá de nuevo.'))
        return
      }
      versionRef.current = 0
      setEstadoJuego(null)
      setAceptados([])
      setPartida({ id: data.id, miAsiento: 0, jugadores: [yo, amigoPendiente], conFlor: cf, modo: 'mano' })
      setFase('waiting')
      return
    }

    // Parejas: seleccion = [compañero, rival1, rival2]
    if (seleccion.length !== 3) return
    const [companero, rival1, rival2] = seleccion
    const { data, error } = await supabase
      .from('truco_partidas')
      .insert({
        jugador1: usuario.id, jugador2: rival1.id,
        jugador3: companero.id, jugador4: rival2.id,
        modo: 'parejas', con_flor: cf,
      })
      .select('id')
      .single()
    if (error || !data) {
      Alert.alert('Error', mensajeError(error, 'No se pudo armar la mesa. Probá de nuevo.'))
      return
    }
    versionRef.current = 0
    setEstadoJuego(null)
    setAceptados([])
    setPartida({
      id: data.id, miAsiento: 0,
      jugadores: [yo, rival1, companero, rival2],
      conFlor: cf, modo: 'parejas',
    })
    setFase('waiting')
  }

  async function salirDeEspera() {
    const p = partidaRef.current
    // El creador cancela la mesa para todos; un invitado que ya aceptó
    // solo vuelve al lobby (la mesa sigue esperando).
    if (p && p.miAsiento === 0) {
      await supabase.from('truco_partidas').delete().eq('id', p.id).eq('estado', 'esperando')
    }
    setPartida(null)
    setEstadoJuego(null)
    setSeleccion([])
    setFase('setup')
    cargarPendientes()
  }

  async function aceptarInvitacion(inv: Invitacion) {
    // Mano a mano: aceptar arranca la partida directamente
    if (inv.modo === 'mano') {
      const inicialJuego = estadoInicial(inv.conFlor, 2)
      const { data } = await supabase
        .from('truco_partidas')
        .update({ estado: 'jugando', estado_juego: inicialJuego, version: 1, updated_at: new Date().toISOString() })
        .eq('id', inv.id)
        .eq('estado', 'esperando')
        .select('id')
      if (!data?.length) {
        Alert.alert('Ups', 'La invitación ya no está disponible.')
        cargarPendientes()
        return
      }
      versionRef.current = 1
      estadoRef.current = inicialJuego
      setEstadoJuego(inicialJuego)
      setPartida({ id: inv.id, miAsiento: inv.miAsiento, jugadores: inv.jugadores, conFlor: inv.conFlor, modo: 'mano' })
      setFase('game')
      return
    }

    // Parejas: aceptación atómica; el último que acepta reparte
    const { data, error } = await supabase.rpc('aceptar_truco', { p_partida: inv.id })
    if (error || !data) {
      Alert.alert('Ups', mensajeError(error, 'La invitación ya no está disponible.'))
      cargarPendientes()
      return
    }
    const p: Partida = { id: inv.id, miAsiento: inv.miAsiento, jugadores: inv.jugadores, conFlor: inv.conFlor, modo: 'parejas' }
    versionRef.current = 0
    estadoRef.current = null
    setEstadoJuego(null)
    setAceptados((data as any).aceptados ?? [])
    setPartida(p)
    setFase('waiting')
    if ((data as any).completo) iniciarPartida(p)
  }

  async function rechazarInvitacion(inv: Invitacion) {
    await supabase.from('truco_partidas').delete().eq('id', inv.id).eq('estado', 'esperando')
    cargarPendientes()
  }

  function entrarMesa(m: MesaEspera) {
    versionRef.current = 0
    setEstadoJuego(null)
    setAceptados(m.aceptados)
    setPartida({ id: m.id, miAsiento: m.miAsiento, jugadores: m.jugadores, conFlor: m.conFlor, modo: m.modo })
    setFase('waiting')
  }

  function continuarPartida(p: PartidaActiva) {
    versionRef.current = p.version
    estadoRef.current = p.estadoJuego
    setEstadoJuego(p.estadoJuego)
    setPartida({
      id: p.id, miAsiento: p.miAsiento, jugadores: p.jugadores,
      conFlor: p.estadoJuego.conFlor, modo: p.jugadores.length === 4 ? 'parejas' : 'mano',
    })
    setFase('game')
  }

  // ── Salir / abandonar ──────────────────────────────────────────────────────
  function salirDelJuego() {
    const s = estadoRef.current
    const p = partidaRef.current
    if (!s || !p || s.ganador) {
      router.back()
      return
    }
    const miEquipo = equipoDe(p.miAsiento)
    const equipoRival = rivalDe(miEquipo)
    const rivales = miembrosDe(equipoRival, s.numJugadores).map(a => p.jugadores[a])
    const mensaje = s.numJugadores === 4
      ? 'Si te vas, los rivales ganan la partida (tu compañero también pierde).'
      : `Si te vas, ${rivales[0].nombre} gana la partida.`
    Alert.alert('¿Abandonar la partida?', mensaje, [
      { text: 'Seguir jugando', style: 'cancel' },
      {
        text: 'Abandonar',
        style: 'destructive',
        onPress: async () => {
          const fin: EstadoJuego = {
            ...s, ganador: equipoRival, pendiente: null,
            abandonadoPor: miEquipo, abandonadoPorAsiento: p.miAsiento,
          }
          await supabase.from('truco_partidas').update({
            estado: 'terminada',
            ganador: rivales[0].id,
            equipo_ganador: equipoRival,
            estado_juego: fin,
            version: versionRef.current + 1,
            updated_at: new Date().toISOString(),
          }).eq('id', p.id)
          router.back()
        },
      },
    ])
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (fase === 'setup') {
    return (
      <PantallaSetup
        c={c} modo={modo} setModo={setModo}
        amigos={amigos} cargando={cargando}
        invitaciones={invitaciones}
        mesas={mesas}
        partidasActivas={partidasActivas}
        seleccion={seleccion}
        onSeleccionarAmigo={seleccionarAmigo}
        onToggleSeleccion={toggleSeleccion}
        onContinuarParejas={() => { setAmigoPendiente(null); setFase('flor') }}
        onAceptarInv={aceptarInvitacion}
        onRechazarInv={rechazarInvitacion}
        onEntrarMesa={entrarMesa}
        onContinuar={continuarPartida}
        onBack={() => router.back()}
      />
    )
  }

  if (fase === 'flor') {
    return (
      <PantallaFlor
        c={c}
        descripcion={amigoPendiente
          ? `¿Querés jugar con flor contra ${amigoPendiente.nombre}?`
          : `Vos y ${seleccion[0]?.nombre} contra ${seleccion[1]?.nombre} y ${seleccion[2]?.nombre}. ¿Juegan con flor?`}
        onConfirmar={confirmarFlor}
        onBack={() => { setAmigoPendiente(null); setFase('setup') }}
      />
    )
  }

  if (fase === 'waiting') {
    return (
      <PantallaWaiting
        c={c}
        jugadores={partida?.jugadores ?? []}
        aceptados={aceptados}
        miAsiento={partida?.miAsiento ?? 0}
        onSalir={salirDeEspera}
      />
    )
  }

  if (!partida || !estadoJuego) {
    return (
      <View style={{ flex: 1, backgroundColor: '#141210', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#C9A84C" />
      </View>
    )
  }

  return (
    <PantallaJuego
      c={c}
      jugadores={partida.jugadores}
      miAsiento={partida.miAsiento}
      estado={estadoJuego}
      onAccion={dispatch}
      onSalir={salirDelJuego}
    />
  )
}
