import { Modal, Pressable, View, Text, TouchableOpacity, Image } from 'react-native'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import { useColores } from '@/lib/ThemeContext'

type IconoTipo = 'bloquear' | 'eliminar' | 'reportar'

interface Props {
  visible: boolean
  onClose: () => void
  onConfirmar: () => void
  titulo: string
  descripcion: string
  nombre: string
  avatar_url?: string
  labelConfirmar?: string
  labelCancelar?: string
  icono?: IconoTipo
}

export function ConfirmacionModal({
  visible, onClose, onConfirmar,
  titulo, descripcion, nombre, avatar_url,
  labelConfirmar = 'Confirmar', labelCancelar = 'Cancelar',
  icono = 'bloquear',
}: Props) {
  const c = useColores()

  const iniciales = nombre
    .split(' ')
    .slice(0, 2)
    .map(p => p[0] ?? '')
    .join('')
    .toUpperCase()

  const idx = descripcion.indexOf(nombre)
  const antes = idx !== -1 ? descripcion.slice(0, idx) : descripcion
  const despues = idx !== -1 ? descripcion.slice(idx + nombre.length) : ''

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}
        onPress={onClose}
      >
        <Pressable style={{ width: '100%' }}>
          <View style={{ backgroundColor: c.fondoCard, borderRadius: 22, padding: 28, alignItems: 'center' }}>

            {/* Ícono superior */}
            {icono === 'reportar' ? (
              <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: c.fondoInput, justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
                <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
                  <Path d="M4 21V4" stroke={c.primario} strokeWidth={2.2} strokeLinecap="round" />
                  <Path d="M4 4h11l-2.8 4.5 2.8 4.5H4V4z" fill={c.primario} />
                </Svg>
              </View>
            ) : (
              <View style={{ marginBottom: 20 }}>
                {avatar_url ? (
                  <Image source={{ uri: avatar_url }} style={{ width: 64, height: 64, borderRadius: 32 }} />
                ) : (
                  <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.primario, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: c.fondo, fontSize: 22, fontWeight: '800' }}>{iniciales}</Text>
                  </View>
                )}
                {/* Overlay según acción */}
                <View style={{ position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: c.fondoCard, justifyContent: 'center', alignItems: 'center' }}>
                  {icono === 'eliminar' ? (
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c.fondoInput, justifyContent: 'center', alignItems: 'center' }}>
                      <Svg width={10} height={10} viewBox="0 0 24 24" fill="none">
                        <Line x1="5" y1="12" x2="19" y2="12" stroke={c.texto} strokeWidth={2.8} strokeLinecap="round" />
                      </Svg>
                    </View>
                  ) : (
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c.error, justifyContent: 'center', alignItems: 'center' }}>
                      <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
                        <Circle cx="12" cy="12" r="8" stroke="#fff" strokeWidth={2.5} />
                        <Line x1="6.5" y1="17.5" x2="17.5" y2="6.5" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
                      </Svg>
                    </View>
                  )}
                </View>
              </View>
            )}

            <Text style={{ color: c.primario, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
              Confirmar acción
            </Text>

            <Text style={{ color: c.texto, fontSize: 22, fontWeight: '800', marginBottom: 12, textAlign: 'center' }}>
              {titulo}
            </Text>

            <Text style={{ color: c.textoSuave, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
              {antes}
              {idx !== -1 && <Text style={{ color: c.texto, fontWeight: '700' }}>{nombre}</Text>}
              {despues}
            </Text>

            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity
                style={{ flex: 1, height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: c.borde, justifyContent: 'center', alignItems: 'center' }}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={{ color: c.texto, fontSize: 16, fontWeight: '600' }}>{labelCancelar}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, height: 50, borderRadius: 14, backgroundColor: c.primario, justifyContent: 'center', alignItems: 'center' }}
                onPress={onConfirmar}
                activeOpacity={0.8}
              >
                <Text style={{ color: c.fondo, fontSize: 16, fontWeight: '700' }}>{labelConfirmar}</Text>
              </TouchableOpacity>
            </View>

          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
