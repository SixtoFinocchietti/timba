import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native'
import { Link, router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { Boton } from '@/components/ui/Boton'
import { Input } from '@/components/ui/Input'
import { mensajeError } from '@/lib/errores'

export default function Registro() {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [aceptaTerminos, setAceptaTerminos] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [emailEnviado, setEmailEnviado] = useState(false)
  const c = useColores()
  const es = makeEstilos(c)

  async function registrarse() {
    if (!nombre.trim() || !email.trim() || !password) { Alert.alert('Completá todos los campos'); return }
    if (password.length < 8) { Alert.alert('Contraseña muy corta', 'Debe tener al menos 8 caracteres.'); return }
    if (!/\d/.test(password)) { Alert.alert('Contraseña débil', 'Incluí al menos un número.'); return }
    if (!aceptaTerminos) { Alert.alert('Aceptá los términos', 'Necesitás aceptar los Términos y la Política de Privacidad para continuar.'); return }

    setCargando(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { nombre: nombre.trim() } },
    })
    if (error) { Alert.alert('No se pudo crear la cuenta', mensajeError(error)); setCargando(false); return }

    // Si session es null, Supabase envió un email de confirmación
    if (!data.session) {
      setEmailEnviado(true)
      setCargando(false)
      return
    }

    router.replace('/(tabs)/home')
    setCargando(false)
  }

  async function reenviarEmail() {
    setCargando(true)
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase() })
    if (error) Alert.alert('Error', mensajeError(error))
    else Alert.alert('Email reenviado', 'Revisá tu bandeja de entrada.')
    setCargando(false)
  }

  // Pantalla de "verificá tu email"
  if (emailEnviado) {
    return (
      <View style={[es.flex, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 }]}>
        <Text style={{ fontSize: 48 }}>📬</Text>
        <Text style={{ color: c.texto, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>
          Revisá tu email
        </Text>
        <Text style={{ color: c.textoSuave, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
          Te enviamos un link de confirmación a{'\n'}
          <Text style={{ color: c.primario, fontWeight: '600' }}>{email.trim().toLowerCase()}</Text>
          {'\n\n'}Hacé click en el link para activar tu cuenta y luego ingresá.
        </Text>
        <Boton titulo="Reenviar email" onPress={reenviarEmail} cargando={cargando} variante="secundario" />
        <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
          <Text style={{ color: c.primario, fontWeight: '700', fontSize: 15 }}>Ir al login →</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={es.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={es.contenedor} keyboardShouldPersistTaps="handled">
        <View style={es.header}>
          <Text style={es.titulo}>Crear cuenta</Text>
          <Text style={es.subtitulo}>Empezá a apostar con tus amigos</Text>
        </View>
        <View style={es.form}>
          <Input label="Tu nombre" value={nombre} onChangeText={setNombre} placeholder="Juan" autoCapitalize="words" />
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="tu@email.com" keyboardType="email-address" autoCapitalize="none" />
          <Input label="Contraseña" value={password} onChangeText={setPassword} placeholder="Mínimo 8 caracteres con un número" secureTextEntry />

          {/* Aceptación de términos */}
          <TouchableOpacity style={es.checkRow} onPress={() => setAceptaTerminos(v => !v)} activeOpacity={0.7}>
            <View style={[es.checkbox, aceptaTerminos && { backgroundColor: c.primario, borderColor: c.primario }]}>
              {aceptaTerminos && <Text style={{ color: c.fondo, fontSize: 12, fontWeight: '800' }}>✓</Text>}
            </View>
            <Text style={es.checkTexto}>
              Acepto los{' '}
              <Text style={es.checkLink} onPress={() => router.push('/terminos')}>Términos y Condiciones</Text>
              {' '}y la{' '}
              <Text style={es.checkLink} onPress={() => router.push('/privacidad')}>Política de Privacidad</Text>
            </Text>
          </TouchableOpacity>

          <Boton titulo="Crear cuenta" onPress={registrarse} cargando={cargando} />
        </View>
        <View style={es.footer}>
          <Text style={es.textoFooter}>¿Ya tenés cuenta? </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity><Text style={es.link}>Ingresá</Text></TouchableOpacity>
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
    header: { gap: 8 },
    titulo: { fontSize: 32, fontWeight: '800', color: c.texto, letterSpacing: -0.5 },
    subtitulo: { color: c.textoSuave, fontSize: 16 },
    form: { gap: 16 },
    checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    checkbox: {
      width: 22, height: 22, borderRadius: 6, borderWidth: 2,
      borderColor: c.borde, alignItems: 'center', justifyContent: 'center',
      marginTop: 1, flexShrink: 0,
    },
    checkTexto: { color: c.textoSuave, fontSize: 13, lineHeight: 20, flex: 1 },
    checkLink: { color: c.primario, fontWeight: '600' },
    footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    textoFooter: { color: c.textoSuave, fontSize: 14 },
    link: { color: c.primario, fontSize: 14, fontWeight: '600' },
  })
}
