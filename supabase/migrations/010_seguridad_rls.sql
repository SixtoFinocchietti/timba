-- ─── 010_seguridad_rls.sql ────────────────────────────────────────────────────
-- Endurecimiento de seguridad a nivel de base de datos:
--   1. usuarios: datos sensibles (email, teléfono, redes, push_token) solo
--      visibles para el dueño; el resto de la app usa la vista usuarios_publicos.
--   2. timbas: la búsqueda por código pasa a un RPC; se elimina la política que
--      exponía todas las timbas a cualquier usuario logueado.
--   3. perfil_publico(): stats/historial de otros usuarios con la privacidad
--      aplicada en el servidor.
--   4. Bloqueos aplicados en la BD: un bloqueado no puede mandar mensajes ni
--      solicitudes de amistad.
--   5. Triggers de validación: transiciones de estado de deudas/timbas,
--      inmutabilidad del voto, cupo y límite de unión, montos min/max.
--   6. Hardening de funciones existentes (search_path + revoke a anon).
--   7. Storage: los buckets públicos dejan de permitir listar archivos.

-- ═══ 1. usuarios ══════════════════════════════════════════════════════════════

drop policy if exists "usuarios_select" on usuarios;
create policy "usuarios_select" on usuarios
  for select using (auth.uid() = id);

-- Vista con solo los campos públicos. Corre con permisos del owner (postgres),
-- salteando a propósito el RLS de usuarios: eso es lo que la hace funcionar.
-- El linter de Supabase la va a marcar como "security definer view" — es intencional.
create or replace view public.usuarios_publicos
with (security_invoker = false) as
  select id, nombre, apodo, avatar_url, privacidad, created_at
  from usuarios;

revoke all on public.usuarios_publicos from public, anon;
grant select on public.usuarios_publicos to authenticated;

-- ═══ 2. timbas: búsqueda por código solo vía RPC ══════════════════════════════

drop policy if exists "timbas_join_select" on timbas;

create or replace function public.buscar_timba_por_codigo(p_codigo text)
returns setof timbas
language sql security definer set search_path = public as $$
  select * from timbas
  where codigo_invitacion = p_codigo
    and auth.uid() is not null;
$$;

revoke all on function public.buscar_timba_por_codigo(text) from public, anon;
grant execute on function public.buscar_timba_por_codigo(text) to authenticated;

-- ═══ 3. perfil público con privacidad server-side ═════════════════════════════

create or replace function public.privacidad_permite(p_nivel text, p_es_amigo boolean)
returns boolean language sql immutable set search_path = public as $$
  select case p_nivel
    when 'todos' then true
    when 'amigos' then p_es_amigo
    else false
  end;
$$;

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

  -- Timbas activas (default: amigos)
  if privacidad_permite(coalesce(v_priv->>'timbas', 'amigos'), v_es_amigo) then
    select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_timbas
    from (
      select distinct t.id, t.titulo, t.tipo, t.estado
      from timbas t
      left join participantes p on p.timba_id = t.id and p.usuario_id = p_usuario_id
      where t.estado <> 'cerrada'
        and (t.creador_id = p_usuario_id or p.usuario_id is not null)
    ) q;
  end if;

  -- Historial y estadísticas comparten la misma consulta base
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

-- ═══ 4. Bloqueos aplicados en la BD ═══════════════════════════════════════════

-- SECURITY DEFINER porque la tabla bloqueados solo es visible para el bloqueador;
-- las políticas que la consultan necesitan ver ambas direcciones.
create or replace function public.hay_bloqueo(p_usuario1 uuid, p_usuario2 uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from bloqueados
    where (bloqueador_id = p_usuario1 and bloqueado_id = p_usuario2)
       or (bloqueador_id = p_usuario2 and bloqueado_id = p_usuario1)
  );
$$;

revoke all on function public.hay_bloqueo(uuid, uuid) from public, anon;
grant execute on function public.hay_bloqueo(uuid, uuid) to authenticated;

