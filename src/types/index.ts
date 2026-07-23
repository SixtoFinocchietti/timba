export type TimbaEstado = 'activa' | 'en_disputa' | 'cerrada'
export type TimbaTipo = 'amistosa' | 'monetaria'
export type NivelPrivacidad = 'todos' | 'amigos' | 'nadie'
export type TemaApp = 'oscuro' | 'claro'

export interface RedSocial {
  nombre: string
  usuario: string
}

export interface Privacidad {
  email: NivelPrivacidad
  telefono: NivelPrivacidad
  redes: NivelPrivacidad
  nombre: NivelPrivacidad
  margenes: NivelPrivacidad
  timbas: NivelPrivacidad
  historial: NivelPrivacidad
}

export interface Usuario {
  id: string
  email: string
  nombre: string
  apodo?: string
  telefono?: string
  redes_sociales?: RedSocial[]
  privacidad?: Privacidad
  pin_edicion?: string
  avatar_url?: string
  tema?: TemaApp
  created_at: string
}

export interface Timba {
  id: string
  creador_id: string
  titulo: string
  descripcion?: string
  tipo: TimbaTipo
  opciones: string[]
  monto_minimo?: number
  monto_maximo?: number
  premio_descripcion?: string
  estado: TimbaEstado
  resultado_ganador?: string
  codigo_invitacion: string
  created_at: string
  updated_at: string
  cerrada_en?: string
  prenda_descripcion?: string
  max_participantes?: number
  fecha_inicio?: string
  limite_union?: string
}

export interface Participante {
  id: string
  timba_id: string
  usuario_id: string
  opcion_elegida: string | null
  monto?: number
  confirmacion_resultado?: boolean | null
  created_at: string
  usuario?: Usuario
}

export type TipoMensaje = 'texto' | 'imagen' | 'gif' | 'invitacion_timba' | 'invitacion_poker' | 'invitacion_truco' | 'invitacion_blackjack' | 'invitacion_pool'

export interface ReaccionMensaje {
  id: string
  mensaje_id: string
  usuario_id: string
  emoji: string
  created_at: string
}

export interface Mensaje {
  id: string
  emisor_id: string
  receptor_id: string
  contenido?: string
  tipo: TipoMensaje
  timba_id?: string
  imagen_url?: string
  gif_url?: string
  leido: boolean
  created_at: string
  reacciones: ReaccionMensaje[]
}

export type DeudaEstado = 'pendiente' | 'pago_informado' | 'finalizada' | 'cancelada'

export interface Deuda {
  id: string
  timba_id: string
  acreedor_id: string
  deudor_id: string
  monto?: number
  descripcion?: string
  estado: DeudaEstado
  fecha_cierre?: string
  created_at: string
  timba?: Timba
  acreedor?: Usuario
  deudor?: Usuario
}
