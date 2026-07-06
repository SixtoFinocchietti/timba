-- Agrega 'invitacion_poker' al constraint de tipo en mensajes
ALTER TABLE mensajes
  DROP CONSTRAINT IF EXISTS mensajes_tipo_check;

ALTER TABLE mensajes
  ADD CONSTRAINT mensajes_tipo_check
    CHECK (tipo IN ('texto', 'imagen', 'gif', 'invitacion_timba', 'invitacion_poker'));
