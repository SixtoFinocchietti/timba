-- Cancelación de una Timba de Pool antes de crear la partida.
-- Ambos jugadores pueden cancelar la sala; no dependemos de un broadcast
-- recibido por el host, que puede estar offline o con la app suspendida.

create or replace function public.cancelar_timba_pool_previa(p_timba_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_timba timbas%rowtype;
begin
  select * into v_timba from timbas where id = p_timba_id;
  if not found or v_timba.estado <> 'activa' then
    return;
  end if;

  if auth.uid() <> v_timba.creador_id and not exists (
    select 1 from mensajes m
    where m.timba_id = v_timba.id
      and m.receptor_id = auth.uid()
  ) then
    raise exception 'NO_AUTORIZADO';
  end if;

  if exists (select 1 from partidas_pool p where p.timba_id = v_timba.id) then
    raise exception 'PARTIDA_YA_INICIADA';
  end if;

  update timbas set estado = 'cancelada' where id = v_timba.id;
end;
$$;

revoke all on function public.cancelar_timba_pool_previa(uuid) from public, anon;
grant execute on function public.cancelar_timba_pool_previa(uuid) to authenticated;
