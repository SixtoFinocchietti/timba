-- Pool + Timba: sacar la votación humana por completo (feedback de juego
-- real, ago 2026). El diseño anterior (migración 021) exigía que cada
-- jugador votara por sí mismo al tocar "Listo" en la sala — esa escritura
-- desde 2 clientes en 2 momentos distintos resultó frágil (se comprobó con
-- datos reales: timbas cerradas con 0 votos registrados). Ahora
-- cerrar_timba_juego() anota a los DOS jugadores atómicamente, en la misma
-- transacción que cierra la timba — nadie vota nunca, 0% intervención.
--
-- De paso: el monto ya no se busca en participantes (podía no existir) sino
-- que se lee directo de timbas.monto_minimo — un solo monto fijo, como ya
-- se decidió en la Fase 9-bis.

create or replace function public.cerrar_timba_juego(p_partida_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_partida         partidas_pool%rowtype;
  v_timba           timbas%rowtype;
  v_ganador_id      uuid;
  v_perdedor_id     uuid;
  v_ganador_nombre  text;
  v_perdedor_nombre text;
begin
  select * into v_partida from partidas_pool where id = p_partida_id;
  if not found or v_partida.timba_id is null then
    return;
  end if;

  if auth.uid() <> v_partida.host_id and auth.uid() <> v_partida.invitado_id then
    raise exception 'No autorizado';
  end if;

  select * into v_timba from timbas where id = v_partida.timba_id;
  if not found or v_timba.estado <> 'activa' then
    return; -- idempotente: ya resuelta o cancelada
  end if;

  -- desconexión sostenida: se cancela, nadie debe nada
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

  select nombre into v_ganador_nombre  from usuarios where id = v_ganador_id;
  select nombre into v_perdedor_nombre from usuarios where id = v_perdedor_id;

  -- registro final sin voto humano: cada jugador queda anotado con SU
  -- propia opción (así perfil_publico() sigue calculando ganaste/perdiste
  -- exactamente igual que con una timba votada a mano — no hace falta
  -- tocar esa función más que la lista de "activas", ver abajo).
  insert into participantes (timba_id, usuario_id, opcion_elegida, monto)
  values
    (v_timba.id, v_ganador_id,  'Gana ' || coalesce(v_ganador_nombre, '?'),  case when v_timba.tipo = 'monetaria' then v_timba.monto_minimo else null end),
    (v_timba.id, v_perdedor_id, 'Gana ' || coalesce(v_perdedor_nombre, '?'), case when v_timba.tipo = 'monetaria' then v_timba.monto_minimo else null end)
  on conflict (timba_id, usuario_id) do update set opcion_elegida = excluded.opcion_elegida, monto = excluded.monto;

  update timbas
  set estado = 'cerrada', resultado_ganador = 'Gana ' || coalesce(v_ganador_nombre, '?'), cerrada_en = now()
  where id = v_timba.id;

  if v_timba.tipo = 'monetaria' and v_timba.monto_minimo is not null and v_timba.monto_minimo > 0 then
    insert into deudas (timba_id, acreedor_id, deudor_id, monto, estado)
    values (v_timba.id, v_ganador_id, v_perdedor_id, v_timba.monto_minimo, 'pendiente');
  end if;
end;
$$;

revoke all on function public.cerrar_timba_juego(uuid) from public, anon;
grant execute on function public.cerrar_timba_juego(uuid) to authenticated;

-- perfil_publico(): las timbas vinculadas a una partida (partidas_pool.timba_id)
-- no deben aparecer en "tus timbas activas" mientras se juegan — se resuelven
-- solas y recién ahí importan, en el historial (que no se toca: esa sub-query
-- ya funciona igual una vez que hay filas en participantes, sean puestas a
-- mano o por cerrar_timba_juego()).
create or replace function public.perfil_publico(p_usuario_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_viewer    uuid := auth.uid();
  v_priv      jsonb;
  v_es_amigo  boolean;
  v_timbas    jsonb := null;
  v_items     jsonb := null;
  v_historial jsonb := null;
  v_stats     jsonb := null;
  v_ganadas   int;
  v_perdidas  int;
  v_total     int;
begin
  if v_viewer is null then
    raise exception 'No autorizado';
  end if;

  select coalesce(privacidad, '{}'::jsonb) into v_priv
  from usuarios where id = p_usuario_id;
  if not found then
    return null;
  end if;

  v_es_amigo := p_usuario_id = v_viewer or exists (
    select 1 from amistades
    where estado = 'aceptada'
      and ((solicitante_id = v_viewer and receptor_id = p_usuario_id)
        or (solicitante_id = p_usuario_id and receptor_id = v_viewer))
  );

  if privacidad_permite(coalesce(v_priv->>'timbas', 'amigos'), v_es_amigo) then
    select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_timbas
    from (
      select distinct t.id, t.titulo, t.tipo, t.estado, t.codigo_invitacion
      from timbas t
      left join participantes p on p.timba_id = t.id and p.usuario_id = p_usuario_id
      where t.estado <> 'cerrada'
        and (t.creador_id = p_usuario_id or p.usuario_id is not null)
        and not exists (select 1 from partidas_pool pp where pp.timba_id = t.id)
    ) q;
  end if;

  if privacidad_permite(coalesce(v_priv->>'historial', 'amigos'), v_es_amigo)
     or privacidad_permite(coalesce(v_priv->>'margenes', 'todos'), v_es_amigo) then
    select
      coalesce(jsonb_agg(to_jsonb(q) order by coalesce(q.cerrada_en, q.created_at) desc), '[]'::jsonb),
      count(*) filter (where q.resultado = 'ganaste'),
      count(*) filter (where q.resultado = 'perdiste'),
      count(*)
    into v_items, v_ganadas, v_perdidas, v_total
    from (
      select t.id, t.titulo, t.created_at, t.cerrada_en,
        case
          when p.opcion_elegida is not null and t.resultado_ganador is not null then
            case when p.opcion_elegida = t.resultado_ganador then 'ganaste' else 'perdiste' end
          else 'neutral'
        end as resultado
      from timbas t
      left join participantes p on p.timba_id = t.id and p.usuario_id = p_usuario_id
      where t.estado = 'cerrada'
        and (t.creador_id = p_usuario_id or p.usuario_id is not null)
    ) q;

    if privacidad_permite(coalesce(v_priv->>'historial', 'amigos'), v_es_amigo) then
      v_historial := v_items;
    end if;
    if privacidad_permite(coalesce(v_priv->>'margenes', 'todos'), v_es_amigo) then
      v_stats := jsonb_build_object('ganadas', v_ganadas, 'perdidas', v_perdidas, 'total', v_total);
    end if;
  end if;

  return jsonb_build_object(
    'es_amigo', v_es_amigo,
    'timbas', v_timbas,
    'historial', v_historial,
    'stats', v_stats
  );
end;
$$;

revoke all on function public.perfil_publico(uuid) from public, anon;
grant execute on function public.perfil_publico(uuid) to authenticated;
