# Pool 8-Ball — Especificación de diseño y desarrollo

> Propuesta elaborada como equipo: Game Designer + UX/UI + Arquitectura + Mobile Senior.
> Estado: **decisiones v1 tomadas (ver Apéndice B)** · Julio 2026 · Fase 1 (motor) en desarrollo

---

## 0. Decisiones estructurales (leer primero)

Estas cinco decisiones condicionan todo lo demás. Cada una tiene alternativas; se explica el trade-off.

### D1 — Orientación: vertical (portrait) con mesa vertical

Toda la app es portrait. Forzar landscape para el pool rompe el flujo (chat, notificaciones,
navegación, volver al home). La mesa de pool es 2:1, así que **puesta en vertical aprovecha
mejor la pantalla de un teléfono (19.5:9) que en horizontal**: la mesa ocupa ~60% del alto,
las bolas se ven MÁS grandes que en landscape, y los controles quedan en zona de pulgar.

- Referencia: *Pooking – Billiards City* (portrait) vs *8 Ball Pool* de Miniclip (landscape, por legado).
- ⚠️ **Impacto inmediato en assets**: el fondo de mesa que se está diseñando debe pensarse
  en vertical (troneras de esquina arriba/abajo, troneras de banda a los costados a media altura).
- Trade-off: landscape permite HUD a los costados sin tapar mesa; portrait obliga a HUD compacto
  arriba. Aceptable: el HUD de pool es chico (2 jugadores + bolas embocadas + timer).

### D2 — Rendering: `@shopify/react-native-skia` (dependencia nueva)

16 bolas en movimiento + sombras + guías de tiro + partículas a 60 fps no es viable con
Views/SVG animados. Skia es canvas GPU, tiene soporte oficial en Expo SDK 56 y se integra
con Reanimated 4 (ya instalado).

- Las **bolas se dibujan proceduralmente** (no son imágenes): círculo base de color + franja
  blanca (rayadas) + circulito con número + gradiente radial + brillo especular. Ver §13.
- La **mesa sí es una imagen estática** (el asset en curso): paño, maderas, troneras decorativas.
  Encima va una capa Skia con todo lo dinámico. La geometría de colisión (bandas, bocas de
  tronera) es lógica invisible que debe calzar con el dibujo.
- Web: Skia usa CanvasKit (WASM ~2 MB). Cargar lazy solo al entrar al Pool, con pantalla de
  carga con tips de juego. El resto de la app no paga ese costo.
- Alternativas descartadas: `react-native-svg` animado (no escala a 16 cuerpos), `expo-gl` +
  three.js (3D innecesario, curva de mantenimiento alta).

### D3 — Física: motor propio determinista en TypeScript puro (no matter-js)

El pool necesita física especializada que los motores genéricos no traen: fricción de
rodadura en dos fases (deslizamiento → rodadura), spin (follow / draw / english), throw en
colisiones, bandas con restitución modificada por efecto, troneras con "cejas". Son
~600-800 líneas de TS puro, sin dependencias, testeables con unit tests.

**Ventaja clave que regala el pool por turnos**: no hay input durante el movimiento, así que
se puede **simular el tiro completo por adelantado** (en ~5 ms) y después solo *animar* el
resultado. Consecuencias en cascada:

1. Animación perfecta a 60 fps (no se simula en caliente, solo se interpola).
2. Sonidos y hápticos agendados con timestamps exactos.
3. Replay y slow-motion gratis (re-animar la misma trayectoria).
4. Multijugador barato: se transmite el **input del tiro**, no 900 frames (ver D4).
5. El bot "imagina" tiros usando el mismo motor (ver §10).

### D4 — Multijugador: "autoridad del tirador" sobre el patrón Realtime existente

El pool es por turnos → encaja exacto en el patrón ya probado (blackjack clásico online,
migración 018): una fila por partida, RLS de participantes, Realtime, escribe solo el
cliente al que le toca.

Por tiro se transmite: `{ input: {ángulo, fuerza, spin, posBlanca?}, eventos, snapshotFinal }`.
El rival **reproduce la animación** ejecutando la misma simulación con el mismo input; al
terminar aplica el snapshot final del tirador como verdad (si hubo divergencia de punto
flotante entre plataformas —Hermes vs. web— la corrección es de fracciones de píxel, invisible).

