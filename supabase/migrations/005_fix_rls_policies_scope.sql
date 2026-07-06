-- Función auxiliar: consulta participantes con security definer
-- para que la policy de participantes no se llame a sí misma (recursión infinita)
create or replace function auth_es_participante(p_timba_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from participantes
    where timba_id = p_timba_id and usuario_id = auth.uid()
  )
$$;

grant execute on function auth_es_participante(uuid) to authenticated;

-- timbas_select: antes cualquier usuario auth veía todas las timbas
-- Ahora: solo creador o participante
drop policy if exists "timbas_select" on timbas;
create policy "timbas_select" on timbas for select using (
  creador_id = auth.uid()
  or auth_es_participante(id)
);

-- participantes_select: antes cualquier usuario auth veía todos los participantes
-- Ahora: solo co-participantes de la misma timba
drop policy if exists "participantes_select" on participantes;
create policy "participantes_select" on participantes for select using (
  auth_es_participante(timba_id)
);
