# Pool 8-Ball — Revisión técnica integral y roadmap de desarrollo

Auditoría solicitada tras varias sesiones de juego real, con el objetivo de dejar una base
sólida antes de seguir sumando funciones. Complementa `docs/POOL_8BALL_SPEC.md` (spec
original, v1 completa según `[[project-pool-juego]]`) — no lo reemplaza: donde algo ya estaba
decidido ahí y sigue vigente, se cita en vez de repetirse.

**Cómo se hizo esta revisión**: lectura directa de todo `src/lib/pool/*.ts` (motor, guía,
reglas, bot, online, sonido, transform), todas las pantallas en `app/juegos/*pool*.tsx`, la
spec original completa y la migración `019_pool.sql`; más un relevamiento del resto de la app
(sistema de invitaciones, patrón de desconexión de Blackjack, configuración global, pantallas
de ayuda de otros juegos, componentes de chat reutilizables) para saber qué es un problema
propio de Pool y qué es un problema estructural de toda la app que Pool simplemente heredó o
expuso primero. Cada hallazgo cita archivo y línea sobre el código real, no sobre la spec.

---

## Resumen ejecutivo

Pool es, hoy, el sistema más maduro de la app en varios sentidos: es el único juego con
tutorial interactivo, el único con manejo de desconexión (presencia + gracia + reclamo), y el
motor de física es genuinamente sofisticado (spin, fricción de dos fases, colisiones con
restitución, IA de bot en cuatro etapas). Pero justamente por ir más rápido que el resto de la
app, expone tres tipos de deuda:

1. **Un bug de precisión real y acotado** en la guía de tiro post-rebote (§1) — tiene causa
   raíz identificable y una corrección de bajo riesgo.
2. **Features pedidas que hoy son solo un valor hardcodeado**, no un sistema (asistencia de
   apuntado, sugerencias del bot, centro de invitaciones) — buena noticia: el motor y el bot
   YA tienen el 80% de la lógica necesaria, falta la capa de UI/configuración.
3. **Deuda estructural de toda la app que Pool no causó pero sí necesita** para cumplir lo
   pedido (no existe pantalla de Configuración, no existe modelo genérico de invitaciones, no
   existe vínculo entre una partida y una Timba). Estos tres puntos aparecen una y otra vez en
   los puntos 4, 5, 7, 8 y 9 del pedido — se tratan una sola vez en profundidad (§8.4) y se
   referencian desde ahí para no repetir el análisis.

El roadmap (§13) prioriza en ese orden: primero lo que es un bug real, después lo que ya tiene
el 80% del trabajo hecho, por último lo que requiere tocar infraestructura compartida con otros
juegos (ahí se marcan explícitamente las decisiones que no son solo técnicas).

---

## 1. Sistema de apuntado — el bug del rebote post-banda

### 1.1 Estado actual

La guía de tiro vive en `src/lib/pool/guia.ts`. `calcularTrayectoriaGuia()` hace un raycast
puro: desde la blanca, en la dirección `angulo`, busca el primer impacto (bola o banda) con
`primerImpacto()`. Si el primer impacto es una banda y quedan rebotes permitidos
(`maxRebotes: 1` en `MesaPool.tsx:213`), refleja el vector dirección **geométricamente** contra
la normal de esa banda (`guia.ts:151-153`):

```ts
const dot = d.x * imp.normal.x + d.y * imp.normal.y
d = { x: d.x - 2 * dot * imp.normal.x, y: d.y - 2 * dot * imp.normal.y }
```

Eso es una **reflexión especular perfecta** (como un espejo): el ángulo de salida respecto a la
normal es exactamente igual al de entrada. Los tests en `guia.test.ts:44-56` confirman que la
guía hace *eso* correctamente — pero *eso* no es lo que hace la física real.

### 1.2 Causa raíz (confirmada contra el motor real)

El rebote de verdad vive en `rebotarPared()` (`fisica.ts:431-446`). Ahí la componente normal y
la tangencial de la velocidad se escalan por **factores distintos**:

```ts
const vnNuevo = -PARAMETROS.restBanda * vn        // normal: ×0.75 (restBanda)
vt -= PARAMETROS.fricBanda * vpt * PARAMETROS.englishBanda        // tangencial:
vt -= PARAMETROS.fricBanda * vt * (1 - PARAMETROS.englishBanda)   //   fricción ×0.2 total
```

Con spin cero (`wz=0`, caso más simple), la tangencial queda multiplicada por `(1 - fricBanda)
= 0.8` mientras la normal queda multiplicada por `restBanda = 0.75`. Son factores **distintos**
→ el ángulo de salida respecto a la normal **no** es igual al de entrada. Haciendo el álgebra:
`tan(ángulo_salida) ≈ 1.067 × tan(ángulo_entrada)` — la bola sale más "abierta" (más paralela a
la banda) que lo que predice un espejo, incluso sin efecto. Es un error **sistemático**: pasa en
el 100% de los rebotes con `spin.a = 0`, no es un caso raro.

Y hay una segunda fuente de error, más grande: el `wz` (efecto lateral / english) del tiro entra
directo en la fricción tangencial vía `vpt = vt - b.wz * R` (`fisica.ts:438`). Es literalmente el
mecanismo por el cual, en pool real, pegarle con efecto cambia el ángulo de salida de la banda —
la razón de ser del "efecto en banda". La guía **no recibe el spin como parámetro en ningún
lado** (`calcularTrayectoriaGuia(bolas, angulo, opts)` — sin `efectoLateral` ni `efectoVertical`
en la firma). Cuando el jugador pone efecto lateral con `SelectorSpin` y apunta a una banda, la
guía dibuja una reflexión que ignora por completo la variable que el jugador está usando
activamente para curvar el tiro. Esto probablemente es la fuente más visible del "a veces no da"
que reportaste: es más notorio cuanto más efecto lateral se usa, exactamente el escenario donde
un jugador que ya sabe apuntar banda simple empieza a experimentar con efecto y la guía deja de
ser confiable justo ahí.

Una tercera causa, más chica pero real: la guía trata **cualquier punto** de `x=±LX`/`y=±LY`
como banda reflectante. La física real no: `if (!enBoca(b)) { chocarBandas(b) }`
(`fisica.ts:567-568`) — dentro de la boca de una tronera **no hay pared**. Si la trayectoria
post-primer-tramo cae cerca de una esquina, la guía puede dibujar un rebote donde la bola real
caería en la tronera o pegaría contra un poste de ceja (`chocarPostes`, tampoco modelado en la
guía). Es un caso de borde comparado con el anterior, pero completa el cuadro: la guía no sabe
nada de troneras ni de postes, solo de las 4 bandas rectas.

### 1.3 Propuesta de solución

**Fase A — corregir el rebote sin spin (bajo riesgo, resuelve el error sistemático):**
en `guia.ts`, reemplazar la reflexión especular por la misma descomposición normal/tangencial
que usa `rebotarPared()`, aplicando los mismos factores (`restBanda` sobre la normal,
`fricBanda` sobre la tangencial) pero trabajando sobre el vector unitario `d` en vez de sobre una
velocidad real. Es determinista y no depende de la fuerza del tiro — arregla el 100% de los
casos sin efecto, que hoy es la mayoría de los tiros de un jugador que no usa `SelectorSpin`.

**Fase B — incorporar el spin conocido en el momento de apuntar:** el estado `spin` (`{a, b}`)
ya existe en `partida-pool.tsx:119` **antes** de tirar (se elige con el modal de `SelectorSpin`
previo al drag de apuntado). Pasarlo como parámetro opcional a `calcularTrayectoriaGuia()` y
aproximar el `wz` que tendría la blanca al llegar a la banda (decae con `decaimientoWz` en el
trayecto — se puede estimar con la distancia recorrida entre el origen y el punto de impacto,
sin necesidad de simular tiro por tiro). No va a ser bit-a-bit idéntico a `simularTiro()` — nadie
espera eso de una guía — pero sí va a estar del lado correcto (curva hacia donde curva de
verdad), que es lo que hoy falla.

**Fase C (opcional, mayor precisión) — dejar de dibujar el tramo post-rebote cuando cae dentro
de la boca de una tronera:** un chequeo barato (`enBoca()` ya existe, es reutilizable tal cual)
antes de reflejar. Si el punto de impacto cae en zona de boca, cortar la guía ahí en vez de
reflejar — más honesto que dibujar un rebote que no va a pasar.

### 1.4 Verificación de que no rompe nada

- `guia.test.ts` tiene 6 tests que fijan el comportamiento actual como contrato. Los tests de
  reflexión "pura" (`:44-56`) hay que **reescribirlos** para el nuevo comportamiento (van a dejar
  de valer con el fix — es esperado, documentar por qué cambian).
- Agregar un test nuevo, el que realmente falta hoy: correr `simularTiro()` con un tiro sin
  obstáculos que pegue en banda y comparar la dirección de salida real (del snapshot/eventos)
  contra la que devuelve la guía corregida, con una tolerancia angular. Esto es lo que
  demuestra que el fix cierra la brecha, no solo que "cambió el número".
- El bot (`bot.ts`) usa `calcularGuia()` (no `calcularTrayectoriaGuia()`, y siempre con
  `maxRebotes: 0` — `guia.ts:163`) para validar que el camino directo blanca→objetivo no está
  obstruido. **No usa el tramo post-rebote para nada** → el fix de Fase A/B no toca ninguna
  decisión del bot, solo el dibujo en pantalla. Cero riesgo de regresión en la IA.
- El único otro consumidor de `calcularTrayectoriaGuia` es `MesaPool.tsx:213` — un solo call
  site, fácil de auditar visualmente después del cambio.

### 1.5 Mejoras de precisión adicionales (si se quiere ir más allá)

