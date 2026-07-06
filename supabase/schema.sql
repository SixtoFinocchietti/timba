-- Usuarios
create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nombre text not null,
  avatar_url text,
  created_at timestamptz default now()
);

-- Timbas
create table timbas (
  id uuid primary key default gen_random_uuid(),
  creador_id uuid not null references usuarios(id) on delete cascade,
  titulo text not null,
  descripcion text,
  tipo text not null check (tipo in ('amistosa', 'monetaria', 'objeto', 'comida')),
  opciones text[] not null,
  monto_minimo numeric,
  monto_maximo numeric,
  premio_descripcion text,
  estado text not null default 'activa' check (estado in ('activa', 'en_disputa', 'cerrada')),
  resultado_ganador text,
  codigo_invitacion text unique not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Participantes
create table participantes (
  id uuid primary key default gen_random_uuid(),
  timba_id uuid not null references timbas(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  opcion_elegida text not null,
  monto numeric,
  confirmacion_resultado boolean,
  created_at timestamptz default now(),
  unique(timba_id, usuario_id)
);

-- Deudas
create table deudas (
  id uuid primary key default gen_random_uuid(),
  timba_id uuid not null references timbas(id) on delete cascade,
  acreedor_id uuid not null references usuarios(id),
  deudor_id uuid not null references usuarios(id),
  monto numeric,
  descripcion text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'cancelada')),
  created_at timestamptz default now()
);

-- Row Level Security
alter table usuarios enable row level security;
alter table timbas enable row level security;
alter table participantes enable row level security;
alter table deudas enable row level security;

-- Policies: usuarios pueden ver y editar su propio perfil
create policy "usuarios_select" on usuarios for select using (true);
create policy "usuarios_insert" on usuarios for insert with check (auth.uid() = id);
create policy "usuarios_update" on usuarios for update using (auth.uid() = id);

-- Policies: timbas visibles para sus participantes
create policy "timbas_select" on timbas for select using (
  exists (select 1 from participantes where timba_id = timbas.id and usuario_id = auth.uid())
  or creador_id = auth.uid()
);
create policy "timbas_insert" on timbas for insert with check (auth.uid() = creador_id);
create policy "timbas_update" on timbas for update using (auth.uid() = creador_id);

-- Policies: participantes
create policy "participantes_select" on participantes for select using (
  exists (select 1 from participantes p2 where p2.timba_id = participantes.timba_id and p2.usuario_id = auth.uid())
);
create policy "participantes_insert" on participantes for insert with check (auth.uid() = usuario_id);
create policy "participantes_update" on participantes for update using (auth.uid() = usuario_id);

-- Policies: deudas
create policy "deudas_select" on deudas for select using (
  auth.uid() = acreedor_id or auth.uid() = deudor_id
);

-- Timbas públicas por código de invitación (para el join)
create policy "timbas_join_select" on timbas for select using (codigo_invitacion is not null);
