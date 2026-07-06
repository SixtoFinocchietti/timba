CREATE TABLE IF NOT EXISTS partidas_poker (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id               UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  invitado_id           UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  -- cartas codificadas como 'Palo-Valor' (ej. 'S-A', 'H-10')
  mazo                  TEXT[] NOT NULL DEFAULT '{}',
  cartas_host           TEXT[] NOT NULL DEFAULT '{}',
  cartas_invitado       TEXT[] NOT NULL DEFAULT '{}',
  comunitarias          TEXT[] NOT NULL DEFAULT '{}',

  -- estado del juego
  fase                  TEXT NOT NULL DEFAULT 'pre_flop'
                        CHECK (fase IN ('pre_flop','flop','turn','river','showdown')),
  turno                 TEXT NOT NULL DEFAULT 'host'
                        CHECK (turno IN ('host','invitado')),

  -- apuestas
  bote                  INTEGER NOT NULL DEFAULT 0,
  apuesta_actual        INTEGER NOT NULL DEFAULT 0,
  fichas_host           INTEGER NOT NULL DEFAULT 5000,
  fichas_invitado       INTEGER NOT NULL DEFAULT 5000,
  apuesta_fase_host     INTEGER NOT NULL DEFAULT 0,
  apuesta_fase_invitado INTEGER NOT NULL DEFAULT 0,
  actuo_host            BOOLEAN NOT NULL DEFAULT false,
  actuo_invitado        BOOLEAN NOT NULL DEFAULT false,

  -- resultado
  ganador               TEXT CHECK (ganador IN ('host','invitado','empate')),
  manos_mostradas       BOOLEAN NOT NULL DEFAULT false,

  -- config
  fichas_iniciales      INTEGER NOT NULL DEFAULT 5000,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Solo los participantes pueden leer/escribir su partida
ALTER TABLE partidas_poker ENABLE ROW LEVEL SECURITY;

CREATE POLICY "poker_participantes"
  ON partidas_poker FOR ALL
  USING (host_id = auth.uid() OR invitado_id = auth.uid());

-- Realtime para sincronizar entre jugadores
ALTER PUBLICATION supabase_realtime ADD TABLE partidas_poker;
