// Tutorial interactivo del Pool (spec §9): ejecuta el guion de
// src/lib/pool/tutorial.ts — 5 lecciones jugables sobre la mesa real (mismo
// motor, misma guía) + 1 quiz de reglas. Progreso persistido por lección;
// "Saltar" siempre visible; cada lección es rejugable.

import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import MesaPoolLazy from '@/components/pool/MesaPoolLazy'
import ControlFuerza from '@/components/pool/ControlFuerza'
import SelectorSpin, { Spin } from '@/components/pool/SelectorSpin'
import { PARAMETROS, simularTiro } from '@/lib/pool/fisica'
import { CLAVE_PROGRESO, LECCIONES, LeccionJugable } from '@/lib/pool/tutorial'
import { crearTransform, RELACION_ASPECTO, SENSIBILIDAD_APUNTADO } from '@/lib/pool/transform'
import { Bola, MuestraAnimacion } from '@/lib/pool/tipos'

const AJUSTE_FINO = (0.25 * Math.PI) / 180

// ángulo inicial: apuntando a la primera bola objetivo del setup
function anguloInicial(bolas: Bola[]): number {
  const blanca = bolas.find(b => b.n === 0)
  const objetivo = bolas.find(b => b.n !== 0)
  if (!blanca || !objetivo) return Math.PI / 2
  return Math.atan2(objetivo.pos.y - blanca.pos.y, objetivo.pos.x - blanca.pos.x)
}