- Mostrar la guía post-rebote más tenue/punteada de forma proporcional a cuánta incertidumbre
  tiene (hoy ya es más tenue que el primer tramo, `MesaPool.tsx:311` — se puede graduar más si
  hay spin fuerte, en vez de binario).
- El nivel "Máxima" del sistema de asistencia (§2) es el lugar natural para exponer el segundo
  rebote (`maxRebotes: 2`) una vez que el primero sea confiable — hoy no tendría sentido, un
  segundo rebote construido sobre un primer rebote ya impreciso solo compondría el error.

---

## 2. Asistencia al apuntado — niveles con diferencias reales

### 2.1 Estado actual

No existe ningún selector de asistencia. La guía siempre se dibuja igual
(`mostrarGuia={!animando && turnoMio}`, `partida-pool.tsx:850`): un tramo + rebote + ghost ball +
línea de objetivo + tangente de la blanca. La única variación que existe hoy es
`longitudGuiaObjetivo`, y es exclusiva del bot en dificultad Fácil (`partida-pool.tsx:852`), no
algo que un jugador humano pueda elegir. La spec original (`docs/POOL_8BALL_SPEC.md:207,260`)
ya había anticipado un campo `guias: 'completa'|'normal'|'corta'` en el borrador de la tabla —
**nunca llegó a la migración real** (`019_pool.sql` no lo tiene) ni a la UI. Es la pieza que
falta, no algo que haya que inventar de cero conceptualmente.

### 2.2 Evaluación de los 4 niveles que planteás

*(Corrección: el prompt original que analicé no traía la definición completa de este punto —
esta sección reemplaza mi primera pasada, que proponía combinar piezas heterogéneas de la guía.
Tu definición real es más simple y, evaluándola, mejor.)*

