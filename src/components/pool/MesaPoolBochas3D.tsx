// Capa 3D de las bochas (Fase B, ago 2026) — reemplaza el grupo de bochas
// procedurales de Skia. Se apila entre MesaPoolFondo (mesa, guías) y
// MesaPoolFrente (glow de bola en mano, taco): mismo tamaño en píxeles,
// fondo transparente. Cámara ortográfica en espacio de píxeles de pantalla
// (no un sistema de coordenadas nuevo): reutiliza tf.aPantalla/radioBolaPx,
// igual que ya hacía el render 2D, para quedar alineada con el arte de la
// mesa sin ningún cálculo extra. Ver plan:
// C:\Users\sixto\.claude\plans\robust-popping-koala.md
//
// Rotación real de cada bocha (Fase C, ago 2026): qx/qy/qz/qw viene de
// fisica.ts (integrado a partir de wx/wy/wz, ya en convención de pantalla —
// ver la nota junto a integrarBola) y se aplica al Group "giro" de cada
// bola, NO al Group "instancia" que la contiene — instancia solo mueve y
// escala, nunca rota. Eso deja un tercer objeto, "brillo" (el plano con
// brillo.png, ver bochas3d.ts), como hermano de "giro" en vez de hijo: al
// no heredar la rotación de giro, el reflejo queda clavado en el mismo
// lugar de la pantalla pase lo que pase con el giro real de la esfera de
// adentro — como pegado en el vidrio en vez de en la bocha. Las bochas
// "cayendo" en una tronera NO reciben cuaternión nuevo a propósito:
// mantienen la última orientación real que tenían antes de dejar de estar
// vivas, en vez de resetear a identidad — da la sensación de que siguen
// girando con su inercia mientras se achican hacia el agujero.

import { useEffect, useRef, useState } from 'react'
import { StyleSheet } from 'react-native'
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl'
import * as THREE from 'three'
import { cargarPlantillaBocha, cargarMaterialBola, cargarMaterialBrillo } from '@/lib/pool/bochas3d'
import { TransformMesa } from '@/lib/pool/mesaGeometria'

export interface BolaPosicionada { n: number; x: number; y: number; qx: number; qy: number; qz: number; qw: number }
export interface BolaCayendo { n: number; x: number; y: number; escala: number }

interface Props {
  tf: TransformMesa
  dibujables: BolaPosicionada[]
  cayendo: BolaCayendo[]
}

interface MallaBola {
  instancia: THREE.Object3D // posición + escala del conjunto (bocha + brillo)
  giro: THREE.Object3D // solo la rotación real de la bocha — el brillo no cuelga de acá
}

interface Motor {
  gl: ExpoWebGLRenderingContext
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  mallas: Map<number, MallaBola>
  escalaUnidad: number
}

// three.js evalúa "canvas = createCanvasElement()" como valor por default
// del parámetro del constructor SIEMPRE que no le pasamos canvas
// explícito — createCanvasElement llama a document.createElementNS(), que
// no existe en React Native (bug real: crash nativo "Property 'document'
// doesn't exist"; no se veía en web porque ahí sí hay document). Se le
// pasa un objeto mínimo que cumple lo que WebGLRenderer toca de "canvas"
// (width/height/style/listeners) sin tocar el DOM en ningún lado.
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

// En Android, expo-gl instala un global WebGLRenderingContext "legacy" (por
// compatibilidad con librerías que esperan esa API) y el contexto real
// queda con ese prototipo aunque por dentro sea WebGL2 — three.js r163+
// hace "context instanceof WebGLRenderingContext" para RECHAZAR WebGL1, y
// ese chequeo da un falso positivo acá (bug real, confirmado en
// dispositivo: "WebGL 1 is not supported since r163", en un contexto que
// en realidad sí es WebGL2). Se oculta el global SOLO durante el
// constructor — nada más de la app lo usa — así ese chequeo no dispara; el
// alpha que necesitaría leer del contexto ya se lo pasamos explícito por
// parámetro, así que no se pierde nada.
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

