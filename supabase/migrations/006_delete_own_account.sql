-- Permite que un usuario autenticado elimine su propia cuenta.
-- security definer corre como postgres, que tiene acceso a auth.users.
-- El CASCADE en usuarios → auth.users propaga la eliminación a todos los datos.
create or replace function delete_own_account()
returns void language plpgsql security definer as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function delete_own_account() to authenticated;
