-- =====================================================================
-- borrar_datos_demo.sql — Quita lo que cargó sql/datos_demo.sql
-- =====================================================================
-- Todo lo que cargó datos_demo.sql se creó en la misma transacción, así que comparte la
-- misma marca de tiempo (created_at); con ella se identifican las filas que no cuelgan de
-- las órdenes de demostración (checadas, contactos, precios, solicitudes, avisos). Las
-- órdenes de demostración se reconocen por sus notas ("Datos de demostración: …").
-- Devuelve al inventario lo que movió el cambio de talla. Los consecutivos de folio no
-- se regresan (los folios no se reutilizan).
-- =====================================================================
begin;

do $borrar$
declare
  v_ts timestamptz;
  v_ordenes uuid[];
begin
  select array_agg(id) into v_ordenes from public.ordenes where notas like 'Datos de demostración:%';
  if v_ordenes is null then
    raise exception 'No hay datos de demostración cargados';
  end if;
  select min(d.created_at) into v_ts from public.devoluciones d where d.orden_id = any (v_ordenes);
  if v_ts is null then
    raise exception 'No se encontró la marca de tiempo de la carga (¿se borraron las devoluciones de demostración?)';
  end if;

  -- Inventario: el reingreso sumó piezas y el cambio las sacó.
  update public.variantes_producto v
     set stock = v.stock - x.delta
    from (select dp.variante_id,
                 sum(case when dp.sentido = 'devuelve' then dp.cantidad else -dp.cantidad end) as delta
          from public.devolucion_partidas dp
          join public.devoluciones d on d.id = dp.devolucion_id
          where d.orden_id = any (v_ordenes) and dp.variante_id is not null
          group by dp.variante_id) x
   where v.id = x.variante_id;
  delete from public.movimientos_producto where created_at = v_ts;

  delete from public.pagos where orden_id = any (v_ordenes);
  delete from public.ordenes where id = any (v_ordenes);

  delete from public.solicitudes_factura where solicitada_at = v_ts;
  delete from public.notificaciones where created_at = v_ts;
  delete from public.contactos_cliente where created_at = v_ts;
  delete from public.escalas_mayoreo where created_at = v_ts;
  delete from public.precios_cliente where updated_at = v_ts;
  delete from public.checadas where created_at = v_ts;
end
$borrar$;

commit;
