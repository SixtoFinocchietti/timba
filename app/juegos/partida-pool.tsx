// Práctica libre de Pool (spec §16): mesa sola sin reglas de 8-ball.
// Orquesta el ciclo del tiro: apuntar (drag relativo sobre la mesa) → cargar
// fuerza (slider, soltar dispara) → simularTiro() resuelve TODO por adelantado
// → se reproduce la animación por muestras a 60 fps → se procesa el resultado
// (scratch ⇒ bola en mano). Los modos con reglas (bot/online) reutilizarán
// esta pantalla con la máquina de estados de reglas.ts por encima.

import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import MesaPoolLazy from '@/components/pool/MesaPoolLazy'
import ControlFuerza from '@/components/pool/ControlFuerza'
import SelectorSpin, { Spin } from '@/components/pool/SelectorSpin'
import {
  CABECERA_Y, PARAMETROS, crearRack, posicionBlancaValida, simularTiro,
} from '@/lib/pool/fisica'
import { crearTransform, RELACION_ASPECTO } from '@/lib/pool/transform'
import { Bola, MuestraAnimacion, ResultadoSimulacion } from '@/lib/pool/tipos'

const AJUSTE_FINO = (0.25 * Math.PI) / 180 // 0.25°
const SENSIBILIDAD = 2.2 // rad por metro de arrastre tangencial

const COLORES_RIEL: Record<number, string> = {
  1: '#F0B428', 2: '#1E5AA8', 3: '#C93430', 4: '#5B3E8F',
  5: '#E07B28', 6: '#1F7A4D', 7: '#8A3038', 8: '#161616',
}

function nuevaSeed(): number {
  return (Date.now() ^ (Math.random() * 0x7fffffff)) | 0
}

// posición válida para reponer la blanca tras un scratch
function reponerBlanca(bolas: Bola[]): Bola[] {
  const candidatos = [{ x: 0, y: CABECERA_Y }]
  for (let y = CABECERA_Y; y >= -1.0; y -= 0.06) {
    for (let x = 0; x <= 0.4; x += 0.05) {
      candidatos.push({ x, y }, { x: -x, y })
    }
  }
  const pos = candidatos.find(p => posicionBlancaValida(bolas, p, false)) ?? { x: 0, y: CABECERA_Y }
  return bolas.map(b =>
    b.n === 0
      ? { ...b, viva: true, quieta: true, pos: { ...pos }, vel: { x: 0, y: 0 }, wx: 0, wy: 0, wz: 0 }
      : b,
  )
}