Tu diseño tiene un solo eje claro: **cuánta trayectoria de la bocha blanca se revela, y hasta
qué evento** — sin asistencia (nada), baja (un adelanto corto), normal (el camino completo hasta
el primer evento, ni un poco más), máxima (+ el punto de impacto y, si es banda, el tramo
posterior al rebote). Es intuitivo de explicar ("cuanta más ayuda, más lejos ves tu propio
camino") y evaluándolo contra el código, lo valido con una precisión y una ambigüedad a resolver:

**Encaja casi 1 a 1 con los parámetros que el motor ya tiene.**
`calcularTrayectoriaGuia(bolas, angulo, {maxRebotes, alcanceTotal})` (`guia.ts:105`) ya expone
exactamente lo que necesitás — no hay que calcular nada nuevo, solo dejar de hardcodear estos
valores y convertirlos en la elección del jugador:

| Nivel | Cómo se logra con el motor actual |
|---|---|
| Sin asistencia | No llamar a `calcularTrayectoriaGuia` / no renderizar nada |
| Baja | `alcanceTotal` chico y fijo (ej. 0.15–0.25 unidades de mesa) + `maxRebotes: 0` |
| Normal | `alcanceTotal` completo (el default, `ALCANCE_TOTAL_DEFAULT = 6`) + `maxRebotes: 0` — la línea llega exactamente hasta el primer evento (bola o banda) y ahí termina, tal cual lo definiste |
| Máxima | Igual que Normal pero `maxRebotes: 1` — agrega el tramo post-rebote solo si el primer evento fue una banda |

Es, literalmente, el mismo parámetro que ya usa el bot (`bot.ts` llama `calcularGuia`, que es
un caso particular con `maxRebotes: 0`) — la infraestructura ya está, falta exponerla como
configuración.

**Ambigüedad ya resuelta (confirmaste opción A)**: tu definición está acotada, explícitamente, a
"la trayectoria de la bocha blanca". Hoy, cuando la guía toca una bola, `MesaPool.tsx` dibuja
además dos cosas que técnicamente NO son "trayectoria de la blanca": el círculo de *ghost ball*
(dónde queda el centro de la blanca al contactar — esto sí es información de la blanca) y la
flecha dorada `dirObjetivo` (hacia dónde sale la bola *objetivo* — información de la OTRA bola,
no de la blanca). **Decidido**: Baja y Normal muestran *solo* el camino de la blanca, sin flecha
ni tangente. La flecha dorada `dirObjetivo` y la tangente `dirBlanca` quedan reservadas para
**Máxima únicamente** — ahí sí tiene sentido que "la ayuda más alta" incluya saber a dónde vas a
mandar la bola objetivo, no solo hasta dónde llega tu propia blanca. Esto además hace que el
salto Normal→Máxima sea más grande y se sienta más "real": no es solo "un evento más", es la
diferencia entre saber dónde vas a pegar y saber qué va a pasar después.

**¿Es clara para el jugador?** Sí, con un matiz de UX en el extremo "Sin asistencia": tal como
la definiste (cero línea, apuntar por intuición pura) no queda ningún indicador ni siquiera de
hacia dónde apunta el taco *ahora mismo*. En mobile, sin mouse ni la sensación física del taco en
la mano, eso puede leerse como "el juego no responde" en vez de "estoy apuntando a ciegas". No
cambia tu diseño — el taco ya se dibuja y rota con el ángulo (`MesaPool.tsx:397-405`) — solo
sugiero que siga visible en este nivel: es el feedback mínimo de "para dónde apunto ahora", no
una predicción de nada. Si preferís cero feedback literal, también es válido y más simple.

**Interacción con el bug de §1**: "Máxima" es el único nivel que expone el tramo post-rebote —
esto refuerza que §1 tiene que resolverse antes de publicar los 4 niveles. Lanzar "Máxima" con el
bug de reflexión especular activo sería peor que no tener el nivel: es justo al jugador que pide
explícitamente "la mayor ayuda posible" a quien más se le mostraría información incorrecta.

### 2.3 Configurabilidad adicional (si querés ir más allá)

- **Hándicap por jugador** (retomando la idea ⭐ del spec original, `docs/POOL_8BALL_SPEC.md:475-477`,
  nunca implementada): si el nivel se fija **por jugador** al crear una partida online, dos
  amigos de nivel distinto timbean parejo — el bueno en Sin asistencia, el novato en Máxima. Con
  este diseño de 4 niveles es incluso más simple de exponer en la UI que con mi propuesta
  original (una sola elección por jugador, no una combinación de casilleros).
- El largo exacto de "Baja" podría ser configurable con un slider en vez de un valor fijo —
  mejora de v1.5, no necesaria para la primera versión.

**Implementación**: cambio concentrado en `MesaPool.tsx` (qué parámetros pasa a
`calcularTrayectoriaGuia` y qué piezas del resultado renderiza) + selector de 4 opciones +
persistencia AsyncStorage, mismo patrón que `tacoSkin`/`sonido` (`@timba:pool_asistencia`). No
hace falta tocar `guia.ts` para esto (aparte del fix de §1) — los parámetros que hacen falta ya
existen.

### 2.4 Dónde vive esta configuración — engranaje en el menú de Pool

*(Idea que surgió en esta ronda, fuera del pedido original: un ícono de engranaje en el menú de
Pool, junto a los modos de juego, para configurar el nivel de asistencia, el taco por defecto, y
funciones futuras.)*

Me parece una buena idea, y no compite con la pantalla de Ajustes app-wide de §5.2 — son dos
cosas distintas con una separación simple: **Ajustes (app-wide) es para lo que tiene sentido en
cualquier juego** (sonido, música, háptica, notificaciones); **el engranaje de Pool es para lo
que solo tiene sentido DENTRO de Pool** (nivel de asistencia, taco por defecto, cualquier opción
futura exclusiva de este juego). Ningún jugador de Truco necesita elegir un taco — esa opción no
pertenece a un lugar genérico, y meterla ahí ensuciaría la pantalla de Ajustes para todos los
demás juegos a medida que cada uno sume sus propias opciones (el mismo problema de "todo
mezclado" que señalo en §8.4, pero en la dirección correcta esta vez: separar, no juntar).

Hay además una razón concreta, no solo de prolijidad: hoy la selección de taco
(`SelectorSkins.tsx`) solo es alcanzable **desde adentro de una partida en curso** (botón
"🎨 Taco" en la barra inferior, `partida-pool.tsx:908-915`) — no hay forma de elegir tu taco por
default antes de jugar, sin arrancar una partida primero solo para cambiarlo. Un engranaje en el
menú resuelve esa falta de descubribilidad de una función que ya existe y funciona.

**Propuesta concreta**:
- Ícono de engranaje en el header de `pool.tsx`, a la derecha (hoy ese header solo tiene
  "‹ Volver" a la izquierda — patrón común: atrás a la izquierda, ajustes a la derecha).
- Abre un sheet, mismo patrón que ya usa el selector de dificultad del bot en esa misma pantalla
  (`pool.tsx:110-135`), con: nivel de asistencia por defecto (§2, cuando esté implementado) y
  taco por defecto — este último **reutiliza `SelectorSkins.tsx` tal cual**, no hay que
  construirlo de nuevo, ya funciona y ya está probado. Lista abierta para lo que se sume después.
- **No duplicar el toggle de sonido acá** — ese vive en el Ajustes app-wide de §5.2 (con el
  atajo rápido dentro de la partida que ya existe hoy). El engranaje de Pool es exclusivamente
  para configuración que no tiene sentido fuera de este juego.
- Dato a favor de hacerlo como sheet/Modal sin apuro: como se acaba de confirmar en §10, un
  `Modal` con un gesto de arrastre adentro necesita su propio `GestureHandlerRootView` en
  Android. Tanto la selección de asistencia como la de taco son elección por tap (como
  `SelectorSkins.tsx` ya lo es hoy) — no debería hacer falta ese wrapper acá, pero vale
  recordarlo si en el futuro se agrega algo que sí necesite arrastre dentro de este sheet.

---

## 3. Sugerencias del bot en práctica libre

### 3.1 Lo que ya existe (y por qué el costo de esto es bajo)

`bot.ts` ya tiene, internamente, exactamente el cerebro que hace falta:
`generarCandidatos(bolas, objetivos)` (`bot.ts:102-156`) evalúa, para cada bola objetivo × cada
tronera, si hay ángulo de corte viable, si el camino está libre, y le asigna una probabilidad de
éxito (`prob`) — devuelve la lista ordenada de mejor a peor. Es exactamente "cuál es la mejor
jugada", ya calculado. El problema no es de algoritmo, es que **no está exportado**
(`bot.ts` solo exporta `decidirTiro`, `PERFILES`, `Dificultad`, `DecisionBot`, `crearRng`) y que
la práctica libre no tiene noción de "objetivos" porque no corre `reglas.ts` (mesa sin reglas,
`estado: EstadoJuego | null` es `null` fuera de modo bot/online — `partida-pool.tsx:113`).

### 3.2 Diseño propuesto

- **Exportar** `generarCandidatos` (o agregar un wrapper liviano `sugerirMejorTiro(bolas):
  Candidato | null` en `bot.ts` para no exponer el tipo interno tal cual).
- En práctica libre, "objetivos" = todas las bolas vivas salvo la blanca (mesa abierta, igual a
  como `bolasObjetivoDe()` ya resuelve el caso `grupo === null` en `reglas.ts:288`) — no hace
  falta ningún estado de reglas, solo la lista de bolas.
- **Cuándo mostrarla**: opt-in, no automática. Un botón (ícono de bombilla, consistente con el
  resto de los botones circulares de la barra inferior — mismo estilo que 🔊/Efecto/Taco en
  `partida-pool.tsx:888-916`) que, al tocarlo, calcula y dibuja la sugerencia una vez. No se
  recalcula en cada frame ni se queda pegada mientras el jugador mueve el dedo — eso sería
  invasivo y además confundiría con la guía propia del jugador.
- **Cómo representarla**: reusar el mismo renderer de segmentos de `MesaPool.tsx` pero con un
  color distinto (ej. celeste, para no confundirse con la guía dorada/blanca propia). **Decidido
  tras probarlo en dispositivo real** (feedback de juego, jul 2026): la sugerencia queda dibujada
  hasta que se tira o se pide otra — no se desvanece sola ni se limpia al primer drag. La primera
  versión hacía eso pensando que era "menos invasivo", pero el jugador la quiere de referencia
  fija mientras alinea su propio apuntado contra ella — borrarla justo al empezar a arrastrar
  arruinaba el caso de uso real.
- **Costo real**: `generarCandidatos` no simula nada pesado (solo raycasts vía `calcularGuia`);
  el ranking con `valorPosicional` si se quiere la versión "buena" (mirando qué queda después,
  no solo el tiro más fácil) corre `simularTiro(..., {sinMuestras:true})` para los 3-4 mejores
  candidatos — la propia spec ya midió esto en ~5ms por tiro completo (`docs/POOL_8BALL_SPEC.md:279`),
  así que evaluar 4 candidatos es ~20ms, imperceptible con un botón de tap.
- **Opcional, no obligatorio**: sí — está fuera de discusión, práctica libre es exactamente el
  modo donde tiene sentido apoyarse; en Bot/Online sería asistencia externa en una partida
  competitiva y no debería existir ahí bajo ningún nivel de asistencia de §2 (esos niveles
  ayudan a *ejecutar* el tiro que el jugador ya decidió, esto *decide por él* qué tiro hacer —
  son categorías distintas, no hay que mezclarlas en la misma UI).

---

## 4. Integración con Timbas

### 4.1 Estado actual (verificado contra el código, no solo la spec)

Hoy es una integración de un solo sentido, después del hecho: al terminar una partida online,
`crearTimbaResultado()` (`partida-pool.tsx:672-682`) navega a `/timba/nueva` con
`opcionesPreset` y `opcionesBloqueadas: 'true'` — arma el formulario, pero el usuario todavía
tiene que confirmar/crear la Timba manualmente, y la Timba resultante **no queda vinculada** a
la partida: `partidas_pool` no tiene columna `timba_id` (`019_pool.sql:10-38`, confirmado
completo). El patrón es el mismo que ya usa Truco (`app/juegos/truco.tsx:350-355`,
`abrirTimba()`) — Pool no inventó nada nuevo acá, pero tampoco corrigió la limitación que
arrastra ese patrón. Blackjack ni siquiera tiene el botón.

La resolución de una Timba (quién cobra, quién debe) es 100% manual y de confianza — función SQL
`verificar_y_cerrar_timba` (`004_cerrar_timba_atomico.sql`) — y así debe seguir: es una decisión
de diseño explícita del proyecto, no un límite técnico (`[[feedback-anti-ludopatia]]`: nunca
auto-resolver un ganador con implicancia de apuesta).

### 4.2 Problema concreto que esto genera

El punto 8 de tu pedido dice literalmente *"si era una Timba: la Timba se cancela, ninguno
gana"* para el caso de desconexión. Hoy eso es **imposible de implementar** tal cual está el
esquema: no hay forma de saber, desde `partidas_pool`, si esa partida tiene una Timba asociada
— la Timba se crea (si se crea) recién *después* de que la partida ya terminó. No hay nada que
cancelar automáticamente porque en el momento de la desconexión la Timba todavía no existe.

### 4.3 Propuesta

**Flujo de creación — dos caminos, cubrir ambos:**

1. **Orgánico (el que existe hoy)**: la Timba se crea después, desde el resultado. Cambio
   mínimo: agregar `timba_id UUID REFERENCES timbas(id) ON DELETE SET NULL` a `partidas_pool`
   (retomando lo que el borrador de la spec ya tenía en `§7` y se simplificó al aplicar la
   migración real) y escribirlo cuando se crea la Timba desde el overlay de fin. Sirve para que
   el botón "Crear Timba" no aparezca dos veces si el usuario vuelve a esa pantalla, y para el
   punto siguiente.
2. **Intencional (nuevo)**: desde el detalle de una Timba ya creada con dos participantes y
   `juego` reconocible como Pool, un botón "Jugar ahora" que arranca la sala online
   (`sala-pool.tsx`) con `timba_id` precargado desde el arranque.

**Validaciones**: el puente Timba↔partida solo tiene sentido 1 a 1 — Timba de exactamente 2
participantes, cuyas opciones de resultado sean "gana A" / "gana B" con A y B siendo los dos
jugadores de la partida. Si la Timba tiene más opciones o más participantes, no se ofrece el
enlace (no todo lo que pasa por Timbas es 1v1, y forzarlo generaría casos raros).

**Resolución — automática solo para "cancelar", nunca para "decidir quién ganó":**
- Partida termina con ganador claro (embocó la 8, o abandono voluntario) → sigue como hoy:
  se **sugiere** el resultado (banner en el detalle de la Timba: "Resultado sugerido: {nombre}
  ganó — según la partida de Pool vinculada"), el creador confirma manualmente. Reduce fricción
  sin romper el modelo de confianza.
- Partida termina por desconexión sostenida (ver distinción de motivo en §8.2) y tenía
  `timba_id` → **esto sí puede ser automático**, porque cancelar no es "decidir un ganador", es
  reconocer que la partida no se completó. **Chequeado en `supabase/schema.sql:21`**: el estado
  de `timbas` hoy es `CHECK (estado IN ('activa', 'en_disputa', 'cerrada'))` — no existe
  `'cancelada'`. Hace falta sumarla al CHECK (migración aditiva, sin romper nada existente) antes
  de poder implementar esto — ya no es una duda, es una subtarea concreta (ver Fase 9 del
  roadmap). `resultado_ganador` debería quedar `null` en ese caso, igual que ya hace
  `reabrir_timba` en `012_mejoras_ux.sql:62` para el caso de disputa.

**Casos especiales**:
- Timba vinculada + break inválido repetido / partida que nunca arranca de verdad: no hay
  ganador ni desconexión — dejar que el creador cancele manualmente, no hay señal automática
  confiable acá.
- Serie "mejor de 3" vinculada a una Timba: la Timba debería resolverse recién al terminar la
  *serie*, no el primer juego — `avanzarSerie()` (`online.ts:82-112`) ya distingue `fase:
  'terminada'` de un juego intermedio, así que el enlace debe mirar `fila.fase`, no cada
  `resultado.ganador` individual (ya viene resuelto por la estructura de datos existente, solo
  hay que engancharse en el punto correcto).

---

## 5. Música y sonidos

### 5.1 Estado actual

`src/lib/pool/sonido.ts` ya es un sistema no trivial: pool de `AudioPlayer` por efecto para
solapamiento, agendado por timestamp exacto del evento físico, tres muestras de golpe por
intensidad en vez de pitch-shifting de una sola. Es sólido. Lo que falta es exactamente lo que
pediste — música ambiental — y algo que el relevamiento general encontró y vale la pena que
sepas: **no existe una pantalla de Configuración en toda la app** (no aparece en el Drawer,
`src/components/ui/DrawerContent.tsx:9-14` solo tiene Timbas/Juegos/Amigos/Perfil/un "Soporte"
sin funcionalidad). El toggle de sonido de Pool (`@timba:pool_sonido`,
`partida-pool.tsx:170,184`) es una isla: no hay equivalente en Truco/Blackjack/Poker, y no hay
ningún lugar fuera de la partida donde se pueda ver o cambiar. Además, hoy sonido y háptica
comparten el mismo flag (`if (sonidoRef.current) haptica.golpe()`, `partida-pool.tsx:379`) — no
se pueden desactivar por separado, lo cual es una limitación real si alguien quiere vibración
sin sonido (silencio en público) o viceversa.

### 5.2 Propuesta

- **Música ambiental**: loop de bajo volumen, se pausa/reduce durante la animación de un tiro
  (para no tapar los efectos) y retoma en reposo. Mismo mecanismo de `createAudioPlayer` +
  `try/catch` que ya usa `sonido.ts`, un player adicional de loop en vez del pool por efecto.
  Debe respetar un toggle **separado** del de efectos (a la gente le molesta música de fondo
  mucho más que un "tock" puntual — tratarlos igual sería un error de UX).
- **No resolver esto solo adentro de Pool**: dado que no hay pantalla de Configuración en la
  app, este es el momento de crearla — no como scope-creep de Pool, sino porque sin ella
  *cualquier* toggle que agreguemos (música, sonido, háptica, y a futuro el de asistencia de
  apuntado de §2) vuelve a quedar aislado dentro de la partida, sin persistencia visible ni
  forma de que el usuario los encuentre fuera de estar jugando. Una pantalla `Ajustes` colgada
  del Drawer (reemplazando el placeholder "Soporte" o al lado) con secciones "Sonido y música" /
  "Notificaciones" / "Juego" resuelve esto para Pool y deja el lugar listo para que los demás
  juegos se sumen después sin reinventar la rueda. El botón 🔊 dentro de la partida se mantiene
  como acceso rápido (le pega directo al mismo AsyncStorage), no hay que sacarlo.
- Separar el flag de háptica del de sonido (`@timba:pool_haptica` propio).
- **Tema claro/oscuro: confirmado que sigue oculto.** El sistema (`src/store/temaStore.ts`) está
  completo pero deshabilitado — `ThemeContext.tsx:11-15` fuerza oscuro con el store comentado, y
  el botón en `perfil.tsx:362-369` también está comentado. Contexto: el modo claro estuvo activo
  en la app, pero no convenció al Jefe del proyecto — se decidió ocultar la opción sin borrar el
  trabajo, por si se retoma más adelante. La pantalla de Ajustes de este roadmap (§13, Fase 10)
  **no** debe exponer ningún control de tema. Ya dejé anotado el porqué directamente en el código
  (`ThemeContext.tsx` y `perfil.tsx`) para que quede claro para cualquiera que lo encuentre
  comentado y no sepa si es una función a medio hacer o una decisión deliberada.

---

## 6. Reglas del juego — sección de ayuda

### 6.1 Estado actual

Pool ya tiene, de lejos, el mejor contenido educativo de la app: `tutorial-pool.tsx` +
`src/lib/pool/tutorial.ts` (6 lecciones jugables + quiz de 4 preguntas con explicación). Ni
Truco ni Blackjack tienen nada parecido (Blackjack solo tiene un botón "Reglas" suelto en
`partida-blackjack-clasico-bot.tsx:265`, aparenta ser un modal simple). El problema no es que
falte contenido — es que el tutorial es una experiencia **de una sola pasada**: enseña una vez,
con progreso persistido, pero no funciona como referencia rápida para consultar a mitad de una
partida real ("¿esto fue falta o no?").

### 6.2 Propuesta

Una pantalla **"Reglas y ayuda"** separada del tutorial (accesible desde el menú de Pool y,
idealmente, desde un ícono `?` dentro de la partida sin interrumpirla — un modal, no una
navegación completa):

- **Reutilizar contenido, no duplicarlo**: las 4 preguntas de `LECCIONES[4]` (quiz) ya tienen
  pregunta + explicación en prosa — son, literalmente, ya la sección de "faltas y situaciones
  comunes" en formato pregunta/respuesta. Extraerlas a una lista de referencia estática
  (glosario de faltas, cuándo tirarle a la 8, qué pasa en un break inválido) es tomar contenido
  que ya se escribió y darle una segunda forma, no escribir de cero.
- **Imágenes**: acá sí hay una dependencia real de contenido nuevo (no de código) — diagramas
  de mesa para "esto es un corte", "esto es una falta de contacto", etc. Se puede resolver con
  capturas reales de `MesaPool` en posiciones armadas a mano (mismo patrón que usa el tutorial
  para armar lecciones, `armar: () => [bola(...), ...]`) en vez de encargar arte nuevo — más
  barato y consistente visualmente con el resto del juego.
- **Consejos para principiantes**: separar claramente de "reglas" (which son objetivas) —
  sección aparte, tono más informal, cosas como "no le pegues siempre al máximo", "mirá el
  ángulo de corte antes que la fuerza".
- **Diseño reutilizable a propósito**: dado que ningún otro juego tiene esto todavía, conviene
  construir el componente pensando en que Truco/Blackjack lo van a copiar después (estructura
  genérica `SeccionAyuda { titulo, contenido, imagen? }` en vez de algo hardcodeado 100%
  Pool-específico) — cuesta poco más ahora y evita otra ronda de "cada juego reinventa lo suyo",
  que es exactamente el patrón que aparece en §9.

---

## 7. Sistema de invitaciones (específico de Pool)

### 7.1 Estado actual

`pool-online.tsx:60-87` (`cargarInvitaciones`) trae hasta **5** invitaciones de las últimas
**48 horas**, todas se muestran en una lista bajo "TE INVITARON" (`pool-online.tsx:170-196`).
No hay expiración real (el filtro de 48h es solo un corte de carga, no un TTL en la base), no
hay forma de descartar una invitación puntual (ni X ni swipe), y si alguien te invita 3 veces
capaz ves 3 cards de la misma persona.

### 7.2 Propuesta (tal como la pediste)

Cambiar `cargarInvitaciones()` para:
1. Traer solo el **mensaje más reciente por emisor distinto** que sea de tipo
   `invitacion_pool` y tenga menos de **10 minutos** (`created_at > now() - 10min`), y de esos,
   mostrar solo el más reciente de todos (no una lista — una sola card a la vez, como pediste).
2. Agregar una **X** en la card. Al tocarla: no hace falta borrar el mensaje de la base
   (es historial de chat) — alcanza con guardar su `id` en un set local de "descartadas en esta
   sesión" (o, mejor, una tabla mínima `invitaciones_descartadas(usuario_id, mensaje_id)` si
   querés que el descarte persista entre sesiones/dispositivos) y filtrar por eso al recalcular
   cuál es "la más reciente válida" — automáticamente aparece la siguiente si existe, sin
   ningún código adicional de "avanzar a la próxima": es una consecuencia directa de recalcular
   sobre la lista filtrada.
3. El realtime que ya existe (`pool-online.tsx:48-58`, INSERT en `mensajes`) sigue funcionando
   igual — solo cambia qué se muestra de lo que llega, no cómo se detecta.

### 7.3 ¿Hay un sistema mejor?

Para Pool específicamente, lo pedido es lo correcto: una invitación a jugar pierde sentido
rápido (nadie quiere aceptar "a jugar" de hace 3 horas), así que una ventana corta + solo la más
reciente es el comportamiento correcto, no un compromiso. Donde sí hay una mejora estructural
mayor disponible es a nivel de toda la app — eso es exactamente el punto 9, que trato aparte
porque no es específico de Pool.

---

## 8. Multijugador

### 8.1 Abandono voluntario

`abandonar()` (`partida-pool.tsx:613-624`, botón "Rendirse" en el header) ya hace lo pedido:
marca `fase='abandonada'`, `ganador_serie` = el rival, la partida queda cerrada. Un caso
especial que sí vale la pena cubrir: **confirmación**. Hoy el botón dispara el abandono directo,
sin diálogo de "¿seguro?" — un toque accidental (mobile, pulgar apurado) pierde la partida al
instante sin forma de deshacerlo. Agregar una confirmación simple es barato y evita una fuente
de frustración innecesaria que no tiene que ver con el diseño del sistema, solo con el gesto.

Otro caso: si la partida es serie "mejor de 3" y vas ganando 1-0, ¿"Rendirse" pierde solo el
juego actual o toda la serie? Por cómo está escrito (`ganador_serie` se fija directo, sin pasar
por `avanzarSerie`), hoy **pierde la serie completa**, sin importar el marcador parcial — es
razonable como default (rendirse es rendirse), pero conviene que el diálogo de confirmación lo
diga explícitamente cuando el marcador no está en 0-0, para que no sea sorpresa.

### 8.2 Desconexión — el problema central de este punto

**Lo que hay hoy**: `GRACIA_RECLAMO_MS = 90_000` (`partida-pool.tsx:46`) — 90 segundos, no los 5
minutos que pediste. Presencia vía canal Supabase Realtime (`partida-pool.tsx:272-286`),
`reclamarVictoria()` con guarda server-side (`.eq('fase','en_juego').lt('updated_at', limite)`,
`:626-638`) para que no haya carrera. El dato importante del relevamiento: **abandono
voluntario y desconexión terminan en el mismo estado** (`fase='abandonada'`) — no hay ninguna
columna que distinga "se rindió" de "se le cortó la conexión", y el mensaje que ve el perdedor
es genérico ("X abandonó la partida", `partida-pool.tsx:1011-1012`) en ambos casos. Esto es
exactamente lo que hace imposible, hoy, tu pedido de §4 ("si era una Timba, se cancela") — no
hay forma de saber, mirando la fila, por cuál de los dos motivos terminó.

**Ampliar la gracia a 5 minutos**: cambio de una constante, sin riesgo — pero antes de subirla
"a secas" hay un problema de diseño que vale la pena resolver al mismo tiempo, porque si no el
5 minutos se siente peor de lo que suena:

**El timer de turno y la gracia de desconexión no están coordinados.** El timer configurable
(30/45/60s, `fila.timer_seg`) lo hace vencer **el propio cliente del jugador en turno**
(`vencioMiTimer()`, se dispara desde un `setInterval` local, `partida-pool.tsx:295-306`). Si
justo ESE cliente es el que se desconecta (el caso más común: alguien recibe una llamada a mitad
de su tiro y bloquea el teléfono), su `setInterval` no corre en background — nunca dispara el
paso de turno que la config de "30s por tiro" promete. La única red de seguridad que queda es la
gracia de presencia, que hoy son 90s y pasarían a ser 5 minutos — el rival, que configuró un
timer de 30s pensando en partidas ágiles, puede terminar esperando 5 minutos igual apenas el
que se desconecta es justo el que tiene el turno. Es una inconsistencia real entre dos
mecanismos que se escribieron por separado y no se hablan entre sí.

**Decidido — gracia en dos niveles, no uno solo** (confirmaste este enfoque):
1. **Ausencia detectada + timer de tiro vencido** (`!rivalPresente` Y ya pasó `timer_seg` +
   un margen corto, ~15s): pasar el turno automáticamente (falta simple, bola en mano — mismo
   efecto que `resolverTimeout()` ya implementa) sin terminar la partida. El desconectado puede
   volver y seguir jugando normalmente, solo perdió ese tiro. Reutiliza `resolverTimeout` tal
   cual existe, solo cambia quién lo dispara (hoy solo el propio cliente en turno; agregar que
   el cliente rival, con la misma guarda `.lt('updated_at')`, también pueda hacerlo si detecta
   ausencia).
2. **Ausencia sostenida** (5 minutos, tu número): recién ahí termina la partida
   (`fase='abandonada'`), con el `motivo_abandono` distinguido (ver abajo).

Este diseño de dos niveles es coherente con lo que ya pediste para el resto: el timer corto
mantiene el ritmo cuando alguien está distraído pero presente; los 5 minutos son para cuando de
verdad se fue.

**Cambio de esquema propuesto** (aditivo, no rompe nada existente): agregar
`motivo_abandono TEXT CHECK (motivo_abandono IN ('voluntario','desconexion'))` a
`partidas_pool`. `abandonar()` escribe `'voluntario'`; `reclamarVictoria()` escribe
`'desconexion'`. Con esto: el banner de fin puede decir "se desconectó" en vez de "abandonó" en
el caso que corresponde (mejor comunicación, lo pediste implícitamente al distinguir los dos
casos en tu prompt), y es la señal que necesita §4 para cancelar una Timba vinculada solo en el
caso de desconexión, nunca en el de rendición voluntaria (ahí sigue habiendo un ganador legítimo).

**Riesgo operativo a marcar, no necesariamente para v1**: nada expira `en_juego`
automáticamente si el rival tampoco vuelve a mirar la pantalla — `reclamarVictoria()` es una
acción, no un proceso. Si los dos jugadores se desconectan (o uno se desconecta y el otro
simplemente cierra la app sin tocar "Reclamar"), la fila queda huérfana en `en_juego` para
siempre. Para v1 esto es aceptable (bajo impacto, sin plata real de por medio); si se quiere
cerrar del todo, la solución correcta es una function con `pg_cron` que barra filas
`en_juego` con `updated_at` viejo — lo marco como mejora de v2, no bloqueante.

### 8.3 Historial de desconexiones — cómo mostrarlo sin castigar

Coincido con el objetivo que planteás (informar, no castigar) y creo que la implementación
tiene que reflejar eso en el diseño, no solo en la intención:

- **Contar solo desconexiones reales**, no rendiciones voluntarias — por eso la distinción de
  motivo de §8.2 es un prerrequisito técnico de este punto, no un detalle aparte.
- **No mostrarlo como número público en el perfil.** Un contador visible para cualquiera
  ("Juan se desconectó 12 veces") es material perfecto para bullying dentro de un grupo de
  amigos, exactamente lo opuesto de la intención declarada. Mejor: mostrarlo **contextualmente**,
  solo en el momento en que importa — por ejemplo, un indicador chico y cualitativo (no
  numérico) en la sala de espera o en la card de invitación, del tipo "conexión inestable en
  partidas recientes", visible solo si hay señal suficiente (ej. ≥3 desconexiones en las
  últimas 20 partidas) para no marcar a alguien por un evento aislado (una mala tarde de wifi
  no debería seguirte).
- **Confirmado: es para todos los juegos, no solo Pool.** Diseño como tabla compartida
  (`eventos_desconexion(usuario_id, juego, partida_id, creado_en)`) en vez de una columna
  contada solo dentro de `partidas_pool` — así el mismo indicador sirve para Blackjack/Truco/
  Poker cuando tengan su propio manejo de desconexión, sin repetir este trabajo por juego.
  **Matiz importante sobre qué significa "para todos los juegos" hoy**: el *esquema* se diseña
  genérico desde ahora, pero solo Pool puede *alimentarlo* de entrada — es, hoy, el único juego
  con manejo de presencia/desconexión (confirmado en el relevamiento: `blackjackClasicoOnline.ts`
  no tiene ninguna lógica de presencia, abandono ni timeout). El indicador para Blackjack/Truco/
  Poker va a mostrar "sin datos" hasta que esos juegos implementen su propio manejo de
  desconexión (fuera del alcance de esta revisión de Pool) — la tabla compartida evita que ese
  trabajo futuro tenga que rediseñar el esquema, no adelanta el trabajo en sí.

### 8.4 Nota transversal (aplica a §4, §5, §7, §8, §9)

Varios de tus puntos chocan, en distintos grados, con el mismo hecho: **hoy no hay
infraestructura compartida entre juegos para invitaciones, presencia/desconexión, ni
configuración**. Pool construyó la suya propia porque la necesitaba primero. Esto no es un
error de Pool — es esperable en una app que fue creciendo juego por juego — pero significa que
al menos tres de tus pedidos (Timbas §4, Configuración §5, Centro de invitaciones §9) tienen dos
caminos posibles: resolverlos **solo para Pool** (rápido, consistente con "no tocar lo que no
pediste") o resolverlos **a nivel app** (más trabajo ahora, evita que Truco/Blackjack repitan
exactamente este mismo trabajo en unos meses). Lo señalo en cada punto donde aplica y lo dejo
como decisión explícita en el roadmap — no lo resuelvo por vos porque cambia el alcance de lo
pedido.

---

## 9. Centro de invitaciones

### 9.1 Estado actual (no es solo un problema de Pool)

No existe ningún modelo genérico de invitación. Todas —Timba, Poker, Truco, Blackjack, Pool—
son mensajes de chat (`mensajes.tipo`, restringido por CHECK constraint, ampliado migración por
migración: `002`, `008`, `014`, `017`, `019`). Cada juego reimplementa su propia
`cargarInvitaciones()` casi idéntica (`blackjack.tsx`, `poker.tsx`, `pool-online.tsx` — mismo
patrón de query, mismo `.limit(5)`, mismo corte de 48h client-side) y el renderizado de las
cards vive todo adentro de un switch gigante en `app/chat/[userId].tsx:1307-1520`. Aparte, las
solicitudes de amistad usan un modelo **completamente distinto** (tabla `amistades`,
`estado='pendiente'`) — hay, literalmente, dos sistemas de "cosas pendientes" que no comparten
ni código ni componente visual entre sí.

### 9.2 Propuesta

Antes que nada: **esto es más grande que "agregar una pantalla a Pool"** — es la ocasión de
consolidar algo que hoy está triplicado (y va a ser cuadruplicado si mañana se suma otro juego).
Diseño propuesto:

- **Pantalla única "Invitaciones"**, accesible desde el Drawer o desde una campanita en el header
  principal (patrón común: badge con contador).
- **Filtros**: por tipo (Timba / Truco / Blackjack / Poker / Pool) con un "Todas" por default;
  no hace falta más que eso — no es una bandeja de email.
- **Orden**: más reciente primero, siempre — es lo que ya hace cada implementación actual, no
  hay que inventar un criterio nuevo.
- **Interacción**: aceptar/rechazar/descartar inline, sin salir de la pantalla — mismo patrón
  que ya usan las cards del chat, solo centralizado.
- **Expiración automática**: acá sí conviene una columna real en vez del truco de "48h
  client-side" que usan hoy — un `expira_en` calculado al insertar el mensaje (TTL distinto por
  tipo: 10 min para Pool §7, capaz más para Timba) resuelve de raíz el problema que tienen las
  tres implementaciones actuales de "48h" siendo un número mágico repetido tres veces.
