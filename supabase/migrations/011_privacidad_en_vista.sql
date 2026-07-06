-- ─── 011_privacidad_en_vista.sql ──────────────────────────────────────────────
-- La configuración de privacidad del perfil ahora se aplica DENTRO de la vista
-- usuarios_publicos, para que rija en toda la app (búsqueda, listas de amigos,
-- chat, perfiles, saldos, juegos) y no dependa de cada pantalla.
--
-- Reglas:
--   · nombre:   si el nivel no lo permite, se muestra el apodo (o "Usuario").
--               Default 'todos' — el nombre es visible salvo que lo restrinjas.
--   · email:    default 'amigos'. NULL si el que consulta no puede verlo.
--   · telefono: default 'amigos'. NULL si no puede verlo.
--   · redes:    default 'todos'.  NULL si no puede verlas.
--   · El dueño siempre ve sus propios datos completos.

create or replace function public.son_amigos(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from amistades
    where estado = 'aceptada'
      and ((solicitante_id = p_a and receptor_id = p_b)
        or (solicitante_id = p_b and receptor_id = p_a))
  );
$$;

revoke all on function public.son_amigos(uuid, uuid) from public, anon;
grant execute on function public.son_amigos(uuid, uuid) to authenticated;

create or replace view public.usuarios_publicos
with (security_invoker = false) as
select
  u.id,
  case
    when u.id = auth.uid()
      or privacidad_permite(coalesce(u.privacidad->>'nombre', 'todos'), son_amigos(auth.uid(), u.id))
    then u.nombre
    else coalesce(nullif(u.apodo, ''), 'Usuario')
  end as nombre,
  u.apodo,
  u.avatar_url,
  u.privacidad,
  u.created_at,
  case
    when u.id = auth.uid()
      or privacidad_permite(coalesce(u.privacidad->>'email', 'amigos'), son_amigos(auth.uid(), u.id))
    then u.email
  end as email,
  case
    when u.id = auth.uid()
      or privacidad_permite(coalesce(u.privacidad->>'telefono', 'amigos'), son_amigos(auth.uid(), u.id))
    then u.telefono
  end as telefono,
  case
    when u.id = auth.uid()
      or privacidad_permite(coalesce(u.privacidad->>'redes', 'todos'), son_amigos(auth.uid(), u.id))
    then u.redes_sociales
  end as redes_sociales
from usuarios u;

revoke all on public.usuarios_publicos from public, anon;
grant select on public.usuarios_publicos to authenticated;