- Broadcast del canal para latencia baja (el rival ve el tiro casi en vivo) + UPDATE de la
  fila como estado persistente (reconexión, historial).
- Sin servidor autoritativo, sin tick-rate, sin lag compensation. Anti-cheat no es objetivo:
  Timba es una app entre amigos basada en confianza, igual que el resto de los juegos.

### D5 — Sin economía interna (anti-ludopatía)

Nada de monedas, fichas apostables ni "double or nothing" dentro del pool. Se juega **al
resultado** (partida suelta o serie al mejor de 3/5 como tanteo). Si hay algo en juego, es
una **Timba** creada explícitamente (premio / prenda / registro de deuda), como en el Truco.
Sin push notifications que inciten a apostar. La Timba es opcional y silenciosa.

---

## 1. Flujo de navegación

```
Juegos (index)
 └── Pool (menú)  ──────────────────────────────┐
      ├── Tutorial (6 lecciones + práctica)      │
      ├── Jugar vs Bot ── selector dificultad ── ┼──► Partida (misma pantalla,
      ├── Jugar con un amigo                     │      distinto "modo")
      │    ├── elegir amigo (lista + buscador)   │
      │    ├── configurar (serie, timer, guías,  │
      │    │    ¿con Timba?)                     │
      │    └── Sala de espera ───────────────────┘
      │         ├── host: “esperando a Juan…” → “¡Juan se unió!” → Empezar
      │         └── invitado: entra por chat / menú Pool / push → espera al host
      ├── Práctica libre (mesa sola, sin reglas)
      └── Invitaciones pendientes (badge)
```

Rutas expo-router:

| Ruta | Pantalla |
|---|---|
| `app/juegos/pool.tsx` | Menú del Pool (modos, invitaciones, progreso tutorial) |
| `app/juegos/sala-pool.tsx` | Sala de espera (patrón `sala-blackjack.tsx`) |
| `app/juegos/partida-pool.tsx` | La mesa. Prop `modo: 'bot' \| 'online' \| 'tutorial' \| 'practica'` |
| — | El tutorial es `partida-pool` con `modo=tutorial` y un guion por encima (§9) |

La card "Pool" se agrega a `app/juegos/index.tsx` y un ícono `pool` (bola 8) a `AppIcon`.

## 2. Pantallas

### 2.1 Menú del Pool
- Header estándar (`AppHeader`).
- Cards de modo: **Tutorial** (con anillo de progreso ✓ 4/6), **vs Bot**, **Con un amigo**, **Práctica libre**.
- Sección **Invitaciones**: cards de invitaciones recibidas pendientes con Aceptar / Rechazar
  (además de la card en el chat — pedido explícito del flujo).
- Primera visita: la card Tutorial aparece destacada con copy "Aprendé en 3 minutos". No se fuerza.
- Stats propias discretas al pie: jugadas, ganadas, mejor racha.

### 2.2 Sala de espera (host / invitado)
Calco del patrón blackjack: canal de presencia `sala-pool-{idsOrdenados}`, el host ve
"esperando…" → "¡{amigo} se unió!" → botón **Empezar**; el invitado escucha el INSERT de
`partidas_pool` filtrado por `invitado_id` y navega solo. Muestra la config elegida
(serie, timer, guías, timba vinculada) y botón "Reenviar invitación".

### 2.3 Partida (layout portrait)

```
┌──────────────────────────────────┐
│ ‹   Pool · Mejor de 3 (1–0)    ⋮ │  ← salir/abandonar, ajustes sonido
├──────────────────────────────────┤
│  ⏱42  🧑 Vos · LISAS  ●●●○○○○    │  ← riel de bolas embocadas
│       🧔 Juan · RAYADAS ◐◐○○○○○  │  ← turno = borde dorado + pulso
├──────────────────────────────────┤
│  ╔══════════════════════════╗    │
│  ║ ◉                      ◉ ║    │
│  ║                          ║    │
│  ║ ◉       MESA           ◉ ║    │  ← imagen de fondo (asset)
│  ║       VERTICAL           ║    │    + capa Skia (bolas, guía,
│  ║         2:1              ║    │      taco, partículas)
│  ║ ◉                      ◉ ║    │
│  ╚══════════════════════════╝    │
├──────────────────────────────────┤
│  (◉spin)   ‹  ›       ║▓▓▓░░║    │  ← spin | ajuste fino | fuerza
└──────────────────────────────────┘
```

