import { useEffect, useRef } from 'react'
import { Animated, View, Text } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useColores } from '@/lib/ThemeContext'

interface Props {
  visible: boolean
  titulo: string
  subtitulo?: string
  onHide: () => void
  bottom?: number
}

export function Toast({ visible, titulo, subtitulo, onHide, bottom = 32 }: Props) {
  const c = useColores()
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(16)).current

  useEffect(() => {
    if (!visible) return
    opacity.setValue(0)
    translateY.setValue(16)
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start()
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 16, duration: 280, useNativeDriver: true }),
      ]).start(() => onHide())
    }, 2600)
    return () => clearTimeout(timer)
  }, [visible])

  if (!visible) return null

  return (
    <Animated.View
      style={{
        position: 'absolute', left: 20, right: 20, bottom,
        opacity, transform: [{ translateY }],
        zIndex: 999,
      }}
      pointerEvents="none"
    >
      <View style={{
        backgroundColor: c.fondoCard,
        borderRadius: 16,
        padding: 14,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
        elevation: 10,
      }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.primario, justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path d="M4 12.5l5 5 11-10" stroke={c.fondo} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.texto, fontSize: 14, fontWeight: '700' }}>{titulo}</Text>
          {subtitulo ? <Text style={{ color: c.textoSuave, fontSize: 13, marginTop: 2 }}>{subtitulo}</Text> : null}
        </View>
      </View>
    </Animated.View>
  )
}
