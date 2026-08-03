-- Fase 11 paso 2 del roadmap Pool (§9.2): hoy cada pantalla de juego corta
-- "invitaciones vigentes" con un número mágico client-side repetido 3 veces
-- (48h en Blackjack/Poker, 10min en Pool desde la Fase 10.4). Se mueve esa
-- lógica a la base: expira_en se calcula una sola vez al insertar el
-- mensaje, según el tipo — de raíz, no repetido por pantalla.

alter table public.mensajes add column if not exists expira_en timestamptz;

create or replace function public.calcular_expira_en_mensaje()
returns trigger
language plpgsql as $$
begin
  if new.expira_en is not null then
    return new;
  end if;
  if new.tipo = 'invitacion_pool' then
    new.expira_en := new.created_at + interval '10 minutes';
  elsif new.tipo like 'invitacion_%' then
    new.expira_en := new.created_at + interval '48 hours';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_calcular_expira_en_mensaje on public.mensajes;
create trigger trg_calcular_expira_en_mensaje
  before insert on public.mensajes
  for each row execute function public.calcular_expira_en_mensaje();
