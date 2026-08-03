-- Fase 9 (auditoría técnica jul 2026): robustecer el multijugador de Pool y
-- vincularlo con Timbas. Migración aditiva, no rompe nada existente.

-- ── partidas_pool: distinguir abandono voluntario de desconexión, y
--    vincular (opcionalmente) a la Timba que se creó a partir de esta partida ──
alter table partidas_pool add column if not exists motivo_abandono text
  check (motivo_abandono in ('voluntario', 'desconexion'));
alter table partidas_pool add column if not exists timba_id uuid
  references timbas(id) on delete set null;

-- ── timbas: nuevo estado terminal 'cancelada' — para cuando la partida
--    vinculada termina por desconexión sostenida (no es "decidir un ganador",
--    es reconocer que la partida no se completó; sin generar deudas) ──
alter table timbas drop constraint if exists timbas_estado_check;
alter table timbas add constraint timbas_estado_check
  check (estado in ('activa', 'en_disputa', 'cerrada', 'cancelada'));

-- ── historial de desconexiones, tabla compartida entre juegos (hoy solo Pool
--    la alimenta; Blackjack/Truco/Poker se suman cuando tengan su propio
--    manejo de presencia). Objetivo: informar, no castigar — ver RLS abajo. ──
create table if not exists eventos_desconexion (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  juego       text not null check (juego in ('pool', 'blackjack', 'truco', 'poker')),
  partida_id  uuid not null,
  created_at  timestamptz not null default now()
);

alter table eventos_desconexion enable row level security;

-- Visible para el propio usuario y sus amigos (mismo criterio que "historial"
-- en la privacidad de perfil) — no es un ranking público.
create policy "eventos_desconexion_select" on eventos_desconexion
  for select using (
    auth.uid() = usuario_id
    or exists (
      select 1 from amistades
      where estado = 'aceptada'
        and ((solicitante_id = auth.uid() and receptor_id = usuario_id)
          or (solicitante_id = usuario_id and receptor_id = auth.uid()))
    )
  );

-- Solo se puede registrar la desconexión de OTRO participante de una
-- partidas_pool que ya quedó marcada 'abandonada'/'desconexion' por
-- reclamarVictoria() — evita que cualquiera marque a cualquiera.
create policy "eventos_desconexion_insert" on eventos_desconexion
  for insert with check (
    auth.uid() <> usuario_id
    and juego = 'pool'
    and exists (
      select 1 from partidas_pool pp
      where pp.id = partida_id
        and (pp.host_id = auth.uid() or pp.invitado_id = auth.uid())
        and (pp.host_id = usuario_id or pp.invitado_id = usuario_id)
        and pp.fase = 'abandonada'
        and pp.motivo_abandono = 'desconexion'
    )
  );

create index if not exists idx_eventos_desconexion_usuario on eventos_desconexion(usuario_id);
create index if not exists idx_partidas_pool_timba on partidas_pool(timba_id);
