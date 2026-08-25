// DEBUG TEMPORAL (Fase A del plan de bochas 3D, ago 2026) — prueba aislada
// de bocha_pool.fbx + una textura, girando, ANTES de invertir en integrarlas
// a la mesa real: confirma que el FBX (~500 vértices, exportado de Blender)
// carga y texturiza en Expo Go (Android/iOS) y en web. Mismo criterio que
// debug-pool.tsx: gateado por __DEV__, sin entrada de menú, se saca antes de
// producción. Ver plan: C:\Users\sixto\.claude\plans\robust-popping-koala.md

import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native'
import { router } from 'expo-router'
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl'
import { Asset } from 'expo-asset'
import { File } from 'expo-file-system'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'

// carga el mesh una sola vez (require estático: Metro lo resuelve a un
// asset numérico, igual que las texturas/PNG que ya usa MesaPool.tsx)
const ASSET_FBX = require('../../assets/pool-assets/bochas/bocha_pool.fbx')
const ASSET_TEXTURA = require('../../assets/pool-assets/bochas/8.jpg')

// En NATIVE, `image = {localUri}` es la convención que espera el
// texImage2D nativo de expo-gl (decodifica el JPG con stb_image, sin pasar
// por HTMLImageElement). En WEB, three.js llama gl.texSubImage2D() del
// browser DIRECTO (no pasa por el wrapper de expo-gl que sí sabe resolver
// ese objeto) — le tiene que llegar un HTMLImageElement ya cargado, o tira
// "Overload resolution failed" (bug real, confirmado en dispositivo: la
// esfera y la luz andaban bien, solo fallaba subir la textura).
// three.js evalúa "canvas = createCanvasElement()" como valor por default
// del constructor si no le pasamos canvas explícito — eso llama a
// document.createElementNS(), que no existe en React Native (crash nativo
// real: "Property 'document' doesn't exist"; en web no se nota porque ahí
// sí hay document). Objeto mínimo que cubre lo que WebGLRenderer toca de
// "canvas" sin tocar el DOM.
function crearCanvasFalso(gl: ExpoWebGLRenderingContext) {
  return {
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    style: {},
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getContext: () => gl,
  }
}

// En Android, expo-gl instala un global WebGLRenderingContext "legacy" y el
// contexto real queda con ese prototipo aunque por dentro sea WebGL2 —
// three.js r163+ hace "context instanceof WebGLRenderingContext" para
// RECHAZAR WebGL1 y da un falso positivo acá (bug real, confirmado en
// dispositivo: "WebGL 1 is not supported since r163" en un contexto que en
// realidad sí es WebGL2). Se oculta el global SOLO durante el constructor.
function crearRenderer(params: THREE.WebGLRendererParameters): THREE.WebGLRenderer {
  const g = globalThis as unknown as { WebGLRenderingContext?: unknown }
  const original = g.WebGLRenderingContext
  if (original) g.WebGLRenderingContext = undefined
  try {
    return new THREE.WebGLRenderer(params)
  } finally {
    if (original) g.WebGLRenderingContext = original
  }
}

function cargarTextura(uri: string): Promise<THREE.Texture> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const tex = new THREE.Texture(img)
        tex.needsUpdate = true
        resolve(tex)
      }
      img.onerror = () => reject(new Error(`No se pudo cargar la textura: ${uri}`))
      img.src = uri
    })
  }
  const tex = new THREE.Texture()
  ;(tex as unknown as { image: { localUri: string } }).image = { localUri: uri }
  tex.needsUpdate = true
  return Promise.resolve(tex)
}

