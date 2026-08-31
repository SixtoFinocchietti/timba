// Carga de assets 3D de las bochas (GLB + texturas + material) — Fase B
// del plan de bochas 3D (ago 2026, ver
// C:\Users\sixto\.claude\plans\robust-popping-koala.md). Todo cacheado a
// nivel de módulo (una promesa por recurso): la geometría y las 16
// texturas se cargan UNA sola vez por sesión de la app — sin esto, entrar
// y salir de la mesa de pool (practica/bot/online) rehace el fetch +
// parseo del GLB y las 16 texturas cada vez, con el flash de carga que eso
// implica.
//
// El material vive acá (no en MesaPoolBochas3D) para que cualquier ajuste
// futuro de "brillo" se aplique en un solo lugar y no se desincronicen —
// ver la nota junto a cargarMaterialBola sobre por qué es
// MeshStandardMaterial y no MeshPhysicalMaterial+clearcoat.

import { Platform } from 'react-native'
import { Asset } from 'expo-asset'
import { File } from 'expo-file-system'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as jpegJs from 'jpeg-js'
import { decodificarPNG } from './decodificarPNG'

const ASSET_GLB = require('../../../assets/pool-assets/bochas/bocha_pool.glb')
const ASSET_BRILLO = require('../../../assets/pool-assets/bochas/brillo.png')

// 0 = blanca; 1-15 = numeradas
const ASSETS_TEXTURA: Record<number, number> = {
  0: require('../../../assets/pool-assets/bochas/blanca.jpg'),
  1: require('../../../assets/pool-assets/bochas/1.jpg'),
  2: require('../../../assets/pool-assets/bochas/2.jpg'),
  3: require('../../../assets/pool-assets/bochas/3.jpg'),
  4: require('../../../assets/pool-assets/bochas/4.jpg'),
  5: require('../../../assets/pool-assets/bochas/5.jpg'),
  6: require('../../../assets/pool-assets/bochas/6.jpg'),
  7: require('../../../assets/pool-assets/bochas/7.jpg'),
  8: require('../../../assets/pool-assets/bochas/8.jpg'),
  9: require('../../../assets/pool-assets/bochas/9.jpg'),
  10: require('../../../assets/pool-assets/bochas/10.jpg'),
  11: require('../../../assets/pool-assets/bochas/11.jpg'),
  12: require('../../../assets/pool-assets/bochas/12.jpg'),
  13: require('../../../assets/pool-assets/bochas/13.jpg'),
  14: require('../../../assets/pool-assets/bochas/14.jpg'),
  15: require('../../../assets/pool-assets/bochas/15.jpg'),
}

// Bug real (ago 2026, build standalone): en Expo Go, un asset resuelve a
// un `file://...` real en la caché local y `File(uri).arrayBuffer()`
// (expo-file-system) lo lee bien — así se probó extensamente toda esta
// sesión. Pero en un build standalone (EAS), los assets bundleados quedan
// COMPILADOS como recurso nativo del APK (la misma razón del bug real de
// "Duplicate resources" fbx/glb ya arreglado en metro.config.js) y
// `asset.localUri` termina siendo una URI que `File` rechaza con
// "URI is not absolute" — el `.glb`/las texturas nunca cargaban, sin
// ninguna bocha visible (ni siquiera negra: cargarPlantillaBocha fallaba
// antes de armar ninguna malla). `fetch()` sí sabe resolver ese esquema
// (el fetch de React Native usa OkHttp en Android, que entiende recursos
// bundleados del APK, no solo http/https) — se intenta primero el camino
// ya confirmado (File) y se cae a fetch solo si ese falla, para no romper
// el caso de Expo Go que sí funciona.
async function leerArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return fetch(uri).then(r => r.arrayBuffer())
  try {
    return await new File(uri).arrayBuffer()
  } catch {
    return fetch(uri).then(r => r.arrayBuffer())
  }
}

