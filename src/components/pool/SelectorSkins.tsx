// Selector de skins (variantes visuales) — mismo modal para taco y mesa, con
// `opciones` genérico. La miniatura cambia de forma según qué se elige: el
// taco es una tira apaisada y la mesa es un rectángulo vertical (1234×1852),
// que en la caja del taco saldría aplastado.

import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useColores } from '@/lib/ThemeContext'

export interface OpcionSkin {
  id: string
  nombre: string
  preview: any // fuente de imagen (require) para la miniatura
}

interface SelectorSkinsProps {
  visible: boolean
  titulo: string
  opciones: OpcionSkin[]
  seleccionado: string
  onCerrar: () => void
  onElegir: (id: string) => void
  // forma de la miniatura: 'apaisado' (taco, default) o 'vertical' (mesa)
  formaPreview?: 'apaisado' | 'vertical'
}

export default function SelectorSkins({
  visible, titulo, opciones, seleccionado, onCerrar, onElegir, formaPreview = 'apaisado',
}: SelectorSkinsProps) {
  const c = useColores()
  const cajaPreview = formaPreview === 'vertical' ? es.previewWrapVertical : es.previewWrap

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={es.overlay} onPress={onCerrar} />
      <View style={[es.panel, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
        <Text style={[es.titulo, { color: c.texto }]}>{titulo}</Text>
        <ScrollView contentContainerStyle={es.lista} style={{ maxHeight: 360 }}>
          {opciones.map(op => {
            const activo = op.id === seleccionado
            return (
              <TouchableOpacity
                key={op.id}
                style={[es.opcion, { borderColor: activo ? c.primario : c.borde, backgroundColor: c.fondoInput }]}
                onPress={() => { onElegir(op.id); onCerrar() }}
                activeOpacity={0.8}
              >
                <View style={[cajaPreview, { backgroundColor: c.fondoCard }]}>
                  <Image source={op.preview} style={es.preview} resizeMode="contain" />
                </View>
                <Text style={[es.nombre, { color: activo ? c.primario : c.texto }]}>{op.nombre}</Text>
                {activo && <Text style={[es.check, { color: c.primario }]}>✓</Text>}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
        <TouchableOpacity style={[es.botonCerrar, { borderColor: c.borde }]} onPress={onCerrar} activeOpacity={0.8}>
          <Text style={[es.botonCerrarTexto, { color: c.textoSuave }]}>Cerrar</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  )
}

const es = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  panel: {
    position: 'absolute', left: 24, right: 24, top: '18%',
    borderRadius: 24, borderWidth: 1, padding: 20, alignItems: 'stretch',
  },
  titulo: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 14 },
  lista: { gap: 10 },
  opcion: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderRadius: 14, padding: 10,
  },
  previewWrap: {
    width: 90, height: 36, borderRadius: 8, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  // la mesa es 1234×1852 (vertical): caja alta para que se vea la proporción
  previewWrapVertical: {
    width: 62, height: 88, borderRadius: 8, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  preview: { width: '92%', height: '92%' },
  nombre: { flex: 1, fontSize: 14, fontWeight: '700' },
  check: { fontSize: 16, fontWeight: '800' },
  botonCerrar: { marginTop: 14, alignSelf: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 8 },
  botonCerrarTexto: { fontSize: 13, fontWeight: '700' },
})