export default function TutorialPool() {
  const c = useColores()
  const es = makeEstilos(c)

  const [idx, setIdx] = useState(0)
  const [completadas, setCompletadas] = useState<string[]>([])
  const [logrado, setLogrado] = useState(false)
  const leccion = LECCIONES[idx]

  // ── estado de la mesa (lecciones jugables) ──
  const [bolas, setBolas] = useState<Bola[]>(() =>
    LECCIONES[0].tipo === 'jugable' ? (LECCIONES[0] as LeccionJugable).armar() : [],
  )
  const [angulo, setAngulo] = useState(() => anguloInicial(bolas))
  const [spin, setSpin] = useState<Spin>({ a: 0, b: 0 })
  const [fuerza, setFuerza] = useState(0)
  const [muestra, setMuestra] = useState<MuestraAnimacion | null>(null)
  const [animando, setAnimando] = useState(false)
  const [spinAbierto, setSpinAbierto] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [anchoMesa, setAnchoMesa] = useState(0)

  // ── estado del quiz ──
  const [pregIdx, setPregIdx] = useState(0)
  const [respuesta, setRespuesta] = useState<number | null>(null)

  const rafRef = useRef<number | null>(null)
  const fuerzaRef = useRef(0)
  const zonaRef = useRef<View>(null)
  const bolasRef = useRef(bolas)
  bolasRef.current = bolas
  const anguloRef = useRef(angulo)
  anguloRef.current = angulo

  useEffect(() => {
    AsyncStorage.getItem(CLAVE_PROGRESO).then(v => {
      if (v) setCompletadas(JSON.parse(v))
    })
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // fallback de medición (tab web en segundo plano no dispara onLayout)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (anchoMesa > 0) return
      const el = zonaRef.current as unknown as { getBoundingClientRect?: () => { width: number; height: number } }
      const rect = el?.getBoundingClientRect?.()
      if (rect && rect.width > 0 && rect.height > 0) {
        const ancho = Math.min(rect.width - 52 - 20, rect.height / RELACION_ASPECTO)
        setAnchoMesa(Math.max(120, Math.floor(ancho)))
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [anchoMesa])

  const marcarCompletada = useCallback((id: string) => {
    setCompletadas(prev => {
      if (prev.includes(id)) return prev
      const nuevas = [...prev, id]
      AsyncStorage.setItem(CLAVE_PROGRESO, JSON.stringify(nuevas))
      return nuevas
    })
  }, [])

  function prepararLeccion(i: number) {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    setIdx(i)
    setLogrado(false)
    setMsg(null)
    setMuestra(null)
    setAnimando(false)
    setSpin({ a: 0, b: 0 })
    setFuerza(0)
    setPregIdx(0)
    setRespuesta(null)
    const l = LECCIONES[i]
    if (l.tipo === 'jugable') {
      const b = l.armar()
      setBolas(b)
      setAngulo(anguloInicial(b))
    }
  }

  function siguiente() {
    if (idx + 1 < LECCIONES.length) prepararLeccion(idx + 1)
    else router.back()
  }

  function reponer() {
    if (leccion.tipo !== 'jugable') return
    const b = leccion.armar()
    setBolas(b)
    setAngulo(anguloInicial(b))
    setMsg(null)
  }

  // ── tiro de lección jugable ──
  function tirar(f: number) {
    if (leccion.tipo !== 'jugable' || animando || logrado) return
    const res = simularTiro(bolasRef.current, {
      angulo: anguloRef.current,
      fuerza: f,
      efectoLateral: spin.a,
      efectoVertical: spin.b,
    })
    setSpin({ a: 0, b: 0 })
    setAnimando(true)
    const t0 = performance.now()
    const paso = () => {
      const tt = (performance.now() - t0) / 1000
      const i = Math.min(res.muestras.length - 1, Math.floor(tt * PARAMETROS.fpsMuestreo))
      setMuestra(res.muestras[i])
      if (i < res.muestras.length - 1) {
        rafRef.current = requestAnimationFrame(paso)
      } else {
        setMuestra(null)
        setAnimando(false)
        const ev = leccion.evaluar(res)
        if (ev.logrado) {
          setLogrado(true)
          setMsg(null)
          marcarCompletada(leccion.id)
        } else {
          setBolas(ev.reset ? leccion.armar() : res.bolas)
          if (ev.reset) setAngulo(anguloInicial(leccion.armar()))
          setMsg(ev.mensaje)
        }
      }
    }
    rafRef.current = requestAnimationFrame(paso)
  }

  // ── quiz ──
  function responder(i: number) {
    if (respuesta !== null || leccion.tipo !== 'quiz') return
    setRespuesta(i)
    if (i === leccion.preguntas[pregIdx].correcta && pregIdx === leccion.preguntas.length - 1) {
      marcarCompletada(leccion.id)
    }
  }

  function siguientePregunta() {
    if (leccion.tipo !== 'quiz') return
    const acerto = respuesta === leccion.preguntas[pregIdx].correcta
    if (pregIdx + 1 < leccion.preguntas.length) {
      if (acerto) {
        setPregIdx(pregIdx + 1)
        setRespuesta(null)
      } else {
        setRespuesta(null) // la misma pregunta de nuevo hasta acertar
      }
    } else if (acerto) {
      setLogrado(true)
    } else {
      setRespuesta(null)
    }
  }

  // ── gestos ──
  const tf = anchoMesa > 0 ? crearTransform(anchoMesa) : null
  const controlesActivos = leccion.tipo === 'jugable' && !animando && !logrado

  const panMesa = Gesture.Pan()
    .enabled(controlesActivos)
    .runOnJS(true)
    .onChange(e => {
      if (!tf) return
      const dxM = e.changeX / tf.sx
      const dyM = -e.changeY / tf.sy
      const a = anguloRef.current
      setAngulo(a + (dxM * -Math.sin(a) + dyM * Math.cos(a)) * SENSIBILIDAD_APUNTADO)
    })

  const pregunta = leccion.tipo === 'quiz' ? leccion.preguntas[pregIdx] : null

  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <View style={es.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={12}>
          <Text style={[es.volver, { color: c.primario }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[es.titulo, { color: c.texto }]}>Tutorial</Text>
        <TouchableOpacity onPress={siguiente} activeOpacity={0.7} hitSlop={8}>
          <Text style={[es.saltar, { color: c.textoSuave }]}>
            {idx + 1 < LECCIONES.length ? 'Saltar ›' : 'Salir'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* stepper */}
      <View style={es.stepper}>
        {LECCIONES.map((l, i) => (
          <TouchableOpacity key={l.id} onPress={() => prepararLeccion(i)} activeOpacity={0.7}>
            <View
              style={[
                es.paso,
                { borderColor: i === idx ? c.primario : c.borde, backgroundColor: completadas.includes(l.id) ? c.primario : c.fondoCard },
              ]}
            >
              <Text style={[es.pasoTexto, { color: completadas.includes(l.id) ? c.fondo : i === idx ? c.primario : c.textoSuave }]}>
                {completadas.includes(l.id) ? '✓' : i + 1}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* instrucción / feedback */}
      <View style={[es.cartaTexto, { backgroundColor: c.fondoCard, borderColor: logrado ? c.primario : c.borde }]}>
        <Text style={[es.leccionTitulo, { color: logrado ? c.primario : c.texto }]}>
          {logrado ? '✓ ' : ''}{leccion.titulo}
        </Text>
        <Text style={[es.leccionTexto, { color: c.textoSuave }]}>
          {logrado ? leccion.exito : msg ?? leccion.instruccion}
        </Text>
        {logrado && (
          <TouchableOpacity style={[es.botonPri, { backgroundColor: c.primario }]} onPress={siguiente} activeOpacity={0.8}>
            <Text style={[es.botonPriTexto, { color: c.fondo }]}>
              {idx + 1 < LECCIONES.length ? 'Siguiente lección' : 'Terminar'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* contenido: mesa o quiz */}
      {leccion.tipo === 'jugable' ? (
        <>
          <View
            ref={zonaRef}
            style={es.zonaJuego}
            onLayout={ev => {
              const { width, height } = ev.nativeEvent.layout
              const ancho = Math.min(width - 52 - 20, height / RELACION_ASPECTO)
              setAnchoMesa(Math.max(120, Math.floor(ancho)))
            }}
          >
            {anchoMesa > 0 && (
              <>
                <GestureDetector gesture={panMesa}>
                  <View>
                    <MesaPoolLazy
                      anchoPx={anchoMesa}
                      bolas={bolas}
                      muestra={muestra}
                      angulo={angulo}
                      fuerzaPreview={fuerza}
                      mostrarGuia={!animando && !logrado}
                      bolaEnMano={false}
                    />
                  </View>
                </GestureDetector>
                <ControlFuerza
                  habilitado={controlesActivos}
                  fuerza={fuerza}
                  onCambio={f => {
                    fuerzaRef.current = f
                    setFuerza(f)
                  }}
                  onSoltar={() => {
                    const f = fuerzaRef.current
                    fuerzaRef.current = 0
                    setFuerza(0)
                    if (f >= 0.06) tirar(f)
                  }}
                  alto={Math.min(300, anchoMesa * RELACION_ASPECTO)}
                />
              </>
            )}
          </View>

          <View style={es.barra}>
            {leccion.conSpin ? (
              <TouchableOpacity
                style={[es.botonSpin, { borderColor: c.primario, backgroundColor: c.fondoCard }]}
                onPress={() => setSpinAbierto(true)}
                activeOpacity={0.8}
                disabled={!controlesActivos}
              >
                <View style={es.spinBola}>
                  <View style={[es.spinPunto, { transform: [{ translateX: spin.a * 9 }, { translateY: -spin.b * 9 }] }]} />
                </View>
                <Text style={[es.botonSpinTexto, { color: c.primario }]}>Efecto</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[es.botonSpin, { borderColor: c.borde, backgroundColor: c.fondoCard }]}
                onPress={reponer}
                activeOpacity={0.8}
              >
                <Text style={[es.botonSpinTexto, { color: c.textoSuave }]}>Reponer bolas</Text>
              </TouchableOpacity>
            )}
            <View style={es.finoWrap}>
              <TouchableOpacity
                style={[es.botonFino, { borderColor: c.borde, backgroundColor: c.fondoCard }]}
                onPress={() => setAngulo(a => a + AJUSTE_FINO)}
                activeOpacity={0.7}
                disabled={!controlesActivos}
              >
                <Text style={[es.botonFinoTexto, { color: c.primario }]}>‹</Text>
              </TouchableOpacity>
              <Text style={[es.finoLabel, { color: c.textoSuave }]}>fino</Text>
              <TouchableOpacity
                style={[es.botonFino, { borderColor: c.borde, backgroundColor: c.fondoCard }]}
                onPress={() => setAngulo(a => a - AJUSTE_FINO)}
                activeOpacity={0.7}
                disabled={!controlesActivos}
              >
                <Text style={[es.botonFinoTexto, { color: c.primario }]}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : (
        <ScrollView style={es.quiz} contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
          {pregunta && !logrado && (
            <>
              <Text style={[es.quizContador, { color: c.textoSuave }]}>
                Pregunta {pregIdx + 1} de {leccion.tipo === 'quiz' ? leccion.preguntas.length : 0}
              </Text>
              <View style={[es.cartaPregunta, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
                <Text style={[es.preguntaTexto, { color: c.texto }]}>{pregunta.pregunta}</Text>
              </View>
              {pregunta.opciones.map((op, i) => {
                const elegida = respuesta === i
                const esCorrecta = i === pregunta.correcta
                const mostrarEstado = respuesta !== null && (elegida || esCorrecta)
                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      es.opcion,
                      { backgroundColor: c.fondoInput, borderColor: c.borde },
                      mostrarEstado && esCorrecta && { borderColor: c.exito, borderWidth: 2 },
                      mostrarEstado && elegida && !esCorrecta && { borderColor: c.error, borderWidth: 2 },
                    ]}
                    onPress={() => responder(i)}
                    activeOpacity={0.8}
                    disabled={respuesta !== null}
                  >
                    <Text style={[es.opcionTexto, { color: c.texto }]}>{op}</Text>
                    {mostrarEstado && (
                      <Text style={{ color: esCorrecta ? c.exito : c.error, fontWeight: '800' }}>
                        {esCorrecta ? '✓' : '✗'}
                      </Text>
                    )}
                  </TouchableOpacity>
                )
              })}
              {respuesta !== null && (
                <View style={[es.cartaPregunta, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
                  <Text style={[es.explicacion, { color: c.textoSuave }]}>{pregunta.explicacion}</Text>
                  <TouchableOpacity
                    style={[es.botonPri, { backgroundColor: c.primario, alignSelf: 'center' }]}
                    onPress={siguientePregunta}
                    activeOpacity={0.8}
                  >
                    <Text style={[es.botonPriTexto, { color: c.fondo }]}>
                      {respuesta === pregunta.correcta ? 'Siguiente' : 'Probar de nuevo'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      <SelectorSpin visible={spinAbierto} spin={spin} onCerrar={() => setSpinAbierto(false)} onElegir={setSpin} />
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1 },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 54, paddingBottom: 4,
    },
    volver: { fontSize: 26, fontWeight: '700', width: 24 },
    titulo: { fontSize: 18, fontWeight: '800' },
    saltar: { fontSize: 14, fontWeight: '700' },
    stepper: {
      flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 6,
    },
    paso: {
      width: 30, height: 30, borderRadius: 15, borderWidth: 1.5,
      alignItems: 'center', justifyContent: 'center',
    },
    pasoTexto: { fontSize: 13, fontWeight: '800' },
    cartaTexto: {
      marginHorizontal: 16, borderWidth: 1.5, borderRadius: 14,
      paddingHorizontal: 14, paddingVertical: 10, gap: 4,
    },
    leccionTitulo: { fontSize: 15, fontWeight: '800' },
    leccionTexto: { fontSize: 12.5, lineHeight: 17 },
    zonaJuego: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 10, paddingHorizontal: 8, paddingVertical: 6,
    },
    barra: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 24, paddingBottom: 26, paddingTop: 2,
    },
    botonSpin: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8,
    },
    spinBola: {
      width: 28, height: 28, borderRadius: 14, backgroundColor: '#F2EFE8',
      alignItems: 'center', justifyContent: 'center',
    },
    spinPunto: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C93430' },
    botonSpinTexto: { fontSize: 13, fontWeight: '700' },
    finoWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    finoLabel: { fontSize: 11, fontWeight: '600' },
    botonFino: {
      width: 44, height: 44, borderRadius: 12, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center',
    },
    botonFinoTexto: { fontSize: 22, fontWeight: '800' },
    botonPri: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20, marginTop: 8, alignSelf: 'flex-start' },
    botonPriTexto: { fontSize: 14, fontWeight: '800' },
    quiz: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },
    quizContador: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
    cartaPregunta: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
    preguntaTexto: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
    opcion: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderWidth: 1, borderRadius: 14, padding: 14, gap: 10,
    },
    opcionTexto: { fontSize: 14, flex: 1, lineHeight: 19 },
    explicacion: { fontSize: 13, lineHeight: 18 },
  })
}
