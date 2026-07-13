import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native'
import { router } from 'expo-router'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { AppIcon, IconName } from '@/components/ui/AppIcon'

const JUEGOS: { id: string; nombre: string; descripcion: string; icono: IconName }[] = [
  { id: 'truco', nombre: 'Truco', descripcion: 'Versión argentina', icono: 'machoEspada' },
  { id: 'poker', nombre: 'Póker', descripcion: "Texas Hold'em", icono: 'poker' },
  { id: 'blackjack', nombre: 'Blackjack', descripcion: '21 · Práctica o mesa con amigos', icono: 'poker' },
]

export default function Juegos() {
  const c = useColores()
  const es = makeEstilos(c)
  const [sheetTruco, setSheetTruco] = useState(false)
  const [sheetBlackjack, setSheetBlackjack] = useState(false)

  function onPressTarjeta(id: string) {
    if (id === 'truco') { setSheetTruco(true); return }
    if (id === 'blackjack') { setSheetBlackjack(true); return }
    router.push(`/juegos/${id}` as any)
  }

  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <View style={es.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={[es.volver, { color: c.primario }]}>‹ Volver</Text>
        </TouchableOpacity>
      </View>

      <Text style={[es.titulo, { color: c.texto }]}>Juegos</Text>

      <View style={es.lista}>
        {JUEGOS.map(juego => (
          <TouchableOpacity
            key={juego.id}
            style={[es.card, { backgroundColor: c.fondoCard, borderColor: c.borde }]}
            onPress={() => onPressTarjeta(juego.id)}
            activeOpacity={0.8}
          >
            <AppIcon name={juego.icono} size={36} />
            <View style={es.cardTexto}>
              <Text style={[es.cardNombre, { color: c.texto }]}>{juego.nombre}</Text>
              <Text style={[es.cardDesc, { color: c.textoSuave }]}>{juego.descripcion}</Text>
            </View>
            <Text style={[es.chevron, { color: c.textoSuave }]}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bottom sheet: elegir modo Truco */}
      <Modal visible={sheetTruco} transparent animationType="slide" onRequestClose={() => setSheetTruco(false)}>
        <Pressable style={es.sheetOverlay} onPress={() => setSheetTruco(false)} />
        <View style={[es.sheet, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
          <View style={[es.sheetHandle, { backgroundColor: c.borde }]} />
          <Text style={[es.sheetTitulo, { color: c.texto }]}>Truco</Text>
          <Text style={[es.sheetSubtitulo, { color: c.textoSuave }]}>¿Qué querés abrir?</Text>

          <TouchableOpacity
            style={[es.sheetOpcion, { backgroundColor: c.fondoInput, borderColor: c.borde }]}
            onPress={() => { setSheetTruco(false); router.push('/juegos/truco') }}
            activeOpacity={0.8}
          >
            <View style={[es.sheetIcono, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
              <AppIcon name="machoEspada" size={22} color={c.primario} />
            </View>
            <View style={es.sheetOpcionTexto}>
              <Text style={[es.sheetOpcionNombre, { color: c.texto }]}>Contador</Text>
              <Text style={[es.sheetOpcionDesc, { color: c.textoSuave }]}>Solo llevar el tanteador con palillos</Text>
            </View>
            <Text style={[es.chevron, { color: c.textoSuave }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[es.sheetOpcionDestacada, { borderColor: c.primario }]}
            onPress={() => { setSheetTruco(false); router.push('/juegos/truco-juego' as any) }}
            activeOpacity={0.8}
          >
            <View style={[es.sheetIconoDestacado, { backgroundColor: c.primario }]}>
              <Text style={{ color: c.fondo, fontSize: 22, fontWeight: '800' }}>♣</Text>
            </View>
            <View style={es.sheetOpcionTexto}>
              <Text style={[es.sheetOpcionNombre, { color: c.texto }]}>Juego</Text>
              <Text style={[es.sheetOpcionDescDestacada, { color: c.primarioSuave }]}>Partida real en la mesa</Text>
            </View>
            <Text style={[es.chevron, { color: c.primario }]}>›</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Bottom sheet: elegir modo Blackjack */}
      <Modal visible={sheetBlackjack} transparent animationType="slide" onRequestClose={() => setSheetBlackjack(false)}>
        <Pressable style={es.sheetOverlay} onPress={() => setSheetBlackjack(false)} />
        <View style={[es.sheet, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
          <View style={[es.sheetHandle, { backgroundColor: c.borde }]} />
          <Text style={[es.sheetTitulo, { color: c.texto }]}>Blackjack</Text>
          <Text style={[es.sheetSubtitulo, { color: c.textoSuave }]}>¿Cómo querés jugar?</Text>

          <TouchableOpacity
            style={[es.sheetOpcion, { backgroundColor: c.fondoInput, borderColor: c.borde }]}
            onPress={() => { setSheetBlackjack(false); router.push('/juegos/practica-blackjack' as any) }}
            activeOpacity={0.8}
          >
            <View style={[es.sheetIcono, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
              <Text style={{ color: c.primario, fontSize: 20, fontWeight: '800' }}>21</Text>
            </View>
            <View style={es.sheetOpcionTexto}>
              <Text style={[es.sheetOpcionNombre, { color: c.texto }]}>Práctica rápida</Text>
              <Text style={[es.sheetOpcionDesc, { color: c.textoSuave }]}>Vos contra un Bot, para practicar</Text>
            </View>
            <Text style={[es.chevron, { color: c.textoSuave }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[es.sheetOpcion, { backgroundColor: c.fondoInput, borderColor: c.borde }]}
            onPress={() => { setSheetBlackjack(false); router.push('/juegos/partida-blackjack-clasico-bot' as any) }}
            activeOpacity={0.8}
          >
            <View style={[es.sheetIcono, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
              <Text style={{ color: c.primario, fontSize: 20, fontWeight: '800' }}>♠</Text>
            </View>
            <View style={es.sheetOpcionTexto}>
              <Text style={[es.sheetOpcionNombre, { color: c.texto }]}>Clásico vs Bot</Text>
              <Text style={[es.sheetOpcionDesc, { color: c.textoSuave }]}>Con dealer y corona, contra un Bot</Text>
            </View>
            <Text style={[es.chevron, { color: c.textoSuave }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[es.sheetOpcionDestacada, { borderColor: c.primario }]}
            onPress={() => { setSheetBlackjack(false); router.push('/juegos/blackjack' as any) }}
            activeOpacity={0.8}
          >
            <View style={[es.sheetIconoDestacado, { backgroundColor: c.primario }]}>
              <AppIcon name="amigos" size={22} color={c.fondo} />
            </View>
            <View style={es.sheetOpcionTexto}>
              <Text style={[es.sheetOpcionNombre, { color: c.texto }]}>Mesa con amigo</Text>
              <Text style={[es.sheetOpcionDescDestacada, { color: c.primarioSuave }]}>Partida real, invitá a un amigo</Text>
            </View>
            <Text style={[es.chevron, { color: c.primario }]}>›</Text>
          </TouchableOpacity>
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
      fontSize: 32, fontWeight: '800', letterSpacing: -0.5,
      paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24,
    },
    lista: { paddingHorizontal: 24, gap: 12 },
    card: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, borderRadius: 16, borderWidth: 1 },
    cardTexto: { flex: 1, gap: 2 },
    cardNombre: { fontSize: 18, fontWeight: '700' },
    cardDesc: { fontSize: 13 },
    chevron: { fontSize: 24, fontWeight: '700' },
    // Sheet
    sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: {
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      borderWidth: 1, borderBottomWidth: 0,
      padding: 10, paddingHorizontal: 20, paddingBottom: 36,
    },
    sheetHandle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
    sheetTitulo: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
    sheetSubtitulo: { fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 20 },
    sheetOpcion: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 12,
    },
    sheetOpcionDestacada: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      borderRadius: 16, padding: 16, borderWidth: 1.5,
      backgroundColor: 'rgba(201,168,76,0.08)',
    },
    sheetIcono: {
      width: 44, height: 44, borderRadius: 12, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    sheetIconoDestacado: {
      width: 44, height: 44, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    sheetOpcionTexto: { flex: 1 },
    sheetOpcionNombre: { fontSize: 16, fontWeight: '800' },
    sheetOpcionDesc: { fontSize: 13, marginTop: 2 },
    sheetOpcionDescDestacada: { fontSize: 13, marginTop: 2 },
  })
}
