-- ─── 013_perfil_timbas_codigo.sql ─────────────────────────────────────────────
-- Fix: unirse a una timba desde el perfil de un amigo.
-- Desde la migración 010 las timbas ajenas no son legibles por id (correcto),
-- así que la lista "Timbas activas" del perfil navegaba a una pantalla con error.
-- Ahora perfil_publico() incluye codigo_invitacion en cada timba (solo se expone
-- a quien la privacidad del dueño ya le permite ver la lista) y el cliente navega
-- por el flujo de invitación (/join/{codigo}) en lugar del detalle directo.

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
