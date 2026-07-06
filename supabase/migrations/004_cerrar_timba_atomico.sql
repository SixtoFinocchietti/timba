-- Función que verifica si todos los participantes confirmaron el resultado
-- y, si es así, cierra la timba y genera las deudas en una sola transacción.
-- Retorna: 'cerrada' si se cerró ahora, 'en_disputa' si faltan confirmaciones.
create or replace function verificar_y_cerrar_timba(p_timba_id uuid)
returns text language plpgsql security definer as $$
declare
  v_timba        timbas%rowtype;
  v_pendientes   int;
  v_total_gan    numeric;
begin
  select * into v_timba from timbas where id = p_timba_id;

  if not found then
    raise exception 'Timba no encontrada';
  end if;

  -- Solo actúa sobre timbas en disputa
  if v_timba.estado != 'en_disputa' then
    return v_timba.estado;
  end if;

  -- Solo participantes autorizados pueden invocar esta función
  if not exists (
    select 1 from participantes
    where timba_id = p_timba_id and usuario_id = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  -- Verificar si quedan participantes sin confirmar
  select count(*) into v_pendientes
  from participantes
  where timba_id = p_timba_id
    and (confirmacion_resultado is null or confirmacion_resultado = false);

  if v_pendientes > 0 then
    return 'en_disputa';
  end if;

  -- ── Todos confirmaron: cerrar timba ──────────────────────────────────────
  update timbas
  set estado = 'cerrada', cerrada_en = now()
  where id = p_timba_id;

  -- ── Generar deudas para timbas monetarias (misma transacción) ─────────────
  if v_timba.tipo = 'monetaria' then
    select coalesce(sum(monto), 0) into v_total_gan
    from participantes
    where timba_id = p_timba_id
      and opcion_elegida = v_timba.resultado_ganador
      and monto > 0;

    if v_total_gan > 0 then
      insert into deudas (timba_id, acreedor_id, deudor_id, monto, estado)
      select
        p_timba_id,
        g.usuario_id,
        p.usuario_id,
        round((p.monto * g.monto / v_total_gan)::numeric, 2),
        'pendiente'
      from
        (select usuario_id, monto from participantes
         where timba_id = p_timba_id
           and opcion_elegida != v_timba.resultado_ganador
           and monto > 0) p
        cross join
        (select usuario_id, monto from participantes
         where timba_id = p_timba_id
           and opcion_elegida = v_timba.resultado_ganador
           and monto > 0) g
      where round((p.monto * g.monto / v_total_gan)::numeric, 2) > 0;
    end if;
  end if;

  return 'cerrada';
end;
$$;

-- Permitir que usuarios autenticados ejecuten la función
grant execute on function verificar_y_cerrar_timba(uuid) to authenticated;
