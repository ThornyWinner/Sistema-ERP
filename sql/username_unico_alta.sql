-- =============================================================================
-- username_unico_alta.sql — El perfil básico que crea el trigger on_auth_user_created
-- siempre recibe un username único.
--
-- Antes, el username inicial era la parte del correo antes de la @. Si ya existía
-- (p. ej. ventas01@dominio-a.com y ventas01@dominio-b.com), el INSERT violaba
-- usuarios_username_key y Supabase rechazaba el registro completo de la cuenta
-- ("Database error saving new user").
--
-- Ahora, si ese username está ocupado, se le agrega un sufijo numérico:
--   ventas01 → ventas01_2 → ventas01_3 …
-- Es solo un valor provisional: Gestión de Usuarios (AuthContext.addUser) lo
-- reemplaza enseguida por el username que captura el administrador.
--
-- Si el correo ya existe en `usuarios` el registro sigue fallando a propósito: un
-- correo no puede tener dos perfiles. La app lo detecta antes de crear la cuenta.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_base text := coalesce(nullif(split_part(new.email, '@', 1), ''), 'usuario');
  v_username text := v_base;
  v_n integer := 1;
begin
  while exists (select 1 from public.usuarios where username = v_username) loop
    v_n := v_n + 1;
    v_username := v_base || '_' || v_n;
  end loop;

  insert into public.usuarios (auth_user_id, email, nombre, username)
  values (new.id, new.email, v_base, v_username)
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;