export default function DebugBocha3D() {
  const c = useColores()
  const es = makeEstilos(c)
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando')
  const [detalle, setDetalle] = useState('')

  useEffect(() => {
    if (!__DEV__) router.replace('/juegos/pool')
  }, [])

  async function onContextCreate(gl: ExpoWebGLRenderingContext) {
    try {
      const assetFbx = Asset.fromModule(ASSET_FBX)
      const assetTex = Asset.fromModule(ASSET_TEXTURA)
      await Promise.all([assetFbx.downloadAsync(), assetTex.downloadAsync()])
      const uriFbx = assetFbx.localUri ?? assetFbx.uri
      const uriTex = assetTex.localUri ?? assetTex.uri

      const buffer = Platform.OS === 'web'
        ? await fetch(uriFbx).then(r => r.arrayBuffer())
        : await new File(uriFbx).arrayBuffer()

      const grupo = new FBXLoader().parse(buffer, '') as THREE.Group
      // por default MeshStandardMaterial sale roughness=1 (mate total) — una
      // bocha de pool real es plástico duro con una capa de laca brillante
      // encima, no una superficie mate. MeshPhysicalMaterial agrega
      // clearcoat (esa capa de laca) sobre el color/roughness de base, que
      // es justo la textura física de una bocha real — no hace falta
      // tocar nada en Blender para esto, es una propiedad del material en
      // el motor de render, no de la textura ni del mesh.
      const material = new THREE.MeshPhysicalMaterial({
        map: await cargarTextura(uriTex),
        roughness: 0.4,
        metalness: 0,
        clearcoat: 1,
        // 0.08→0.16: el brillo puntual quedaba muy chico y "quemado" (blanco
        // puro sin transición) — un poco más de rugosidad en la capa de
        // laca esparce ese punto en un brillo más suave, sigue siendo
        // reluciente pero deja de leerse como un flash.
        clearcoatRoughness: 0.16,
      })
      grupo.traverse(hijo => {
        if ((hijo as THREE.Mesh).isMesh) (hijo as THREE.Mesh).material = material
      })

      // el FBX puede venir en cualquier escala/unidad de Blender: se
      // re-centra y re-escala a ~1 unidad de diámetro sin asumir nada del
      // archivo de origen (evita hardcodear un factor que dependa de cómo
      // se exportó puntualmente este mesh).
      const caja = new THREE.Box3().setFromObject(grupo)
      const centro = caja.getCenter(new THREE.Vector3())
      const tam = caja.getSize(new THREE.Vector3())
      const escala = 1 / Math.max(tam.x, tam.y, tam.z, 0.0001)
      grupo.position.sub(centro)
      const contenedor = new THREE.Group()
      contenedor.add(grupo)
      contenedor.scale.setScalar(escala)
      // DIAGNÓSTICO TEMPORAL (ago 2026): comparar contra los mismos
      // números logueados en bochas3d.ts/MesaPoolBochas3D — mismo FBX,
      // mismo cálculo, para confirmar si dan igual acá. Sacar una vez
      // resuelto el tamaño en la mesa real.
      // eslint-disable-next-line no-console
      console.log('[debug-bocha3d] caja del FBX: tam=', tam.x, tam.y, tam.z, 'escala=', escala)

      const scene = new THREE.Scene()
      scene.add(contenedor)
      // más luz ambiental (0.55→0.8): el lado sin brillo quedaba negro
      // puro, sin volumen — cuesta leerlo como esfera si solo hay un punto
      // brillante y el resto es plano.
      scene.add(new THREE.AmbientLight(0xffffff, 0.8))
      const luz = new THREE.DirectionalLight(0xffffff, 1.1)
      luz.position.set(-1, 1.4, 1.2)
      scene.add(luz)

      const camera = new THREE.PerspectiveCamera(35, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 10)
      camera.position.set(0, 0, 2.6)

      const renderer = crearRenderer({
        context: gl as unknown as WebGLRenderingContext,
        canvas: crearCanvasFalso(gl) as unknown as HTMLCanvasElement,
        alpha: true,
      })
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight)
      renderer.setClearColor(0x000000, 0)

      setEstado('listo')

      const loop = () => {
        requestAnimationFrame(loop)
        contenedor.rotation.y += 0.012
        contenedor.rotation.x += 0.004
        renderer.render(scene, camera)
        gl.endFrameEXP()
      }
      loop()
    } catch (e) {
      setDetalle(e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e))
      setEstado('error')
    }
  }

  return (
    <View style={[es.contenedor, { backgroundColor: c.fondo }]}>
      <View style={es.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={12}>
          <Text style={[es.volver, { color: c.primario }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[es.titulo, { color: c.texto }]}>Debug · bocha 3D</Text>
        <View style={{ width: 24 }} />
      </View>
      <Text style={[es.ayuda, { color: c.textoSuave }]}>
        {estado === 'cargando' && 'Cargando bocha_pool.fbx + textura…'}
        {estado === 'listo' && 'Si ves una esfera texturizada girando, la Fase A está confirmada.'}
        {estado === 'error' && 'Falló la carga — detalle abajo.'}
      </Text>
      <View style={es.zonaGl}>
        <GLView style={es.gl} onContextCreate={onContextCreate} />
      </View>
      {estado === 'error' && <Text style={es.error}>{detalle}</Text>}
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
    titulo: { fontSize: 16, fontWeight: '800' },
    ayuda: { fontSize: 12, textAlign: 'center', paddingHorizontal: 24, paddingBottom: 12 },
    zonaGl: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    gl: { width: 280, height: 280 },
    error: { color: '#E05252', fontSize: 11, paddingHorizontal: 20, paddingBottom: 24 },
  })
}