- **Camino incremental si el rediseño completo es demasiado para ahora**: extraer primero la
  lógica de `cargarInvitaciones()` a un hook compartido (`useInvitacionesPendientes(tipo?)`) que
  cada juego siga usando desde su propia pantalla — no unifica la UI todavía, pero mata la
  triplicación de la query y deja el terreno preparado para la pantalla única después sin
  reescribir tres veces más.

---

## 10. Problema con Expo Go — el selector de efecto (spin) en Samsung

*(Corrección: el prompt original que analicé no traía la descripción completa de este punto — el
problema real es el botón de selección de efecto/spin, no "un efecto visual" genérico. Con ese
dato, el diagnóstico deja de ser una lista de sospechosos y pasa a tener una causa concreta,
verificable en el código — reemplaza mi primera pasada, que apuntaba a Skia/GPU.)*

### 10.1 Diagnóstico

`SelectorSpin.tsx` — el modal donde arrastrás el punto de contacto sobre la bola blanca para
elegir el efecto — envuelve el gesto de arrastre (`Gesture.Pan()` de
`react-native-gesture-handler`, `SelectorSpin.tsx:35-47`) **adentro de un `<Modal>` de React
Native** (`SelectorSpin.tsx:6,55` — el `Modal` que se importa de `'react-native'`, no un
componente propio).

