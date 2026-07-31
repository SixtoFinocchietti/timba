import { useCallback, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { AppIcon } from '@/components/ui/AppIcon'
import { CLAVE_PROGRESO, LECCIONES } from '@/lib/pool/tutorial'
import {
  CLAVE_NIVEL_ASISTENCIA, NIVEL_ASISTENCIA_DEFAULT, NIVELES_ASISTENCIA, NivelAsistencia,
} from '@/lib/pool/asistencia'
import { CLAVE_TACO_SKIN, OPCIONES_TACO, TACO_DEFAULT, TacoSkinId } from '@/lib/pool/skins'
import SelectorSkins from '@/components/pool/SelectorSkins'

// Menú del Pool (spec §2.1). Fases 2-3: práctica libre y 8-ball vs Bot;
// tutorial y online llegan en las fases 4-5 — se muestran como próximamente
// para que el menú ya comunique el alcance del juego.

const MODOS: {
  id: string
  nombre: string
  descripcion: string
  disponible: boolean
}[] = [
  { id: 'tutorial', nombre: 'Tutorial', descripcion: 'Aprendé controles, reglas y efectos en 3 minutos', disponible: true },
  { id: 'practica', nombre: 'Práctica libre', descripcion: 'Mesa sola, sin reglas: tirá y probá efectos', disponible: true },
  { id: 'bot', nombre: 'Jugar vs Bot', descripcion: '8-Ball con reglas · Fácil, Normal o Difícil', disponible: true },
  { id: 'amigo', nombre: 'Con un amigo', descripcion: 'Partida online con invitación por chat', disponible: true },
  // Oculto del menú por ahora (jul 2026) — la pantalla (debug-pool.tsx) y su
  // ruta siguen existiendo, solo no se muestra la entrada acá. Descomentar
  // para reactivarla si hace falta seguir calibrando geometría.
  // { id: 'debug', nombre: '🐞 Debug mesa (temporal)', descripcion: 'Ver bandas y troneras invisibles', disponible: true },
]

const DIFICULTADES = [
  { id: 'facil', nombre: 'Fácil', descripcion: 'Solo ve tiros directos y le pega de más' },
  { id: 'normal', nombre: 'Normal', descripcion: 'Planifica un tiro adelante y usa efecto' },
  { id: 'dificil', nombre: 'Difícil', descripcion: 'Planifica la limpieza y juega seguridades' },
]

export default function PoolMenu() {
  const c = useColores()
  const es = makeEstilos(c)
  const [sheetBot, setSheetBot] = useState(false)
  const [sheetAjustes, setSheetAjustes] = useState(false)
  const [skinsAbierto, setSkinsAbierto] = useState(false)
  const [progresoTutorial, setProgresoTutorial] = useState(0)
  const [nivelAsistencia, setNivelAsistencia] = useState<NivelAsistencia>(NIVEL_ASISTENCIA_DEFAULT)
  const [tacoSkin, setTacoSkin] = useState<TacoSkinId>(TACO_DEFAULT)

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(CLAVE_PROGRESO).then(v => {
        setProgresoTutorial(v ? (JSON.parse(v) as string[]).length : 0)
      })
      AsyncStorage.getItem(CLAVE_NIVEL_ASISTENCIA).then(v => {
        if (v === 'sin' || v === 'baja' || v === 'normal' || v === 'maxima') setNivelAsistencia(v)
      })
      AsyncStorage.getItem(CLAVE_TACO_SKIN).then(v => {
        if (v && OPCIONES_TACO.some(t => t.id === v)) setTacoSkin(v as TacoSkinId)
      })
    }, []),
  )

  function abrir(id: string) {
    if (id === 'tutorial') router.push('/juegos/tutorial-pool' as any)
    if (id === 'practica') router.push('/juegos/partida-pool' as any)
    if (id === 'bot') setSheetBot(true)
    if (id === 'amigo') router.push('/juegos/pool-online' as any)
    if (id === 'debug') router.push('/juegos/debug-pool' as any)
  }

  function jugarVsBot(dificultad: string) {
    setSheetBot(false)
    router.push({ pathname: '/juegos/partida-pool', params: { modo: 'bot', dificultad } } as any)
  }

  function elegirNivelAsistencia(id: NivelAsistencia) {
    setNivelAsistencia(id)
    AsyncStorage.setItem(CLAVE_NIVEL_ASISTENCIA, id)
  }

  function elegirTacoSkin(id: string) {
    setTacoSkin(id as TacoSkinId)
    AsyncStorage.setItem(CLAVE_TACO_SKIN, id)
  }

  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <View style={[es.header, es.headerFila]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={[es.volver, { color: c.primario }]}>‹ Volver</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSheetAjustes(true)} activeOpacity={0.7} hitSlop={10}>
          <AppIcon name="ajustes" size={22} color={c.textoSuave} />
        </TouchableOpacity>
      </View>

      <View style={es.tituloFila}>
        <AppIcon name="pool" size={34} />
        <Text style={[es.titulo, { color: c.texto }]}>Pool · 8-Ball</Text>
      </View>

      <View style={es.lista}>
        {MODOS.map(m => (
          <TouchableOpacity
            key={m.id}
            style={[
              es.card,
              { backgroundColor: c.fondoCard, borderColor: m.disponible ? c.primario : c.borde },
              !m.disponible && es.cardApagada,
            ]}
            onPress={() => abrir(m.id)}
            activeOpacity={m.disponible ? 0.8 : 1}
            disabled={!m.disponible}
          >
            <View style={es.cardTexto}>
              <Text style={[es.cardNombre, { color: c.texto }]}>
                {m.nombre}
                {m.id === 'tutorial' && progresoTutorial > 0
                  ? `  ·  ${progresoTutorial}/${LECCIONES.length}${progresoTutorial === LECCIONES.length ? ' ✓' : ''}`
                  : ''}
              </Text>
              <Text style={[es.cardDesc, { color: c.textoSuave }]}>{m.descripcion}</Text>
            </View>
            {m.disponible ? (
              <Text style={[es.chevron, { color: c.primario }]}>›</Text>
            ) : (
              <View style={[es.badge, { borderColor: c.borde }]}>
                <Text style={[es.badgeTexto, { color: c.textoSuave }]}>Pronto</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Bottom sheet: dificultad del Bot */}
      <Modal visible={sheetBot} transparent animationType="slide" onRequestClose={() => setSheetBot(false)}>
        <Pressable style={es.sheetOverlay} onPress={() => setSheetBot(false)} />
        <View style={[es.sheet, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
          <View style={[es.sheetHandle, { backgroundColor: c.borde }]} />
          <Text style={[es.sheetTitulo, { color: c.texto }]}>Jugar vs Bot</Text>
          <Text style={[es.sheetSubtitulo, { color: c.textoSuave }]}>¿Qué tan bueno lo querés?</Text>

          {DIFICULTADES.map(d => (
            <TouchableOpacity
              key={d.id}
              style={[es.sheetOpcion, { backgroundColor: c.fondoInput, borderColor: c.borde }]}
              onPress={() => jugarVsBot(d.id)}
              activeOpacity={0.8}
            >
              <View style={[es.sheetIcono, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
                <AppIcon name="pool" size={22} color={c.primario} />
              </View>
              <View style={es.sheetOpcionTexto}>
                <Text style={[es.sheetOpcionNombre, { color: c.texto }]}>{d.nombre}</Text>
                <Text style={[es.sheetOpcionDesc, { color: c.textoSuave }]}>{d.descripcion}</Text>
              </View>
              <Text style={[es.chevron, { color: c.textoSuave }]}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      {/* Bottom sheet: ajustes propios de Pool (spec §2.4, auditoría técnica
          jul 2026) — separado de un futuro "Ajustes" app-wide: acá vive solo
          lo que no tiene sentido fuera de este juego (nivel de asistencia,
          taco). El sonido/música quedan para la pantalla de Ajustes general
          cuando exista, no se duplican acá. */}
      <Modal visible={sheetAjustes} transparent animationType="slide" onRequestClose={() => setSheetAjustes(false)}>
        <Pressable style={es.sheetOverlay} onPress={() => setSheetAjustes(false)} />
        <View style={[es.sheet, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
          <View style={[es.sheetHandle, { backgroundColor: c.borde }]} />
          <Text style={[es.sheetTitulo, { color: c.texto }]}>Ajustes de Pool</Text>

          <Text style={[es.sheetSeccion, { color: c.textoSuave }]}>ASISTENCIA AL APUNTADO</Text>
          {NIVELES_ASISTENCIA.map(n => (
            <TouchableOpacity
              key={n.id}
              style={[
                es.sheetOpcionChica,
                { backgroundColor: c.fondoInput, borderColor: n.id === nivelAsistencia ? c.primario : c.borde },
              ]}
              onPress={() => elegirNivelAsistencia(n.id)}
              activeOpacity={0.8}
            >
              <View style={es.sheetOpcionTexto}>
                <Text style={[es.sheetOpcionNombre, { color: c.texto }]}>{n.nombre}</Text>
                <Text style={[es.sheetOpcionDesc, { color: c.textoSuave }]}>{n.descripcion}</Text>
              </View>
              {n.id === nivelAsistencia && <Text style={{ color: c.primario, fontSize: 18, fontWeight: '800' }}>✓</Text>}
            </TouchableOpacity>
          ))}

          <Text style={[es.sheetSeccion, { color: c.textoSuave, marginTop: 14 }]}>TACO</Text>
          <TouchableOpacity
            style={[es.sheetOpcionChica, { backgroundColor: c.fondoInput, borderColor: c.borde }]}
            onPress={() => setSkinsAbierto(true)}
            activeOpacity={0.8}
          >
            <View style={es.sheetOpcionTexto}>
              <Text style={[es.sheetOpcionNombre, { color: c.texto }]}>
                {OPCIONES_TACO.find(t => t.id === tacoSkin)?.nombre ?? 'Taco'}
              </Text>
              <Text style={[es.sheetOpcionDesc, { color: c.textoSuave }]}>Toca para elegir tu taco por defecto</Text>
            </View>
            <Text style={[es.chevron, { color: c.textoSuave }]}>›</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <SelectorSkins
        visible={skinsAbierto}
        titulo="Elegí tu taco"
        opciones={OPCIONES_TACO}
        seleccionado={tacoSkin}
        onCerrar={() => setSkinsAbierto(false)}
        onElegir={elegirTacoSkin}
      />
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1 },
    header: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 },
    headerFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    volver: { fontSize: 18, fontWeight: '700' },
    tituloFila: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24,
    },
    titulo: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
    lista: { paddingHorizontal: 24, gap: 12 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 16,
      padding: 20, borderRadius: 16, borderWidth: 1,
    },
    cardApagada: { opacity: 0.55 },
    cardTexto: { flex: 1, gap: 2 },
    cardNombre: { fontSize: 17, fontWeight: '700' },
    cardDesc: { fontSize: 13 },
    chevron: { fontSize: 24, fontWeight: '700' },
    badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    badgeTexto: { fontSize: 11, fontWeight: '700' },
    // Sheet (mismo patrón que juegos/index)
    sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: {
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      borderWidth: 1, borderBottomWidth: 0,
      padding: 10, paddingHorizontal: 20, paddingBottom: 36,
    },
    sheetHandle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
    sheetTitulo: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
    sheetSubtitulo: { fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 20 },
    sheetSeccion: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 20, marginBottom: 8 },
    sheetOpcion: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 12,
    },
    sheetOpcionChica: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderRadius: 14, padding: 14, borderWidth: 1.5, marginBottom: 10,
    },
    sheetIcono: {
      width: 44, height: 44, borderRadius: 12, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    sheetOpcionTexto: { flex: 1 },
    sheetOpcionNombre: { fontSize: 16, fontWeight: '800' },
    sheetOpcionDesc: { fontSize: 13, marginTop: 2 },
  })
}