- HUD superior compacto: score de la serie, jugadores con grupo asignado y riel de
  mini-bolas embocadas (feedback de progreso instantáneo), timer circular alrededor del
  avatar activo.
- Banners de evento (2 s, no modales): "¡Falta! Bola blanca embocada — Juan tiene bola en mano",
  "Mesa abierta", "¡Vas por la 8!".
- Fin de partida: overlay con resultado, botón **Revancha**, y si hay Timba vinculada,
  acceso directo para cargarle el resultado (§15).

## 3. Diseño de interfaz

- **Tema**: el chrome (header, HUD, botones) respeta claro/oscuro con la paleta existente.
  La mesa es "el mundo físico": idéntica en ambos temas, con viñeta más marcada en oscuro.
- **Paño**: **verde clásico (bosque profundo)** ✅ decidido. Requisito: textura sutil y
  pareja — un paño muy dibujado ensucia la lectura de las líneas de guía de tiro.
- Acentos con `c.primario` (dorado): guía de tiro propia, glow de turno, destello de tronera.
- El rival no ve tu guía (online); en la animación del rival, su guía no se muestra (solo el tiro).
- Grupos accesibles: nunca solo color — texto "LISAS/RAYADAS" + números en las mini-bolas
  (las rayadas ya llevan franja blanca: cubre daltonismo).

## 4. Controles (mobile-first)

| Acción | Gesto | Detalle |
|---|---|---|
| Apuntar | Drag en cualquier zona de la mesa | **Relativo, no absoluto**: el dedo nunca tapa lo que apuntás. Rota la dirección alrededor de la blanca. Sensibilidad proporcional a la velocidad del gesto (lento = fino ~0.1°/px, rápido = grueso). |
| Ajuste fino | Botones `‹ ›` | Tap = 0.25°; mantener = repetición. Más descubrible que gestos secretos. |
| Fuerza | Slider vertical derecho (zona pulgar) | Arrastrás hacia abajo (el taco retrocede en la mesa, anticipación visual), **soltás = tiro**. Cancelación: volver arriba del 8% o botón ✕. Nunca debe salir un tiro accidental. |
| Spin | Botón bola blanca (abajo izq.) | Abre modal con bola grande; arrastrás el punto de contacto (radio limitado al 70% — sin miscue en v1). Persiste el tiro, se resetea a centro después. El botón siempre muestra el punto elegido. |
| Bola en mano | Drag de la blanca | La bola flota con glow y se dibuja **40-60 px por encima del dedo** + lupa. Zonas inválidas en rojo (tras el break: solo cabecera). |
| Zurdo | Ajuste en `⋮` | Slider de fuerza a la izquierda. |

**Guía de tiro** (el corazón de la usabilidad): línea desde la blanca → **ghost ball**
punteada en el punto de impacto → flecha corta con la dirección que tomará la bola objetivo
→ línea corta de la tangente de la blanca. La *longitud* de la guía es configurable por
partida (ver hándicap, §16) — en tutorial es completa con rebotes.

## 5. Experiencia de usuario

- **Estado siempre legible**: de quién es el turno, qué grupo tenés, qué acaba de pasar.
  Regla: cualquier consecuencia de regla se comunica con banner + ícono + háptico, nunca
  silenciosamente.
- **Anti-frustración calibrada**: troneras 10-15% más generosas que la medida real (radio
  efectivo ~2.0-2.2× radio de bola), timer configurable (§7) y guías claras. El objetivo es
  que fallar se sienta *culpa propia entendible*, no injusticia.
- **Primera vez que ocurre algo** (primera falta, primera mesa abierta): banner extendido
  con explicación de una línea. Se marca como visto (AsyncStorage) y no se repite.
- **Onboarding suave**: tutorial sugerido, no obligatorio; práctica libre para experimentar
  sin presión.
- Sesiones cortas: una partida dura 5-10 min; una serie de 3, ~20 min. El timer de turno
  mantiene el ritmo en PvP.

## 6. Sistema de invitaciones

Reutiliza la infraestructura del chat + mejoras de robustez:

1. Host configura la partida → se crea la sala → se inserta mensaje
   `tipo: 'invitacion_pool'` con JSON `{hostId, hostNombre, serie, timer, guias, timbaId?}`
   (ampliar el CHECK de `mensajes.tipo`, patrón migración 008) → **push notification**
   (infra `push_tokens` de la 007).
2. El invitado la ve como card en el chat (Aceptar / Rechazar inline) **y** en el menú del
   Pool (lista de pendientes con badge).
3. **Estados**: `pendiente → aceptada | rechazada | expirada (TTL 30 min) | cancelada`.
   La card del chat refleja el estado (evita el bug clásico de aceptar invitaciones muertas).
   El host puede cancelar desde la sala; cancelar mata la card y la entrada del menú.
4. Aceptar → sala de espera → presencia → el host inicia → INSERT → ambos navegan.

**Mejora clave sobre el flujo propuesto — desconexión ≠ abandono:**

- *Desconexión* (app en background, red caída — pasa todo el tiempo en mobile): banner
  "Juan se desconectó — esperando 60 s…" con countdown. Si vuelve (presencia re-aparece),
  la partida sigue: el estado completo vive en la fila, se re-lee y listo.
- *Abandono* (botón "Abandonar" con confirmación, o venció la gracia): victoria del que
  queda + notificación + `fase='abandonada'` + la sala/invitación desaparecen.
- **Revancha**: al terminar, botón visible para ambos; cuando los dos lo tocan se crea la
  partida siguiente sin re-invitar (se alterna quién rompe).

## 7. Sistema de partidas (datos + sincronización)

### Tabla `partidas_pool` (migración 019, patrón 018)

```sql
CREATE TABLE IF NOT EXISTS partidas_pool (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id            UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  invitado_id        UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  fase               TEXT NOT NULL DEFAULT 'en_juego'
                     CHECK (fase IN ('en_juego','terminada','abandonada')),
  turno              TEXT NOT NULL DEFAULT 'host' CHECK (turno IN ('host','invitado')),

  -- estado de la mesa tras el último tiro (verdad persistente)
  estado_bolas       JSONB NOT NULL,   -- [{n:0..15, x, y, viva}]
  grupo_host         TEXT CHECK (grupo_host IN ('lisas','rayadas')),  -- null = mesa abierta
  bola_en_mano       BOOLEAN NOT NULL DEFAULT false,
  tras_break         BOOLEAN NOT NULL DEFAULT true,

  -- último tiro (para replay del rival y reconexión)
  ultimo_tiro        JSONB,            -- {input:{ang,fuerza,spin,posBlanca?}, eventos[], snapshot[]}
  num_tiro           INTEGER NOT NULL DEFAULT 0,

  -- serie: 1 = partida suelta, 3 = mejor de 3 (elegible al crear)
  serie_max          INTEGER NOT NULL DEFAULT 1 CHECK (serie_max IN (1,3)),
  victorias_host     INTEGER NOT NULL DEFAULT 0,
  victorias_invitado INTEGER NOT NULL DEFAULT 0,

  ganador            TEXT CHECK (ganador IN ('host','invitado')),
  motivo_fin         TEXT CHECK (motivo_fin IN ('ocho_embocada','ocho_con_falta','abandono','timeout')),

  timer_seg          INTEGER NOT NULL DEFAULT 45 CHECK (timer_seg IN (0,30,45,60)),  -- 0 = sin límite
  guias              TEXT NOT NULL DEFAULT 'normal' CHECK (guias IN ('completa','normal','corta')),
  timba_id           UUID REFERENCES timbas(id) ON DELETE SET NULL,

  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE partidas_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pool_participantes" ON partidas_pool FOR ALL
  USING (host_id = auth.uid() OR invitado_id = auth.uid());
ALTER PUBLICATION supabase_realtime ADD TABLE partidas_pool;
```

### Ciclo de un tiro online

```
Tirador                                     Rival
───────                                     ─────
apunta / fuerza / suelta
simula tiro completo (~5ms)
  → trayectorias + eventos + snapshot
broadcast 'tiro' (canal)      ──────────►   recibe input+snapshot
anima localmente 60fps                      anima con SU motor (mismo input)
al terminar: UPDATE fila                    al terminar: aplica snapshot
  {ultimo_tiro, estado_bolas,               (corrección subpíxel si divergió)
   turno, grupo, faltas, …}   ──────────►   UPDATE de respaldo (reconexión)
```