// Bug real (ago 2026): en NATIVE, la convención {localUri} que espera el
// texImage2D de expo-gl (decodifica el archivo con stb_image, del lado
// nativo, sin pasar por JS) fallaba en SILENCIO para cualquier imagen real
// (JPG o PNG) en este proyecto — la bocha quedaba negra (con su reflejo
// especular normal, porque eso no depende de la textura: así se diagnosticó
// que la luz andaba bien y el problema era puntualmente la textura). Se
// probó exhaustivamente: el archivo existe, el tamaño es correcto, la firma
// JPG/PNG es válida, ninguna es progresiva/interlaceada rara — y aun así
// fallaba, sin ningún error ni en JS ni en logcat.
//
// Causa raíz real: el nombre de este proyecto en Expo es
// "@kratos2006/timba" — el "/" de ahí obliga a Expo a codificar dos veces
// ese segmento en CUALQUIER path de caché de este proyecto (termina como
// ".../%2540kratos2006%252Ftimba/..."), incluso en `Paths.cache` de
// expo-file-system (se probó copiar el archivo ahí con un nombre plano —
// mismo resultado, porque Expo Go aísla el caché de cada proyecto bajo ese
// mismo directorio, sin ninguna carpeta "genérica" disponible). El decoder
// nativo de expo-gl (loadImage() en EXGLImageUtils.cpp, separado del código
// de expo-file-system) no logra resolver ese path — stb_image nunca
// encuentra el archivo. Correr la app como build standalone (no Expo Go)
// probablemente esquivaría esto solo (sin esa carpeta con owner/slug
// codificado), pero no es algo que se pueda validar desde acá.
//
// Fix real: dejar de depender del decoder nativo de imágenes por completo.
// `leerArrayBuffer` (arriba) usa expo-file-system, que SÍ resuelve bien ese
// mismo path raro (confirmado: así carga el .glb) — así que se leen los
// bytes crudos del archivo con eso, y se decodifica el JPG/PNG en JS puro
// (jpeg-js / decodificarPNG.ts) para armar un THREE.DataTexture con los
// píxeles ya listos. Más lento que dejar decodificar a la GPU/nativo, pero
// son 17 imágenes chicas (~30-50 KB cada una) una sola vez por sesión —
// aceptable frente a que no había forma de que se vieran.
async function cargarTexturaDesdeUri(uri: string, tipo: 'jpeg' | 'png'): Promise<THREE.Texture> {
  if (Platform.OS === 'web') {
    // En WEB no hace falta nada de esto: el navegador decodifica JPG/PNG
    // nativamente y bien, sin el bug de arriba (que es específico del
    // decoder nativo de expo-gl en Android/iOS).
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const tex = new THREE.Texture(img)
        configurarFiltroTextura(tex)
        tex.needsUpdate = true
        resolve(tex)
      }
      img.onerror = () => reject(new Error(`No se pudo cargar la textura: ${uri}`))
      img.src = uri
    })
  }
  const buffer = await leerArrayBuffer(uri)
  const { width, height, data } = tipo === 'jpeg'
    ? jpegJs.decode(buffer, { useTArray: true, formatAsRGBA: true })
    : decodificarPNG(buffer)
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
  // THREE.DataTexture pone flipY=false por default (a diferencia de
  // THREE.Texture, que es true) — sin esto, las bochas quedan al revés
  // respecto de como se veían antes (con {localUri}, que sí flipeaba).
  tex.flipY = true
  configurarFiltroTextura(tex)
  tex.needsUpdate = true
  return tex
}

// Las texturas de las bochas son en su mayoría un color sólido + un
// número chico (p.ej. la 8: casi toda negra, con un "8" blanco ocupando
// una fracción mínima de los 1024×512px) — a los ~16px que mide una bocha
// en pantalla, el mipmapping por default de three.js promedia la textura
// contra sus vecinos para cada nivel, y un detalle tan chico contra un
// fondo tan uniforme se termina promediando a casi nada: la bocha se veía
// negra/sin brillo, aunque la textura cargaba bien (bug real, confirmado
// con captura ampliada — no era un problema de carga). Con mipmaps
// apagados, la GPU siempre samplea la textura a resolución completa sin
// importar qué tan chica se dibuje — a cambio de algo de shimmer/aliasing
// cuando la bocha se mueve rápido, aceptable frente a que no se vea nada.
function configurarFiltroTextura(tex: THREE.Texture) {
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
}

export interface PlantillaBocha {
  grupo: THREE.Group // molde: clonar (grupo.clone(true)) antes de usar, nunca agregar directo a una escena
  escalaUnidad: number // multiplicador para que el clon quede en diámetro 1 — ver nota abajo
}

let promesaPlantilla: Promise<PlantillaBocha> | null = null

function parseGLB(buffer: ArrayBuffer): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(buffer, '', gltf => resolve(gltf.scene), reject)
  })
}

