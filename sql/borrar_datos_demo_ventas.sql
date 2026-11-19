-- =====================================================================
-- borrar_datos_demo_ventas.sql — Quita lo que cargó sql/datos_demo_ventas.sql
-- =====================================================================
-- Todo se cargó en una transacción, con la misma marca de tiempo (created_at). Las
-- autorizaciones de demostración se reconocen por "(demo)" en su justificación; con su
-- fecha se borran también las cuentas, las listas (y sus respuestas) y los avisos.
-- Si alguna autorización de demostración ya se usó para crear una orden, la orden NO
-- se borra (solo se desliga).
-- =====================================================================
begin;

do $borrar$
declare
  v_ts timestamptz;
begin
  select min(created_at) into v_ts from public.autorizaciones_venta where justificacion like '%(demo)%';
  if v_ts is null then
    raise exception 'No hay datos de demostración de ventas cargados';
  end if;

  delete from public.autorizaciones_venta where created_at = v_ts and justificacion like '%(demo)%';
  delete from public.listas_tallas where created_at = v_ts;          -- respuestas en cascada
  delete from public.proveedores_cuentas where created_at = v_ts;
  delete from public.notificaciones where created_at = v_ts and enlace = '/autorizaciones';
end
$borrar$;

commit;
