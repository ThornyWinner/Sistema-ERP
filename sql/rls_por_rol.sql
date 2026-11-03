-- =============================================================================
-- rls_por_rol.sql — Seguridad a nivel de fila (RLS) por rol de usuario.
--
-- Matriz de acceso (igual a utils/permissions.ts en el frontend):
--   admin_primario   → CRUD en todo.
--   admin_secundario → solo lectura en todo.
--   vendedor         → CRUD en sus propias órdenes (y sus detalles, pagos, talleres,
--                      personalizaciones); lectura de inventario y proveedores;
--                      alta/edición de clientes.
--   disenador, sublimador, cortador, costurera, bordador
--                    → ven solo las órdenes que pasan por su taller y actualizan el
--                      avance de su propio taller; sin acceso a pagos ni inventario.
--   Usuario inactivo o sin perfil → sin acceso.
--
-- Las funciones auxiliares viven en el esquema `private` (no expuesto por la API).
-- Son SECURITY DEFINER para poder consultar otras tablas sin que sus políticas se
-- llamen entre sí (recursión) y siempre se basan en auth.uid() del usuario actual.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Funciones auxiliares
-- ---------------------------------------------------------------------------

-- Ya existía: rol del usuario actual (solo si está activo).
create or replace function private.current_user_role()
returns text language sql stable security definer set search_path = ''
as $$
  select r.nombre from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.estado = 'activo'
$$;

-- Id (tabla usuarios) del usuario actual, solo si está activo.
create or replace function private.mi_usuario_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select u.id from public.usuarios u
  where u.auth_user_id = (select auth.uid()) and u.estado = 'activo'
$$;

-- Taller que corresponde al rol del usuario actual (null si no es rol de taller).
create or replace function private.mi_taller_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select t.id from public.talleres t
  where t.nombre = case private.current_user_role()
    when 'disenador'  then 'diseno'
    when 'sublimador' then 'sublimacion'
    when 'cortador'   then 'corte'
    when 'costurera'  then 'costura'
    when 'bordador'   then 'bordado'
  end
$$;

-- ¿La orden pasa por el taller del usuario actual?
create or replace function private.taller_ve_orden(p_orden uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.orden_detalles d
    join public.produccion_taller pt on pt.orden_detalle_id = d.id
    where d.orden_id = p_orden and pt.taller_id = private.mi_taller_id()
  )
$$;

