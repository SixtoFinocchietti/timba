-- Pool + Timba: dos bugs encontrados jugando en vivo con un amigo (ago 2026).
--
-- 1) validar_update_timba() (migración 010) solo permitía las transiciones
--    del flujo viejo por voto (activa->en_disputa->cerrada/activa). Nunca se
--    actualizó para el flujo nuevo de cerrar_timba_juego() (migración 022),
--    que hace activa->cerrada y activa->cancelada directo. El trigger
--    rechazaba esos UPDATE con TRANSICION_INVALIDA, la función abortaba
--    (rollback de toda la transacción) y el cliente nunca revisaba el
--    .error del rpc() — quedaba en silencio total: la timba seguía 'activa'
--    para siempre, sin participantes ni deudas. Se comprobó con datos
--    reales de dos partidas jugadas hoy.
-- 2) timbas_select exige creador_id = auth.uid() o auth_es_participante(id).
--    Desde que se sacó el auto-voto (migración 022 / R2) el invitado no
--    tiene fila en participantes hasta que la partida termina, así que en
--    la sala (antes/durante el juego) no cumple ninguna de las dos
--    condiciones y no puede leer la timba — solo el host (creador) podía
--    verla. Se agrega una policy basada en mensajes.timba_id: el invitado
--    ya tiene acceso de lectura a su propia fila de mensajes (recibió la
--    invitación ahí), así que puede leer la timba a la que esa invitación
--    apunta.

create or replace function public.validar_update_timba()
returns trigger
language plpgsql security definer set search_path = public as $$
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
      (old.estado = 'activa' and new.estado in ('en_disputa', 'cerrada', 'cancelada'))
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

create policy "timbas_select_invitado_pool" on public.timbas for select using (
  exists (
    select 1 from public.mensajes m
    where m.timba_id = timbas.id
      and m.receptor_id = auth.uid()
  )
);
