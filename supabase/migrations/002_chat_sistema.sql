-- ─── 002_chat_sistema.sql ───────────────────────────────────────────────────
-- Ejecutar en Supabase → SQL Editor

-- 1. Amistades: preferencias por usuario (favorito y silenciado son independientes para cada lado)
ALTER TABLE amistades ADD COLUMN IF NOT EXISTS favorito_solicitante  boolean NOT NULL DEFAULT false;
ALTER TABLE amistades ADD COLUMN IF NOT EXISTS favorito_receptor      boolean NOT NULL DEFAULT false;
ALTER TABLE amistades ADD COLUMN IF NOT EXISTS silenciado_solicitante boolean NOT NULL DEFAULT false;
ALTER TABLE amistades ADD COLUMN IF NOT EXISTS silenciado_receptor    boolean NOT NULL DEFAULT false;

-- 2. Mensajes
CREATE TABLE IF NOT EXISTS mensajes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emisor_id   uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  receptor_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  contenido   text,
  tipo        text NOT NULL DEFAULT 'texto'
              CHECK (tipo IN ('texto', 'imagen', 'gif', 'invitacion_timba')),
  timba_id    uuid REFERENCES timbas(id) ON DELETE SET NULL,
  imagen_url  text,
  gif_url     text,
  leido       boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- 3. Reacciones a mensajes (una por usuario por mensaje)
CREATE TABLE IF NOT EXISTS reacciones_mensajes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensaje_id uuid NOT NULL REFERENCES mensajes(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  emoji      text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(mensaje_id, usuario_id)
);

-- 4. Usuarios bloqueados
CREATE TABLE IF NOT EXISTS bloqueados (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bloqueador_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  bloqueado_id  uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(bloqueador_id, bloqueado_id)
);

-- 5. Reportes (revisión manual)
CREATE TABLE IF NOT EXISTS reportes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reportador_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  reportado_id  uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  motivo        text,
  created_at    timestamptz DEFAULT now()
);

-- 6. Habilitar RLS
ALTER TABLE mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reacciones_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloqueados ENABLE ROW LEVEL SECURITY;
ALTER TABLE reportes ENABLE ROW LEVEL SECURITY;

-- Políticas: mensajes
CREATE POLICY "mensajes_select" ON mensajes FOR SELECT
  USING (auth.uid() = emisor_id OR auth.uid() = receptor_id);

CREATE POLICY "mensajes_insert" ON mensajes FOR INSERT
  WITH CHECK (auth.uid() = emisor_id);

CREATE POLICY "mensajes_update" ON mensajes FOR UPDATE
  USING (auth.uid() = receptor_id);

-- Políticas: reacciones
CREATE POLICY "reacciones_select" ON reacciones_mensajes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mensajes m
      WHERE m.id = reacciones_mensajes.mensaje_id
        AND (m.emisor_id = auth.uid() OR m.receptor_id = auth.uid())
    )
  );

CREATE POLICY "reacciones_insert" ON reacciones_mensajes FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "reacciones_delete" ON reacciones_mensajes FOR DELETE
  USING (auth.uid() = usuario_id);

-- Políticas: bloqueados
CREATE POLICY "bloqueados_select" ON bloqueados FOR SELECT
  USING (auth.uid() = bloqueador_id);

CREATE POLICY "bloqueados_insert" ON bloqueados FOR INSERT
  WITH CHECK (auth.uid() = bloqueador_id);

CREATE POLICY "bloqueados_delete" ON bloqueados FOR DELETE
  USING (auth.uid() = bloqueador_id);

-- Políticas: reportes
CREATE POLICY "reportes_insert" ON reportes FOR INSERT
  WITH CHECK (auth.uid() = reportador_id);

-- 7. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_mensajes_conv
  ON mensajes(emisor_id, receptor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mensajes_no_leidos
  ON mensajes(receptor_id, leido) WHERE leido = false;

CREATE INDEX IF NOT EXISTS idx_reacciones_mensaje
  ON reacciones_mensajes(mensaje_id);

-- 8. Habilitar Realtime para los cambios en tiempo real
ALTER PUBLICATION supabase_realtime ADD TABLE mensajes;
ALTER PUBLICATION supabase_realtime ADD TABLE reacciones_mensajes;