- **Timer**: corre en el cliente del que tira; si expira, su propio cliente pasa el turno
  (falta menor: bola en mano para el rival — regla estándar de apps). Si el tirador está
  desconectado, el rival puede reclamar tras la gracia vía RPC `reclamar_turno_pool(partida_id)`
  que valida server-side que `updated_at` sea viejo (evita carreras; patrón de guardas de la
  migración 010).
- El bot y la práctica corren 100% locales, sin fila en la base (como `practica-blackjack`).

## 8. Reglas 8-ball (máquina de estados)

Función pura `resolverTiro(estadoJuego, eventosFisica) → {nuevoEstado, resultado}` en
`src/lib/pool/reglas.ts` — misma filosofía testeable que `truco.ts` / `blackjack.ts`.
Separar reglas del motor físico habilita 9-ball futuro sin tocar la física.

Estados: `break → mesa_abierta → asignados → bola8 → fin`.

Reglas v1 (perfil "amistoso", basado en WPA simplificado):

- **Break**: blanca detrás de la línea de cabecera. Legal = embocar algo o ≥4 bolas a banda.
  Ilegal → el rival elige: re-break o jugar como quedó. **8 en el break = re-rack**
  (ni victoria ni derrota instantánea: anticlimático y azaroso).
- **Mesa abierta** tras el break (aunque se emboque): el grupo se asigna con el primer
  emboque legal posterior.
- **El turno continúa** si embocaste bola de tu grupo sin falta.
- **Faltas** (→ bola en mano para el rival):
  - blanca embocada,
  - primer contacto con bola ajena o con la 8 antes de tiempo,
  - después del contacto, ninguna bola tocó banda ni se embocó nada,
  - no tocar ninguna bola,
  - timeout de turno.
- **La 8**: embocarla limpiamente con tu grupo completo = victoria. Embocarla antes de
  tiempo, o con falta en el mismo tiro = **derrota**.
- **Sin call pocket en v1** (anunciar tronera): fricción alta para casual. Queda como
  opción "modo estricto" en la config (§18).
- Las bolas no pueden salir de la mesa en la simulación (bandas contienen siempre) —
  elimina toda la casuística de "bola fuera".

## 9. Tutorial (interactivo, 6 lecciones de ~30 s)

Corre sobre `partida-pool` con `modo=tutorial`: un guion coloca bolas, restringe controles
y valida objetivos. Cada lección con ✓ persistido, rejugable, y botón "Saltar" siempre visible.

1. **Tu primer tiro** — solo blanca + una bola frente a la tronera. Mano fantasma animada
   enseña el drag de apuntado; después se ilumina el slider de fuerza. Objetivo: embocarla.
2. **El ángulo** — se muestra la *ghost ball* con copy "pegale ACÁ para que vaya ALLÁ".
   Tres tiros con ángulo creciente.
3. **La fuerza justa** — escenario donde pegarle fuerte emboca la blanca también.
   Enseña dosificar (y qué es una falta de blanca embocada).
4. **Efectos** — tres mini-retos con el modal de spin: *follow* (la blanca sigue),
   *draw* (retrocede), *english* (cambia el rebote en banda).
5. **Las reglas** — mini-partida guiada contra un bot pasivo: break real, asignación de
   grupos, cada evento explicado con banner la primera vez.
6. **Faltas y la 8** — quiz interactivo de 4 situaciones ("¿esto es falta?") + ganar
   embocando la 8 (y ver qué pasa si la metés antes de tiempo).

Los tips contextuales reaparecen en partidas reales la primera vez que ocurre cada evento.

## 10. IA del bot — comportamiento, no porcentaje

### Arquitectura (un solo cerebro, tres personalidades)

```
1. GENERADOR   por cada bola propia × cada tronera: ghost ball, ¿línea libre?,
               ángulo de corte, distancias  →  tiros candidatos
2. EVALUADOR   probabilidad estimada de emboque = f(ángulo de corte, distancias,
               obstáculos)  +  valor posicional (¿dónde queda la blanca?)
3. PLANIFICADOR según dificultad: 0 / 1 / 2-3 tiros de anticipación
               (simulaciones forward reales con el motor de física)
4. EJECUTOR    aplica RUIDO HUMANO al input: error gaussiano en ángulo (σ) y
               fuerza, sesgos por perfil  →  la física hace el resto
```

