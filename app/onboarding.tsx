import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { AppIcon, IconName } from '@/components/ui/AppIcon'

const { width } = Dimensions.get('window')

interface Slide {
  icono: IconName
  titulo: string
  descripcion: string
}

const SLIDES: Slide[] = [
  {
    icono: 'timba',
    titulo: '¡Bienvenido a Timba!',
    descripcion: 'Registrá tus apuestas informales con amigos. Sin papeles, sin olvidarte de quién ganó.',
  },
  {
    icono: 'juegos',
    titulo: 'Creá una Timba',
    descripcion: 'Elegí el juego, compartí el código de invitación y declarad el resultado. Todos confirman para cerrarla.',
  },
  {
    icono: 'saldos',
    titulo: 'Seguí tus saldos',
    descripcion: 'Sabé siempre cuánto te deben y cuánto debés. Con un toque podés recordarle a quien te debe.',
  },
]

export default function Onboarding() {
  const [slide, setSlide] = useState(0)
  const c = useColores()
  const es = makeEstilos(c)

  async function completar() {
    await AsyncStorage.setItem('@timba:onboarding_visto', '1')
    router.replace('/(auth)/login')
  }

  function siguiente() {
    if (slide < SLIDES.length - 1) {
      setSlide(s => s + 1)
    } else {
      completar()
    }
  }

  const s = SLIDES[slide]
  const esUltimo = slide === SLIDES.length - 1

  return (
    <View style={es.contenedor}>
      {/* Saltar */}
      {!esUltimo && (
        <TouchableOpacity style={es.saltar} onPress={completar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={es.saltarTexto}>Saltar</Text>
        </TouchableOpacity>
      )}

      {/* Icono */}
      <View style={es.iconArea}>
        <View style={[es.iconCircle, { backgroundColor: c.primario + '18' }]}>
          <AppIcon name={s.icono} size={80} color={c.primario} />
        </View>
      </View>

      {/* Texto */}
      <View style={es.textoArea}>
        <Text style={es.titulo}>{s.titulo}</Text>
        <Text style={es.descripcion}>{s.descripcion}</Text>
      </View>

      {/* Dots */}
      <View style={es.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              es.dot,
              { backgroundColor: i === slide ? c.primario : c.borde },
              i === slide && { width: 22 },
            ]}
          />
        ))}
      </View>

      {/* Botón principal */}
      <TouchableOpacity
        style={[es.btn, { backgroundColor: c.primario }]}
        onPress={siguiente}
        activeOpacity={0.85}
      >
        <Text style={[es.btnTexto, { color: c.fondo }]}>
          {esUltimo ? 'Empezar' : 'Siguiente →'}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: {
      flex: 1,
      backgroundColor: c.fondo,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      gap: 32,
    },
    saltar: {
      position: 'absolute',
      top: 56,
      right: 24,
    },
    saltarTexto: {
      color: c.textoSuave,
      fontSize: 15,
      fontWeight: '600',
    },
    iconArea: {
      alignItems: 'center',
    },
    iconCircle: {
      width: 160,
      height: 160,
      borderRadius: 80,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textoArea: {
      alignItems: 'center',
      gap: 12,
    },
    titulo: {
      fontSize: 28,
      fontWeight: '800',
      color: c.texto,
      textAlign: 'center',
      letterSpacing: -0.5,
    },
    descripcion: {
      fontSize: 16,
      color: c.textoSuave,
      textAlign: 'center',
      lineHeight: 24,
    },
    dots: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    btn: {
      width: width - 64,
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: 'center',
    },
    btnTexto: {
      fontSize: 17,
      fontWeight: '700',
    },
  })
}