Esto es una limitación **documentada oficialmente** por `react-native-gesture-handler`, no una
conjetura: en Android, los gestos de RNGH no funcionan dentro de un `Modal` porque el `Modal`
nativo de Android se renderiza en una ventana nativa separada, que **no es descendiente** del
`GestureHandlerRootView` que envuelve el resto de la app — ningún gesto dentro de ese árbol tiene
raíz a la que reportarse. La solución documentada es envolver el contenido del `Modal` con su
**propio** `GestureHandlerRootView` adicional.

Encaja exacto con el resto del código:
- La app tiene un único `GestureHandlerRootView` en la raíz (`app/_layout.tsx:60`) — cubre toda
  la navegación normal, pero por la limitación de arriba **no** cubre el contenido de ningún
  `<Modal>`.
- El drag de apuntado sobre la mesa (`panMesa`, `partida-pool.tsx:687`) y el slider de fuerza
  (`ControlFuerza.tsx`) **no** están dentro de un Modal — están inline en la pantalla — por eso
  funcionan bien, consistente con que no reportaste problemas ahí.
- De todos los componentes de Pool (y, revisando el resto de la app, de todos los componentes en
  general), **`SelectorSpin.tsx` es el único que combina `Modal` + `Gesture.Pan()`**. El selector
  de skins de taco (`SelectorSkins.tsx`) también es un Modal, pero solo usa `TouchableOpacity` —
  sin RNGH, no le afecta esta limitación.

