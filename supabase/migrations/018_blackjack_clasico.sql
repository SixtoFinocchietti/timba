-- Blackjack Clásico: 2 jugadores + dealer (Bot). Modelo "blackjack real + corona".
-- Cada jugador juega su mano contra el dealer con pagos estándar (1:1, BJ 3:2) y
-- además compiten por la corona (bonus = % de la apuesta del ganador que paga el
-- rival). Estado completo en una fila, sincronizado por Realtime, igual que
-- partidas_blackjack (017).

CREATE TABLE IF NOT EXISTS partidas_blackjack_clasico (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id            UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  invitado_id        UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  -- cartas codificadas 'Palo-Valor' (ej. 'S-A', 'H-10'), igual que el resto
  mazo               TEXT[] NOT NULL DEFAULT '{}',
  cartas_host        TEXT[] NOT NULL DEFAULT '{}',
  cartas_invitado    TEXT[] NOT NULL DEFAULT '{}',
  cartas_dealer      TEXT[] NOT NULL DEFAULT '{}',

  -- apuestas de la mano actual
  apuesta_host       INTEGER NOT NULL DEFAULT 0,
  apuesta_invitado   INTEGER NOT NULL DEFAULT 0,
  doblada_host       BOOLEAN NOT NULL DEFAULT false,
  doblada_invitado   BOOLEAN NOT NULL DEFAULT false,

  -- fichas (puntos de juego, sin dinero real)
  fichas_host        INTEGER NOT NULL DEFAULT 5000,
  fichas_invitado    INTEGER NOT NULL DEFAULT 5000,
  fichas_iniciales   INTEGER NOT NULL DEFAULT 5000,

  -- corona (opcional): bonus = corona_pct % de la apuesta del ganador
  corona_activa      BOOLEAN NOT NULL DEFAULT true,
  corona_pct         INTEGER NOT NULL DEFAULT 25,

  -- estado del juego
  fase               TEXT NOT NULL DEFAULT 'apuestas'
                     CHECK (fase IN ('apuestas','juego','resultado')),
  turno              TEXT CHECK (turno IN ('host','invitado','dealer')),
  -- true = el host juega primero esta mano; se alterna en cada mano nueva
  primero_es_host    BOOLEAN NOT NULL DEFAULT true,

  -- resultado de la mano (para mostrar igual en ambos clientes)
  resultado_host     TEXT CHECK (resultado_host IN ('blackjack','gana','push','pierde')),
  resultado_invitado TEXT CHECK (resultado_invitado IN ('blackjack','gana','push','pierde')),
  delta_host         INTEGER NOT NULL DEFAULT 0,
  delta_invitado     INTEGER NOT NULL DEFAULT 0,
  corona_ganador     TEXT CHECK (corona_ganador IN ('host','invitado')),
  corona_bonus       INTEGER NOT NULL DEFAULT 0,

  mano               INTEGER NOT NULL DEFAULT 1,

  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Solo los participantes pueden leer/escribir su partida
ALTER TABLE partidas_blackjack_clasico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blackjack_clasico_participantes"
  ON partidas_blackjack_clasico FOR ALL
  USING (host_id = auth.uid() OR invitado_id = auth.uid());

-- Realtime para sincronizar entre jugadores
ALTER PUBLICATION supabase_realtime ADD TABLE partidas_blackjack_clasico;
