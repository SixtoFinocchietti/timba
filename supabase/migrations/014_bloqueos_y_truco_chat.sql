-- ─── 014_bloqueos_y_truco_chat.sql ────────────────────────────────────────────
--   1. No se puede bloquear a alguien si hay deudas pendientes entre ambos
--      (en cualquier dirección).
--   2. estado_bloqueo(otro): le dice al chat si hay bloqueo y de qué lado,
--      para mostrar el aviso "te bloqueó" / "lo bloqueaste".
--   3. Nuevo tipo de mensaje 'invitacion_truco' para invitar a jugar al Truco
--      desde el chat.

-- ═══ 1. Bloqueo prohibido con deudas activas ══════════════════════════════════

create or replace function public.validar_bloqueo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from deudas
    where estado in ('pendiente', 'pago_informado')
      and ((acreedor_id = new.bloqueador_id and deudor_id = new.bloqueado_id)
        or (acreedor_id = new.bloqueado_id and deudor_id = new.bloqueador_id))
  ) then
    raise exception 'DEUDAS_PENDIENTES';
  end if;
  return new;
end;
$$;

revoke all on function public.validar_bloqueo() from public, anon, authenticated;

drop trigger if exists trg_validar_bloqueo on bloqueados;
create trigger trg_validar_bloqueo
  before insert on bloqueados
  for each row execute function public.validar_bloqueo();

-- ═══ 2. Estado de bloqueo consultable ═════════════════════════════════════════
-- SECURITY DEFINER porque el bloqueado no puede ver la fila que lo bloquea;
-- devuelve solo un estado, nunca la fila.

create or replace function public.estado_bloqueo(p_otro uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from bloqueados where bloqueador_id = auth.uid() and bloqueado_id = p_otro)
      then 'bloqueaste'
    when exists (select 1 from bloqueados where bloqueador_id = p_otro and bloqueado_id = auth.uid())
      then 'te_bloqueo'
    else 'ninguno'
  end;
$$;

revoke all on function public.estado_bloqueo(uuid) from public, anon;
grant execute on function public.estado_bloqueo(uuid) to authenticated;

-- ═══ 3. Tipo de mensaje: invitación al Truco ══════════════════════════════════

alter table mensajes drop constraint if exists mensajes_tipo_check;
alter table mensajes add constraint mensajes_tipo_check
  check (tipo in ('texto', 'imagen', 'gif', 'invitacion_timba', 'invitacion_poker', 'invitacion_truco'));
