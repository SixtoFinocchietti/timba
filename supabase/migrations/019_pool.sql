-- Pool 8-Ball online (2 jugadores). Modelo "autoridad del tirador" (spec D4):
-- por cada tiro viaja el INPUT (ángulo, fuerza, efectos, posición de la blanca
-- si hubo bola en mano) + el SNAPSHOT final; el rival re-simula la animación
-- con el mismo motor determinista y aplica el snapshot como verdad — si hubo
-- divergencia flotante entre plataformas, la corrección es subpíxel.
-- Estado completo en una fila sincronizada por Realtime, igual que
-- partidas_blackjack_clasico (018), con el estado de juego en jsonb como
-- truco_partidas. Escribe solo el cliente al que le toca tirar.

CREATE TABLE IF NOT EXISTS partidas_pool (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id       UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  invitado_id   UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  -- para listados; el detalle (turno, grupos, la 8) vive en estado_juego
  fase          TEXT NOT NULL DEFAULT 'en_juego'
                CHECK (fase IN ('en_juego','terminada','abandonada')),

  -- mesa tras el último tiro: [{n,x,y,viva}] — snapshot autoritativo
  estado_bolas  JSONB NOT NULL,
  -- EstadoJuego de reglas.ts (el host es SIEMPRE el jugador 'A')
  estado_juego  JSONB NOT NULL,
  -- { input: Tiro, num: int } — el rival lo re-simula para animar el tiro
  ultimo_tiro   JSONB,
  num_tiro      INTEGER NOT NULL DEFAULT 0,

  -- serie: 1 = partida suelta, 3 = mejor de 3 (decisión v1)
  serie_max          INTEGER NOT NULL DEFAULT 1 CHECK (serie_max IN (1,3)),
  victorias_host     INTEGER NOT NULL DEFAULT 0,
  victorias_invitado INTEGER NOT NULL DEFAULT 0,
  rompe_host         BOOLEAN NOT NULL DEFAULT true, -- quién rompe el juego actual

  -- 0 = sin límite (decisión v1: configurable al crear)
  timer_seg     INTEGER NOT NULL DEFAULT 45 CHECK (timer_seg IN (0,30,45,60)),
  ganador_serie TEXT CHECK (ganador_serie IN ('host','invitado')),

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Solo los participantes pueden leer/escribir su partida
ALTER TABLE partidas_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pool_participantes"
  ON partidas_pool FOR ALL
  USING (host_id = auth.uid() OR invitado_id = auth.uid());

-- Realtime para sincronizar entre jugadores
ALTER PUBLICATION supabase_realtime ADD TABLE partidas_pool;

-- Nuevo tipo de mensaje: invitación de Pool desde el chat
ALTER TABLE mensajes DROP CONSTRAINT IF EXISTS mensajes_tipo_check;
ALTER TABLE mensajes ADD CONSTRAINT mensajes_tipo_check
  CHECK (tipo IN ('texto', 'imagen', 'gif', 'invitacion_timba',
                  'invitacion_poker', 'invitacion_truco', 'invitacion_blackjack',
                  'invitacion_pool'));
