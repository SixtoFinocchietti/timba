// Decoder de PNG en JS puro — evita depender del decoder nativo de imágenes
// de expo-gl (ver la nota junto a cargarTexturaDesdeUri en bochas3d.ts sobre
// el bug real que esto esquiva: el decoder nativo no encuentra el archivo en
// la carpeta de caché de Expo Go de este proyecto). Alcanza con soportar
// exactamente lo que necesita brillo.png (8-bit RGBA, sin entrelazar, el
// único PNG que carga esta app) — esto NO es un decoder de PNG genérico.
import { inflate } from 'pako'

export interface ImagenDecodificada {
  width: number
  height: number
  data: Uint8Array // RGBA, 4 bytes por píxel
}

function leerUInt32BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

export function decodificarPNG(buffer: ArrayBuffer): ImagenDecodificada {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    throw new Error('decodificarPNG: firma PNG inválida')
  }

  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0
  const idatChunks: Uint8Array[] = []
  let offset = 8
  while (offset < bytes.length) {
    const len = leerUInt32BE(bytes, offset)
    const tipo = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
    const data = bytes.subarray(offset + 8, offset + 8 + len)
    if (tipo === 'IHDR') {
      width = leerUInt32BE(data, 0)
      height = leerUInt32BE(data, 4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (tipo === 'IDAT') {
      idatChunks.push(data)
    } else if (tipo === 'IEND') {
      break
    }
    offset += 8 + len + 4 // largo + tipo + data + CRC
  }

  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`decodificarPNG: solo soporta PNG de 8 bits RGBA (bitDepth=${bitDepth}, colorType=${colorType})`)
  }
  if (interlace !== 0) {
    throw new Error('decodificarPNG: no soporta PNG entrelazado (Adam7) — reexportar el asset con "interlace: none"')
  }

  const compressed = new Uint8Array(idatChunks.reduce((n, c) => n + c.length, 0))
  let pos = 0
  for (const chunk of idatChunks) { compressed.set(chunk, pos); pos += chunk.length }
  const raw = inflate(compressed)

  const bpp = 4 // RGBA de 8 bits
  const stride = width * bpp
  const data = new Uint8Array(height * stride)
  let prevRow = new Uint8Array(stride)
  let inOff = 0
  for (let y = 0; y < height; y++) {
    const filterType = raw[inOff]
    inOff += 1
    const row = data.subarray(y * stride, y * stride + stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0
      const b = prevRow[x]
      const c = x >= bpp ? prevRow[x - bpp] : 0
      const filt = raw[inOff + x]
      let recon: number
      switch (filterType) {
        case 0: recon = filt; break
        case 1: recon = (filt + a) & 0xff; break
        case 2: recon = (filt + b) & 0xff; break
        case 3: recon = (filt + Math.floor((a + b) / 2)) & 0xff; break
        case 4: recon = (filt + paeth(a, b, c)) & 0xff; break
        default: throw new Error(`decodificarPNG: filter type desconocido: ${filterType}`)
      }
      row[x] = recon
    }
    inOff += stride
    prevRow = row
  }

  return { width, height, data }
}