En criollo: no es un efecto visual que "se ve mal" — es el gesto de arrastre dentro de ese modal
puntual el que probablemente no reacciona en absoluto en Android, porque el sistema de gestos
nunca llega a encontrar una raíz válida en ese árbol de vistas.

### 10.2 ¿Puede deberse a Expo Go y no al código?

No — y es una buena noticia: significa que está 100% en tu control arreglarlo, sin depender de
ningún cambio de Expo. Esta limitación de RNGH con `Modal` en Android **no es específica de Expo
Go**: es consecuencia de cómo Android arma la jerarquía nativa de vistas de un `Modal`, y
reproduce igual en un development build o en un build de producción — Expo Go es simplemente
donde lo viste primero, no la causa.

Sobre "Samsung" puntualmente: la limitación documentada es sobre el `Modal` de Android en
general, no sobre ningún fabricante — mi sospecha es que **no es realmente específico de
Samsung**, sino de Android en general, y Samsung fue el único Android que probaste hasta ahora
(dijiste que no pudiste probar iPhone por la versión distinta de Expo Go, y no mencionaste haber
probado otro Android). Vale la pena confirmarlo con el paso 3 de abajo.

### 10.3 Cómo depurarlo

1. **Confirmar la hipótesis directo en el código**: en `SelectorSpin.tsx`, envolver
   temporalmente el `<GestureDetector>` (línea 61) en un
   `<GestureHandlerRootView style={{ flex: 1 }}>` (importado de `react-native-gesture-handler`)
   y probar de nuevo en el Samsung con Expo Go. Si el arrastre empieza a responder, es
   exactamente esto — no hace falta ningún otro paso de investigación.
2. Si no cambia nada: revisar la consola de Expo Go en el dispositivo (Metro/logcat) mientras se
   arrastra — RNGH suele loguear una advertencia cuando un gesto no encuentra un
   `GestureHandlerRootView` disponible.
3. **Separar "Android" de "Samsung"**: probar el mismo modal en cualquier Android que no sea
   Samsung (un emulador alcanza). Si falla igual ahí, confirma que es la causa de 10.1 y no algo
   específico del fabricante.

### 10.4 Cómo verificar si ocurre también en un build nativo

Con esta causa identificada, la predicción es que **sí** va a reproducir igual en un development
build o en un build de producción — es una limitación de la combinación Modal + RNGH + Android,
no del cliente de Expo Go específicamente. Para confirmarlo formalmente: generar un development
build (`eas build --profile development`, o `npx expo run:android` local) e instalarlo en el
mismo Samsung — si el arrastre tampoco responde ahí, queda confirmado que Expo Go no tiene nada
que ver.

### 10.5 La corrección — ✅ ya aplicada en el código

Se envolvió el contenido del `Modal` de `SelectorSpin.tsx` con un `GestureHandlerRootView`
propio (pendiente solo confirmar en el Samsung real que resolvió el síntoma — ver 10.3):

```tsx
<Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
  <GestureHandlerRootView style={{ flex: 1 }}>
    <Pressable style={es.overlay} onPress={onCerrar} />
    <View style={[es.panel, /* ... */]}>{/* ... */}</View>
  </GestureHandlerRootView>
</Modal>
```

Cambio acotado a un solo archivo, sin riesgo para el resto del juego — ya confirmamos que ningún
otro componente comparte este patrón (10.1), así que no hay nada más que revisar por este mismo
motivo.

### 10.6 Cómo evitar este tipo de diferencias a futuro

- **Regla para el equipo**: cualquier `Gesture.*`/`GestureDetector` de
  `react-native-gesture-handler` que vaya a vivir dentro de un `<Modal>` de React Native necesita
  su propio `GestureHandlerRootView` — el de la raíz de la app no alcanza. Vale la pena dejarlo
  como comentario en el propio `SelectorSpin.tsx` corregido, para que la próxima vez que alguien
  meta un drag dentro de un modal no pise lo mismo.
- Preferir un sheet propio (`View` posicionado con `position: 'absolute'`, como ya hacen los
  otros sheets de Pool en `pool.tsx`/`pool-online.tsx`) en vez del `Modal` de React Native cuando
  el contenido necesita gestos de RNGH — evita la limitación de raíz en vez de tener que
  parchearla cada vez que aparece.
- Sobre Expo Go en general: cuando un bug aparece "en Expo Go, en un dispositivo, no en otro",
  conviene descartar primero causas de código verificables (como esta) antes de asumir que es un
  problema de la plataforma — es más rápido de confirmar o descartar, y en este caso resultó ser
  exactamente eso.

### 10.7 Candidato secundario (mucho menos probable, queda por completitud)

Si el fix de 10.5 no resolviera el problema (poco probable dado lo bien que encaja la causa de
arriba): la siguiente hipótesis sería un desajuste de versión nativa entre
`@shopify/react-native-skia` (fijado en `2.6.2`, `package.json:9`) y el binario que trae el
cliente de Expo Go para SDK 56 (Skia viene *"Included in Expo Go"* según la documentación oficial,
`docs.expo.dev/versions/v56.0.0/sdk/skia`) — pero `SelectorSpin.tsx` no usa Skia para nada (es
todo `View`/`Text` planos, sin Canvas), así que esta hipótesis solo aplicaría si aparece un
segundo síntoma distinto en algo que sí use Skia (por ejemplo el sombreado `RadialGradient` de
las bolas, `MesaPool.tsx:170-176`). La dejo documentada por si eso pasa; para el problema del
selector de efecto que describiste, 10.1–10.5 es la explicación.

---

## 11. Revisión general — hallazgos adicionales

### 11.1 Bugs / inconsistencias de código

- **`comunicarResultado()`** (`partida-pool.tsx:416-431`) tiene una expresión redundante:
  ```ts
  const quien = quienTiro === miJugador && !esOnline ? '' : quienTiro === (esOnline ? miJugador : HUMANO) ? '' : ` de ${nombreOtro}`
  ```
  Cuando `!esOnline`, `miJugador === HUMANO` siempre (ver su definición), así que la primera
  condición es un subconjunto exacto de la segunda — no es un bug funcional (el resultado es
  correcto), pero es código que cuesta más de leer de lo que hace. Simplifica a:
  `quienTiro === (esOnline ? miJugador : HUMANO) ? '' : \` de ${nombreOtro}\``.
- **Timer de turno no reconciliado contra tiempo real** (ya detallado en §8.2): el countdown es
  un `setInterval` local, no una resta contra `fila.updated_at` del servidor — al volver de
  background, el número mostrado puede no reflejar el tiempo real transcurrido. Afecta tanto la
  UX (el número que ves) como la robustez del propio mecanismo de timeout.
- **`generarCandidatos` y compañía no exportados** de `bot.ts` — bloqueante directo para §3,
  listado acá también porque es un cambio de una línea con alto apalancamiento.
- **Pantalla de debug sigue siendo alcanzable por ruta** (`app/juegos/debug-pool.tsx`) aunque
  esté oculta del menú (`pool.tsx:24-27`, comentario "recordar sacarla antes de producción" ya
  en el propio código, `[[project-pool-juego]]` también lo señala como pendiente). No es
  peligroso (es un juego, no expone datos), pero es deuda ya auto-identificada por el propio
  código — buen candidato a resolver junto con cualquier otro trabajo de esta lista.
- **`CHAFLAN_ESQUINA` marcado como "pendiente de calibrar con precisión... en dispositivo real"**
  directamente en el comentario de `transform.ts:78`. No es un bug reportado por vos, pero está
  auto-marcado como incompleto en el propio código — mencionarlo para que no se pierda entre
  tanto otro punto.

### 11.2 UX / performance

- **Sonido y háptica comparten un solo flag** (ver §5) — separarlos es barato y es una queja
  común en juegos móviles cuando no se puede separar.
- Los tres skins de taco (`palo_pool.png`, `_1`, `_2`) se cargan siempre con `useImage`, aunque
  solo uno se dibuje (`MesaPool.tsx:193-196`, comentario propio explica por qué: reglas de
  hooks). Es un costo de memoria menor pero real — no crítico, pero si se agregan más skins a
  futuro (paños, bolas) conviene revisar si un loader dinámico (con manejo cuidadoso de
  Suspense/loading, ya que `require()` dinámico no anda con Metro tal como el propio comentario
  aclara) vale la pena antes de que la lista crezca más.
- `palo_pool_1.png` y `palo_pool_2.png` **sin trackear en git** según la última nota de memoria
  del proyecto (aparecieron sueltos en el worktree) — vale confirmar que estén commiteados,
  si no, el build de otra persona/CI se rompe silenciosamente por un asset faltante.

### 11.3 Funciones que probablemente faltan (no pedidas, propuesta del equipo)

- **Replay del último tiro** — ya estaba en la lista de "mejoras no pedidas" del spec original
  (`§16`) y sigue sin implementarse; es barato (el input ya viaja completo en `ultimo_tiro`,
  solo hay que re-animarlo bajo demanda) y da mucho valor percibido.
