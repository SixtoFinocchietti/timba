import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native'
import { Link, router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { Boton } from '@/components/ui/Boton'
import { Input } from '@/components/ui/Input'
import { AppIcon } from '@/components/ui/AppIcon'
import { mensajeError } from '@/lib/errores'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const c = useColores()
  const es = makeEstilos(c)

  async function iniciarSesion() {
    if (!email.trim() || !password) { Alert.alert('Completá todos los campos'); return }
    setCargando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) Alert.alert('No se pudo ingresar', mensajeError(error))
    else router.replace('/(tabs)/home')
    setCargando(false)
  }

  return (
    <KeyboardAvoidingView style={es.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={es.contenedor} keyboardShouldPersistTaps="handled">
        <View style={es.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <AppIcon name="timba" size={52} />
            <Text style={es.logo}>Timba</Text>
          </View>
          <Text style={es.subtitulo}>Apuestas entre amigos</Text>
        </View>
        <View style={es.form}>
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="tu@email.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <Input label="Contraseña" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
          <Boton titulo="Entrar" onPress={iniciarSesion} cargando={cargando} />
        </View>
        <View style={es.footer}>
          <Text style={es.textoFooter}>¿No tenés cuenta? </Text>
          <Link href="/(auth)/registro" asChild>
            <TouchableOpacity><Text style={es.link}>Registrate</Text></TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.fondo },
    contenedor: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center', gap: 40 },
    header: { alignItems: 'center', gap: 8 },
    logo: { fontSize: 48, fontWeight: '800', color: c.texto, letterSpacing: -1 },
    subtitulo: { color: c.textoSuave, fontSize: 16 },
    form: { gap: 16 },
    footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    textoFooter: { color: c.textoSuave, fontSize: 14 },
    link: { color: c.primario, fontSize: 14, fontWeight: '600' },
  })
}
