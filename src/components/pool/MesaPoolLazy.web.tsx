// Web: CanvasKit (WASM ~2 MB) se carga UNA vez y recién después se importa el
// componente Skia (importarlo antes rompe). Spec §17: carga lazy solo al
// entrar al Pool — el resto de la app no paga este costo.

import { useEffect, useState, ComponentType } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web'
import type { MesaPoolProps } from './MesaPool'
import { RELACION_ASPECTO } from '@/lib/pool/transform'

let cargaSkia: Promise<void> | null = null

export default function MesaPoolLazy(props: MesaPoolProps) {
  const [Mesa, setMesa] = useState<ComponentType<MesaPoolProps> | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vivo = true
    // ruta absoluta: sin locateFile, CanvasKit resuelve el wasm relativo a la
    // URL actual (/juegos/... → el router devuelve HTML y el compile explota)
    cargaSkia = cargaSkia ?? LoadSkiaWeb({ locateFile: file => `/${file}` })
    cargaSkia
      .then(() => import('./MesaPool'))
      .then(m => { if (vivo) setMesa(() => m.default) })
      .catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [])

  if (!Mesa) {
    return (
      <View
        style={{
          width: props.anchoPx, height: props.anchoPx * RELACION_ASPECTO,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#155843', borderRadius: 16,
        }}
      >
        {error
          ? <Text style={{ color: '#F2EFE8' }}>No se pudo cargar la mesa</Text>
          : <ActivityIndicator color="#DFC47A" size="large" />}
      </View>
    )
  }
  return <Mesa {...props} />
}
