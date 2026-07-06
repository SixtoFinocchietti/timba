-- ─── 015_bloqueo_conserva_amistad.sql ─────────────────────────────────────────
-- Cambio de modelo: bloquear YA NO elimina la amistad — la "congela".
-- Mientras dura el bloqueo, el par no cuenta como amigos (privacidad, perfil)
-- y no pueden chatear ni invitarse; al desbloquear todo vuelve a la normalidad.
-- El cliente deja de borrar la fila de amistades al bloquear.

-- son_amigos: un par bloqueado no cuenta como amigos
create or replace function public.son_amigos(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from amistades
    where estado = 'aceptada'
      and ((solicitante_id = p_a and receptor_id = p_b)
        or (solicitante_id = p_b and receptor_id = p_a))
  )
  and not exists (
    select 1 from bloqueados
    where (bloqueador_id = p_a and bloqueado_id = p_b)
       or (bloqueador_id = p_b and bloqueado_id = p_a)
  );
$$;

-- perfil_publico: usa son_amigos (que ahora contempla bloqueos)
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

  v_es_amigo := p_usuario_id = v_viewer or son_amigos(v_viewer, p_usuario_id);

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

-- Truco: no se puede crear una partida con alguien bloqueado
drop policy if exists "truco_insert_jugador1" on truco_partidas;
create policy "truco_insert_jugador1" on truco_partidas
  for insert with check (
    auth.uid() = jugador1
    and jugador1 <> jugador2
    and not hay_bloqueo(jugador1, jugador2)
  );
