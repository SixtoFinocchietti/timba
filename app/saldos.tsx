import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, Alert, Share,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useColores } from '@/lib/ThemeContext'
import { ColoresTema } from '@/lib/colores'
import { Deuda } from '@/types'
import { AppIcon, IconName } from '@/components/ui/AppIcon'
import { mensajeError } from '@/lib/errores'

// ─── helpers ────────────────────────────────────────────────────────────────

function nombreVisible(u: any): string {
  return u?.apodo || u?.nombre || 'Desconocido'
}

function fechaCorta(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function formatMonto(n: number): string {
  return '$' + n.toLocaleString('es-AR')
}

function ordenarDeudas(lista: Deuda[]): Deuda[] {
  return [...lista].sort((a, b) => {
    const fechaDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (fechaDiff !== 0) return fechaDiff
    return (b.monto ?? 0) - (a.monto ?? 0)
  })
}

// ─── pantalla principal ──────────────────────────────────────────────────────

export default function Saldos() {
  const { usuario } = useAuthStore()
  const [meDeban, setMeDeban] = useState<Deuda[]>([])
  const [leDebo, setLeDebo] = useState<Deuda[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const c = useColores()
  const es = makeEstilos(c)

  useEffect(() => { cargarSaldos() }, [])

  async function cargarSaldos() {
    if (!usuario) return
    setCargando(true)
    setErrorCarga(null)
    try {
      const [{ data: acreedor, error: e1 }, { data: deudor, error: e2 }] = await Promise.all([
        supabase
          .from('deudas')
          .select('*, timba:timbas(titulo, cerrada_en), deudor:usuarios_publicos!deudas_deudor_id_fkey(nombre, apodo)')
          .eq('acreedor_id', usuario.id)
          .in('estado', ['pendiente', 'pago_informado']),
        supabase
          .from('deudas')
          .select('*, timba:timbas(titulo, cerrada_en), acreedor:usuarios_publicos!deudas_acreedor_id_fkey(nombre, apodo)')
          .eq('deudor_id', usuario.id)
          .in('estado', ['pendiente', 'pago_informado']),
      ])
      if (e1 || e2) throw e1 ?? e2
      setMeDeban(ordenarDeudas(acreedor ?? []))
      setLeDebo(ordenarDeudas(deudor ?? []))
    } catch (err) {
      setErrorCarga(mensajeError(err))
    } finally {
      setCargando(false)
    }
  }

  // Acreedor confirma que recibió el pago
  function accionSaldada(deuda: Deuda) {
    if (deuda.estado !== 'pago_informado') return
    const nombre = nombreVisible(deuda.deudor)
    Alert.alert(
      'Confirmar pago recibido',
      `¿Confirmás que ${nombre} ya te pagó? Esto cerrará la deuda definitivamente.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, está saldada',
          onPress: async () => {
            const { error } = await supabase
              .from('deudas')
              .update({ estado: 'finalizada', fecha_cierre: new Date().toISOString() })
              .eq('id', deuda.id)
            if (error) {
              Alert.alert('Error', 'No se pudo cerrar la deuda. Intentá de nuevo.')
            } else {
              setMeDeban(prev => prev.filter(d => d.id !== deuda.id))
            }
          },
        },
      ]
    )
  }

  // Acreedor envía recordatorio (chat futuro)
  function accionRecordar() {
    Alert.alert('Próximamente', 'El sistema de mensajes estará disponible en una próxima versión.')
  }

  // Acreedor comparte mensaje externamente
  async function accionCompartir(deuda: Deuda) {
    const nombre = nombreVisible(deuda.deudor)
    const timba = (deuda.timba as any)?.titulo ?? 'la timba'
    const montoStr = deuda.monto ? formatMonto(deuda.monto) : 'lo que apostamos'
    try {
      await Share.share({
        message: `Hola ${nombre} 👋. Págame la Timba!!! 💸 ${montoStr}, te gané en '${timba}'.`,
      })
    } catch {
      // usuario canceló el share
    }
  }

  // Deudor informa que pagó
  function accionPagada(deuda: Deuda) {
    const nombre = nombreVisible(deuda.acreedor)
    Alert.alert(
      'Informar pago',
      `¿Confirmás que ya le pagaste a ${nombre}? Quedará pendiente su confirmación.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Ya pagué',
          onPress: async () => {
            const { error } = await supabase
              .from('deudas')
              .update({ estado: 'pago_informado' })
              .eq('id', deuda.id)
            if (error) {
              Alert.alert('Error', 'No se pudo registrar el pago. Intentá de nuevo.')
            } else {
              setLeDebo(prev =>
                prev.map(d => d.id === deuda.id ? { ...d, estado: 'pago_informado' } : d)
              )
            }
          },
        },
      ]
    )
  }

  const totalAFavor = meDeban.reduce((s, d) => s + (d.monto ?? 0), 0)
  const totalDebes = leDebo.reduce((s, d) => s + (d.monto ?? 0), 0)

  return (
    <View style={es.contenedor}>
      <View style={es.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={es.btnVolver}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={es.btnVolverTexto}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={es.titulo}>Saldos</Text>
          <Text style={es.subtitulo}>Deudas activas</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={es.scroll}
        refreshControl={
          <RefreshControl refreshing={cargando} onRefresh={cargarSaldos} tintColor={c.primario} />
        }
        showsVerticalScrollIndicator={false}
      >
        {errorCarga && (
          <View style={{ alignItems: 'center', paddingVertical: 32, gap: 10 }}>
            <AppIcon name="xCirculo" size={36} color={c.error} />
            <Text style={{ color: c.error, fontWeight: '700' }}>No se pudo cargar</Text>
            <Text style={{ color: c.textoSuave, fontSize: 13 }}>{errorCarga}</Text>
            <TouchableOpacity onPress={cargarSaldos}>
              <Text style={{ color: c.primario, fontWeight: '700' }}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Estado: todo saldado */}
        {!cargando && !errorCarga && meDeban.length === 0 && leDebo.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 48, gap: 14 }}>
            <AppIcon name="vacioTodoDia" size={56} color={c.exito} />
            <Text style={{ color: c.texto, fontSize: 22, fontWeight: '800' }}>¡Todo al día!</Text>
            <Text style={{ color: c.textoSuave, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
              No tenés deudas pendientes.{'\n'}Cuando terminen las timbas van a aparecer acá.
            </Text>
          </View>
        )}

        {/* Balance neto + resumen */}
        {(totalAFavor > 0 || totalDebes > 0) && (
          <>
            <BalanceNeto aFavor={totalAFavor} debes={totalDebes} c={c} es={es} />
            <View style={es.resumenRow}>
              <ResumenCard label="Te deben" monto={totalAFavor} count={meDeban.length} color={c.exito} c={c} es={es} />
              <ResumenCard label="Debés" monto={totalDebes} count={leDebo.length} color={c.error} c={c} es={es} />
            </View>
          </>
        )}

        {/* Sección: Te Deben */}
        {(meDeban.length > 0 || leDebo.length > 0) && (
          <>
            <View style={es.seccion}>
              <SeccionHeader titulo="Te deben" count={meDeban.length} color={c.exito} c={c} es={es} />
              {meDeban.length === 0
                ? <VacioCard texto="Nadie te debe nada" icono="vacioTodoDia" color={c.exito} c={c} es={es} />
                : meDeban.map(d => (
                  <ItemTeDeben
                    key={d.id}
                    deuda={d}
                    c={c}
                    es={es}
                    onSaldada={() => accionSaldada(d)}
                    onRecordar={accionRecordar}
                    onCompartir={() => accionCompartir(d)}
                  />
                ))
              }
            </View>

            {/* Sección: Debés */}
            <View style={es.seccion}>
              <SeccionHeader titulo="Debés" count={leDebo.length} color={c.error} c={c} es={es} />
              {leDebo.length === 0
                ? <VacioCard texto="No debés nada" icono="sinDeudas" color={c.exito} c={c} es={es} />
                : leDebo.map(d => (
                  <ItemDeudor
                    key={d.id}
                    deuda={d}
                    c={c}
                    es={es}
                    onPagada={() => accionPagada(d)}
                  />
                ))
              }
            </View>
          </>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  )
}

// ─── componentes internos ────────────────────────────────────────────────────

function BalanceNeto({ aFavor, debes, c, es }: {
  aFavor: number; debes: number
  c: ColoresTema; es: ReturnType<typeof makeEstilos>
}) {
  const neto = aFavor - debes
  const color = neto > 0 ? c.exito : neto < 0 ? c.error : c.textoSuave
  const signo = neto > 0 ? '+' : ''
  const label = neto > 0 ? 'Estás a favor' : neto < 0 ? 'Estás en deuda' : 'Saldos equilibrados'
  return (
    <View style={[es.balanceCard, { backgroundColor: color + '12', borderColor: color + '33' }]}>
      <Text style={[es.balanceLabel, { color }]}>{label}</Text>
      <Text style={[es.balanceMonto, { color }]}>{signo}{formatMonto(Math.abs(neto))}</Text>
    </View>
  )
}

function ResumenCard({ label, monto, count, color, c, es }: {
  label: string; monto: number; count: number; color: string
  c: ColoresTema; es: ReturnType<typeof makeEstilos>
}) {
  return (
    <View style={[es.resumenCard, { backgroundColor: color + '18', borderColor: color + '44' }]}>
      <Text style={[es.resumenLabel, { color }]}>{label}</Text>
      <Text style={[es.resumenMonto, { color }]}>{formatMonto(monto)}</Text>
      <Text style={[es.resumenCant, { color: color + 'AA' }]}>
        {count} {count === 1 ? 'deuda' : 'deudas'}
      </Text>
    </View>
  )
}

function SeccionHeader({ titulo, count, color, c, es }: {
  titulo: string; count: number; color: string
  c: ColoresTema; es: ReturnType<typeof makeEstilos>
}) {
  return (
    <View style={es.seccionHeader}>
      <View style={[es.punto, { backgroundColor: color }]} />
      <Text style={[es.seccionTitulo, { color: c.texto }]}>{titulo}</Text>
      {count > 0 && (
        <View style={[es.badge, { backgroundColor: color + '22' }]}>
          <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{count}</Text>
        </View>
      )}
    </View>
  )
}

function VacioCard({ texto, icono, color, c, es }: {
  texto: string; icono: IconName; color: string
  c: ColoresTema; es: ReturnType<typeof makeEstilos>
}) {
  return (
    <View style={[es.vacioCaja, { backgroundColor: c.fondoCard, borderColor: c.borde }]}>
      <AppIcon name={icono} size={22} color={color} />
      <Text style={{ color: c.textoSuave, fontSize: 14 }}>{texto}</Text>
    </View>
  )
}

// Card para "Te Deben" (soy el acreedor)
function ItemTeDeben({ deuda: d, c, es, onSaldada, onRecordar, onCompartir }: {
  deuda: Deuda; c: ColoresTema; es: ReturnType<typeof makeEstilos>
  onSaldada: () => void; onRecordar: () => void; onCompartir: () => void
}) {
  const pagado = d.estado === 'pago_informado'
  const persona = nombreVisible(d.deudor as any)
  const inicial = (persona[0] ?? '?').toUpperCase()
  const timba = d.timba as any

  return (
    <View style={[es.card, { borderColor: pagado ? c.exito + '66' : c.borde }]}>
      {/* Badge "Pago informado" */}
      {pagado && (
        <View style={[es.cardBadge, { backgroundColor: c.exito + '1A' }]}>
          <Text style={{ color: c.exito, fontSize: 11, fontWeight: '700' }}>
            ✓ Pago informado — confirmar para cerrar
          </Text>
        </View>
      )}

      {/* Fila principal */}
      <View style={es.cardFila}>
        <View style={[es.avatar, { backgroundColor: c.exito + '20' }]}>
          <Text style={{ color: c.exito, fontSize: 17, fontWeight: '800' }}>{inicial}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[es.itemNombre, { color: c.texto }]} numberOfLines={1}>{persona}</Text>
          {timba?.titulo && (
            <Text style={[es.itemMeta, { color: c.textoSuave }]} numberOfLines={1}>
              {timba.titulo}
            </Text>
          )}
          <View style={es.fechasRow}>
            {timba?.cerrada_en && (
              <Text style={[es.itemFecha, { color: c.textoSuave }]}>
                Cerrada {fechaCorta(timba.cerrada_en)}
              </Text>
            )}
            <Text style={[es.itemFecha, { color: c.textoSuave }]}>
              Desde {fechaCorta(d.created_at)}
            </Text>
          </View>
        </View>
        {d.monto != null && (
          <View style={[es.montoBox, { backgroundColor: c.exito + '18' }]}>
            <Text style={[es.montoTexto, { color: c.exito }]}>+{formatMonto(d.monto)}</Text>
          </View>
        )}
      </View>

      {/* Acciones */}
      <View style={es.accionesRow}>
        <TouchableOpacity
          style={[
            es.btnAccion,
            pagado
              ? { backgroundColor: c.exito }
              : { backgroundColor: c.fondoInput, opacity: 0.5 },
          ]}
          onPress={onSaldada}
          disabled={!pagado}
        >
          <Text style={[es.btnAccionTxt, { color: pagado ? c.fondo : c.textoSuave }]}>
            ✓ Saldada
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[es.btnAccion, { backgroundColor: c.fondoInput }]}
          onPress={onRecordar}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <AppIcon name="recordatorio" size={12} color={c.texto} />
            <Text style={[es.btnAccionTxt, { color: c.texto }]}>Recordar</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[es.btnAccion, { backgroundColor: c.fondoInput }]}
          onPress={onCompartir}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <AppIcon name="compartir" size={12} color={c.texto} />
            <Text style={[es.btnAccionTxt, { color: c.texto }]}>Compartir</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// Card para "Debés" (soy el deudor)
function ItemDeudor({ deuda: d, c, es, onPagada }: {
  deuda: Deuda; c: ColoresTema; es: ReturnType<typeof makeEstilos>
  onPagada: () => void
}) {
  const pagado = d.estado === 'pago_informado'
  const persona = nombreVisible(d.acreedor as any)
  const inicial = (persona[0] ?? '?').toUpperCase()
  const timba = d.timba as any

  return (
    <View style={[es.card, { borderColor: pagado ? c.advertencia + '66' : c.borde }]}>
      {/* Badge "Esperando confirmación" */}
      {pagado && (
        <View style={[es.cardBadge, { backgroundColor: c.advertencia + '1A' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppIcon name="pagoPendiente" size={11} color={c.advertencia} />
            <Text style={{ color: c.advertencia, fontSize: 11, fontWeight: '700' }}>
              Pago informado — esperando al acreedor
            </Text>
          </View>
        </View>
      )}

      {/* Fila principal */}
      <View style={es.cardFila}>
        <View style={[es.avatar, { backgroundColor: c.error + '20' }]}>
          <Text style={{ color: c.error, fontSize: 17, fontWeight: '800' }}>{inicial}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[es.itemNombre, { color: c.texto }]} numberOfLines={1}>{persona}</Text>
          {timba?.titulo && (
            <Text style={[es.itemMeta, { color: c.textoSuave }]} numberOfLines={1}>
              {timba.titulo}
            </Text>
          )}
          <View style={es.fechasRow}>
            {timba?.cerrada_en && (
              <Text style={[es.itemFecha, { color: c.textoSuave }]}>
                Cerrada {fechaCorta(timba.cerrada_en)}
              </Text>
            )}
            <Text style={[es.itemFecha, { color: c.textoSuave }]}>
              Desde {fechaCorta(d.created_at)}
            </Text>
          </View>
        </View>
        {d.monto != null && (
          <View style={[es.montoBox, { backgroundColor: c.error + '18' }]}>
            <Text style={[es.montoTexto, { color: c.error }]}>−{formatMonto(d.monto)}</Text>
          </View>
        )}
      </View>

      {/* Acción */}
      {pagado ? (
        <View style={[es.btnPagadaInfo, {
          backgroundColor: c.advertencia + '15',
          borderColor: c.advertencia + '44',
        }]}>
          <Text style={{ color: c.advertencia, fontSize: 13, fontWeight: '600' }}>
            Ya informaste el pago · El acreedor debe confirmarlo
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[es.btnPagada, { backgroundColor: c.primario }]}
          onPress={onPagada}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppIcon name="yaPague" size={14} color={c.fondo} />
            <Text style={[es.btnPagadaTxt, { color: c.fondo }]}>Ya pagué</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ─── estilos ─────────────────────────────────────────────────────────────────

function makeEstilos(c: ColoresTema) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: c.fondo },
    topBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20,
    },
    btnVolver: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    btnVolverTexto: { color: c.primario, fontSize: 24, fontWeight: '600' },
    titulo: { color: c.texto, fontSize: 26, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' },
    subtitulo: { color: c.textoSuave, fontSize: 13, textAlign: 'center', marginTop: 1 },
    scroll: { paddingHorizontal: 20, paddingTop: 4 },

    balanceCard: {
      borderRadius: 20, padding: 20, borderWidth: 1,
      alignItems: 'center', gap: 4, marginBottom: 16,
    },
    balanceLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    balanceMonto: { fontSize: 40, fontWeight: '900', letterSpacing: -1.5 },

    resumenRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
    resumenCard: { flex: 1, borderRadius: 20, padding: 18, gap: 2, borderWidth: 1 },
    resumenLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    resumenMonto: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
    resumenCant: { fontSize: 12, fontWeight: '500', marginTop: 2 },

    seccion: { marginBottom: 28, gap: 10 },
    seccionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
    punto: { width: 8, height: 8, borderRadius: 4 },
    seccionTitulo: { fontSize: 16, fontWeight: '800', flex: 1 },
    badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },

    vacioCaja: {
      borderRadius: 16, padding: 20, borderWidth: 1,
      alignItems: 'center', gap: 6, borderStyle: 'dashed',
    },

    card: {
      borderRadius: 16, borderWidth: 1,
      backgroundColor: c.fondoCard, overflow: 'hidden',
    },
    cardBadge: {
      paddingVertical: 7, paddingHorizontal: 14, alignItems: 'center',
    },
    cardFila: {
      flexDirection: 'row', alignItems: 'center',
      gap: 12, padding: 14,
    },
    avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    itemNombre: { fontSize: 15, fontWeight: '700' },
    itemMeta: { fontSize: 12 },
    fechasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 1 },
    itemFecha: { fontSize: 11 },
    montoBox: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
    montoTexto: { fontSize: 17, fontWeight: '900' },

    accionesRow: {
      flexDirection: 'row', gap: 6,
      paddingHorizontal: 10, paddingBottom: 10,
    },
    btnAccion: {
      flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
    },
    btnAccionTxt: { fontSize: 12, fontWeight: '700' },

    btnPagada: {
      margin: 10, marginTop: 0,
      paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    },
    btnPagadaTxt: { fontSize: 14, fontWeight: '800' },
    btnPagadaInfo: {
      margin: 10, marginTop: 0,
      paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1,
    },
  })
}