export default function MesaPoolBochas3D({ tf, dibujables, cayendo }: Props) {
  const motorRef = useRef<Motor | null>(null)
  // dispara el useEffect de abajo con las props MÁS RECIENTES una vez que
  // termina de cargar — la carga es async (FBX + 16 texturas), así que si
  // se llamara a actualizar() directo al final de onContextCreate usaría
  // las props de cuando se montó el componente, no las actuales (bug real
  // que se evita así: la mesa podría haber avanzado varios frames de
  // animación mientras tanto).
  const [listo, setListo] = useState(false)

  async function onContextCreate(gl: ExpoWebGLRenderingContext) {
    const scene = new THREE.Scene()
    // Subido de nuevo (1.3/1.9 → 1.7/3.2): seguía oscuro y sin brillo
    // especular visible. La direccional es la que produce el reflejo
    // puntual (la ambiental solo levanta el piso general parejo), por eso
    // sube proporcionalmente más que la ambiental acá.
    scene.add(new THREE.AmbientLight(0xffffff, -0.1))
    const luz = new THREE.DirectionalLight(0xffffff, 5)
    luz.position.set(1, -1.4, -5.5)
    scene.add(luz)

    // (0, anchoPx, 0, altoPx): frustum en píxeles de pantalla con Y hacia
    // abajo, igual convención que tf.aPantalla — así una bocha en (p.x,p.y)
    // cae exactamente donde caía en el Group de Skia.
    const camera = new THREE.OrthographicCamera(0, tf.anchoPx, 0, tf.altoPx, 0.1, 1000)
    camera.position.set(0, 0, 100)

    const renderer = crearRenderer({
      context: gl as unknown as WebGLRenderingContext,
      canvas: crearCanvasFalso(gl) as unknown as HTMLCanvasElement,
      alpha: true,
    })
    // gl.drawingBufferWidth es el buffer en píxeles FÍSICOS (multiplicado
    // por devicePixelRatio en cualquier pantalla retina/high-DPI), pero la
    // cámara ortográfica de acá está definida en píxeles LÓGICOS
    // (tf.anchoPx/altoPx, los mismos que usa tf.aPantalla) — pasarle el
    // tamaño físico directo a setSize() sin decirle a three.js la relación
    // entre ambos rompe la correspondencia 1 unidad-de-mundo = 1px en
    // cualquier pantalla con devicePixelRatio ≠ 1 (la enorme mayoría de
    // celus): todo el contenido queda mal escalado/recortado dentro del
    // buffer real (bug real, sospechado tras varias vueltas de tocar
    // escala/geometría/mipmaps sin ningún efecto visible — esto es lo
    // único en el pipeline que nunca se había tocado). setPixelRatio +
    // setSize en unidades lógicas es la forma correcta en three.js.
    const pixelRatio = gl.drawingBufferWidth / tf.anchoPx
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(tf.anchoPx, tf.altoPx, false)
    renderer.setClearColor(0x000000, 0)
    renderer.render(scene, camera) // limpia a transparente mientras cargan los assets
    gl.endFrameEXP()

    // Sin este try/catch, un fallo cargando el mesh/texturas quedaba como
    // una promesa rechazada sin manejar: no truena nada visible, las bochas
    // simplemente no aparecen — sin ninguna pista de qué falló ni dónde.
    // console.error acá se ve en la terminal de `expo start`.
    try {
      await cargarYArmarTodasLasBochas()
    } catch (err) {
      console.error('[MesaPoolBochas3D] no se pudieron cargar los assets 3D de las bochas:', err)
    }

    async function cargarYArmarTodasLasBochas() {
      const { grupo, escalaUnidad } = await cargarPlantillaBocha()
      // materialBrillo/geometriaBrillo: UNA sola vez por contexto (no por
      // bola) — las 16 comparten el mismo plano y la misma textura, solo
      // cambia dónde se ubica cada instancia. Igual que el resto de los
      // materiales, se arma de cero en cada onContextCreate (no a nivel de
      // módulo) por el mismo motivo que cargarMaterialBola: reusar un
      // Texture entre contextos WebGL distintos lo deja sin datos.
      const materialBrillo = await cargarMaterialBrillo()
      // diametroCrudo: cargarPlantillaBocha() NO hornea escalaUnidad en
      // "grupo" (a propósito, ver su historial más abajo) — el mesh de
      // "nucleo" mide lo que mida el .glb en sus propias unidades, no
      // diámetro 1. escalaUnidad es "cuánto multiplicar PARA LLEGAR a
      // diámetro 1", así que el tamaño real sin normalizar es 1/escalaUnidad
      // — bug real: el plano de brillo asumía diámetro 1 (radio 0.5) cuando
      // el radio real era ~0.345, así que terminaba flotando muy lejos de la
      // bocha una vez multiplicado por escalaFinal (nunca se veía, ni con
      // una textura de prueba a color sólido). El plano y su offset en Z se
      // arman en estas mismas unidades "crudas" para que, al aplicarles el
      // mismo instancia.scale que a la esfera, terminen exactamente del
      // tamaño y la distancia correctos sin importar qué escala real tenga
      // el .glb.
      const diametroCrudo = 1 / escalaUnidad
      // ESCALA_BRILLO: tamaño del plano de brillo.png relativo al diámetro de
      // la bocha (1.0 = mismo tamaño exacto que la bocha). Cambiar solo este
      // número para agrandar/achicar el plano sin tocar nada más.
      const ESCALA_BRILLO = 1.0
      const geometriaBrillo = new THREE.PlaneGeometry(diametroCrudo * ESCALA_BRILLO, diametroCrudo * ESCALA_BRILLO)

      const mallas = new Map<number, MallaBola>()
      for (let n = 0; n <= 15; n++) {
        const material = await cargarMaterialBola(n)
        // clone(true): copia la jerarquía del FBX (transforms propios, vivos
        // — nada horneado) — la geometría del mesh de adentro se comparte
        // entre las 16 instancias (clone() no clona BufferGeometry por
        // default), solo el material se pisa por bola.
        const nucleo = grupo.clone(true)
        nucleo.traverse(hijo => {
          if ((hijo as THREE.Mesh).isMesh) (hijo as THREE.Mesh).material = material
        })

        // giro es lo único que gira (ver actualizar()) — nucleo nunca se toca
        // después de acá.
        const giro = new THREE.Group()
        giro.add(nucleo)

        // brillo: plano fijo, NO cuelga de giro (así no rota con la bocha).
        // La esfera cruda (sin normalizar, ver diametroCrudo arriba) tiene
        // radio diametroCrudo/2 en todas direcciones SIN IMPORTAR cómo esté
        // rotada (rotar una esfera no cambia su silueta) — ×1.1 la deja
        // apenas delante de la cara que mira a cámara, sin importar el giro
        // de "giro".
        const brillo = new THREE.Mesh(geometriaBrillo, materialBrillo)
        brillo.position.z = (diametroCrudo / 2) * 1.1

        // instancia es lo único que actualizar() escala/posiciona — nunca
        // rota, así el tamaño final sale de UNA sola cuenta (diametroPx *
        // escalaUnidad) en vez de depender de qué scale haya quedado pisado
        // o compuesto en un clon previo, y el brillo queda clavado en
        // pantalla pase lo que pase con giro.
        const instancia = new THREE.Group()
        instancia.add(giro)
        instancia.add(brillo)
        instancia.visible = false
        scene.add(instancia)
        mallas.set(n, { instancia, giro })
      }

      motorRef.current = { gl, renderer, scene, camera, mallas, escalaUnidad }
      setListo(true)
    }
  }

  useEffect(() => {
    const motor = motorRef.current
    if (!motor) return
    // única cuenta de la que sale el tamaño en pantalla — ver nota en
    // cargarPlantillaBocha sobre por qué no se apoya en el .scale de
    // ningún Group intermedio. (El ×6 de diagnóstico que hubo acá ya
    // cumplió su propósito — con las bochas artificialmente agrandadas se
    // superponían muy por encima de su hitbox real y eso causaba z-fighting
    // entre esferas coplanares, no un bug de mesh/textura — ver historial
    // en cargarPlantillaBocha.)
    //
    // ESCALA_VISUAL_EXTRA: multiplicador solo del tamaño RENDERIZADO,
    // aparte de radioBolaPx (que sigue siendo el hitbox real de colisión,
    // sin tocar). En 1.0 el modelo mide exactamente lo mismo que el
    // hitbox — con el prop debug de MesaPool activado, se ve un círculo
    // amarillo (el hitbox real) sobre cada bocha para comparar a ojo.
    // 1.5→1.6: reportado ~1px más chico que el hitbox tras el último ajuste
    // de luz/roughness (nada de esta cuenta cambió en ese ajuste — el reporte
    // puede incluir algo de margen de error de medir a ojo un objeto de
    // ~10px, ver nota abajo).
    const ESCALA_VISUAL_EXTRA = 1.6
    const escalaFinal = tf.radioBolaPx * 2 * motor.escalaUnidad * ESCALA_VISUAL_EXTRA
    // OFFSET_VERTICAL: 1.08→0.10 — tras subir luz/bajar roughness (sin tocar
    // esta cuenta) se reportó el modelo 8px arriba del hitbox, un salto
    // grande respecto del calibrado anterior (offset casi perfecto, solo
    // 1px). Aplicado literal (nuevo coef. = 1.08 − 8/radioBolaPx≈8.18), pero
    // ese salto no tiene una causa clara en el código — nada en la posición
    // cambió entre esa calibración y esta. Puede ser que el brillo/reflejo
    // más marcado (menos roughness, más luz) corra la percepción visual de
    // "dónde está el centro" de la bocha sin que la geometría se haya
    // movido un solo píxel. Pedir una captura con el círculo amarillo esta
    // vez para confirmar en vez de seguir ajustando a ciegas.
    const OFFSET_VERTICAL_PX = -tf.radioBolaPx * 0.1
    const activos = new Set<number>()

    for (const b of dibujables) {
      const malla = motor.mallas.get(b.n)
      if (!malla) continue
      const p = tf.aPantalla({ x: b.x, y: b.y })
      // separación de Z chica y estable por bola (no aleatoria, para que
      // no "titile" entre frames): sin esto, dos bochas tocándose de
      // verdad en una jugada real (mismo z=0) arriesgan el mismo
      // z-fighting que se vio agrandado ×6 — con las bochas a su tamaño
      // real la superposición es mínima, pero cero no es buena garantía.
      malla.instancia.position.set(p.x, p.y + OFFSET_VERTICAL_PX, b.n * 0.001)
      malla.instancia.scale.setScalar(escalaFinal)
      malla.giro.quaternion.set(b.qx, b.qy, b.qz, b.qw)
      malla.instancia.visible = true
      activos.add(b.n)
    }
    for (const c of cayendo) {
      const malla = motor.mallas.get(c.n)
      if (!malla) continue
      const p = tf.aPantalla({ x: c.x, y: c.y })
      malla.instancia.position.set(p.x, p.y + OFFSET_VERTICAL_PX, c.n * 0.001)
      malla.instancia.scale.setScalar(escalaFinal * c.escala)
      malla.instancia.visible = true
      activos.add(c.n)
    }
    for (const [n, malla] of motor.mallas) {
      if (!activos.has(n)) malla.instancia.visible = false
    }

    // try/catch acá también: una textura que cargó "bien" en JS pero falla
    // recién al subirse a la GPU (p.ej. datos incompletos por una descarga
    // cortada) revienta justo en este render(), no en la carga — sin esto,
    // el error quedaba silencioso igual que el de más arriba.
    try {
      motor.renderer.render(motor.scene, motor.camera)
      motor.gl.endFrameEXP()
    } catch (err) {
      console.error('[MesaPoolBochas3D] error renderizando las bochas 3D:', err)
    }
  }, [listo, dibujables, cayendo, tf])

  return <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
}
