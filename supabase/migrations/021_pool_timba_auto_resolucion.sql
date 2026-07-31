-- Pool + Timba: pre-compromiso y auto-resolución (feedback de juego real, jul
-- 2026). Antes la Timba se creaba DESPUÉS de terminar el partido —
-- posibilita que el ganador "recién decida" crear la Timba porque ganó. Ahora
-- se crea ANTES (al invitar) y se resuelve sola cuando el partido termina:
-- el resultado sale del propio motor del juego, no es una afirmación que
-- alguien pueda inflar, así que auto-resolver acá es más seguro que en una
-- Timba genérica de "quién llega primero a casa" (que sigue siendo 100%
-- manual, esto NO cambia el modelo general de Timbas).

create or replace function public.cerrar_timba_juego(p_partida_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_partida        partidas_pool%rowtype;
  v_timba          timbas%rowtype;
  v_ganador_id     uuid;
  v_perdedor_id    uuid;
  v_ganador_nombre text;
  v_monto          numeric;
begin
  select * into v_partida from partidas_pool where id = p_partida_id;
  if not found or v_partida.timba_id is null then
    return;
  end if;

  -- solo un participante de ESTA partida puede disparar su resolución
  if auth.uid() <> v_partida.host_id and auth.uid() <> v_partida.invitado_id then
    raise exception 'No autorizado';
  end if;

  select * into v_timba from timbas where id = v_partida.timba_id;
  -- idempotente: si ya se resolvió (llamado por los dos clientes a la vez,
  -- o de nuevo por reconexión) no hace nada
  if not found or v_timba.estado <> 'activa' then
    return;
  end if;

  -- desconexión sostenida: se cancela, nadie debe nada — no es "decidir un
  -- ganador", es reconocer que la partida no se completó de verdad
  if v_partida.fase = 'abandonada' and v_partida.motivo_abandono = 'desconexion' then
    update timbas set estado = 'cancelada' where id = v_timba.id;
    return;
  end if;

  -- terminada normal, o abandono voluntario (eso sí cuenta como derrota real)
  if v_partida.ganador_serie is null
     or (v_partida.fase <> 'terminada' and not (v_partida.fase = 'abandonada' and v_partida.motivo_abandono = 'voluntario')) then
    return; -- todavía no hay resultado firme
  end if;

  v_ganador_id  := case when v_partida.ganador_serie = 'host' then v_partida.host_id else v_partida.invitado_id end;
  v_perdedor_id := case when v_ganador_id = v_partida.host_id then v_partida.invitado_id else v_partida.host_id end;

  select nombre into v_ganador_nombre from usuarios where id = v_ganador_id;

  update timbas
  set estado = 'cerrada', resultado_ganador = 'Gana ' || coalesce(v_ganador_nombre, '?'), cerrada_en = now()
  where id = v_timba.id;

  if v_timba.tipo = 'monetaria' then
    select monto into v_monto from participantes where timba_id = v_timba.id and usuario_id = v_perdedor_id;
    if v_monto is null then
      select monto into v_monto from participantes where timba_id = v_timba.id and usuario_id = v_ganador_id;
    end if;
    if v_monto is not null and v_monto > 0 then
      insert into deudas (timba_id, acreedor_id, deudor_id, monto, estado)
      values (v_timba.id, v_ganador_id, v_perdedor_id, v_monto, 'pendiente');
    end if;
  end if;
end;
$$;

revoke all on function public.cerrar_timba_juego(uuid) from public, anon;
grant execute on function public.cerrar_timba_juego(uuid) to authenticated;
