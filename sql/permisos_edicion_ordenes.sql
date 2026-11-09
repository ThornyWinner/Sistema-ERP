-- =============================================================================
-- permisos_edicion_ordenes.sql — Quién puede modificar una orden.
--
-- Regla del negocio:
--   - admin_primario:              puede modificar TODAS las órdenes.
--   - admin_secundario y vendedor: crean órdenes propias y solo modifican (y abonan)
--                                  las que registraron ellos mismos
--                                  (ordenes.vendedor_id = su usuario). P. ej. el admin
--                                  secundario no puede editar las de Karla o Fernanda,
--                                  y cada vendedora solo edita las suyas.
--   - Talleres:                    no modifican órdenes (solo su avance de producción).
--
-- private.puede_editar_orden() es la regla única: la usan las políticas RLS de
-- orden_detalles, personalizaciones, personalizacion_hilos, produccion_taller y pagos,
-- y la función public.editar_orden (sql/editar_orden.sql).
-- =============================================================================

create or replace function private.puede_editar_orden(p_orden uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case private.current_user_role()
    when 'admin_primario' then true
    when 'admin_secundario' then exists (
      select 1 from public.ordenes o
      where o.id = p_orden and o.vendedor_id = private.mi_usuario_id())
    when 'vendedor' then exists (
      select 1 from public.ordenes o
      where o.id = p_orden and o.vendedor_id = private.mi_usuario_id())
    else false
  end
$$;

-- Edición de la cabecera de la orden con la misma regla.
alter policy edicion on public.ordenes
  using (
    (select private.current_user_role()) = 'admin_primario'
    or ((select private.current_user_role()) in ('admin_secundario', 'vendedor')
        and vendedor_id = (select private.mi_usuario_id()))
  )
  with check (
    (select private.current_user_role()) = 'admin_primario'
    or ((select private.current_user_role()) in ('admin_secundario', 'vendedor')
        and vendedor_id = (select private.mi_usuario_id()))
  );

-- -----------------------------------------------------------------------------
-- Alta de órdenes: el admin secundario registra órdenes propias igual que un
-- vendedor (vendedor_id = él mismo); el admin primario, a nombre de cualquiera.
-- Los abonos (pagos) ya siguen private.puede_editar_orden: cada quien en sus órdenes.
-- -----------------------------------------------------------------------------
alter policy alta on public.ordenes
  with check (
    (select private.current_user_role()) = 'admin_primario'
    or ((select private.current_user_role()) in ('admin_secundario', 'vendedor')
        and vendedor_id = (select private.mi_usuario_id()))
  );

-- Al registrar una orden se da de alta el cliente o se actualiza su contacto.
alter policy alta on public.clientes
  with check ((select private.current_user_role()) = any (array['admin_primario', 'admin_secundario', 'vendedor']));

alter policy edicion on public.clientes
  using ((select private.current_user_role()) = any (array['admin_primario', 'admin_secundario', 'vendedor']))
  with check ((select private.current_user_role()) = any (array['admin_primario', 'admin_secundario', 'vendedor']));
