-- 016: Truco Parejas (2v2)
-- Agrega jugador3/jugador4 + modo a truco_partidas, extiende RLS a los 4 jugadores
-- (con chequeo de bloqueos entre todos los pares) y crea el RPC aceptar_truco
-- para que las aceptaciones sean atómicas (el último que acepta reparte).

alter table truco_partidas
  add column if not exists modo text not null default 'mano',
  add column if not exists jugador3 uuid references usuarios(id) on delete cascade,
  add column if not exists jugador4 uuid references usuarios(id) on delete cascade,
  add column if not exists aceptados uuid[] not null default '{}',
  add column if not exists equipo_ganador text;

alter table truco_partidas
  add constraint truco_partidas_modo_check check (modo in ('mano', 'parejas'));

-- En 'mano' no hay jugador3/4; en 'parejas' son obligatorios.
-- Equipos: jugador1 + jugador3 (asientos 0 y 2) vs jugador2 + jugador4 (asientos 1 y 3).
alter table truco_partidas
  add constraint truco_partidas_modo_jugadores_check check (
    (modo = 'mano' and jugador3 is null and jugador4 is null)
    or (modo = 'parejas' and jugador3 is not null and jugador4 is not null)
  );

alter table truco_partidas
  add constraint truco_partidas_equipo_ganador_check check (equipo_ganador in ('p1', 'p2'));

create index if not exists idx_truco_partidas_jugador2 on truco_partidas(jugador2);
create index if not exists idx_truco_partidas_jugador3 on truco_partidas(jugador3) where jugador3 is not null;
create index if not exists idx_truco_partidas_jugador4 on truco_partidas(jugador4) where jugador4 is not null;

-- ── RLS: los 4 jugadores ──────────────────────────────────────────────────────

drop policy if exists "truco_select_jugadores" on truco_partidas;
create policy "truco_select_jugadores" on truco_partidas
  for select using (auth.uid() in (jugador1, jugador2, jugador3, jugador4));

drop policy if exists "truco_update_jugadores" on truco_partidas;
create policy "truco_update_jugadores" on truco_partidas
  for update using (auth.uid() in (jugador1, jugador2, jugador3, jugador4));

-- Cualquier jugador puede rechazar/cancelar mientras la mesa espera (borra la partida para todos).
drop policy if exists "truco_delete_jugadores" on truco_partidas;
create policy "truco_delete_jugadores" on truco_partidas
  for delete using (
    auth.uid() in (jugador1, jugador2, jugador3, jugador4)
    and estado = 'esperando'
  );

drop policy if exists "truco_insert_jugador1" on truco_partidas;
create policy "truco_insert_jugador1" on truco_partidas
  for insert with check (
    auth.uid() = jugador1
    and jugador1 <> jugador2
    and not hay_bloqueo(jugador1, jugador2)
    and (
      modo = 'mano'
      or (
        jugador3 is not null and jugador4 is not null
        and jugador3 not in (jugador1, jugador2, jugador4)
        and jugador4 not in (jugador1, jugador2)
        and not hay_bloqueo(jugador1, jugador3)
        and not hay_bloqueo(jugador1, jugador4)
        and not hay_bloqueo(jugador2, jugador3)
        and not hay_bloqueo(jugador2, jugador4)
        and not hay_bloqueo(jugador3, jugador4)
      )
    )
  );

-- ── RPC: aceptación atómica ───────────────────────────────────────────────────
-- Corre como el usuario (security invoker): la RLS ya limita a jugadores de la partida.
-- Devuelve { aceptados, completo }: si completo=true, el que llamó es el último en
-- aceptar y le toca generar el reparto inicial (update guardado por estado='esperando').

create or replace function aceptar_truco(p_partida uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v truco_partidas%rowtype;
  v_uid uuid := auth.uid();
  v_necesarios int;
begin
  if v_uid is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  select * into v from truco_partidas where id = p_partida for update;
  if not found or v.estado <> 'esperando' then
    raise exception 'PARTIDA_NO_DISPONIBLE';
  end if;

  if v_uid is distinct from v.jugador2
     and v_uid is distinct from v.jugador3
     and v_uid is distinct from v.jugador4 then
    raise exception 'NO_INVITADO';
  end if;

  if not (v_uid = any(v.aceptados)) then
    update truco_partidas
      set aceptados = aceptados || v_uid, updated_at = now()
      where id = p_partida
      returning * into v;
  end if;

  v_necesarios := case v.modo when 'parejas' then 3 else 1 end;
  return jsonb_build_object(
    'aceptados', to_jsonb(v.aceptados),
    'completo', coalesce(array_length(v.aceptados, 1), 0) >= v_necesarios
  );
end;
$$;

revoke execute on function aceptar_truco(uuid) from public, anon;
grant execute on function aceptar_truco(uuid) to authenticated;