drop policy if exists "mensajes_insert" on mensajes;
create policy "mensajes_insert" on mensajes
  for insert with check (
    auth.uid() = emisor_id
    and not hay_bloqueo(emisor_id, receptor_id)
  );

drop policy if exists "amistades_insert" on amistades;
create policy "amistades_insert" on amistades
  for insert with check (
    auth.uid() = solicitante_id
    and not hay_bloqueo(solicitante_id, receptor_id)
  );

-- ═══ 5. mensajes: el receptor solo puede marcar leído ═════════════════════════

revoke update on mensajes from authenticated, anon;
grant update (leido) on mensajes to authenticated;

-- ═══ 6. amistades: ambos lados actualizan sus prefs; solo el receptor acepta ══
-- (además arregla un bug: la política vieja solo dejaba actualizar al receptor,
--  así que favorito/silenciado del lado solicitante fallaba en silencio)

drop policy if exists "amistades_update" on amistades;
create policy "amistades_update" on amistades
  for update using (auth.uid() = solicitante_id or auth.uid() = receptor_id);

create or replace function public.validar_update_amistad()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.solicitante_id is distinct from old.solicitante_id
     or new.receptor_id is distinct from old.receptor_id then
    raise exception 'CAMPOS_INMUTABLES';
  end if;
  if new.estado is distinct from old.estado then
    if not (auth.uid() = old.receptor_id and old.estado = 'pendiente' and new.estado = 'aceptada') then
      raise exception 'TRANSICION_INVALIDA';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validar_update_amistad() from public, anon, authenticated;

drop trigger if exists trg_validar_update_amistad on amistades;
create trigger trg_validar_update_amistad
  before update on amistades
  for each row execute function public.validar_update_amistad();

-- ═══ 7. participantes: reglas de negocio en la BD ═════════════════════════════

-- Solo se pueden tocar estas columnas por API:
revoke update on participantes from authenticated, anon;
grant update (opcion_elegida, monto, confirmacion_resultado) on participantes to authenticated;

create or replace function public.validar_participante()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_timba timbas%rowtype;
  v_count int;
begin
  select * into v_timba from timbas where id = new.timba_id;
  if not found then
    raise exception 'Timba no encontrada';
  end if;

  if tg_op = 'INSERT' then
    if v_timba.estado <> 'activa' then
      raise exception 'TIMBA_NO_ACTIVA';
    end if;
    if v_timba.limite_union is not null and now() > v_timba.limite_union then
      raise exception 'LIMITE_VENCIDO';
    end if;
    if v_timba.max_participantes is not null then
      select count(*) into v_count from participantes where timba_id = new.timba_id;
      if v_count >= v_timba.max_participantes then
        raise exception 'TIMBA_LLENA';
      end if;
    end if;
  else
    -- El voto es inmutable una vez elegido
    if old.opcion_elegida is not null and new.opcion_elegida is distinct from old.opcion_elegida then
      raise exception 'VOTO_INMUTABLE';
    end if;
    -- Solo se vota/aporta con la timba activa
    if v_timba.estado <> 'activa'
       and (new.opcion_elegida is distinct from old.opcion_elegida
         or new.monto is distinct from old.monto) then
      raise exception 'TIMBA_NO_ACTIVA';
    end if;
    -- Solo se confirma un resultado cuando hay una propuesta
    if new.confirmacion_resultado is distinct from old.confirmacion_resultado
       and v_timba.estado <> 'en_disputa' then
      raise exception 'SIN_PROPUESTA';
    end if;
  end if;

  if new.opcion_elegida is not null and not (new.opcion_elegida = any (v_timba.opciones)) then
    raise exception 'OPCION_INVALIDA';
  end if;

  if v_timba.tipo = 'monetaria' and new.monto is not null then
    if (v_timba.monto_minimo is not null and new.monto < v_timba.monto_minimo)
       or (v_timba.monto_maximo is not null and new.monto > v_timba.monto_maximo) then
      raise exception 'MONTO_FUERA_DE_RANGO';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validar_participante() from public, anon, authenticated;

