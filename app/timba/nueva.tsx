import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { Boton } from '@/components/ui/Boton'
import { Input } from '@/components/ui/Input'
import { TimbaTipo } from '@/types'
import { AppIcon, IconName } from '@/components/ui/AppIcon'

const TIPOS: { value: TimbaTipo; icono: IconName; label: string; desc: string }[] = [
  { value: 'amistosa', icono: 'amistosa', label: 'Amistosa', desc: 'Premio o prenda' },
  { value: 'monetaria', icono: 'conPlata', label: 'Con plata', desc: 'Cada uno apuesta dinero' },
]

const PRESETS_INICIO = [
  { label: 'Sin fecha', dias: null },
  { label: 'Mañana', dias: 1 },
  { label: '3 días', dias: 3 },
  { label: '1 semana', dias: 7 },
] as const

const PRESETS_LIMITE = [
  { label: 'Sin límite', dias: null },
  { label: '1 día', dias: 1 },
  { label: '3 días', dias: 3 },
  { label: '1 semana', dias: 7 },
] as const

function generarCodigo(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function diasToISO(dias: number | null, endOfDay = false): string | null {
  if (dias === null) return null
  const d = new Date()
  d.setDate(d.getDate() + dias)
  if (endOfDay) d.setHours(23, 59, 59, 0)
  else d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function mostrarFecha(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
}

export default function NuevaTimba() {
  const { usuario, session } = useAuthStore()
  const c = useColores()
  const es = makeEstilos(c)
  const params = useLocalSearchParams<{ tituloPreset?: string; opcionesPreset?: string; opcionesBloqueadas?: string }>()

  const opcionesBloqueadas = params.opcionesBloqueadas === 'true'
  const opcionesIniciales = params.opcionesPreset ? params.opcionesPreset.split(',') : ['', '']

  const [titulo, setTitulo] = useState(params.tituloPreset ?? '')
  const [descripcion, setDescripcion] = useState('')
  const [tipo, setTipo] = useState<TimbaTipo>('amistosa')
  const [opciones, setOpciones] = useState(opcionesIniciales)

  // Amistosa
  const [premio, setPremio] = useState('')
  const [prenda, setPrenda] = useState('')

  // Monetaria
  const [montoMinimo, setMontoMinimo] = useState('')
  const [montoMaximo, setMontoMaximo] = useState('')

  // Avanzado
  const [verAvanzado, setVerAvanzado] = useState(false)
  const [maxParticipantes, setMaxParticipantes] = useState('')
  const [diasInicio, setDiasInicio] = useState<number | null>(null)
  const [diasLimite, setDiasLimite] = useState<number | null>(null)

  const [cargando, setCargando] = useState(false)

  function agregarOpcion() {
    if (opciones.length < 6) setOpciones([...opciones, ''])
  }

  function editarOpcion(index: number, valor: string) {
    const nuevas = [...opciones]
    nuevas[index] = valor
    setOpciones(nuevas)
  }

  function eliminarOpcion(index: number) {
    if (opciones.length <= 2) return
    setOpciones(opciones.filter((_, i) => i !== index))
  }

  async function crearTimba() {
    if (!titulo.trim()) { Alert.alert('Escribí un título para la timba'); return }
    const opcionesValidas = opciones.filter(o => o.trim())
    if (opcionesValidas.length < 2) { Alert.alert('Necesitás al menos 2 opciones'); return }

    let montoMin: number | null = null
    let montoMax: number | null = null
    if (tipo === 'monetaria') {
      if (montoMinimo.trim()) {
        montoMin = parseFloat(montoMinimo.replace(',', '.'))
        if (isNaN(montoMin) || montoMin <= 0) { Alert.alert('El monto mínimo debe ser mayor a 0'); return }
      }
      if (montoMaximo.trim()) {
        montoMax = parseFloat(montoMaximo.replace(',', '.'))
        if (isNaN(montoMax) || montoMax <= 0) { Alert.alert('El monto máximo debe ser mayor a 0'); return }
      }
      if (montoMin && montoMax && montoMax < montoMin) {
        Alert.alert('El máximo debe ser mayor o igual al mínimo'); return
      }
    }

    let maxPart: number | null = null
    if (maxParticipantes.trim()) {
      maxPart = parseInt(maxParticipantes)
      if (isNaN(maxPart) || maxPart < 2) { Alert.alert('El cupo mínimo es 2 participantes'); return }
    }

    setCargando(true)
    const userId = usuario?.id ?? session?.user?.id
    if (!userId) { Alert.alert('Error', 'No hay sesión activa'); setCargando(false); return }
    const codigo = generarCodigo()

    const { error: insertError } = await supabase.from('timbas').insert({
      creador_id: userId,
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      tipo,
      opciones: opcionesValidas,
      estado: 'activa',
      codigo_invitacion: codigo,
      monto_minimo: montoMin,
      monto_maximo: montoMax,
      premio_descripcion: tipo === 'amistosa' ? (premio.trim() || null) : null,
      prenda_descripcion: tipo === 'amistosa' ? (prenda.trim() || null) : null,
      max_participantes: maxPart,
      fecha_inicio: diasToISO(diasInicio),
      limite_union: diasToISO(diasLimite, true),
    })

    if (insertError) { Alert.alert('Error al crear la timba', insertError.message); setCargando(false); return }

    const { data, error: selectError } = await supabase.from('timbas').select('id').eq('codigo_invitacion', codigo).single()
    if (selectError || !data) { Alert.alert('Error al cargar la timba', selectError?.message ?? 'Sin datos'); setCargando(false); return }

    await supabase.from('participantes').insert({ timba_id: data.id, usuario_id: userId, opcion_elegida: null })
    setCargando(false)
    router.replace(`/timba/${data.id}`)
  }

  return (
    <KeyboardAvoidingView style={es.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={es.contenedor} keyboardShouldPersistTaps="handled">

        <View style={es.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: c.textoSuave, fontSize: 16 }}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={{ color: c.texto, fontSize: 18, fontWeight: '700' }}>Nueva timba</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={es.form}>

          <Input label="¿Sobre qué apuestan?" value={titulo} onChangeText={setTitulo} placeholder="Ej: Quién llega primero a casa" />
          <Input
            label="Descripción (opcional)"
            value={descripcion}
            onChangeText={setDescripcion}
            placeholder="Detalles extra..."
            multiline
            numberOfLines={3}
            style={{ height: 80, paddingTop: 12 }}
          />

          {/* Tipo */}
          <View style={es.seccion}>
            <Text style={[es.labelSeccion, { color: c.textoSuave }]}>Tipo de apuesta</Text>
            <View style={es.tiposRow}>
              {TIPOS.map((t) => {
                const activo = tipo === t.value
                return (
                  <TouchableOpacity
                    key={t.value}
                    style={[es.tipoChip, { borderColor: activo ? c.primario : c.borde, backgroundColor: activo ? c.primario + '18' : c.fondoInput }]}
                    onPress={() => setTipo(t.value)}
                    activeOpacity={0.8}
                  >
                    <AppIcon name={t.icono} size={22} color={activo ? c.primario : c.textoSuave} />
                    <View>
                      <Text style={{ color: activo ? c.primario : c.texto, fontSize: 14, fontWeight: '700' }}>{t.label}</Text>
                      <Text style={{ color: c.textoSuave, fontSize: 11 }}>{t.desc}</Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Campos para Amistosa */}
          {tipo === 'amistosa' && (
            <View style={es.seccion}>
              <Input label="Premio (opcional)" value={premio} onChangeText={setPremio} placeholder="Ej: El ganador elige el restaurante" />
              <Input label="Prenda (opcional)" value={prenda} onChangeText={setPrenda} placeholder="Ej: El que pierde paga la cuenta" />
            </View>
          )}

          {/* Campos para Monetaria */}
          {tipo === 'monetaria' && (
            <View style={[es.seccion, { gap: 10 }]}>
              <Text style={[es.labelSeccion, { color: c.textoSuave }]}>Montos de apuesta (opcional)</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Input label="Mínimo ($)" value={montoMinimo} onChangeText={setMontoMinimo} placeholder="Sin mínimo" keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Input label="Máximo ($)" value={montoMaximo} onChangeText={setMontoMaximo} placeholder="Sin máximo" keyboardType="numeric" />
                </View>
              </View>
            </View>
          )}

          {/* Opciones */}
          <View style={es.seccion}>
            <Text style={[es.labelSeccion, { color: c.textoSuave }]}>Opciones</Text>
            {opcionesBloqueadas ? (
              opciones.map((op, i) => (
                <View key={i} style={[es.filaOpcion, { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.fondoInput }]}>
                  <Text style={{ color: c.texto, fontSize: 15, fontWeight: '600' }}>{op}</Text>
                </View>
              ))
            ) : (
              <>
                {opciones.map((op, i) => (
                  <View key={i} style={es.filaOpcion}>
                    <Input value={op} onChangeText={(v) => editarOpcion(i, v)} placeholder={`Opción ${i + 1}`} style={es.inputOpcion} />
                    {opciones.length > 2 && (
                      <TouchableOpacity onPress={() => eliminarOpcion(i)} style={es.btnEliminar}>
                        <Text style={{ color: c.error, fontSize: 18 }}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                {opciones.length < 6 && (
                  <TouchableOpacity onPress={agregarOpcion} style={{ paddingVertical: 6 }}>
                    <Text style={{ color: c.primario, fontSize: 14, fontWeight: '600' }}>+ Agregar opción</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          {/* Avanzado toggle */}
          <TouchableOpacity
            style={[es.btnAvanzado, { backgroundColor: c.fondoCard, borderColor: c.borde }]}
            onPress={() => setVerAvanzado(v => !v)}
            activeOpacity={0.8}
          >
            <Text style={{ color: c.textoSuave, fontSize: 14, fontWeight: '600' }}>
              {verAvanzado ? '▲' : '▼'}  Configuración avanzada
            </Text>
          </TouchableOpacity>

          {verAvanzado && (
            <View style={[es.avanzadoCard, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>

              {/* Max participantes */}
              <View style={es.avanzadoItem}>
                <Text style={[es.avanzadoLabel, { color: c.texto }]}>Cupo máximo</Text>
                <Text style={{ color: c.textoSuave, fontSize: 12, marginBottom: 6 }}>Máximo de personas que pueden unirse</Text>
                <Input
                  value={maxParticipantes}
                  onChangeText={setMaxParticipantes}
                  placeholder="Sin límite"
                  keyboardType="numeric"
                />
              </View>

              {/* Fecha de inicio */}
              <View style={es.avanzadoItem}>
                <Text style={[es.avanzadoLabel, { color: c.texto }]}>Inicio programado</Text>
                <Text style={{ color: c.textoSuave, fontSize: 12, marginBottom: 8 }}>
                  La timba no aparece hasta esta fecha
                </Text>
                <View style={es.presetsRow}>
                  {PRESETS_INICIO.map((p) => {
                    const activo = diasInicio === p.dias
                    return (
                      <TouchableOpacity
                        key={String(p.dias)}
                        style={[es.presetChip, { borderColor: activo ? c.primario : c.borde, backgroundColor: activo ? c.primario + '18' : c.fondoInput }]}
                        onPress={() => setDiasInicio(p.dias)}
                        activeOpacity={0.8}
                      >
                        <Text style={{ color: activo ? c.primario : c.textoSuave, fontSize: 13, fontWeight: '600' }}>
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                {diasInicio !== null && (
                  <Text style={{ color: c.primario, fontSize: 13, marginTop: 6 }}>
                    Aparece el {mostrarFecha(diasInicio)}
                  </Text>
                )}
              </View>

              {/* Límite de unión */}
              <View style={es.avanzadoItem}>
                <Text style={[es.avanzadoLabel, { color: c.texto }]}>Límite de unión</Text>
                <Text style={{ color: c.textoSuave, fontSize: 12, marginBottom: 8 }}>
                  Hasta cuándo se puede unir alguien
                </Text>
                <View style={es.presetsRow}>
                  {PRESETS_LIMITE.map((p) => {
                    const activo = diasLimite === p.dias
                    return (
                      <TouchableOpacity
                        key={String(p.dias)}
                        style={[es.presetChip, { borderColor: activo ? c.primario : c.borde, backgroundColor: activo ? c.primario + '18' : c.fondoInput }]}
                        onPress={() => setDiasLimite(p.dias)}
                        activeOpacity={0.8}
                      >
                        <Text style={{ color: activo ? c.primario : c.textoSuave, fontSize: 13, fontWeight: '600' }}>
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                {diasLimite !== null && (
                  <Text style={{ color: c.primario, fontSize: 13, marginTop: 6 }}>
                    Cierra el {mostrarFecha(diasLimite)}
                  </Text>
                )}
              </View>

            </View>
          )}

          <Boton titulo="Crear timba" onPress={crearTimba} cargando={cargando} style={{ marginTop: 8 }} />

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.fondo },
    contenedor: { paddingBottom: 48 },
    topBar: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20,
    },
    form: { paddingHorizontal: 24, gap: 20 },
    seccion: { gap: 10 },
    labelSeccion: { fontSize: 13, fontWeight: '600' },
    tiposRow: { gap: 10 },
    tipoChip: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      padding: 14, borderRadius: 14, borderWidth: 1.5,
    },
    filaOpcion: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    inputOpcion: { flex: 1 },
    btnEliminar: { width: 36, height: 52, alignItems: 'center', justifyContent: 'center' },
    btnAvanzado: {
      flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
      padding: 14, borderRadius: 14, borderWidth: 1,
    },
    avanzadoCard: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 20 },
    avanzadoItem: { gap: 4 },
    avanzadoLabel: { fontSize: 14, fontWeight: '700' },
    presetsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    presetChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  })
}
