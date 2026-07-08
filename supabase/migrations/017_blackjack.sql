-- Blackjack 1 vs 1: un jugador es la banca (rota en cada mano) y el otro apuesta.
-- Misma arquitectura que partidas_poker: estado completo en una fila,
-- sincronizado entre los dos clientes por Realtime.

CREATE TABLE IF NOT EXISTS partidas_blackjack (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id          UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  invitado_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  -- cartas codificadas como 'Palo-Valor' (ej. 'S-A', 'H-10'), igual que el póker
  mazo             TEXT[] NOT NULL DEFAULT '{}',
  cartas_jugador   TEXT[] NOT NULL DEFAULT '{}',
  cartas_banca     TEXT[] NOT NULL DEFAULT '{}',

  -- true = el host es la banca esta mano; se alterna en cada mano nueva
  banca_es_host    BOOLEAN NOT NULL DEFAULT true,

  -- estado del juego
  fase             TEXT NOT NULL DEFAULT 'apuesta'
                   CHECK (fase IN ('apuesta','jugador','resultado')),

  -- apuesta de la mano actual
  apuesta          INTEGER NOT NULL DEFAULT 0,
  doblada          BOOLEAN NOT NULL DEFAULT false,
  fichas_host      INTEGER NOT NULL DEFAULT 5000,
  fichas_invitado  INTEGER NOT NULL DEFAULT 5000,

  -- resultado de la mano
  ganador          TEXT CHECK (ganador IN ('jugador','banca','empate')),
  resultado        TEXT CHECK (resultado IN (
                     'blackjack','blackjack_banca','blackjack_empate',
                     'paso_jugador','paso_banca',
                     'mayor_jugador','mayor_banca','empate'
                   )),

  -- config
  fichas_iniciales INTEGER NOT NULL DEFAULT 5000,

  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Solo los participantes pueden leer/escribir su partida
ALTER TABLE partidas_blackjack ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blackjack_participantes"
  ON partidas_blackjack FOR ALL
  USING (host_id = auth.uid() OR invitado_id = auth.uid());

-- Realtime para sincronizar entre jugadores
ALTER PUBLICATION supabase_realtime ADD TABLE partidas_blackjack;

-- Nuevo tipo de mensaje para invitar a jugar al Blackjack desde el chat
ALTER TABLE mensajes
  DROP CONSTRAINT IF EXISTS mensajes_tipo_check;

ALTER TABLE mensajes
  ADD CONSTRAINT mensajes_tipo_check
    CHECK (tipo IN ('texto', 'imagen', 'gif', 'invitacion_timba',
                    'invitacion_poker', 'invitacion_truco', 'invitacion_blackjack'));
