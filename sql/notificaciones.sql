-- =============================================================================
-- notificaciones.sql — Notificaciones entre usuarios del sistema.
--
--  notificaciones  una fila por destinatario. Un mismo envío a varias personas (o a
--                  todo un rol) comparte `envio_id`.
--
-- Reglas:
--  - Cualquier usuario activo puede enviar a otros usuarios activos o a roles completos.
--  - El envío solo se hace con la RPC enviar_notificacion(): el remitente siempre es
--    el usuario de la sesión (no se puede suplantar) y nadie se notifica a sí mismo.
--  - El destinatario ve, marca como leídas y elimina sus notificaciones.
--  - El remitente ve lo que envió (para saber quién lo leyó), pero no lo modifica.
--  - Los nombres de remitente y destinatario se guardan en la fila porque los roles
--    sin privilegios de admin no pueden leer la tabla `usuarios` (RLS).
--  - `enlace` solo admite rutas internas de la app (empiezan con "/").
--
-- Depende de private.current_user_role() y private.mi_usuario_id() (rls_por_rol.sql).
-- =============================================================================

create table public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  envio_id uuid not null,
  destinatario_id uuid not null references public.usuarios(id) on delete cascade,
  destinatario_nombre text not null,
  remitente_id uuid references public.usuarios(id) on delete set null,
  remitente_nombre text not null,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 120),
  mensaje text check (mensaje is null or char_length(mensaje) <= 2000),
  enlace text check (enlace is null or (enlace ~ '^/[^/]' or enlace = '/') and char_length(enlace) <= 300),
  leida_at timestamptz,
  created_at timestamptz not null default now()
);

create index notificaciones_destinatario_idx on public.notificaciones (destinatario_id, created_at desc);
create index notificaciones_remitente_idx on public.notificaciones (remitente_id, created_at desc);
create index notificaciones_envio_idx on public.notificaciones (envio_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.notificaciones enable row level security;

create policy lectura_propias on public.notificaciones for select to authenticated
  using (destinatario_id = (select private.mi_usuario_id())
         or remitente_id = (select private.mi_usuario_id()));

create policy marcar_leida on public.notificaciones for update to authenticated
  using (destinatario_id = (select private.mi_usuario_id()))
  with check (destinatario_id = (select private.mi_usuario_id()));

create policy borrar_propias on public.notificaciones for delete to authenticated
  using (destinatario_id = (select private.mi_usuario_id()));

-- Sin INSERT directo (solo por la RPC) y el UPDATE solo puede tocar `leida_at`.
revoke all on public.notificaciones from anon, authenticated;
grant select, delete on public.notificaciones to authenticated;
grant update (leida_at) on public.notificaciones to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: directorio de usuarios a quienes se puede notificar
-- (solo id, nombre y rol de usuarios activos; sin email ni otros datos).
-- ---------------------------------------------------------------------------
create or replace function public.directorio_usuarios()
returns table (id uuid, nombre text, rol text)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.nombre, r.nombre
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.estado = 'activo'
    and (select private.current_user_role()) is not null
    and u.id is distinct from (select private.mi_usuario_id())
  order by u.nombre
$$;

-- ---------------------------------------------------------------------------
-- RPC: enviar una notificación a usuarios concretos y/o a roles completos.
-- Devuelve cuántas personas la recibieron.
-- ---------------------------------------------------------------------------
create or replace function public.enviar_notificacion(
  p_titulo text,
  p_mensaje text default null,
  p_destinatarios uuid[] default '{}',
  p_roles text[] default '{}',
  p_enlace text default null
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_yo uuid := private.mi_usuario_id();
  v_yo_nombre text;
  v_envio uuid := gen_random_uuid();
  v_total integer;
begin
  if v_yo is null then
    raise exception 'Usuario sin sesión activa';
  end if;

  select nombre into v_yo_nombre from public.usuarios where id = v_yo;

  insert into public.notificaciones
    (envio_id, destinatario_id, destinatario_nombre, remitente_id, remitente_nombre,
     titulo, mensaje, enlace)
  select v_envio, u.id, u.nombre, v_yo, v_yo_nombre,
         btrim(p_titulo), nullif(btrim(coalesce(p_mensaje, '')), ''), nullif(btrim(coalesce(p_enlace, '')), '')
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.estado = 'activo'
    and u.id <> v_yo
    and (u.id = any(coalesce(p_destinatarios, '{}')) or r.nombre = any(coalesce(p_roles, '{}')));

  get diagnostics v_total = row_count;
  if v_total = 0 then
    raise exception 'No hay destinatarios activos para esta notificación';
  end if;
  return v_total;
end;
$$;

revoke execute on function public.directorio_usuarios() from public, anon;
revoke execute on function public.enviar_notificacion(text, text, uuid[], text[], text) from public, anon;
grant execute on function public.directorio_usuarios() to authenticated;
grant execute on function public.enviar_notificacion(text, text, uuid[], text[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- Tiempo real: la campana recibe las notificaciones nuevas al instante.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.notificaciones;