drop trigger if exists trg_validar_participante on participantes;
create trigger trg_validar_participante
  before insert or update on participantes
  for each row execute function public.validar_participante();

-- ═══ 8. deudas: transiciones de estado válidas ════════════════════════════════
-- deudor:   pendiente → pago_informado
-- acreedor: pendiente/pago_informado → finalizada (o cancelada, para perdonarla)

create or replace function public.validar_update_deuda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.timba_id is distinct from old.timba_id
     or new.acreedor_id is distinct from old.acreedor_id
     or new.deudor_id is distinct from old.deudor_id
     or new.monto is distinct from old.monto
     or new.created_at is distinct from old.created_at then
    raise exception 'CAMPOS_INMUTABLES';
  end if;
  if new.estado is distinct from old.estado then
    if old.estado = 'pendiente' and new.estado = 'pago_informado'
       and auth.uid() = old.deudor_id then
      null;
    elsif old.estado in ('pendiente', 'pago_informado')
       and new.estado in ('finalizada', 'cancelada')
       and auth.uid() = old.acreedor_id then
      null;
    else
      raise exception 'TRANSICION_INVALIDA';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validar_update_deuda() from public, anon, authenticated;

drop trigger if exists trg_validar_update_deuda on deudas;
create trigger trg_validar_update_deuda
  before update on deudas
  for each row execute function public.validar_update_deuda();

-- ═══ 9. timbas: estados y campos protegidos ═══════════════════════════════════

create or replace function public.validar_update_timba()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.estado = 'cerrada' then
    raise exception 'TIMBA_CERRADA';
  end if;
  if new.creador_id is distinct from old.creador_id
     or new.codigo_invitacion is distinct from old.codigo_invitacion
     or new.tipo is distinct from old.tipo
     or new.opciones is distinct from old.opciones
     or new.created_at is distinct from old.created_at then
    raise exception 'CAMPOS_INMUTABLES';
  end if;
  if new.estado is distinct from old.estado then
    if not (
      (old.estado = 'activa' and new.estado = 'en_disputa')
      or (old.estado = 'en_disputa' and new.estado in ('cerrada', 'activa'))
    ) then
      raise exception 'TRANSICION_INVALIDA';
    end if;
  end if;
  if new.resultado_ganador is not null
     and not (new.resultado_ganador = any (new.opciones)) then
    raise exception 'OPCION_INVALIDA';
  end if;
  return new;
end;
$$;

revoke all on function public.validar_update_timba() from public, anon, authenticated;

drop trigger if exists trg_validar_update_timba on timbas;
create trigger trg_validar_update_timba
  before update on timbas
  for each row execute function public.validar_update_timba();

-- ═══ 10. Hardening de funciones existentes ════════════════════════════════════

alter function public.check_join_rate_limit() set search_path = public;
alter function public.verificar_y_cerrar_timba(uuid) set search_path = public;
alter function public.auth_es_participante(uuid) set search_path = public;
alter function public.delete_own_account() set search_path = public;

-- Los triggers no necesitan EXECUTE del caller; los RPC solo para authenticated.
revoke execute on function public.check_join_rate_limit() from public, anon, authenticated;
revoke execute on function public.verificar_y_cerrar_timba(uuid) from public, anon;
revoke execute on function public.auth_es_participante(uuid) from public, anon;
revoke execute on function public.delete_own_account() from public, anon;

-- ═══ 11. Storage: sin listado público de buckets ══════════════════════════════
-- Los buckets siguen siendo públicos (las URLs directas funcionan igual);
-- solo se elimina la posibilidad de LISTAR todos los archivos por API.
-- Se mantiene un SELECT del dueño para que el upsert del avatar siga funcionando.

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_owner_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);

drop policy if exists "chat_imagenes_read" on storage.objects;
create policy "chat_imagenes_owner_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-imagenes' and (storage.foldername(name))[1] = (auth.uid())::text);
