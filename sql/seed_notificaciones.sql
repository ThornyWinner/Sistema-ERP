-- =============================================================================
-- seed_notificaciones.sql — Datos de prueba para la campana de notificaciones.
--
-- Incluye:
--  - Notificaciones entre usuarios (individuales y a roles completos), leídas y sin leer.
--  - Avisos automáticos de cambio de taller y de orden terminada, coherentes con el
--    avance real de las órdenes (ORD-2026-000002, 000003, 000004, 000006, 000009).
--
-- Los usuarios y órdenes se buscan por nombre y folio; si alguno no existe, esa fila
-- simplemente no se inserta. Es repetible: primero borra los datos de prueba anteriores.
-- Todas las filas de prueba usan envio_id con prefijo 00000000-0000-4000-8000-.
--
-- Para borrar los datos de prueba:
--   delete from public.notificaciones where envio_id::text like '00000000-0000-4000-8000-%';
-- =============================================================================

delete from public.notificaciones where envio_id::text like '00000000-0000-4000-8000-%';

insert into public.notificaciones
  (envio_id, destinatario_id, destinatario_nombre, remitente_id, remitente_nombre,
   titulo, mensaje, enlace, leida_at, created_at)
select
  ('00000000-0000-4000-8000-' || lpad(v.envio::text, 12, '0'))::uuid,
  d.id, d.nombre,
  r.id, coalesce(r.nombre, 'Aviso automático'),
  v.titulo, v.mensaje,
  replace(v.enlace, '{orden}', coalesce(o.id::text, '')),
  case when v.leida then now() - v.hace + interval '10 minutes' end,
  now() - v.hace