// Molde de una bocha: el Group del glTF ya cargado y centrado en el
// origen, CON SU JERARQUÍA VIVA (nada horneado en la geometría) — más
// escalaUnidad, el número por el que hay que multiplicar para que un clon
// quede en diámetro 1. El consumidor aplica esa escala UNA sola vez, como
// número explícito (diametroPxDeseado * escalaUnidad), directo sobre el
// Group que envuelve el clon — ver MesaPoolBochas3D.
//
// Historial de vueltas sobre esto (ago 2026):
// 1) Primero devolvía una BufferGeometry "horneada" (geometry.applyMatrix4
//    con la matriz de mundo del mesh) — las 16 bochas salían NEGRAS en la
//    mesa real. Se sospechó un determinante negativo en la transformación
//    del FBX (conversión Z-up→Y-up de Blender) que three.js solo compensa
//    con la jerarquía viva — se sacó el horneado.
// 2) El wrapper de Group extra para controlar el tamaño por bola tenía dos
//    escalas anidadas que se pisaban entre sí — se resolvió devolviendo
//    escalaUnidad como número plano, sin aplicarlo a ningún Group acá.
// 3) Con eso resuelto, el material seguía saliendo negro (rastreado
//    después a la etapa de luces/PBR, no a esto) y aparte se vio un efecto
//    "vitral" (triángulos de colores mezclados) que se sospechó un bug de
//    indexado de UVs específico de FBXLoader — MAL DIAGNOSTICADO: el
//    usuario probó las mismas texturas sobre el mismo mesh en Blender y
//    salían perfectas, y separando las bochas superpuestas en la app el
//    "vitral" desaparecía. La causa real: TODAS las bochas se posicionan
//    en z=0 (ver MesaPoolBochas3D), y un multiplicador de tamaño de
//    diagnóstico (×6, temporal) las hacía mucho más grandes que su hitbox
//    real — con muchas esferas coplanares superpuestas, la GPU no puede
//    resolver de forma estable qué triángulo de qué bola gana en cada
//    píxel (z-fighting clásico), mezclando fragmentos de varias bochas
//    distintas. No era ni el modelo ni el parser.
//    Aun así, migrar de FBXLoader a GLTFLoader quedó como mejora real
//    (glTF tiene un solo índice de vértice unificado por atributo, más
//    simple y con loader más maduro/probado en three.js) — no porque haya
//    sido la causa de este bug puntual.
// 4) Meses después: TODAS las texturas reales (JPG de bochas, PNG de
//    brillo) salían negras en Android — ver la nota junto a
//    cargarTexturaDesdeUri para el diagnóstico completo y el fix real
//    (decodificar en JS, no en el nativo de expo-gl).
export function cargarPlantillaBocha(): Promise<PlantillaBocha> {
  if (!promesaPlantilla) {
    promesaPlantilla = (async () => {
      const asset = Asset.fromModule(ASSET_GLB)
      await asset.downloadAsync()
      const uri = asset.localUri ?? asset.uri
      const buffer = await leerArrayBuffer(uri)
      const grupo = await parseGLB(buffer)

      const caja = new THREE.Box3().setFromObject(grupo)
      const centro = caja.getCenter(new THREE.Vector3())
      const tam = caja.getSize(new THREE.Vector3())
      const escalaUnidad = 1 / Math.max(tam.x, tam.y, tam.z, 0.0001)
      grupo.position.sub(centro)
      return { grupo, escalaUnidad }
    })()
  }
  return promesaPlantilla
}

const cacheUris = new Map<number, Promise<string>>()

// Solo cachea la RESOLUCIÓN del asset (nombre de archivo → uri local) —
// eso es lo único caro de verdad (I/O). Antes cacheaba el THREE.Texture /
// MeshPhysicalMaterial ya construidos y los reusaba entre pantallas — pero
// un Texture "recuerda" si ya se subió a la GPU (needsUpdate pasa a false
// después de la primera subida), y esa marca es por CONTEXTO WebGL: al
// volver a entrar a la mesa (nuevo GLView, nuevo onContextCreate, nuevo
// renderer/contexto), el texture reusado pensaba que no hacía falta
// resubirse y quedaba sin datos en el contexto nuevo — bug real,
// confirmado tras descartar geometría/UVs/normales por inspección directa
// del FBX (nada raro ahí). Por eso Texture/Material se arman de cero en
// cada llamada — barato, solo la carga de la imagen se repite.
function cargarUriTextura(n: number): Promise<string> {
  let promesa = cacheUris.get(n)
  if (!promesa) {
    const moduloTextura = ASSETS_TEXTURA[n]
    if (moduloTextura === undefined) throw new Error(`No hay textura para la bola ${n}`)
    promesa = (async () => {
      const asset = Asset.fromModule(moduloTextura)
      await asset.downloadAsync()
      return asset.localUri ?? asset.uri
    })()
    cacheUris.set(n, promesa)
  }
  return promesa
}

