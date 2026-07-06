import Svg, { Path, Circle, Rect, Line, Ellipse } from 'react-native-svg'

export type IconName =
  | 'timba' | 'juegos' | 'amigos' | 'perfil' | 'saludo'
  | 'camara' | 'editarPerfil' | 'telefono'
  | 'ganadas' | 'perdidas' | 'saldos'
  | 'busqueda' | 'xCirculo' | 'favoritoLleno' | 'favoritoVacio'
  | 'aceptar' | 'rechazar'
  | 'compartirLink' | 'tipoMonetario' | 'pozoTotal' | 'premio' | 'prenda'
  | 'limite' | 'cupo'
  | 'amistosa' | 'conPlata'
  | 'vacioTodoDia' | 'sinDeudas' | 'recordatorio' | 'compartir' | 'yaPague' | 'pagoPendiente'
  | 'subirImagen' | 'galeria' | 'machoEspada' | 'poker'

interface AppIconProps {
  name: IconName
  size?: number
  color?: string
}

export function AppIcon({ name, size = 24, color = '#C9A84C' }: AppIconProps) {
  const sw = 1.6
  const sw2 = 1.7
  const lc = 'round' as const
  const lj = 'round' as const

  switch (name) {
    // ── Dado (Timba, Logo, Join, Vacío timbas) ──────────────────────────────
    case 'timba':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x="4" y="4" width="16" height="16" rx="4.5" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Circle cx="9" cy="9" r="1.1" fill={color} />
          <Circle cx="12" cy="12" r="1.1" fill={color} />
          <Circle cx="15" cy="15" r="1.1" fill={color} />
        </Svg>
      )

    // ── Control de juegos ───────────────────────────────────────────────────
    case 'juegos':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x="3" y="8" width="18" height="9" rx="4.5" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Line x1="7" y1="11" x2="7" y2="14" stroke={color} strokeWidth={sw} strokeLinecap={lc} />
          <Line x1="5.5" y1="12.5" x2="8.5" y2="12.5" stroke={color} strokeWidth={sw} strokeLinecap={lc} />
          <Circle cx="15.4" cy="11.6" r="1" fill={color} />
          <Circle cx="17.6" cy="13.6" r="1" fill={color} />
        </Svg>
      )

    // ── Usuarios/Amigos (Drawer, vacío amigos, cupo) ────────────────────────
    case 'amigos':
    case 'cupo':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="9" cy="8" r="3" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M3.8 19c0-2.9 2.3-5.2 5.2-5.2s5.2 2.3 5.2 5.2" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M15.2 5.3a3 3 0 0 1 0 5.4" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M16 13.9c2.4.5 4.2 2.6 4.2 5.1" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        </Svg>
      )

    // ── Perfil ──────────────────────────────────────────────────────────────
    case 'perfil':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="8" r="3.3" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M5.4 19.2c0-3.6 2.95-6.5 6.6-6.5s6.6 2.9 6.6 6.5" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        </Svg>
      )

    // ── Saludo mano (Hola, nombre) ──────────────────────────────────────────
    case 'saludo':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M17 10.6V6.1a1.9 1.9 0 0 0-3.8 0" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M13.2 9.6V4.5a1.9 1.9 0 0 0-3.8 0v1.9" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M9.4 10V6.1a1.9 1.9 0 0 0-3.8 0v7.4" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M17 8.1a1.9 1.9 0 1 1 3.8 0v5.4a7.5 7.5 0 0 1-7.5 7.5h-1.6c-2.5 0-4.1-.8-5.5-2.2l-3.2-3.2a1.9 1.9 0 0 1 2.7-2.7L6.6 14" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        </Svg>
      )

    // ── Cámara (editar foto avatar, foto en chat) ───────────────────────────
    case 'camara':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x="3" y="7" width="18" height="13" rx="3" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M8.2 7l1.2-2.2h5.2L15.8 7" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Circle cx="12" cy="13.4" r="3.2" stroke={color} strokeWidth={sw} />
        </Svg>
      )

    // ── Lápiz/editar ────────────────────────────────────────────────────────
    case 'editarPerfil':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M16.4 4.4l3.2 3.2L8.2 19l-4.2 1 1-4.2 11.4-11.4z" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M14.3 6.5l3.2 3.2" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        </Svg>
      )

    // ── Teléfono ────────────────────────────────────────────────────────────
    case 'telefono':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x="6.5" y="3" width="11" height="18" rx="2.6" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Line x1="10.4" y1="5.4" x2="13.6" y2="5.4" stroke={color} strokeWidth={sw} strokeLinecap={lc} />
          <Circle cx="12" cy="17.8" r="0.7" fill={color} />
        </Svg>
      )

    // ── Trofeo (ganadas, premio) ─────────────────────────────────────────────
    case 'ganadas':
    case 'premio':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M8 4h8v3.6a4 4 0 0 1-8 0V4z" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M8 5H5.4v1.4A2.6 2.6 0 0 0 8 9M16 5h2.6v1.4A2.6 2.6 0 0 1 16 9" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M12 11.6V15" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M9.4 19.5h5.2l-.6-2.5h-4z" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Line x1="8.5" y1="19.5" x2="15.5" y2="19.5" stroke={color} strokeWidth={sw} strokeLinecap={lc} />
        </Svg>
      )

    // ── Calavera (perdidas, prenda) ──────────────────────────────────────────
    case 'perdidas':
    case 'prenda':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M6 14.6C5 13.7 4.5 12.4 4.5 10.9 4.5 7.1 7.8 4 12 4s7.5 3.1 7.5 6.9c0 1.5-.5 2.8-1.5 3.7" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M6 14.6h12v2.6a1.3 1.3 0 0 1-1.3 1.3H7.3A1.3 1.3 0 0 1 6 17.2z" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Circle cx="9" cy="11" r="1.7" stroke={color} strokeWidth={sw} />
          <Circle cx="15" cy="11" r="1.7" stroke={color} strokeWidth={sw} />
          <Path d="M12 13l-.8 1.5h1.6z" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M9.5 14.6v3.9M12 14.6v3.9M14.5 14.6v3.9" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        </Svg>
      )

    // ── Saldos (llama/moneda) ────────────────────────────────────────────────
    case 'saldos':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M8.5 5.4h7" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M8.5 5.4c.7 1 1.3 1.5 1.4 2.3M15.5 5.4c-.7 1-1.3 1.5-1.4 2.3" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M9.9 7.7C7.3 9.2 5.5 11.7 5.5 14.6 5.5 18 8.4 20 12 20s6.5-2 6.5-5.4c0-2.9-1.8-5.4-4.4-6.9z" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M12 10.3v.9M12 16v.9" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M13.7 11.6a1.8 1.8 0 0 0-1.7-1c-1 0-1.8.6-1.8 1.5 0 1.9 3.5 1 3.5 2.9 0 .85-.8 1.5-1.8 1.5a1.8 1.8 0 0 1-1.7-1" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        </Svg>
      )

    // ── Búsqueda (lupa) ──────────────────────────────────────────────────────
    case 'busqueda':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="11" cy="11" r="6" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Line x1="15.5" y1="15.5" x2="20" y2="20" stroke={color} strokeWidth={sw} strokeLinecap={lc} />
        </Svg>
      )

    // ── X en círculo (limpiar búsqueda, error) ───────────────────────────────
    case 'xCirculo':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Line x1="9.2" y1="9.2" x2="14.8" y2="14.8" stroke={color} strokeWidth={sw} strokeLinecap={lc} />
          <Line x1="14.8" y1="9.2" x2="9.2" y2="14.8" stroke={color} strokeWidth={sw} strokeLinecap={lc} />
        </Svg>
      )

    // ── Corazón lleno ────────────────────────────────────────────────────────
    case 'favoritoLleno':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M12 20.3l-1.1-1C6.1 14.9 3 12.1 3 8.6A4.1 4.1 0 0 1 12 6.2 4.1 4.1 0 0 1 21 8.6c0 3.5-3.1 6.3-7.9 10.7z" fill={color} />
        </Svg>
      )

    // ── Corazón vacío ────────────────────────────────────────────────────────
    case 'favoritoVacio':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M12 20.3l-1.1-1C6.1 14.9 3 12.1 3 8.6A4.1 4.1 0 0 1 12 6.2 4.1 4.1 0 0 1 21 8.6c0 3.5-3.1 6.3-7.9 10.7z" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        </Svg>
      )

    // ── Checkmark (aceptar) ──────────────────────────────────────────────────
    case 'aceptar':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M5 12.5l4.5 4.5L19 7" stroke={color} strokeWidth={sw2} strokeLinecap={lc} strokeLinejoin={lj} />
        </Svg>
      )

    // ── X (rechazar) ─────────────────────────────────────────────────────────
    case 'rechazar':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Line x1="7" y1="7" x2="17" y2="17" stroke={color} strokeWidth={sw2} strokeLinecap={lc} />
          <Line x1="17" y1="7" x2="7" y2="17" stroke={color} strokeWidth={sw2} strokeLinecap={lc} />
        </Svg>
      )

    // ── Link/cadena (compartir timba) ────────────────────────────────────────
    case 'compartirLink':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M10.2 13.5a3 3 0 0 0 4.5.4l2.3-2.3a3 3 0 0 0-4.2-4.2l-1 1" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M13.8 10.5a3 3 0 0 0-4.5-.4L7 12.4a3 3 0 0 0 4.2 4.2l1-1" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        </Svg>
      )

    // ── Billete (tipo monetario) ─────────────────────────────────────────────
    case 'tipoMonetario':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x="3" y="6" width="18" height="12" rx="2.5" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Circle cx="12" cy="12" r="2.4" stroke={color} strokeWidth={sw} />
          <Circle cx="6.4" cy="12" r="0.6" fill={color} />
          <Circle cx="17.6" cy="12" r="0.6" fill={color} />
        </Svg>
      )

    // ── Banco (pozo total, pozo) ─────────────────────────────────────────────
    case 'pozoTotal':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M4 9.5l8-4.5 8 4.5" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Line x1="4" y1="9.5" x2="20" y2="9.5" stroke={color} strokeWidth={sw} strokeLinecap={lc} />
          <Line x1="6.5" y1="9.5" x2="6.5" y2="16.5" stroke={color} strokeWidth={sw} strokeLinecap={lc} />
          <Line x1="10" y1="9.5" x2="10" y2="16.5" stroke={color} strokeWidth={sw} strokeLinecap={lc} />
          <Line x1="14" y1="9.5" x2="14" y2="16.5" stroke={color} strokeWidth={sw} strokeLinecap={lc} />
          <Line x1="17.5" y1="9.5" x2="17.5" y2="16.5" stroke={color} strokeWidth={sw} strokeLinecap={lc} />
          <Line x1="3.5" y1="19.5" x2="20.5" y2="19.5" stroke={color} strokeWidth={sw} strokeLinecap={lc} />
          <Line x1="5" y1="16.5" x2="19" y2="16.5" stroke={color} strokeWidth={sw} strokeLinecap={lc} />
        </Svg>
      )

    // ── Reloj (límite de tiempo) ─────────────────────────────────────────────
    case 'limite':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="13.5" r="7" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M12 13.5V9.5" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M9.8 3.2h4.4M12 3.2v3.3" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M18.2 8.2l1.4-1.4" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        </Svg>
      )

    // ── Timba amistosa (manos) ───────────────────────────────────────────────
    case 'amistosa':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M11 17l2 2a1 1 0 1 0 3-3" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M14 14l2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M21 3l1 11h-2" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M3 3l-1 11 6.5 6.5a1 1 0 1 0 3-3" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M3 4h8" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        </Svg>
      )

    // ── Moneda con $$ (con plata) ────────────────────────────────────────────
    case 'conPlata':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x="3" y="6.5" width="18" height="11" rx="2.5" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M12 9.3v.7M12 14v.7" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M13.7 10.7a1.8 1.8 0 0 0-1.7-1c-1 0-1.8.6-1.8 1.5 0 1.9 3.5 1 3.5 2.9 0 .85-.8 1.5-1.8 1.5a1.8 1.8 0 0 1-1.7-1" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Circle cx="6.3" cy="12" r="0.55" fill={color} />
          <Circle cx="17.7" cy="12" r="0.55" fill={color} />
        </Svg>
      )

    // ── Checkmark en círculo (vacío todo al día) ─────────────────────────────
    case 'vacioTodoDia':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={sw2} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M8 12.3l2.7 2.7L16 9" stroke={color} strokeWidth={sw2} strokeLinecap={lc} strokeLinejoin={lj} />
        </Svg>
      )

    // ── Destellos (sin deudas) ───────────────────────────────────────────────
    case 'sinDeudas':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M3.5 20.5 8 10.6l5.4 5.4z" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M13.6 11.4l1.8-1.6M16.4 13l2-1M14.8 16.4l1.6 1.3M15.6 8.6l1.3-1.4" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Circle cx="16" cy="6.4" r="0.6" fill={color} />
          <Circle cx="19.4" cy="10" r="0.6" fill={color} />
          <Circle cx="19.2" cy="6" r="0.6" fill={color} />
        </Svg>
      )

    // ── Campana (recordatorio) ───────────────────────────────────────────────
    case 'recordatorio':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M18 16a6 6 0 0 0-1-3.3V11a5 5 0 0 0-10 0v1.7A6 6 0 0 0 6 16l-1.3 1.7h14.6z" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M10.4 20a1.7 1.7 0 0 0 3.2 0" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        </Svg>
      )

    // ── Flecha subir/compartir ───────────────────────────────────────────────
    case 'compartir':
    case 'subirImagen':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M12 15.5V4" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M7.5 8.5 12 4l4.5 4.5" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M5 14v3.5A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V14" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        </Svg>
      )

    // ── Cash con alas (ya pagué) ─────────────────────────────────────────────
    case 'yaPague':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x="8.6" y="9.6" width="6.8" height="5.2" rx="1.2" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Circle cx="12" cy="12.2" r="1.1" stroke={color} strokeWidth={sw} />
          <Path d="M8.6 10.9C6.1 9.4 3.6 9.6 2.1 11.1c1.4.2 2.4.8 3 1.7-1.3-.2-2.6.1-3.5.9 1.2.3 2 .9 2.4 1.8" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M15.4 10.9c2.5-1.5 5-1.3 6.5.2-1.4.2-2.4.8-3 1.7 1.3-.2 2.6.1 3.5.9-1.2.3-2 .9-2.4 1.8" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        </Svg>
      )

    // ── Reloj de arena (pago pendiente) ─────────────────────────────────────
    case 'pagoPendiente':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Line x1="6" y1="4" x2="18" y2="4" stroke={color} strokeWidth={sw} strokeLinecap={lc} />
          <Line x1="6" y1="20" x2="18" y2="20" stroke={color} strokeWidth={sw} strokeLinecap={lc} />
          <Path d="M7 4c0 4 5 5 5 8s-5 4-5 8" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M17 4c0 4-5 5-5 8s5 4 5 8" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M9.2 17.2h5.6" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        </Svg>
      )

    // ── Galería de imágenes ──────────────────────────────────────────────────
    case 'galeria':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x="3" y="5" width="18" height="14" rx="2.6" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
          <Circle cx="8.4" cy="9.6" r="1.6" stroke={color} strokeWidth={sw} />
          <Path d="M3.6 16.6l4.6-4 3 2.5L15 10.5 20.4 16" stroke={color} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        </Svg>
      )

    // ── Llama (Póker) ───────────────────────────────────────────────────────
    case 'poker':
      return (
        <Svg width={size} height={size} viewBox="0 0 26 28" fill="none">
          <Path d="M13 2 C13 8 4 9 4 16 C4 20 7 22 10 21 C12 20.5 12 19 11.5 18 C13 21 11 24 9 25 L17 25 C15 24 13 21 14.5 18 C14 19 14 20.5 16 21 C19 22 22 20 22 16 C22 9 13 8 13 2 Z" fill={color} />
        </Svg>
      )

    // ── Carta de naipe (Truco) ───────────────────────────────────────────────
    case 'machoEspada':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x="3.8" y="2" width="16.4" height="20" rx="2.6" stroke={color} strokeWidth={1.5} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M12 4.2l1.05 2.1v6.2h-2.1V6.3z" stroke={color} strokeWidth={1.5} strokeLinecap={lc} strokeLinejoin={lj} />
          <Line x1="12" y1="6.4" x2="12" y2="12.5" stroke={color} strokeWidth={1.5} strokeLinecap={lc} />
          <Path d="M7.4 14c1.7-1.2 3.1-1.7 4.6-1.7s2.9.5 4.6 1.7" stroke={color} strokeWidth={1.5} strokeLinecap={lc} strokeLinejoin={lj} />
          <Path d="M7.4 14c-.7.05-1.15.5-1.05 1.25M16.6 14c.7.05 1.15.5 1.05 1.25" stroke={color} strokeWidth={1.5} strokeLinecap={lc} strokeLinejoin={lj} />
          <Line x1="10.9" y1="13.6" x2="10.9" y2="17.9" stroke={color} strokeWidth={1.5} strokeLinecap={lc} />
          <Line x1="13.1" y1="13.6" x2="13.1" y2="17.9" stroke={color} strokeWidth={1.5} strokeLinecap={lc} />
          <Path d="M10.9 15.1h2.2M10.9 16.5h2.2" stroke={color} strokeWidth={1.5} strokeLinecap={lc} strokeLinejoin={lj} />
          <Circle cx="12" cy="18.9" r="1.05" stroke={color} strokeWidth={1.5} />
        </Svg>
      )

    default:
      return null
  }
}
