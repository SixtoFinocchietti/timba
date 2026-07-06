import { TextInput, Text, View, StyleSheet, TextInputProps } from 'react-native'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'

interface InputProps extends TextInputProps {
  label?: string
  error?: string
}

export function Input({ label, error, style, ...props }: InputProps) {
  const c = useColores()
  const es = makeEstilos(c)

  return (
    <View style={es.contenedor}>
      {label && <Text style={es.label}>{label}</Text>}
      <TextInput
        style={[es.input, error && es.inputError, style]}
        placeholderTextColor={c.textoSuave}
        selectionColor={c.primario}
        {...props}
      />
      {error && <Text style={es.error}>{error}</Text>}
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { gap: 6 },
    label: { color: c.textoSuave, fontSize: 13, fontWeight: '500' },
    input: {
      height: 52,
      backgroundColor: c.fondoInput,
      borderRadius: 12,
      paddingHorizontal: 16,
      color: c.texto,
      fontSize: 16,
      borderWidth: 1.5,
      borderColor: c.borde,
    },
    inputError: { borderColor: c.error },
    error: { color: c.error, fontSize: 12 },
  })
}