La clave de que los errores se sientan humanos: **el ruido se aplica al input, nunca al
resultado**. El bot falla como falla una persona: la bola pega en la ceja de la tronera,
queda corta, la blanca se va larga. Nunca hay dados visibles ni teletransportes. Y el bot
usa exactamente el mismo motor y las mismas reglas que el jugador — cero información
privilegiada.

### Perfiles

| | 😅 Fácil | 🎯 Normal | 🦈 Difícil |
|---|---|---|---|
| Visión de tiros | Solo directos, de su grupo | Directos + banda simple | Directos, bandas, combinaciones simples |
| Elección | La bola "más cerca de una tronera" (no la más probable) | La de mejor probabilidad | Mejor probabilidad **× valor posicional** |
| Planificación | Ninguna: cada tiro es una isla | 1 tiro adelante (posición de la blanca) | 2-3 adelante: elige el *orden* de limpieza |
| Spin | Nunca | Follow/draw básicos | Completo, incluye english para salidas de banda |
| σ ángulo | ±3.5° | ±1.2° (escala con dificultad del tiro) | ±0.45° |
| Fuerza | Aleatoria con **sesgo a pegarle de más** (típico principiante) | Correcta; a veces corto en tiros largos | Dosificada al plan |
| Seguridad | No existe el concepto | Si mejor prob < 35%: tiro suave defensivo | Si mejor prob < 45%: **snooker deliberado** (esconde la blanca) |
| Errores de lectura | 10% le pega a bola equivocada → faltas reales; puede elegir mal el grupo en mesa abierta | Tras 2+ emboques seguidos, exceso de confianza (σ +20%) | En la bola 8 o tiro de partido, **presión**: σ +30% |
| Tiempo de "pensar" | 1-2 s, tira rápido | 2-4 s, se ve la guía moviéndose entre opciones | 3-6 s, "camina la mesa" |
| Objetivo de diseño | Un novato recién tutorializado le gana ~65% | Pareja para un jugador casual | Ganable, y ganarle se siente épico |

*Legibilidad*: mientras el bot piensa, su línea de apuntado se ve moverse entre candidatos
(versión corta de la guía). El jugador entiende qué está considerando — el bot se siente
*presente*, no una pausa con spinner.

## 11. Animaciones

- **Simular primero, animar después** (D3): el render interpola una trayectoria ya
  calculada → 60 fps clavados, cero stutter por GC.
- Bolas: rotación del patrón proporcional a la velocidad (rodadura); el **brillo especular
  queda fijo** (la luz no gira con la bola) — este contraste es lo que vende el 3D en 2D.
- Taco: retrocede con el slider (anticipación), dispara con easing rápido, se desvanece
  durante el movimiento y reaparece armado para el siguiente turno.
- Tronera: la bola escala a ~0.85, curva hacia el centro de la boca, cae con fade; su
  mini-bola "viaja" al riel del HUD (micro-recompensa).
- Victoria: la 8 cae → **slow-motion 0.5× del último medio segundo** (gratis: re-animar
  la cola de la trayectoria) → confetti dorado. Derrota: sobria, sin burla.
- Guía con dash animado sutil; banners con spring de Reanimated; física dormida = cero
  trabajo por frame (batería).

## 12. Física (spec del motor — `src/lib/pool/fisica.ts`)

- Espacio: mesa 9 ft normalizada (2.24 × 1.12), radio de bola 0.0286. Coordenadas de mesa,
  no de píxeles.
- Integración: **semi-implícito Euler a dt fijo 1/120 s** (determinismo + estabilidad),
  render a 60 fps interpolado. Barrido continuo (CCD) bola-bola para tiros rápidos
  (sin túneles en el break).
- Estados por bola: `sliding` (fricción cinética μ≈0.2; la velocidad de giro y la lineal
  convergen) → `rolling` (fricción de rodadura μ≈0.01) → `stopped` (umbral de sleep).
  Esta transición en dos fases es lo que hace que el draw/follow se comporte de verdad.
- Colisión bola-bola: impulso sobre la normal, restitución 0.94; *throw* por spin
  (simplificable en v1).