- **Stats de partidas de Pool en el perfil** (partidas jugadas, % victorias, racha) — mencionado
  en la spec original, no implementado; con el historial de desconexiones de §8.3 ya
  requiriendo tocar el perfil, es buen momento para agruparlo en el mismo trabajo.
- **Botón "Cancelar" explícito para el jugador que espera durante la gracia de desconexión** —
  hoy la única salida antes de que se cumplan los 5 minutos es el botón atrás genérico del
  header, que abandona la pantalla sin resolver la fila (queda en `en_juego`, ver nota de §8.2).
  Un botón "Salir y dejar la partida en pausa" (deja la fila como está, no fuerza nada) frente a
  otro "Abandonar ahora" (fuerza el cierre) sería más honesto sobre qué hace cada acción.

---

## 12. Priorización — cómo se armó el roadmap

Cuatro criterios, en este orden de peso quedaron los puntos del pedido:

1. **¿Es un bug o una feature?** Un bug (algo que hoy da un resultado incorrecto respecto a lo
   que el propio sistema promete) va antes que cualquier feature nueva, sin importar el tamaño.
2. **¿Cuánto del trabajo ya existe?** Varios puntos tienen el 70-90% de la lógica ya escrita en
   `bot.ts`/`guia.ts`/`online.ts` — completarlos cuesta una fracción de lo que costaría
   construirlos de cero, así que suben en la cola.
3. **Dependencia técnica real** (no solo orden de conveniencia): §4 y §8 comparten el mismo
   cambio de esquema (`motivo_abandono`, `timba_id`) — tiene sentido resolverlos en la misma
   fase, uno depende literalmente del otro para tener sentido completo.
4. **Alcance app-wide vs. Pool-only**: los puntos marcados en §8.4 tienen una decisión de scope
   que es tuya, no mía — el roadmap ofrece ambos caminos donde aplica y no asume cuál preferís.

---

## 13. Roadmap de desarrollo

Continúa la numeración de fases de `docs/POOL_8BALL_SPEC.md` (que llegó hasta Fase 6, v1
completa).

### Fase 7 — Corrección de física de guía (bloqueante, base de todo lo demás) — ✅ hecha
*Impacto: alto (afecta cada tiro de cada partida). Dificultad: media. Dependencias: ninguna.*

| Subtarea | Dificultad | Nota |
|---|---|---|
| ✅ 7.1 Reemplazar reflexión especular por normal/tangencial real en `guia.ts` (§1.3 Fase A) | Media | `reflejarEnBanda()` — mismo modelo que `rebotarPared()` |
| ✅ 7.2 Tests nuevos (comparación contra `rebotarPared()` reimplementado independiente + caso de boca de tronera) | Baja | 66/66 tests pasan, `tsc --noEmit` limpio |
| ✅ 7.3 Incorporar spin conocido (`efectoLateral`) al cálculo de guía (§1.3 Fase B) | Media | Simplificado: `wz` tratado como constante en el trayecto (sin modelar `decaimientoWz`) — directamente correcto en dirección, aproximado en magnitud, mucho más simple que estimar decaimiento y sin ese riesgo. `efectoVertical` no aplica (no mueve `wz`, solo `wx/wy`) |
| ✅ 7.4 No dibujar rebote si el impacto cae en zona de boca de tronera (§1.3 Fase C) | Baja | `enBoca()` exportada de `fisica.ts`, reutilizada tal cual |

Hallazgo real al correr los tests: dos tests viejos apuntaban al centro exacto de la banda larga — que es donde vive la tronera lateral. Con 7.4 correctamente dejan de rebotar ahí (en la mesa real, esa bola cae). Se corrigió la geometría de esos tests, no el fix.

### Fase 8 — Asistencia y sugerencias (alto apalancamiento: el motor ya existe) — ✅ hecha (menos 8.2)
*Impacto: alto. Dificultad: media. Dependencias: Fase 7 (la guía tiene que ser confiable antes de exponer más niveles de ella).*

| Subtarea | Dificultad | Nota |
|---|---|---|
| ✅ 8.1 Selector de 4 niveles de asistencia + persistencia AsyncStorage (§2.3) | Media | `src/lib/pool/asistencia.ts` nuevo + cambios en `MesaPool.tsx` |
| ⏸️ 8.2 Asistencia por jugador al crear partida online ("hándicap", §2.3) | Media | **Diferida a propósito** — a diferencia del resto de Fase 8, necesita migración de esquema (`partidas_pool`) y tocar `pool-online.tsx`/`sala-pool.tsx`/`online.ts`, con un perfil de riesgo distinto (sin probar online con 2 cuentas todavía). Queda como su propio siguiente paso, no bloquea el resto |
| ✅ 8.3 Exportar `generarCandidatos` de `bot.ts` (§3.2) | Baja | Cambio de visibilidad |
| ✅ 8.4 Botón + render de sugerencia en práctica libre (§3.2) | Media | Botón "💡 Sugerencia", se limpia a los 3s o al primer drag |
| ✅ 8.5 Engranaje "Ajustes de Pool" en `pool.tsx`: asistencia por defecto + taco por defecto (§2.4) | Baja | Reutiliza `SelectorSkins.tsx` tal cual; de paso se centralizó `OPCIONES_TACO` en `skins.ts` (antes duplicado en `partida-pool.tsx`) |

Ícono nuevo `ajustes` agregado a `AppIcon.tsx` (no existía ninguno de tipo "configuración/engranaje" en el catálogo).

### Fase 9 — Multijugador robusto + Timbas — ✅ hecha (9.1–9.3, 9.6)
*Impacto: alto (afecta dinero/apuestas entre amigos). Dificultad: alta. Dependencias: ninguna técnica.*

Migración aplicada en vivo (proyecto `emesunjuzgfenpsltnkg`, `020_pool_fase9_multijugador_timbas.sql`)
y verificada contra el esquema real vía MCP de Supabase — el `schema.sql` local estaba
desactualizado (le faltaban columnas que ya existían en producción, agregadas en migraciones
tempranas sin archivo local correspondiente); no asumir que los `.sql` locales son la verdad
completa, confirmar contra `list_tables` antes de escribir una migración nueva.

| Subtarea | Dificultad | Nota |
|---|---|---|
| ✅ 9.1 Migración: `motivo_abandono` + `timba_id` en `partidas_pool` | Baja | Aditivo, aplicado y verificado con `get_advisors` (sin lints nuevos) |
| ✅ 9.2 Gracia en dos niveles (§8.2) | Alta | `reclamarTurnoPorAusencia()` nueva — mismo patrón de update guardado server-side que `reclamarVictoria()`, dispara desde el timer del jugador QUE ESPERA en vez de depender del cliente ausente. `GRACIA_RECLAMO_MS` 90s→5min |
| ✅ 9.3 Confirmación al presionar "Rendirse" | Baja | `confirmarAbandonar()` con `Alert.alert`, avisa explícitamente si pierde una serie en curso |
| ✅ 9.6 Historial de desconexiones + indicador cualitativo | Media | Tabla `eventos_desconexion` (RLS: visible a amigos, insert solo sobre el rival de una partida propia ya marcada `abandonada`/`desconexion` — no se puede marcar a cualquiera). Badge en `sala-pool.tsx`, sin número visible |

9.4 y 9.5 se implementaron en una segunda pasada con alcance distinto al que estaba acá — ver
Fase 9-bis inmediatamente abajo, que reemplaza lo que decía esta sección sobre esos dos puntos.

### Fase 9-bis — Timba pre-comprometida y auto-resolución — ✅ hecha
*Impacto: muy alto (cambia el modelo de confianza para este caso puntual). Dificultad: alta.*

Rediseño completo pedido después de probar la Fase 9 original en la práctica: el usuario notó
que crear la Timba **después** de jugar (como quedó diseñado en la primera pasada, con el banner
de "resultado sugerido") permite que dos amigos jueguen una partida casual y el que gana recién
ahí decida armar una Timba — sabiendo ya el resultado. La solución: comprometer la Timba **antes**
de arrancar, con reglas visibles para ambos, y resolverla sola cuando el partido termina.

**Por qué esto no rompe el principio anti-ludopatía** (`[[feedback-anti-ludopatia]]`: nunca
auto-resolver un ganador con implicancia de apuesta) — se confirmó explícitamente con el usuario
antes de tocar código: acá el resultado sale del propio motor del juego (quién embocó la 8 con
la mesa limpia), no es una afirmación que alguien pueda inflar o mentir — muy distinto de una
Timba genérica ("quién llega primero a casa") donde sí hace falta que alguien proponga y otro
confirme porque el software no puede verificar la verdad por su cuenta. **El modelo general de
Timbas no cambió**: esto es una excepción acotada y verificable, solo para Timbas creadas desde
este flujo de Pool (exactamente 2 participantes, opciones bloqueadas a "Gana X"/"Gana Y",
vinculadas 1 a 1 a una `partidas_pool`).

Antes de implementar se confirmaron 2 decisiones con el usuario (`AskUserQuestion`): si la
partida termina por **desconexión** sostenida la Timba se **cancela** (nadie debe nada — distinto
de una rendición voluntaria, que sí resuelve con un ganador real); y para timbas con plata, el
monto es **uno solo que fija el creador**, igual para los dos jugadores (no un monto por
jugador — mantiene el flujo simple).

