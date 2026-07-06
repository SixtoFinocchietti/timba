-- ─── 012_mejoras_ux.sql ───────────────────────────────────────────────────────
-- Mejoras de UX y performance:
--   1. mensajes_ocultos: "Eliminar para mí" persistente en el chat.
--   2. cancelar_propuesta(): el creador puede retirar un resultado propuesto
--      (la timba vuelve a 'activa' y se borran las confirmaciones), destrabando
--      timbas que quedaban en disputa para siempre.
--   3. Póker: columna sb_es_host para rotar los blinds entre manos.
--   4. Índices para las foreign keys sin cobertura (advisor de performance).

-- ═══ 1. Mensajes ocultos por usuario ══════════════════════════════════════════

create table if not exists mensajes_ocultos (
  id         uuid primary key default gen_random_uuid(),
  mensaje_id uuid not null references mensajes(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  created_at timestamptz default now(),
  unique (mensaje_id, usuario_id)
);

alter table mensajes_ocultos enable row level security;

create policy "mensajes_ocultos_select" on mensajes_ocultos
  for select using (auth.uid() = usuario_id);

-- Solo se pueden ocultar mensajes de conversaciones propias
create policy "mensajes_ocultos_insert" on mensajes_ocultos
  for insert with check (
    auth.uid() = usuario_id
    and exists (
      select 1 from mensajes m
      where m.id = mensaje_id
        and (m.emisor_id = auth.uid() or m.receptor_id = auth.uid())
    )
  );

create policy "mensajes_ocultos_delete" on mensajes_ocultos
  for delete using (auth.uid() = usuario_id);

create index if not exists idx_mensajes_ocultos_usuario on mensajes_ocultos(usuario_id);
create index if not exists idx_mensajes_ocultos_mensaje on mensajes_ocultos(mensaje_id);

-- ═══ 2. Cancelar propuesta de resultado ═══════════════════════════════════════

create or replace function public.cancelar_propuesta(p_timba_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_timba timbas%rowtype;
begin
  select * into v_timba from timbas where id = p_timba_id;
  if not found then
    raise exception 'Timba no encontrada';
  end if;
  if v_timba.creador_id <> auth.uid() then
    raise exception 'No autorizado';
  end if;
  if v_timba.estado <> 'en_disputa' then
    raise exception 'SIN_PROPUESTA';
  end if;

  -- Primero las confirmaciones (mientras sigue en_disputa, el trigger lo permite)
  update participantes set confirmacion_resultado = null where timba_id = p_timba_id;
  update timbas set estado = 'activa', resultado_ganador = null where id = p_timba_id;
end;
$$;

revoke all on function public.cancelar_propuesta(uuid) from public, anon;
grant execute on function public.cancelar_propuesta(uuid) to authenticated;

-- ═══ 3. Póker: blinds rotativos ═══════════════════════════════════════════════
-- true = el host paga la small blind esta mano (comportamiento histórico).
-- El cliente lo alterna en cada mano nueva.

alter table partidas_poker add column if not exists sb_es_host boolean not null default true;

-- ═══ 4. Índices para foreign keys (advisor de performance) ════════════════════

create index if not exists idx_amistades_receptor        on amistades(receptor_id);
create index if not exists idx_bloqueados_bloqueado      on bloqueados(bloqueado_id);
create index if not exists idx_deudas_acreedor           on deudas(acreedor_id);
create index if not exists idx_deudas_deudor             on deudas(deudor_id);
create index if not exists idx_deudas_timba              on deudas(timba_id);
create index if not exists idx_join_intentos_usuario     on join_intentos(usuario_id);
create index if not exists idx_mensajes_timba            on mensajes(timba_id);
create index if not exists idx_participantes_usuario     on participantes(usuario_id);
create index if not exists idx_partidas_poker_host       on partidas_poker(host_id);
create index if not exists idx_partidas_poker_invitado   on partidas_poker(invitado_id);
create index if not exists idx_reacciones_usuario        on reacciones_mensajes(usuario_id);
create index if not exists idx_reportes_reportado        on reportes(reportado_id);
create index if not exists idx_reportes_reportador       on reportes(reportador_id);
create index if not exists idx_timbas_creador            on timbas(creador_id);
create index if not exists idx_truco_partidas_ganador    on truco_partidas(ganador);
create index if not exists idx_truco_partidas_jugador1   on truco_partidas(jugador1);