- Bandas: restitución 0.75; el english modifica el ángulo de salida.
- Spin de la blanca: top/back spin actúa **después** del contacto (follow: la blanca
  sigue; draw: retrocede); english afecta bandas y throw.
- Troneras: 6 sensores circulares (radio efectivo 2.0-2.2× bola, generoso) + **cejas**
  ("jaws") como segmentos de banda: una bola puede escupirse de la tronera — realismo
  que se nota.
- Sin `Math.random` dentro del motor (el break del bot usa seed) — reproducibilidad total.
- Unit tests de escenarios: tiro recto, corte a 30°, draw, banco a una banda, break
  (conteo de bolas a banda), con snapshots de posiciones finales.

## 13. Efectos visuales / dirección de arte de las bolas

**Bolas procedurales en Skia** (no sprites): círculo de color pleno → franja blanca
horizontal (rayadas) → circulito blanco con número → gradiente radial de sombreado
(oscurece bordes) → **highlight especular** arriba-izquierda, fijo. La rotación del patrón
por debajo del highlight fijo produce la ilusión de esfera rodando. Beneficios: rotan de
verdad, resolución perfecta en cualquier pantalla, tinte dinámico posible, cero peso de assets.

- Sombra: elipse suave desplazada (luz cenital apenas frontal), opacidad ~35%, constante.
- Iluminación de mesa: viñeta radial (centro más claro) simulando la lámpara colgante.
- Partículas discretas: impacto fuerte (3-5 chispas blancas), tronera (puff + destello
  dorado `c.primario`), break (onda expansiva sutil).
- Trail de la blanca en tiros fuertes (streak con fade) — vende velocidad y peso.
- Falta: flash rojo suave del borde de mesa + ícono; nunca modal.

## 14. Sonido y háptica

| Evento | Sonido | Háptico (expo-haptics, solo nativo) |
|---|---|---|
| Golpe de taco | "tock" escalado por fuerza | light |
| Bola-bola | "clack" — 3 samples por intensidad rotados al azar | light si energía alta |
| Banda | "thud" sordo | — |
| Tronera | knock + rodadura interna corta | medium |
| Rodadura | loop sutil, volumen por velocidad | — |
| Victoria / falta | festejo discreto / "dun" apagado | success / error |

- Pitch y volumen escalados por energía del impacto; **máximo 4-6 voces simultáneas** con
  prioridad por energía (el break dispara ~20 colisiones en un segundo).
- Librería: `expo-audio` (SDK 56 — `expo-av` está deprecado; confirmar API en docs v56
  antes de codear, según AGENTS.md).
- Web: inicializar audio tras el primer gesto (autoplay policy).
- Fuentes CC0: kenney.nl / freesound.org, o grabar bolas reales.
- Toggle de sonido/háptica en `⋮`, persistido.

## 15. Integración con Timbas

1. **Al crear la partida** (patrón Truco): toggle "¿Con timba?" en la config → navega a
   `/timba/nueva` con opciones precargadas **"Gana {host}" / "Gana {invitado}"** y vincula
   `timba_id` a la partida. La invitación del chat muestra "🎱 + timba" como contexto.
2. **Al terminar**: si hay Timba vinculada, la pantalla de resultado ofrece **"Cargar
   resultado en la Timba"** → deep-link con el ganador sugerido.
   **Decisión deliberada: sugerir, no auto-resolver.** Cerrar una timba es un acto social
   del creador (modelo de confianza de toda la app); auto-resolver rompería ese contrato y
   generaría disputas (¿y si acordaron anular por lag?). Trade-off aceptado: un tap más.
3. **Después de jugar sin timba**: en el resultado, CTA suave "¿La revancha con timba?" —
   una sola vez, nunca push, nunca insistente (anti-ludopatía).
4. Serie al mejor de 3/5 = la timba refiere a la serie, no a cada juego.

## 16. Mejoras no pedidas (propuestas del equipo)

- **Hándicap de guías** ⭐: en la config, el host puede setear guías distintas por jugador
  (completa / normal / corta). Es LA feature-espíritu-Timba: empareja a dos amigos de nivel
  dispar y hace la apuesta justa (el bueno juega sin guía, el novato con guía completa).