// Material + textura de una bocha por número (0 = blanca). Textura/material
// SIEMPRE nuevos (ver nota en cargarUriTextura) — no cachear el resultado
// de esta función.
//
// MeshPhysicalMaterial + clearcoat (la "capa de laca" que se probó primero)
// renderizaba TOTALMENTE NEGRO acá, de forma reproducible, incluso subiendo
// la luz ambiental+direccional a más de 2x lo normal (la ambiental ni
// siquiera depende de dirección/posición — si ESA tampoco hacía nada,
// no era un problema de cantidad ni de apuntado de luz, era clearcoat en
// sí). Se abandona clearcoat: MeshStandardMaterial (sin esa capa extra) sí
// renderiza bien, confirmado en dispositivo real — el brillo se consigue
// bajando roughness en vez de con la capa de clearcoat.
export async function cargarMaterialBola(n: number): Promise<THREE.MeshStandardMaterial> {
  const uri = await cargarUriTextura(n)
  const map = await cargarTexturaDesdeUri(uri, 'jpeg')
  // 0.25→0.15: sin reflejo especular visible pese a subir la luz — más
  // roughness = reflejo más disperso/tenue, menos = más concentrado/brillante.
  return new THREE.MeshStandardMaterial({ map, roughness: 0, metalness: 0.3 })
}

let promesaUriBrillo: Promise<string> | null = null

function cargarUriBrillo(): Promise<string> {
  if (!promesaUriBrillo) {
    promesaUriBrillo = (async () => {
      const asset = Asset.fromModule(ASSET_BRILLO)
      await asset.downloadAsync()
      return asset.localUri ?? asset.uri
    })()
  }
  return promesaUriBrillo
}

// Textura experimental (brillo.png, ago 2026): fondo transparente + un par
// de manchas blancas que simulan un reflejo de luz — pensada para ir FIJA
// (no rotar con la bocha), como un decal pegado siempre en el mismo lugar
// de la pantalla independientemente de cómo gire la esfera de adentro. Por
// eso es MeshBasicMaterial (sin luces: ya es "el brillo" en sí, no algo que
// deba iluminarse) con transparent+depthWrite:false (estándar para planos
// translúcidos superpuestos). Igual que cargarMaterialBola, no cachea el
// Texture/Material — solo la uri (ver nota ahí sobre el bug de reuso entre
// contextos WebGL). MesaPoolBochas3D es quien decide dónde ubicar el plano
// para que quede clavado en pantalla pese al giro de la bocha.
//
// brillo.png también estaba exportado con entrelazado Adam7 (un modo de PNG
// más complejo de decodificar que baseline) — se re-exportó sin entrelazar
// de todos modos (mismos píxeles, mismo canal alfa, verificado byte a byte;
// decodificarPNG.ts solo soporta PNG sin entrelazar a propósito, ver ahí) —
// si en el futuro se reemplaza este asset a mano, exportar con
// "interlace: none".
export async function cargarMaterialBrillo(): Promise<THREE.MeshBasicMaterial> {
  const uri = await cargarUriBrillo()
  const map = await cargarTexturaDesdeUri(uri, 'png')
  // side: DoubleSide — el plano seguía invisible incluso con una textura
  // de PRUEBA opaca (rojo sólido, sin nada de transparencia), lo que
  // descarta que fuera un tema de tamaño/posición/transparencia: por
  // default three.js solo dibuja la cara CUYA normal mira a cámara
  // (culling de la cara de atrás) — sospecha confirmada por eliminación:
  // la normal del plano debe estar mirando para el otro lado en este
  // sistema de coordenadas. DoubleSide lo dibuja de cualquier manera, sin
  // depender de a qué lado termine apuntando la normal.
  return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide })
}