export default function PartidaPool() {
  const c = useColores()
  const es = makeEstilos(c)

  const [bolas, setBolas] = useState<Bola[]>(() => crearRack(nuevaSeed()))
  const [angulo, setAngulo] = useState(Math.PI / 2)
  const [spin, setSpin] = useState<Spin>({ a: 0, b: 0 })
  const [fuerza, setFuerza] = useState(0)
  const [muestra, setMuestra] = useState<MuestraAnimacion | null>(null)
  const [animando, setAnimando] = useState(false)
  const [bolaEnMano, setBolaEnMano] = useState(false)
  const [spinAbierto, setSpinAbierto] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [anchoMesa, setAnchoMesa] = useState(0)

  const rafRef = useRef<number | null>(null)
  // la fuerza también vive en un ref: onSoltar puede llegar en el mismo tick
  // que el último onCambio y el state del render actual estaría atrasado
  const fuerzaRef = useRef(0)
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const modoDrag = useRef<'apuntar' | 'mover'>('apuntar')

  // refs espejo para leer estado fresco dentro de callbacks de gestos/rAF
  const bolasRef = useRef(bolas)
  bolasRef.current = bolas
  const anguloRef = useRef(angulo)
  anguloRef.current = angulo

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    if (msgTimer.current) clearTimeout(msgTimer.current)
  }, [])

  const avisar = useCallback((texto: string) => {
    setMsg(texto)
    if (msgTimer.current) clearTimeout(msgTimer.current)
    msgTimer.current = setTimeout(() => setMsg(null), 2600)
  }, [])

  function procesar(res: ResultadoSimulacion) {
    const embocadas = res.eventos.filter(e => e.tipo === 'tronera').map(e => e.bola)
    let finales = res.bolas
    if (embocadas.includes(0)) {
      finales = reponerBlanca(finales)
      setBolaEnMano(true)
      avisar('Bola blanca embocada — acomodala donde quieras')
    } else if (embocadas.length > 0) {
      avisar(embocadas.length === 1 ? '¡Embocaste una!' : `¡Embocaste ${embocadas.length}!`)
    }
    setBolas(finales)
    if (finales.filter(b => b.viva && b.n !== 0).length === 0) {
      avisar('¡Mesa limpia! Tocá Rack para volver a armar')
    }
  }

  function tirar(f: number) {
    if (animando) return
    const res = simularTiro(bolasRef.current, {
      angulo: anguloRef.current,
      fuerza: f,
      efectoLateral: spin.a,
      efectoVertical: spin.b,
    })
    setSpin({ a: 0, b: 0 })
    setFuerza(0)
    setBolaEnMano(false)
    setAnimando(true)

    const t0 = performance.now()
    const paso = () => {
      const t = (performance.now() - t0) / 1000
      const idx = Math.min(res.muestras.length - 1, Math.floor(t * PARAMETROS.fpsMuestreo))
      setMuestra(res.muestras[idx])
      if (idx < res.muestras.length - 1) {
        rafRef.current = requestAnimationFrame(paso)
      } else {
        setMuestra(null)
        setAnimando(false)
        procesar(res)
      }
    }
    rafRef.current = requestAnimationFrame(paso)
  }

  function reRack() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    setMuestra(null)
    setAnimando(false)
    setBolaEnMano(false)
    setSpin({ a: 0, b: 0 })
    setFuerza(0)
    setBolas(crearRack(nuevaSeed()))
  }

  // ── gesto sobre la mesa: apuntar (relativo) o mover la blanca (bola en mano) ──
  const tf = anchoMesa > 0 ? crearTransform(anchoMesa) : null

  const panMesa = Gesture.Pan()
    .enabled(!animando)
    .runOnJS(true)
    .onBegin(e => {
      if (!tf) return
      const m = tf.aMesa(e.x, e.y)
      const blanca = bolasRef.current.find(b => b.n === 0)
      modoDrag.current =
        bolaEnMano && blanca && Math.hypot(m.x - blanca.pos.x, m.y - blanca.pos.y) < 0.14
          ? 'mover'
          : 'apuntar'
    })
    .onChange(e => {
      if (!tf) return
      if (modoDrag.current === 'mover') {
        // la bola se dibuja por encima del dedo para que no la tape (spec §4)
        const m = tf.aMesa(e.x, e.y)
        const pos = { x: m.x, y: m.y + 0.07 }
        if (posicionBlancaValida(bolasRef.current, pos, false)) {
          setBolas(prev => prev.map(b => (b.n === 0 ? { ...b, pos } : b)))
        }
        return
      }
      // apuntado relativo: el componente tangencial del arrastre rota la dirección
      const dxM = e.changeX / tf.escala
      const dyM = -e.changeY / tf.escala
      const a = anguloRef.current
      const dAng = (dxM * -Math.sin(a) + dyM * Math.cos(a)) * SENSIBILIDAD
      setAngulo(a + dAng)
    })

  const vivasNo0 = bolas.filter(b => b.viva && b.n !== 0).length
  const embocadasRiel = bolas.filter(b => !b.viva && b.n !== 0)

  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <View style={es.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={12}>
          <Text style={[es.volver, { color: c.primario }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[es.titulo, { color: c.texto }]}>Práctica libre</Text>
        <TouchableOpacity
          style={[es.botonRack, { borderColor: c.borde }]}
          onPress={reRack}
          activeOpacity={0.8}
        >
          <Text style={[es.botonRackTexto, { color: c.primario }]}>Rack</Text>
        </TouchableOpacity>
      </View>

      {/* riel de embocadas + mensaje */}
      <View style={es.riel}>
        {embocadasRiel.length === 0 && !msg && (
          <Text style={[es.rielVacio, { color: c.textoSuave }]}>
            Arrastrá para apuntar · deslizá la barra y soltá para tirar · quedan {vivasNo0}
          </Text>
        )}
        {msg ? (
          <Text style={[es.msg, { color: c.primarioSuave }]}>{msg}</Text>
        ) : (
          <View style={es.rielBolas}>
            {embocadasRiel.map(b => (
              <View
                key={b.n}
                style={[
                  es.mini,
                  { backgroundColor: COLORES_RIEL[b.n <= 8 ? b.n : b.n - 8] },
                  b.n >= 9 && es.miniRayada,
                ]}
              />
            ))}
          </View>
        )}
      </View>

      {/* mesa + slider de fuerza */}
      <View
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
                  mostrarGuia={!animando}
                  bolaEnMano={bolaEnMano}
                />
              </View>
            </GestureDetector>
            <ControlFuerza
              habilitado={!animando}
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
              alto={Math.min(320, anchoMesa * RELACION_ASPECTO)}
            />
          </>
        )}
      </View>

      {/* barra inferior: spin + ajuste fino */}
      <View style={es.barra}>
        <TouchableOpacity
          style={[es.botonSpin, { borderColor: c.borde, backgroundColor: c.fondoCard }]}
          onPress={() => setSpinAbierto(true)}
          activeOpacity={0.8}
          disabled={animando}
        >
          <View style={es.spinBola}>
            <View
              style={[
                es.spinPunto,
                { transform: [{ translateX: spin.a * 9 }, { translateY: -spin.b * 9 }] },
              ]}
            />
          </View>
          <Text style={[es.botonSpinTexto, { color: c.textoSuave }]}>Efecto</Text>
        </TouchableOpacity>

        <View style={es.finoWrap}>
          <TouchableOpacity
            style={[es.botonFino, { borderColor: c.borde, backgroundColor: c.fondoCard }]}
            onPress={() => setAngulo(a => a + AJUSTE_FINO)}
            activeOpacity={0.7}
            disabled={animando}
          >
            <Text style={[es.botonFinoTexto, { color: c.primario }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[es.finoLabel, { color: c.textoSuave }]}>fino</Text>
          <TouchableOpacity
            style={[es.botonFino, { borderColor: c.borde, backgroundColor: c.fondoCard }]}
            onPress={() => setAngulo(a => a - AJUSTE_FINO)}
            activeOpacity={0.7}
            disabled={animando}
          >
            <Text style={[es.botonFinoTexto, { color: c.primario }]}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      <SelectorSpin
        visible={spinAbierto}
        spin={spin}
        onCerrar={() => setSpinAbierto(false)}
        onElegir={setSpin}
      />
    </View>
  )
}

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1 },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 54, paddingBottom: 6,
    },
    volver: { fontSize: 26, fontWeight: '700', width: 24 },
    titulo: { fontSize: 18, fontWeight: '800' },
    botonRack: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
    botonRackTexto: { fontSize: 13, fontWeight: '800' },
    riel: { minHeight: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    rielVacio: { fontSize: 11, textAlign: 'center' },
    rielBolas: { flexDirection: 'row', gap: 5 },
    mini: { width: 14, height: 14, borderRadius: 7 },
    miniRayada: { borderWidth: 3, borderColor: '#F2EFE8' },
    msg: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
    zonaJuego: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 10, paddingHorizontal: 8, paddingVertical: 8,
    },
    barra: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 24, paddingBottom: 28, paddingTop: 4,
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
  })
}
