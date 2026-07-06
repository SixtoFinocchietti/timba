// Traduce errores de Supabase/red a mensajes amigables en español.
// Nunca exponer error.message directamente al usuario — revela internos de la DB.

const MENSAJES: Record<string, string> = {
  // Auth
  'invalid login credentials':        'Email o contraseña incorrectos.',
  'invalid_credentials':              'Email o contraseña incorrectos.',
  'user already registered':          'Ya existe una cuenta con ese email.',
  'email already in use':             'Ya existe una cuenta con ese email.',
  'email not confirmed':              'Confirmá tu email antes de ingresar.',
  'email rate limit exceeded':        'Demasiados intentos. Esperá unos minutos.',
  'over_request_rate_limit':          'Demasiados intentos. Esperá unos minutos.',
  'rate_limit':                       'Demasiados intentos. Esperá unos minutos.',
  'unable to validate email address': 'El formato del email no es válido.',
  'password should be at least':      'La contraseña es muy corta.',
  'weak_password':                    'La contraseña es muy débil. Usá al menos 8 caracteres con números.',
  'session_not_found':                'Tu sesión expiró. Volvé a iniciar sesión.',
  'jwt expired':                      'Tu sesión expiró. Volvé a iniciar sesión.',
  // DB / red
  'duplicate key value':              'Ya existe un registro con esos datos.',
  'foreign key constraint':           'Error en los datos. Intentá de nuevo.',
  'network request failed':           'Sin conexión. Revisá tu internet.',
  'failed to fetch':                  'Sin conexión. Revisá tu internet.',
  'rate_limit_exceeded':              'Demasiados intentos. Esperá una hora.',
  // Validaciones de la BD (triggers de la migración 010)
  'row-level security':               'No tenés permiso para hacer esa acción.',
  'timba_llena':                      'La timba está llena.',
  'limite_vencido':                   'El plazo para unirse venció.',
  'timba_no_activa':                  'La timba ya no está activa.',
  'timba_cerrada':                    'La timba ya está cerrada.',
  'voto_inmutable':                   'Tu voto ya está confirmado y no se puede cambiar.',
  'opcion_invalida':                  'Esa opción no existe en esta timba.',
  'monto_fuera_de_rango':             'El monto está fuera de los límites de la timba.',
  'sin_propuesta':                    'No hay ningún resultado propuesto para confirmar.',
  'transicion_invalida':              'Esa acción no está permitida en este estado.',
  'deudas_pendientes':                'No se puede bloquear: tienen deudas pendientes entre ustedes. Salden las deudas primero.',
}

export function mensajeError(error: unknown, fallback = 'Ocurrió un error. Intentá de nuevo.'): string {
  if (!error) return fallback

  const raw = (
    typeof error === 'string'
      ? error
      : (error as any)?.message ?? ''
  ).toLowerCase()

  for (const [clave, mensaje] of Object.entries(MENSAJES)) {
    if (raw.includes(clave)) return mensaje
  }

  return fallback
}