| Subtarea | Dificultad | Nota |
|---|---|---|
| ✅ RPC `cerrar_timba_juego(p_partida_id)` (migración `021_pool_timba_auto_resolucion.sql`) | Alta | `SECURITY DEFINER`, idempotente (no hace nada si `timbas.estado` ya no es `'activa'`) — necesaria porque `deudas` no tiene policy de INSERT para usuarios comunes, y `timbas_update` solo deja escribir al creador (acá cualquiera de los 2 jugadores tiene que poder disparar la resolución) |
| ✅ Crear la Timba ANTES de invitar, en `pool-online.tsx` | Alta | Sección nueva "Timba (opcional)": tipo + premio/prenda o monto único — sin el formulario avanzado de `nueva.tsx` (cupos, fechas), sin mostrar las opciones (ya se sabe cuáles son: "Gana vos"/"Gana el amigo") |
| ✅ La invitación (mensaje de chat + card) avisa "🎲 Con timba" | Media | `timbaId` viaja en el `contenido` del mensaje `invitacion_pool` |
| ✅ Sala: reglas de la timba + config visibles, "Listo" mutuo, arranque automático | Alta | Presence trackea `{rol, listo}`; cuando ambos están listos el host dispara `empezarPartida()` solo (antes había un botón manual). "Cancelar juego": broadcast en el mismo canal, cierra la sala para los dos |
| ~~Auto-voto de cada jugador por sí mismo~~ → **sacado** (ver Fase 9-ter) | — | La primera versión hacía upsert desde 2 clientes en 2 momentos distintos — resultó frágil, ver abajo |
| ✅ `cerrar_timba_juego` se dispara solo al terminar la partida | Media | Efecto en `partida-pool.tsx` sobre `fila.fase`/`fila.timba_id`, guardado con un ref para no llamarlo dos veces por cliente — igual es idempotente si los dos clientes lo llaman a la vez |
| ✅ Overlay de fin con premio/prenda/plata | Media | "Has ganado"/"Has perdido" + "Tu premio es: X" / "Tu prenda es: X" / "Ahora te deben \$X" / "Ahora debés \$X" — ya no hay botón "Crear Timba" (se movió a antes de jugar) |
| ✅ Limpieza | Baja | Se sacó `crearTimbaResultado()` de `partida-pool.tsx` y el parámetro `poolPartidaId` de `nueva.tsx` (quedaban sin uso con el nuevo flujo) |

### Fase 9-ter — sacar la votación humana por completo — ✅ hecha
*Impacto: alto (corrige un bug real de datos). Dificultad: media.*

El diseño de la Fase 9-bis todavía dependía de que cada jugador votara por sí mismo al tocar
"Listo" (upsert en `participantes` desde 2 clientes, en 2 momentos distintos). El usuario probó
esto y reportó dos problemas reales: (1) todavía había que ir a la Timba a votar/proponer — nada
práctico — y (2) propuso directamente sacar la votación del medio. Se confirmó investigando la
base en vivo (`execute_sql` del MCP de Supabase): las 2 timbas de Pool más recientes habían
cerrado con el ganador correcto, pero con **0 votos registrados** — el upsert fallaba en
silencio (nunca se chequeaba el `.error`), dejando la timba resuelta pero sin las filas de
`participantes` que el resto del sistema (historial, "ganaste"/"perdiste") necesita.

**Decisión**: seguir usando `timbas`/`deudas` (reutiliza toda la integración ya armada con
"Saldos" e historial de perfil — no vale la pena duplicar eso), pero sacar la votación humana
del medio por completo:

| Cambio | Nota |
|---|---|
| `cerrar_timba_juego` reescrita (migración `022_pool_timba_sin_votacion.sql`) | Ahora anota a los DOS jugadores en `participantes` atómicamente, en la misma transacción que cierra la timba — nadie vota nunca. El monto ya no se busca en `participantes` (podía no existir) sino que se lee directo de `timbas.monto_minimo` |
| `pool-online.tsx` y `sala-pool.tsx` ya no escriben en `participantes` | Ni al crear la timba ni al tocar "Listo" — cero intervención del jugador, como se pidió |
| `perfil_publico()` excluye timbas con partida vinculada de "tus timbas activas" | `and not exists (select 1 from partidas_pool pp where pp.timba_id = t.id)` — solo mientras están `en_juego`; una vez `cerrada` aparecen en el historial normalmente, sin cambios ahí |
| `app/(tabs)/home.tsx` (listado principal) — mismo filtro, del lado del cliente | Consulta `partidas_pool` por las propias y excluye esos ids |
| `app/timba/[id].tsx`: modo de solo lectura para timbas de juego | Mientras `estado==='activa'` y hay una `partidas_pool` vinculada, se reemplaza la UI de votar/proponer por un aviso ("se resuelve sola"). De paso, red de seguridad: si alguien abre la timba y la partida vinculada ya terminó pero la timba sigue `activa`, se reintenta `cerrar_timba_juego` ahí mismo (idempotente) |
| Se sacó el banner de "resultado sugerido" de la Fase 9 original | Quedó obsoleto: ya no tiene sentido proponer nada a mano para una timba de juego |

**Lección para el futuro**: cualquier escritura Supabase sin chequear `.error` puede fallar en
silencio y dejar datos a medio resolver sin ningún síntoma visible en la UI — en este caso el
síntoma solo apareció consultando la base directamente. Vale la pena, ante un reporte de "esto
no se está comportando como debería", chequear el estado real en Supabase (`execute_sql`,
`get_logs`) antes de asumir dónde está el bug.

### Fase 10 — Contenido y configuración (mayor impacto en percepción de pulido)
*Impacto: medio-alto. Dificultad: media. Dependencias: ninguna técnica.*

Decisión ya tomada (confirmada por vos): pantalla de Ajustes **app-wide**. Sin control de tema
claro/oscuro (§5.2 — esa decisión sigue en pie, ya anotada en el código).

| Subtarea | Dificultad | Nota |
|---|---|---|
| 10.1 Pantalla de Ajustes app-wide (sonido/música/háptica, colgada del Drawer, sin toggle de tema) | Media-Alta | |
| 10.2 Música ambiental + toggle separado | Media | Depende de 10.1 para dónde vive el toggle |
| 10.3 Pantalla "Reglas y ayuda" reutilizando contenido del tutorial (§6.2) | Media | Diagramas vía capturas de `MesaPool`, no arte nuevo |
| 10.4 Invitaciones: solo la más reciente <10 min + X para descartar (§7.2) | Baja | Cambio acotado a `pool-online.tsx` |

### Fase 11 — Centro de invitaciones (decisión de alcance app-wide, §9)
*Impacto: medio (hoy funciona, aunque triplicado). Dificultad: alta si es la versión completa. Dependencias: ninguna.*

**Camino incremental recomendado** (§9.2): empezar por el hook compartido
`useInvitacionesPendientes`, que ya mata la triplicación de código sin rediseñar UI; la pantalla
única + `expira_en` en base queda como paso 2 cuando/si se decide invertir en eso.

### Fase 12 — Expo Go / Samsung + limpieza general
*Impacto: medio-alto (bug puntual ya diagnosticado, fix de bajo riesgo) + varios. Dificultad: baja-media cada ítem. Dependencias: ninguna, se pueden hacer en paralelo con cualquier otra fase.*

| Subtarea | Dificultad |
|---|---|
| ~~12.1 Envolver el contenido de `SelectorSpin.tsx` en su propio `GestureHandlerRootView` (§10.5)~~ | **✅ Aplicado** — pendiente confirmar en el Samsung real que resolvió el síntoma |
| 12.2 Fijar versiones de paquetes nativos al rango que valida Expo (`expo install --check`) | Baja |
| 12.3 Simplificar `comunicarResultado()` (§11.1) | Baja |
| 12.4 Timer reconciliado contra `updated_at` del servidor, no solo `setInterval` local (§11.1) | Media |
| 12.5 Sacar/proteger ruta de `debug-pool.tsx` antes de producción | Baja |
| 12.6 Separar flag de háptica del de sonido | Baja |
| 12.7 Confirmar que `palo_pool_1.png`/`_2.png` estén trackeados en git | Baja |
| 12.8 Replay del último tiro (mejora no pedida, §11.3) | Baja |
| 12.9 Stats de Pool en el perfil (mejora no pedida, §11.3) | Media |

---

## Decisiones ya confirmadas en esta ronda

1. **Gracia de desconexión en dos niveles** (§8.2, Fase 9.2) — confirmado, se implementa así.
2. **Historial de desconexiones**: tabla compartida entre todos los juegos, no solo Pool (§8.3,
   Fase 9.6) — con el matiz de que hoy solo Pool puede alimentarla.
3. **Pantalla de Ajustes**: app-wide (§5.2, Fase 10.1).
4. **Tema claro/oscuro**: sigue oculto, no se reactiva. Ya quedó anotado el porqué directamente
   en `src/lib/ThemeContext.tsx` y `app/(tabs)/perfil.tsx` para que no se pierda el contexto.
5. **Flecha dorada (`dirObjetivo`) y tangente (`dirBlanca`) reservadas para Máxima únicamente**
   (§2.2, opción A) — Baja y Normal muestran solo el camino de la blanca, sin excepciones.
6. **Fix de `SelectorSpin.tsx`**: envuelto en su propio `GestureHandlerRootView` — **confirmado
   funcionando en el Samsung real** del usuario (jul 2026).
7. **Barra inferior de la partida reordenada** tras probarla en dispositivo real: se sacó el
   botón Taco (duplicaba el engranaje de Ajustes de Pool) y "Sugerencia" se movió a una fila
   propia arriba de la mesa — la barra de abajo no entraba en pantallas angostas con los 4
   botones + fino juntos.
8. **La sugerencia del bot queda dibujada hasta que se tira**, no se autoborra a los 3s ni al
   primer drag — confirmado tras probarlo: el jugador la usa de referencia fija para alinear su
   propio apuntado, borrarla al empezar a arrastrar arruinaba ese uso.
9. **Fase 9 — alcance de 9.4 reducido** (solo banner de resultado sugerido, sin "Jugar ahora"
   desde una Timba existente) y **9.2 se implementa igual**, con el usuario probando la
   sincronización online con un amigo. Ver detalle en §13, Fase 9.
