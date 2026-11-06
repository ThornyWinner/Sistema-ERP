-- =============================================================================
-- eliminar_usuario.sql — Elimina un usuario completo: su perfil en `usuarios` y su
-- cuenta de Supabase Auth (auth.users).
--
-- El navegador no puede borrar cuentas de Auth (requiere la service role key), por
-- eso se hace con esta RPC SECURITY DEFINER. Reglas:
--  - Solo la puede ejecutar un administrador primario activo.
--  - Nadie puede eliminarse a sí mismo.
--  - Todo ocurre en una transacción: si el perfil tiene registros asociados (órdenes,
--    movimientos, historial…) la llave foránea lo impide (código 23503) y la cuenta de
--    Auth tampoco se borra. En ese caso se recomienda marcar el usuario como inactivo.
--  - Si el perfil no tiene cuenta de Auth vinculada, solo se borra el perfil.
-- Al borrar de auth.users, Supabase elimina en cascada sus identidades y sesiones.
--
-- Depende de private.current_user_role() y private.mi_usuario_id() (rls_por_rol.sql).
-- La usa AuthContext.deleteUser y, para deshacer un alta fallida, AuthContext.addUser.
-- =============================================================================

create or replace function public.eliminar_usuario(p_usuario uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_auth uuid;
begin
  if (select private.current_user_role()) is distinct from 'admin_primario' then
    raise exception 'Solo el administrador primario puede eliminar usuarios'
      using errcode = '42501';
  end if;

  if p_usuario = (select private.mi_usuario_id()) then
    raise exception 'No puedes eliminar tu propio usuario';
  end if;

  delete from public.usuarios where id = p_usuario
  returning auth_user_id into v_auth;

  if not found then
    raise exception 'El usuario no existe';
  end if;

  if v_auth is not null then
    delete from auth.users where id = v_auth;
  end if;
end;
$$;

revoke execute on function public.eliminar_usuario(uuid) from public, anon;
grant execute on function public.eliminar_usuario(uuid) to authenticated;
