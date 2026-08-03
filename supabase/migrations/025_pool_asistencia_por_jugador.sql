-- Fase 8.2 del roadmap: hándicap por jugador en partidas online. El host
-- fija, al armar la invitación, el nivel de asistencia de cada asiento
-- (el suyo y el del invitado) — así dos amigos de nivel distinto timbean
-- parejo. Se guarda en la fila para que quede fijo durante todo el partido
-- y sea visible para ambos en la sala antes de arrancar.

alter table public.partidas_pool
  add column asistencia_host text not null default 'normal'
    check (asistencia_host in ('sin', 'baja', 'normal', 'maxima')),
  add column asistencia_invitado text not null default 'normal'
    check (asistencia_invitado in ('sin', 'baja', 'normal', 'maxima'));