-- ¿El usuario actual puede ver la orden? (admins: todas; vendedor: las suyas;
-- talleres: las que pasan por su taller)
create or replace function private.puede_ver_orden(p_orden uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case private.current_user_role()
    when 'admin_primario'   then true
    when 'admin_secundario' then true
    when 'vendedor' then exists (
      select 1 from public.ordenes o
      where o.id = p_orden and o.vendedor_id = private.mi_usuario_id())
    else private.taller_ve_orden(p_orden)
  end
$$;

-- ¿El usuario actual puede modificar la orden y todo lo que cuelga de ella?
-- (admin primario: todas; vendedor: las suyas)
create or replace function private.puede_editar_orden(p_orden uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case private.current_user_role()
    when 'admin_primario' then true
    when 'vendedor' then exists (
      select 1 from public.ordenes o
      where o.id = p_orden and o.vendedor_id = private.mi_usuario_id())
    else false
  end
$$;

-- Orden a la que pertenece un detalle / una personalización.
create or replace function private.orden_de_detalle(p_detalle uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select d.orden_id from public.orden_detalles d where d.id = p_detalle $$;

create or replace function private.orden_de_personalizacion(p_personalizacion uuid)
returns uuid language sql stable security definer set search_path = ''
as $$
  select d.orden_id from public.personalizaciones p
  join public.orden_detalles d on d.id = p.orden_detalle_id
  where p.id = p_personalizacion
$$;

-- ¿El producto / variante / cliente aparece en alguna orden del taller del usuario?
-- (los talleres necesitan el nombre del producto y del cliente en su tablero)
create or replace function private.taller_ve_producto(p_producto uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.orden_detalles d
    join public.produccion_taller pt on pt.orden_detalle_id = d.id
    where d.producto_id = p_producto and pt.taller_id = private.mi_taller_id()
  )
$$;

create or replace function private.taller_ve_variante(p_variante uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.orden_detalles d
    join public.produccion_taller pt on pt.orden_detalle_id = d.id
    where d.variante_id = p_variante and pt.taller_id = private.mi_taller_id()
  )
$$;

create or replace function private.taller_ve_cliente(p_cliente uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.ordenes o
    where o.cliente_id = p_cliente and private.taller_ve_orden(o.id)
  )
$$;

-- Las políticas se evalúan con el rol del usuario: solo `authenticated` ejecuta.
revoke execute on all functions in schema private from public, anon;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- RPC usada por la app al iniciar sesión: solo para usuarios autenticados.
revoke execute on function public.actualizar_mi_ultimo_acceso() from public, anon;
grant execute on function public.actualizar_mi_ultimo_acceso() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Sin sesión no hay acceso a ninguna tabla (defensa adicional a RLS)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- ---------------------------------------------------------------------------
-- 3. Se eliminan todas las políticas anteriores
-- ---------------------------------------------------------------------------
do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Función antigua en public (llamable incluso sin sesión); la reemplaza
-- private.current_user_role(). Se borra después de las políticas que la usaban.
drop function if exists public.usuario_actual_rol();

-- ---------------------------------------------------------------------------
-- 4. Catálogos: los lee cualquier usuario activo; solo el admin primario escribe
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['categorias_producto','colores','tallas','estados_orden','estados_pago',
                           'estados_produccion','metodos_pago','tipos_venta','talleres','roles'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy lectura_usuarios_activos on public.%I for select to authenticated
      using ((select private.current_user_role()) is not null)$p$, t);
    execute format($p$create policy alta_admin on public.%I for insert to authenticated
      with check ((select private.current_user_role()) = 'admin_primario')$p$, t);
    execute format($p$create policy edicion_admin on public.%I for update to authenticated
      using ((select private.current_user_role()) = 'admin_primario')
      with check ((select private.current_user_role()) = 'admin_primario')$p$, t);
    execute format($p$create policy baja_admin on public.%I for delete to authenticated
      using ((select private.current_user_role()) = 'admin_primario')$p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Inventario y proveedores: lectura admins + vendedor; escritura admin primario.
--    Los talleres solo ven los productos/variantes de sus órdenes.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['materiales','movimientos_material','movimientos_producto','proveedores',
                           'productos','variantes_producto','consecutivos_documentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy alta_admin on public.%I for insert to authenticated
      with check ((select private.current_user_role()) = 'admin_primario')$p$, t);
    execute format($p$create policy edicion_admin on public.%I for update to authenticated
      using ((select private.current_user_role()) = 'admin_primario')
      with check ((select private.current_user_role()) = 'admin_primario')$p$, t);
    execute format($p$create policy baja_admin on public.%I for delete to authenticated
      using ((select private.current_user_role()) = 'admin_primario')$p$, t);
  end loop;
end $$;

create policy lectura on public.materiales for select to authenticated
  using ((select private.current_user_role()) in ('admin_primario','admin_secundario','vendedor'));
create policy lectura on public.movimientos_material for select to authenticated
  using ((select private.current_user_role()) in ('admin_primario','admin_secundario','vendedor'));
create policy lectura on public.movimientos_producto for select to authenticated
  using ((select private.current_user_role()) in ('admin_primario','admin_secundario','vendedor'));
-- El vendedor elige proveedor en los productos de comercialización (Nueva Orden).
create policy lectura on public.proveedores for select to authenticated
  using ((select private.current_user_role()) in ('admin_primario','admin_secundario','vendedor'));
create policy lectura on public.productos for select to authenticated
  using ((select private.current_user_role()) in ('admin_primario','admin_secundario','vendedor')
         or private.taller_ve_producto(id));
create policy lectura on public.variantes_producto for select to authenticated
  using ((select private.current_user_role()) in ('admin_primario','admin_secundario','vendedor')
         or private.taller_ve_variante(id));
-- El folio lo genera un trigger (SECURITY DEFINER); solo los admins lo consultan.
create policy lectura on public.consecutivos_documentos for select to authenticated
  using ((select private.current_user_role()) in ('admin_primario','admin_secundario'));

-- ---------------------------------------------------------------------------
-- 6. Usuarios: cada quien ve su propio perfil; los admins ven todos.
--    Solo el admin primario crea, edita o elimina (nadie puede cambiarse el rol).
-- ---------------------------------------------------------------------------
alter table public.usuarios enable row level security;
create policy lectura on public.usuarios for select to authenticated
  using (auth_user_id = (select auth.uid())
         or (select private.current_user_role()) in ('admin_primario','admin_secundario'));
create policy alta_admin on public.usuarios for insert to authenticated
  with check ((select private.current_user_role()) = 'admin_primario');
create policy edicion_admin on public.usuarios for update to authenticated
  using ((select private.current_user_role()) = 'admin_primario')
  with check ((select private.current_user_role()) = 'admin_primario');
create policy baja_admin on public.usuarios for delete to authenticated
  using ((select private.current_user_role()) = 'admin_primario');

-- ---------------------------------------------------------------------------
-- 7. Clientes: admins y vendedores; los talleres solo ven los de sus órdenes.
--    El vendedor puede dar de alta y actualizar el contacto de cualquier cliente
--    (Nueva Orden reutiliza el cliente si ya existe).
-- ---------------------------------------------------------------------------
alter table public.clientes enable row level security;
create policy lectura on public.clientes for select to authenticated
  using ((select private.current_user_role()) in ('admin_primario','admin_secundario','vendedor')
         or private.taller_ve_cliente(id));
create policy alta on public.clientes for insert to authenticated
  with check ((select private.current_user_role()) in ('admin_primario','vendedor'));
create policy edicion on public.clientes for update to authenticated
  using ((select private.current_user_role()) in ('admin_primario','vendedor'))
  with check ((select private.current_user_role()) in ('admin_primario','vendedor'));
create policy baja_admin on public.clientes for delete to authenticated
  using ((select private.current_user_role()) = 'admin_primario');

-- ---------------------------------------------------------------------------
-- 8. Órdenes
-- ---------------------------------------------------------------------------
alter table public.ordenes enable row level security;
create policy lectura on public.ordenes for select to authenticated
  using ((select private.current_user_role()) in ('admin_primario','admin_secundario')
         or vendedor_id = (select private.mi_usuario_id())
         or private.taller_ve_orden(id));
-- El vendedor solo crea/edita/elimina órdenes a su nombre y no puede reasignarlas.
create policy alta on public.ordenes for insert to authenticated
  with check ((select private.current_user_role()) = 'admin_primario'
              or ((select private.current_user_role()) = 'vendedor'
                  and vendedor_id = (select private.mi_usuario_id())));
create policy edicion on public.ordenes for update to authenticated
  using ((select private.current_user_role()) = 'admin_primario'
         or ((select private.current_user_role()) = 'vendedor'
             and vendedor_id = (select private.mi_usuario_id())))
  with check ((select private.current_user_role()) = 'admin_primario'
              or ((select private.current_user_role()) = 'vendedor'
                  and vendedor_id = (select private.mi_usuario_id())));
create policy baja on public.ordenes for delete to authenticated
  using ((select private.current_user_role()) = 'admin_primario'
         or ((select private.current_user_role()) = 'vendedor'
             and vendedor_id = (select private.mi_usuario_id())));

-- Detalles de la orden
alter table public.orden_detalles enable row level security;
create policy lectura on public.orden_detalles for select to authenticated
  using (private.puede_ver_orden(orden_id));
create policy alta on public.orden_detalles for insert to authenticated
  with check (private.puede_editar_orden(orden_id));
create policy edicion on public.orden_detalles for update to authenticated
  using (private.puede_editar_orden(orden_id))
  with check (private.puede_editar_orden(orden_id));
create policy baja on public.orden_detalles for delete to authenticated
  using (private.puede_editar_orden(orden_id));

-- Avance por taller: además del dueño de la orden, cada taller actualiza su propio paso.
alter table public.produccion_taller enable row level security;
create policy lectura on public.produccion_taller for select to authenticated
  using (private.puede_ver_orden(private.orden_de_detalle(orden_detalle_id)));
create policy alta on public.produccion_taller for insert to authenticated
  with check (private.puede_editar_orden(private.orden_de_detalle(orden_detalle_id)));
create policy edicion on public.produccion_taller for update to authenticated
  using (private.puede_editar_orden(private.orden_de_detalle(orden_detalle_id))
         or taller_id = (select private.mi_taller_id()))
  with check (private.puede_editar_orden(private.orden_de_detalle(orden_detalle_id))
              or (taller_id = (select private.mi_taller_id())
                  and private.puede_ver_orden(private.orden_de_detalle(orden_detalle_id))));
create policy baja on public.produccion_taller for delete to authenticated
  using (private.puede_editar_orden(private.orden_de_detalle(orden_detalle_id)));

-- Personalización (bordado) y sus colores de hilo
alter table public.personalizaciones enable row level security;
create policy lectura on public.personalizaciones for select to authenticated
  using (private.puede_ver_orden(private.orden_de_detalle(orden_detalle_id)));
create policy alta on public.personalizaciones for insert to authenticated
  with check (private.puede_editar_orden(private.orden_de_detalle(orden_detalle_id)));
create policy edicion on public.personalizaciones for update to authenticated
  using (private.puede_editar_orden(private.orden_de_detalle(orden_detalle_id)))
  with check (private.puede_editar_orden(private.orden_de_detalle(orden_detalle_id)));
create policy baja on public.personalizaciones for delete to authenticated
  using (private.puede_editar_orden(private.orden_de_detalle(orden_detalle_id)));

alter table public.personalizacion_hilos enable row level security;
create policy lectura on public.personalizacion_hilos for select to authenticated
  using (private.puede_ver_orden(private.orden_de_personalizacion(personalizacion_id)));
create policy alta on public.personalizacion_hilos for insert to authenticated
  with check (private.puede_editar_orden(private.orden_de_personalizacion(personalizacion_id)));
create policy edicion on public.personalizacion_hilos for update to authenticated
  using (private.puede_editar_orden(private.orden_de_personalizacion(personalizacion_id)))
  with check (private.puede_editar_orden(private.orden_de_personalizacion(personalizacion_id)));
create policy baja on public.personalizacion_hilos for delete to authenticated
  using (private.puede_editar_orden(private.orden_de_personalizacion(personalizacion_id)));

-- Pagos: información financiera; los talleres no la ven.
alter table public.pagos enable row level security;
create policy lectura on public.pagos for select to authenticated
  using ((select private.current_user_role()) = 'admin_secundario'
         or private.puede_editar_orden(orden_id));
create policy alta on public.pagos for insert to authenticated
  with check (private.puede_editar_orden(orden_id));
create policy edicion on public.pagos for update to authenticated
  using (private.puede_editar_orden(orden_id))
  with check (private.puede_editar_orden(orden_id));
create policy baja on public.pagos for delete to authenticated
  using (private.puede_editar_orden(orden_id));

-- Historial de estados: lo escriben los triggers (SECURITY DEFINER).
alter table public.historial_ordenes enable row level security;
create policy lectura on public.historial_ordenes for select to authenticated
  using ((select private.current_user_role()) = 'admin_secundario'
         or private.puede_editar_orden(orden_id));
create policy baja_admin on public.historial_ordenes for delete to authenticated
  using ((select private.current_user_role()) = 'admin_primario');

-- Comentarios y archivos de la orden: los ve quien ve la orden; cualquiera que la vea
-- (excepto el admin secundario, de solo lectura) puede agregar a su nombre;
-- cada autor edita/elimina lo suyo y el admin primario, todo.
do $$
declare t text;
begin
  foreach t in array array['comentarios_orden','archivos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy lectura on public.%I for select to authenticated
      using (private.puede_ver_orden(orden_id))$p$, t);
    execute format($p$create policy alta on public.%I for insert to authenticated
      with check ((select private.current_user_role()) <> 'admin_secundario'
                  and usuario_id = (select private.mi_usuario_id())
                  and private.puede_ver_orden(orden_id))$p$, t);
    execute format($p$create policy edicion on public.%I for update to authenticated
      using ((select private.current_user_role()) = 'admin_primario'
             or ((select private.current_user_role()) <> 'admin_secundario'
                 and usuario_id = (select private.mi_usuario_id())))
      with check ((select private.current_user_role()) = 'admin_primario'
                  or ((select private.current_user_role()) <> 'admin_secundario'
                      and usuario_id = (select private.mi_usuario_id())
                      and private.puede_ver_orden(orden_id)))$p$, t);
    execute format($p$create policy baja on public.%I for delete to authenticated
      using ((select private.current_user_role()) = 'admin_primario'
             or ((select private.current_user_role()) <> 'admin_secundario'
                 and usuario_id = (select private.mi_usuario_id())))$p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Índices para las búsquedas que hacen las políticas
-- ---------------------------------------------------------------------------
create index if not exists idx_personalizacion_detalle on public.personalizaciones (orden_detalle_id);
create index if not exists idx_hilo_personalizacion on public.personalizacion_hilos (personalizacion_id);
create index if not exists idx_produccion_taller_detalle_taller
  on public.produccion_taller (taller_id, orden_detalle_id);
