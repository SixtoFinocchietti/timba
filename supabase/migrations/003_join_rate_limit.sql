-- Tabla para rastrear intentos de búsqueda por código de invitación
create table if not exists join_intentos (
  id         uuid        primary key default gen_random_uuid(),
  usuario_id uuid        not null references usuarios(id) on delete cascade,
  created_at timestamptz default now()
);

alter table join_intentos enable row level security;

-- Solo el usuario autenticado puede insertar sus propios intentos
create policy "join_intentos_insert" on join_intentos
  for insert with check (auth.uid() = usuario_id);

-- Trigger: bloquea si el usuario hizo más de 10 intentos en la última hora
create or replace function check_join_rate_limit()
returns trigger language plpgsql security definer as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from join_intentos
  where usuario_id = NEW.usuario_id
    and created_at > now() - interval '1 hour';

  if v_count >= 10 then
    raise exception 'RATE_LIMIT_EXCEEDED';
  end if;

  -- Limpiar intentos viejos del mismo usuario (>2h) para no acumular filas
  delete from join_intentos
  where usuario_id = NEW.usuario_id
    and created_at < now() - interval '2 hours';

  return NEW;
end;
$$;

create trigger trg_join_rate_limit
  before insert on join_intentos
  for each row execute function check_join_rate_limit();

-- Actualizar policy de timbas para join: requiere autenticación
-- (antes permitía selects anónimos; ahora solo usuarios logueados pueden buscar por código)
drop policy if exists "timbas_join_select" on timbas;

create policy "timbas_join_select" on timbas for select using (
  codigo_invitacion is not null
  and auth.uid() is not null
);