from (values
  -- ---------------- Notificaciones entre usuarios ----------------
  -- 1. Admin → rol vendedor (envío a todo el rol): una leída y otra no.
  (1, 'Fernanda Vanegas', 'Héctor Daniel Salas Pérez', 'Junta de ventas el viernes a las 10:00',
   'Revisaremos las órdenes pendientes de cobro y las entregas de la próxima semana. Traigan sus avances.',
   null, null, interval '3 days', true),
  (1, 'Karla Flores', 'Héctor Daniel Salas Pérez', 'Junta de ventas el viernes a las 10:00',
   'Revisaremos las órdenes pendientes de cobro y las entregas de la próxima semana. Traigan sus avances.',
   null, null, interval '3 days', false),

  -- 2. Vendedora → diseñadora, con enlace a la orden.
  (2, 'Rosa Sosa', 'Karla Flores', 'El cliente aprobó el logo de ORD-2026-000001',
   'Ya pueden continuar con el diseño final. El cliente pidió el logo un poco más grande en la espalda.',
   '/ordenes/{orden}', 'ORD-2026-000001', interval '5 hours', false),

  -- 3. Vendedora → costurera: urgente.
  (3, 'Carmen Torres', 'Fernanda Vanegas', 'Urgente: adelantar ORD-2026-000004',
   'El cliente necesita la entrega dos días antes. ¿Podrían darle prioridad en costura en cuanto salga de corte?',
   '/ordenes/{orden}', 'ORD-2026-000004', interval '40 minutes', false),

  -- 4. Admin → todos los talleres (mismo envío, distintos estados de lectura).
  (4, 'Rosa Sosa', 'Héctor Daniel Salas Pérez', 'Inventario: reporten el consumo de hilos',
   'Antes del cierre de semana, registren cuánto hilo usaron por orden para ajustar el inventario de materiales.',
   '/inventario/materiales', null, interval '1 day', false),
  (4, 'Felipe López', 'Héctor Daniel Salas Pérez', 'Inventario: reporten el consumo de hilos',
   'Antes del cierre de semana, registren cuánto hilo usaron por orden para ajustar el inventario de materiales.',
   '/inventario/materiales', null, interval '1 day', false),
  (4, 'Ramón Sánchez', 'Héctor Daniel Salas Pérez', 'Inventario: reporten el consumo de hilos',
   'Antes del cierre de semana, registren cuánto hilo usaron por orden para ajustar el inventario de materiales.',
   '/inventario/materiales', null, interval '1 day', true),
  (4, 'Carmen Torres', 'Héctor Daniel Salas Pérez', 'Inventario: reporten el consumo de hilos',
   'Antes del cierre de semana, registren cuánto hilo usaron por orden para ajustar el inventario de materiales.',
   '/inventario/materiales', null, interval '1 day', true),
  (4, 'Jesús Pérez Pérez', 'Héctor Daniel Salas Pérez', 'Inventario: reporten el consumo de hilos',
   'Antes del cierre de semana, registren cuánto hilo usaron por orden para ajustar el inventario de materiales.',
   '/inventario/materiales', null, interval '1 day', false),

  -- 5. Costurera → admin: falta material.
  (5, 'Héctor Daniel Salas Pérez', 'Carmen Torres', 'Falta hilo azul marino para ORD-2026-000003',
   'Nos quedan dos conos y la orden lleva 40 camisas. ¿Se puede pedir al proveedor hoy?',
   '/inventario/materiales', null, interval '2 hours', false),

  -- 6. Diseñadora → sublimador.
  (6, 'Felipe López', 'Rosa Sosa', 'Archivos de diseño de ORD-2026-000006 listos',
   'Dejé los archivos finales en la carpeta compartida. Revisa los colores del degradado antes de imprimir.',
   '/talleres/sublimacion', null, interval '1 day 3 hours', true),

  -- 7. Admin secundario → admin primario.
  (7, 'Héctor Daniel Salas Pérez', 'Miguel Angél Salas Muñiz', 'Reporte mensual listo para revisión',
   'Ya está el reporte de ventas de octubre en la sección de Reportes. Hay dos órdenes con descuento que conviene revisar.',
   '/reportes', null, interval '2 days', true),

  -- ---------------- Avisos automáticos (remitente nulo) ----------------
  -- 8. ORD-2026-000004: Diseño terminado → Corte (corte ya está en proceso: leída).
  (8, 'Ramón Sánchez', null, 'Orden ORD-2026-000004 lista para Corte',
   '25 × Overol Completo terminó Diseño (por Rosa Sosa). Ya puede pasar a Corte.',
   '/talleres/corte', null, interval '2 days 4 hours', true),

  -- 9. ORD-2026-000006: Diseño terminado → Sublimación.
  (9, 'Felipe López', null, 'Orden ORD-2026-000006 lista para Sublimación',
   '30 × Camisa Ejecutiva terminó Diseño (por Rosa Sosa). Ya puede pasar a Sublimación.',
   '/talleres/sublimacion', null, interval '1 day 2 hours', false),

  -- 10. ORD-2026-000003: Corte terminado → Costura (costura en proceso: leída).
  (10, 'Carmen Torres', null, 'Orden ORD-2026-000003 lista para Costura',
   '40 × Camisa Industrial Manga Larga terminó Corte (por Ramón Sánchez). Ya puede pasar a Costura.',
   '/talleres/costura', null, interval '1 day 6 hours', true),

  -- 11. ORD-2026-000009: Costura terminada → Bordado (bordado ya en proceso: leída).
  (11, 'Jesús Pérez Pérez', null, 'Orden ORD-2026-000009 lista para Bordado',
   '20 × Camisa Industrial Manga Larga terminó Costura (por Carmen Torres). Ya puede pasar a Bordado.',
   '/talleres/bordado', null, interval '8 hours', true),

  -- 12. ORD-2026-000002: terminó producción → vendedora de la orden y admin primario.
  (12, 'Karla Flores', null, 'Orden ORD-2026-000002 terminó producción',
   'Todos los productos completaron sus talleres (último: Bordado, por Jesús Pérez Pérez). Lista para revisión y entrega.',
   '/ordenes/{orden}', 'ORD-2026-000002', interval '3 hours', false),
  (12, 'Héctor Daniel Salas Pérez', null, 'Orden ORD-2026-000002 terminó producción',
   'Todos los productos completaron sus talleres (último: Bordado, por Jesús Pérez Pérez). Lista para revisión y entrega.',
   '/ordenes/{orden}', 'ORD-2026-000002', interval '3 hours', false)
) as v(envio, para, de, titulo, mensaje, enlace, folio, hace, leida)
join public.usuarios d on d.nombre = v.para and d.estado = 'activo'
left join public.usuarios r on r.nombre = v.de
left join public.ordenes o on o.folio = v.folio
-- Si se pidió un remitente o una orden que no existe, la fila se omite.
where (v.de is null or r.id is not null)
  and (v.folio is null or o.id is not null);