- **Práctica libre**: mesa sola sin reglas. Costo ~0 (motor sin máquina de reglas).
- **Replay del último tiro** (botón 🔁): re-animar el input guardado. Costo mínimo, mucho valor.
- **Emotes rápidos** en partida (👏 😅 🎱 🍀, predefinidos): lo social sin teclado ni toxicidad;
  viajan por el broadcast del canal.
- **Stats en perfil**: partidas, % victoria, racha, "limpiezas" (ganar sin que el rival emboque).
- Modo zurdo, toggles de sonido/háptica (§14).

## 17. Problemas potenciales y mitigación

| Riesgo | Mitigación |
|---|---|
| Divergencia de punto flotante entre plataformas (Hermes vs web) | Snapshot final autoritativo del tirador; corrección subpíxel invisible (D4) |
| Desconexiones a mitad de partida | Gracia de 60 s con presencia + estado completo en la fila (reanudable); abandono explícito separado (§6) |
| Carreras en timeout de turno | RPC `reclamar_turno_pool` con validación temporal server-side (patrón guardas 010) |
| CanvasKit pesa ~2 MB en web | Import lazy de la ruta del Pool + pantalla de carga con tips |
| Batería / calentamiento | Física por evento (no loop continuo); canvas idle sin redibujar |
| El dedo tapa la acción | Apuntado relativo + bola en mano con offset y lupa (§4) |
| El asset de mesa se está haciendo horizontal | ⚠️ Avisar ya: diseñarlo vertical (D1) |
| Troneras frustrantes | Radio generoso 2.0-2.2×; medir tasa de emboque por dificultad y tunear |
| Invitaciones zombis | Estados con TTL + card de chat que se actualiza (§6) |
| Audio en web no suena | Inicializar tras primer gesto del usuario |

## 18. Roadmap

**v1 (MVP jugable)**
1. Motor de física + reglas + tests (sin UI) — la base de TODO
2. Mesa Skia + controles + práctica libre
3. Bot (3 perfiles) + selector
4. Tutorial (guion sobre partida)
5. Online (migración 019 + sala + invitaciones + broadcast)
6. Integración Timba + revancha + pulido (sonido, partículas, banners)

**v1.5**: hándicap de guías, replay, stats, emotes, modo zurdo.

**v2**: call pocket ("modo estricto"), **9-ball** (mismo motor, reglas nuevas — por eso
están separadas), torneos del grupo de amigos (bracket + timba por ronda), espectadores
que timbean sobre partidas ajenas.

**v3**: massé/salto (física de curva), personalización cosmética de paño/taco (sin
lootboxes ni monedas — anti-ludopatía), ¿carambola/3 bandas para el público local?

---

## Apéndice A — Estructura de código propuesta

```
src/lib/pool/
  tipos.ts       — Bola, EstadoMesa, Tiro, EventoFisica, EstadoJuego
  fisica.ts      — motor determinista puro (sin imports de UI)
  reglas.ts      — máquina de estados 8-ball pura
  bot.ts         — generador/evaluador/planificador/ejecutor + perfiles
  online.ts      — sync realtime (patrón blackjackClasicoOnline.ts)
src/components/pool/
  MesaPool.tsx       — canvas Skia: mesa, bolas, guía, taco, partículas
  ControlFuerza.tsx  — slider de potencia
  SelectorSpin.tsx   — modal de efecto
  HudPool.tsx        — jugadores, grupos, riel, timer, banners
app/juegos/pool.tsx · sala-pool.tsx · partida-pool.tsx
supabase/migrations/019_pool.sql
```

Dependencia nueva: `@shopify/react-native-skia` (Expo SDK 56 la soporta oficialmente;
en web requiere setup CanvasKit — leer docs v56 antes de instalar, per AGENTS.md).
Sonido: `expo-audio`. Todo lo demás ya está en el proyecto.

## Apéndice B — Decisiones tomadas (14 jul 2026)

1. Paño **verde clásico** (bosque profundo), textura sutil y pareja.
2. Timer de turno **configurable al crear la partida: 30 / 45 / 60 s / sin límite**
   (default 45; `timer_seg = 0` representa sin límite).
3. Perfiles del bot con nombres **genéricos**: Fácil / Normal / Difícil.
4. Serie **elegible al crear la partida: partida suelta o mejor de 3** (default: suelta).
