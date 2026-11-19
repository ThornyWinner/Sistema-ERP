-- =====================================================================
-- datos_demo.sql — Datos de demostración para las pantallas que estaban vacías
-- =====================================================================
-- Carga, en una sola transacción y usando las funciones del sistema (con sus mismas
-- validaciones):
--  1. Historial de compras: 9 órdenes ENTREGADAS y pagadas de 2025 y principios de 2026,
--     con tallas y colores por partida y sus pasos de taller terminados. Dan contenido
--     al Historial de clientes (qué compra, tallas, frecuencia, inactivos, "repetir
--     pedido" del año pasado). Sus notas empiezan con "Datos de demostración:".
--  2. Seguimiento a clientes (contactos_cliente) de las dos vendedoras, con un
--     próximo contacto vencido y otros por venir.
--  3. Una devolución con reembolso y un cambio de talla (registrar_devolucion).
--  4. Dos solicitudes de factura: una pendiente y una rechazada (solicitar_factura /
--     atender_solicitud_factura). Se capturan los mismos datos fiscales que ya tiene
--     el cliente, así que el catálogo no cambia.
--  5. Mayoreo general y precios especiales para tres clientes.
--  6. Checadas del reloj checador del 4 al 19 de noviembre de 2026 para el personal
--     con horario (con algunos retardos y una que otra falta).
--
-- No toca las órdenes, pagos ni clientes que ya existían (salvo que las solicitudes de
-- factura cuelgan de ORD-2026-000004 y ORD-2026-000005). Se deshace con
-- sql/borrar_datos_demo.sql. Si ya se cargó, se detiene sin hacer nada.
-- =====================================================================
begin;

-- Orden entregada y pagada (anticipo del 50 % y liquidación a la entrega).
-- p_partidas: [{producto, talla, color, cantidad, precio, talleres: [...]}]
create or replace function pg_temp.demo_orden(
  p_cliente text, p_vendedor text, p_fecha date, p_entrega date, p_metodo text, p_tipo_venta text,
  p_partidas jsonb, p_nota text)
returns uuid
language plpgsql
as $f$
declare
  v_id uuid;
  v_x jsonb;
  v_det uuid;
  v_prod uuid;
  v_total numeric;
  v_ant numeric;
  v_i int := 0;
  v_j int;
  v_t text;
  v_anio int := extract(year from p_fecha);
  v_hoy int := extract(year from current_date);
  v_num int;
  v_cli uuid := (select id from public.clientes where razon_social = p_cliente);
  v_vend uuid := (select id from public.usuarios where nombre = p_vendedor);
  v_metodo_id uuid := (select id from public.metodos_pago where nombre = p_metodo);
  v_entregada uuid := (select id from public.estados_orden where nombre = 'Entregada');
  v_lista uuid := (select id from public.estados_orden where nombre = 'Lista para Entrega');
  v_alta timestamptz := (p_fecha + time '10:00') at time zone 'America/Monterrey';
  v_fin timestamptz := (p_entrega + time '16:00') at time zone 'America/Monterrey';
begin
  if v_cli is null or v_vend is null or v_metodo_id is null then
    raise exception 'Falta el cliente "%", el vendedor "%" o el método "%"', p_cliente, p_vendedor, p_metodo;
  end if;

  insert into public.ordenes (cliente_id, vendedor_id, fecha_creacion, fecha_entrega, subtotal, total, anticipo,
                              descuento, iva, notas, created_at, estado_id, metodo_pago_id, tipo_venta_id)
  values (v_cli, v_vend, p_fecha, p_entrega, 0, 0, 0, 0, 0, 'Datos de demostración: ' || p_nota, v_alta,
          v_entregada, v_metodo_id, (select id from public.tipos_venta where nombre = p_tipo_venta))
  returning id into v_id;

  -- El folio automático usa el año en curso: las órdenes de otro año llevan su propio consecutivo.
  if v_anio <> v_hoy then
    update public.consecutivos_documentos set ultimo_numero = ultimo_numero - 1
     where tipo_documento = 'ORDEN' and anio = v_hoy;
    insert into public.consecutivos_documentos (tipo_documento, anio, ultimo_numero)
    values ('ORDEN', v_anio, 0) on conflict (tipo_documento, anio) do nothing;
    update public.consecutivos_documentos set ultimo_numero = ultimo_numero + 1
     where tipo_documento = 'ORDEN' and anio = v_anio
    returning ultimo_numero into v_num;
    update public.ordenes set folio = 'ORD-' || v_anio || '-' || lpad(v_num::text, 6, '0') where id = v_id;
  end if;
  update public.historial_ordenes set created_at = v_alta where orden_id = v_id;

  for v_x in select * from jsonb_array_elements(p_partidas) loop
    v_prod := coalesce(
      (select d.producto_id from public.orden_detalles d where d.descripcion = v_x->>'producto' and d.producto_id is not null limit 1),
      (select p.id from public.productos p where p.nombre = v_x->>'producto' order by p.created_at limit 1));
    if v_prod is null then
      raise exception 'No existe el producto "%"', v_x->>'producto';
    end if;
    insert into public.orden_detalles (orden_id, producto_id, cantidad, precio_unitario, tipo_produccion,
                                       descripcion, talla, color, tasa_iva, created_at)
    values (v_id, v_prod, (v_x->>'cantidad')::int, (v_x->>'precio')::numeric,
            case when p_tipo_venta = 'Comercialización' then 'comercializacion' else 'fabricacion' end,
            v_x->>'producto', v_x->>'talla', v_x->>'color', 0.16, v_alta + make_interval(secs => v_i))
    returning id into v_det;
    v_i := v_i + 1;

    v_j := 0;
    for v_t in select jsonb_array_elements_text(coalesce(v_x->'talleres', '[]')) loop
      v_j := v_j + 1;
      insert into public.produccion_taller (orden_detalle_id, taller_id, usuario_id, estado, fecha_inicio, fecha_fin, created_at)
      values (v_det, (select id from public.talleres where nombre = v_t),
              (select u.id from public.usuarios u join public.roles r on r.id = u.rol_id
                where r.nombre = case v_t when 'diseno' then 'disenador' when 'sublimacion' then 'sublimador'
                                          when 'corte' then 'cortador' when 'costura' then 'costurera' else 'bordador' end
                order by u.nombre limit 1),
              'completed',
              ((p_fecha + v_j * 2) + time '09:00') at time zone 'America/Monterrey',
              ((p_fecha + v_j * 2 + 1) + time '17:00') at time zone 'America/Monterrey',
              v_alta);
    end loop;
  end loop;

  select total into v_total from public.ordenes where id = v_id;
  v_ant := round(v_total * 0.5, 2);
  insert into public.pagos (orden_id, fecha, monto, metodo_pago, metodo_pago_id, referencia, created_at)
  values (v_id, p_fecha, v_ant, p_metodo, v_metodo_id, 'Anticipo', v_alta);
  insert into public.pagos (orden_id, fecha, monto, metodo_pago, metodo_pago_id, referencia, created_at)
  values (v_id, p_entrega, v_total - v_ant, p_metodo, v_metodo_id, 'Liquidación', v_fin);
  update public.ordenes set anticipo = v_ant where id = v_id;

  insert into public.historial_ordenes (orden_id, usuario_id, estado_anterior_id, estado_nuevo_id, comentario, created_at)
  values (v_id, v_vend, v_lista, v_entregada, 'Entregada al cliente', v_fin);
  return v_id;
end;
$f$;

-- Ejecuta una función "como" un usuario (las funciones toman al usuario de la sesión).
create or replace function pg_temp.como(p_nombre text)
returns void
language sql
as $f$
  select set_config('request.jwt.claims',
    (select json_build_object('sub', auth_user_id, 'role', 'authenticated')::text from public.usuarios where nombre = p_nombre),
    true);
$f$;

do $seed$
declare
  o_minera uuid; o_constr1 uuid; o_constr2 uuid; o_hosp uuid; o_trans uuid;
  o_escuela uuid; o_agro uuid; o_fogon uuid; o_taller uuid;
  v jsonb;
  v_sol uuid;
  v_admin text;
  e record;
  d date;
  v_he time; v_hs time;
  r int;
  v_ent timestamptz; v_sal timestamptz;
  c_hilo constant jsonb := '["corte","costura","bordado"]';
begin
  if exists (select 1 from public.ordenes where notas like 'Datos de demostración:%') then
    raise exception 'Los datos de demostración ya están cargados (borra primero con sql/borrar_datos_demo.sql)';
  end if;

  -- Todo se captura como el administrador primario: así no aplican las políticas de
  -- crédito y descuento a las órdenes históricas.
  select u.nombre into v_admin from public.usuarios u join public.roles r on r.id = u.rol_id
  where r.nombre = 'admin_primario' and u.estado = 'activo' and u.auth_user_id is not null order by u.nombre limit 1;
  perform pg_temp.como(v_admin);

  ------------------------------------------------------------ 1. historial de compras
  o_minera := pg_temp.demo_orden('Minera Peñoles Unidad Saltillo', 'Fernanda Vanegas', '2025-11-12', '2025-12-05',
    'Transferencia', 'Fabricacion', jsonb_build_array(
      jsonb_build_object('producto', 'Overol Completo', 'talla', 'M',  'color', 'Azul Marino', 'cantidad', 10, 'precio', 800, 'talleres', c_hilo),
      jsonb_build_object('producto', 'Overol Completo', 'talla', 'L',  'color', 'Azul Marino', 'cantidad', 12, 'precio', 800, 'talleres', c_hilo),
      jsonb_build_object('producto', 'Overol Completo', 'talla', 'XL', 'color', 'Azul Marino', 'cantidad', 6,  'precio', 800, 'talleres', c_hilo)),
    'overoles de fin de año con logo bordado al pecho');

  o_constr1 := pg_temp.demo_orden('Constructora del Norte S.A. de C.V.', 'Karla Flores', '2025-03-18', '2025-04-08',
    'Transferencia', 'Fabricacion', jsonb_build_array(
      jsonb_build_object('producto', 'Camisa Industrial Manga Larga', 'talla', 'M',  'color', 'Gris', 'cantidad', 15, 'precio', 500, 'talleres', c_hilo),
      jsonb_build_object('producto', 'Camisa Industrial Manga Larga', 'talla', 'L',  'color', 'Gris', 'cantidad', 20, 'precio', 500, 'talleres', c_hilo),
      jsonb_build_object('producto', 'Camisa Industrial Manga Larga', 'talla', 'XL', 'color', 'Gris', 'cantidad', 5,  'precio', 500, 'talleres', c_hilo),
      jsonb_build_object('producto', 'Pantalón Cargo Reforzado', 'talla', '32', 'color', 'Gris', 'cantidad', 10, 'precio', 600, 'talleres', '["corte","costura"]'::jsonb),
      jsonb_build_object('producto', 'Pantalón Cargo Reforzado', 'talla', '34', 'color', 'Gris', 'cantidad', 15, 'precio', 600, 'talleres', '["corte","costura"]'::jsonb),
      jsonb_build_object('producto', 'Pantalón Cargo Reforzado', 'talla', '36', 'color', 'Gris', 'cantidad', 5,  'precio', 600, 'talleres', '["corte","costura"]'::jsonb)),
    'uniforme de obra 2025');

  o_constr2 := pg_temp.demo_orden('Constructora del Norte S.A. de C.V.', 'Karla Flores', '2025-09-02', '2025-09-12',
    'Transferencia', 'Comercialización', jsonb_build_array(
      jsonb_build_object('producto', 'Chaleco Reflectivo', 'talla', 'Unitalla', 'color', 'Naranja', 'cantidad', 40, 'precio', 360, 'talleres', '["bordado"]'::jsonb)),
    'chalecos para la obra de Ramos Arizpe');

  o_hosp := pg_temp.demo_orden('Hospital San José de Coahuila', 'Karla Flores', '2025-06-10', '2025-06-30',
    'Transferencia', 'Fabricacion', jsonb_build_array(
      jsonb_build_object('producto', 'Camisa Ejecutiva', 'talla', 'S', 'color', 'Blanco', 'cantidad', 8,  'precio', 430, 'talleres', c_hilo),
      jsonb_build_object('producto', 'Camisa Ejecutiva', 'talla', 'M', 'color', 'Blanco', 'cantidad', 12, 'precio', 430, 'talleres', c_hilo),
      jsonb_build_object('producto', 'Camisa Ejecutiva', 'talla', 'L', 'color', 'Blanco', 'cantidad', 6,  'precio', 430, 'talleres', c_hilo)),
    'camisas del área administrativa');

  o_trans := pg_temp.demo_orden('Transportes Rápidos del Bajío', 'Fernanda Vanegas', '2025-05-20', '2025-06-06',
    'Transferencia', 'Mixto', jsonb_build_array(
      jsonb_build_object('producto', 'Chaleco Reflectivo', 'talla', 'Unitalla', 'color', 'Naranja', 'cantidad', 25, 'precio', 360, 'talleres', '["bordado"]'::jsonb),
      jsonb_build_object('producto', 'Camisa Ejecutiva', 'talla', 'M', 'color', 'Azul Cielo', 'cantidad', 10, 'precio', 460, 'talleres', c_hilo),
      jsonb_build_object('producto', 'Camisa Ejecutiva', 'talla', 'L', 'color', 'Azul Cielo', 'cantidad', 10, 'precio', 460, 'talleres', c_hilo)),
    'operadores y oficina');

  o_escuela := pg_temp.demo_orden('Escuela Técnica Industrial No. 12', 'Fernanda Vanegas', '2025-08-04', '2025-08-22',
    'Efectivo', 'Fabricacion', jsonb_build_array(
      jsonb_build_object('producto', 'Pantalón Cargo Reforzado', 'talla', '28', 'color', 'Azul Marino', 'cantidad', 20, 'precio', 580, 'talleres', c_hilo),
      jsonb_build_object('producto', 'Pantalón Cargo Reforzado', 'talla', '30', 'color', 'Azul Marino', 'cantidad', 20, 'precio', 580, 'talleres', c_hilo),
      jsonb_build_object('producto', 'Pantalón Cargo Reforzado', 'talla', '32', 'color', 'Azul Marino', 'cantidad', 10, 'precio', 580, 'talleres', c_hilo)),
    'pantalones de taller para el ciclo 2025-2026');

  o_agro := pg_temp.demo_orden('Agroindustrias La Laguna', 'Fernanda Vanegas', '2025-10-01', '2025-10-20',
    'Transferencia', 'Fabricacion', jsonb_build_array(
      jsonb_build_object('producto', 'Camisa Industrial Manga Larga', 'talla', 'M', 'color', 'Azul Marino', 'cantidad', 15, 'precio', 510, 'talleres', c_hilo),
      jsonb_build_object('producto', 'Camisa Industrial Manga Larga', 'talla', 'L', 'color', 'Azul Marino', 'cantidad', 15, 'precio', 510, 'talleres', c_hilo)),
    'camisas para el personal de planta');

  o_fogon := pg_temp.demo_orden('Restaurante El Fogón Norteño', 'Karla Flores', '2026-04-22', '2026-05-08',
    'Tarjeta Crédito', 'Fabricacion', jsonb_build_array(
      jsonb_build_object('producto', 'Camisa Ejecutiva', 'talla', 'M', 'color', 'Negro', 'cantidad', 6, 'precio', 480, 'talleres', '["diseno","corte","costura","bordado"]'::jsonb),
      jsonb_build_object('producto', 'Camisa Ejecutiva', 'talla', 'L', 'color', 'Negro', 'cantidad', 6, 'precio', 480, 'talleres', '["diseno","corte","costura","bordado"]'::jsonb)),
    'camisas para meseros con logo nuevo');

  o_taller := pg_temp.demo_orden('Taller Mecánico Hernández', 'Fernanda Vanegas', '2026-03-03', '2026-03-20',
    'Efectivo', 'Fabricacion', jsonb_build_array(
      jsonb_build_object('producto', 'Overol Completo', 'talla', 'L',  'color', 'Gris', 'cantidad', 3, 'precio', 850, 'talleres', '["corte","costura"]'::jsonb),
      jsonb_build_object('producto', 'Overol Completo', 'talla', 'XL', 'color', 'Gris', 'cantidad', 2, 'precio', 850, 'talleres', '["corte","costura"]'::jsonb)),
    'overoles para mecánicos');

  ------------------------------------------------------------ 2. seguimiento a clientes
  insert into public.contactos_cliente (cliente_id, usuario_id, fecha, canal, resultado, notas, proximo_contacto)
  select c.id, u.id, x.fecha::timestamptz, x.canal, x.resultado, x.notas, x.proximo::date
  from (values
    ('Minera Peñoles Unidad Saltillo', 'Fernanda Vanegas', '2026-11-10 17:20-06', 'whatsapp', 'cotizacion',
     'Pidió cotizar otra vez los 28 overoles del año pasado para fin de año.', '2026-11-21'),
    ('Restaurante El Fogón Norteño', 'Karla Flores', '2026-10-20 12:05-06', 'llamada', 'sin_respuesta',
     'No contestó; dejar recado con el gerente para las camisas de temporada.', '2026-11-03'),
    ('Hospital San José de Coahuila', 'Karla Flores', '2026-09-15 10:30-06', 'visita', 'interesado',
     'Interesados en uniformes de enfermería para 2027; mandar catálogo y muestras.', '2026-12-01'),
    ('Constructora del Norte S.A. de C.V.', 'Karla Flores', '2026-01-05 09:40-06', 'correo', 'pedido',
     'Confirmó el pedido de camisas de este año.', null),
    ('Escuela Técnica Industrial No. 12', 'Fernanda Vanegas', '2026-07-28 13:15-06', 'whatsapp', 'interesado',
     'Pidieron precios de pantalón para el nuevo ciclo escolar.', '2026-08-04'),
    ('Taller Mecánico Hernández', 'Fernanda Vanegas', '2026-11-12 16:00-06', 'llamada', 'no_interesado',
     'Por ahora no necesitan; volver a buscarlos en enero.', '2027-01-12'),
    ('Transportes Rápidos del Bajío', 'Fernanda Vanegas', '2026-10-30 11:10-06', 'whatsapp', 'pedido',
     'Confirmó chalecos y camisas (ORD-2026-000006).', null),
    ('Agroindustrias La Laguna', 'Fernanda Vanegas', '2026-09-22 18:00-06', 'llamada', 'interesado',
     'Quieren repetir las camisas de planta antes de la cosecha.', '2026-10-06')
  ) as x(cliente, vendedor, fecha, canal, resultado, notas, proximo)
  join public.clientes c on c.razon_social = x.cliente
  join public.usuarios u on u.nombre = x.vendedor;

  ------------------------------------------------------------ 3. devolución y cambio de talla
  perform pg_temp.como('Karla Flores');
  v := public.registrar_devolucion(o_constr1, jsonb_build_object(
    'motivo', 'defecto', 'descripcion', 'Costura de la entrepierna abierta en dos pantalones.',
    'devueltas', jsonb_build_array(jsonb_build_object(
      'detalle_id', (select id from public.orden_detalles where orden_id = o_constr1 and talla = '36'), 'cantidad', 2)),
    'reembolsar', true, 'metodo_reembolso', 'Transferencia'));
  update public.devoluciones set fecha = '2025-04-21' where id = (v->>'id')::uuid;
  update public.pagos set fecha = '2025-04-21' where devolucion_id = (v->>'id')::uuid;

  perform pg_temp.como('Fernanda Vanegas');
  v := public.registrar_devolucion(o_agro, jsonb_build_object(
    'motivo', 'talla', 'descripcion', 'Les quedaron chicas; se cambiaron por XL del inventario.',
    'devueltas', jsonb_build_array(jsonb_build_object(
      'detalle_id', (select id from public.orden_detalles where orden_id = o_agro and talla = 'M'), 'cantidad', 3,
      'reingresar_variante_id', (select v2.id from public.variantes_producto v2
                                  join public.orden_detalles d on d.producto_id = v2.producto_id
                                  where d.orden_id = o_agro and d.talla = 'M' and v2.talla = 'M' and v2.color = 'Azul Marino' limit 1))),
    'nuevas', jsonb_build_array(jsonb_build_object(
      'variante_id', (select v2.id from public.variantes_producto v2
                      join public.orden_detalles d on d.producto_id = v2.producto_id
                      where d.orden_id = o_agro and d.talla = 'M' and v2.talla = 'XL' and v2.color = 'Azul Marino' and v2.stock >= 3 limit 1),
      'cantidad', 3, 'precio_unitario', 510))));
  update public.devoluciones set fecha = '2025-10-27' where id = (v->>'id')::uuid;

  ------------------------------------------------------------ 4. solicitudes de factura
  perform pg_temp.como('Miguel Angél Salas Muñiz');
  perform public.solicitar_factura((select id from public.ordenes where folio = 'ORD-2026-000005'), jsonb_build_object(
    'rfc', 'HSJ010215RS8', 'razon_social', 'HOSPITAL SAN JOSE DE COAHUILA', 'regimen_fiscal', '603',
    'codigo_postal', '25270', 'uso_cfdi', 'G03', 'metodo_pago', 'PUE', 'forma_pago', '03',
    'notas', 'La necesitan antes de pagar; anexar su orden de compra OC-4471.'));

  perform pg_temp.como('Fernanda Vanegas');
  v_sol := public.solicitar_factura((select id from public.ordenes where folio = 'ORD-2026-000004'), jsonb_build_object(
    'rfc', 'MPS870611LP6', 'razon_social', 'MINERA PEÑOLES UNIDAD SALTILLO', 'regimen_fiscal', '601',
    'codigo_postal', '25290', 'uso_cfdi', 'G03', 'metodo_pago', 'PPD', 'forma_pago', '99',
    'notas', 'Facturar el total; el saldo se paga a 30 días.'));
  perform pg_temp.como(v_admin);
  perform public.atender_solicitud_factura(v_sol, 'rechazada',
    'Falta el número de orden de compra de Peñoles (lo exigen en la factura). Pídelo y vuelve a solicitarla.');

  ------------------------------------------------------------ 5. mayoreo y precios por cliente
  insert into public.escalas_mayoreo (producto_id, cantidad_min, descuento_pct) values
    (null, 12, 3), (null, 50, 6), (null, 100, 10),
    ((select producto_id from public.orden_detalles where descripcion = 'Chaleco Reflectivo' and producto_id is not null limit 1), 30, 8);

  insert into public.precios_cliente (cliente_id, producto_id, descuento_pct, precio, vigente_hasta, notas)
  values
    ((select id from public.clientes where razon_social = 'Constructora del Norte S.A. de C.V.'), null, 8, null, null,
     'Convenio anual 2026'),
    ((select id from public.clientes where razon_social = 'Minera Peñoles Unidad Saltillo'),
     (select producto_id from public.orden_detalles where descripcion = 'Overol Completo' and producto_id is not null limit 1),
     null, 790, '2026-12-31', 'Precio pactado para el pedido de fin de año'),
    ((select id from public.clientes where razon_social = 'Magna International'),
     (select producto_id from public.orden_detalles where descripcion = 'Camisa Industrial Manga Larga' and producto_id is not null limit 1),
     null, 495, null, 'Contrato marco 2026');

  ------------------------------------------------------------ 6. reloj checador
  for e in
    select em.id, em.horario_id, h.sede_id, s.latitud, s.longitud
    from public.empleados em
    join public.horarios h on h.id = em.horario_id
    left join public.sedes s on s.id = h.sede_id
    where em.activo
  loop
    for d in select g::date from generate_series(date '2026-11-04', (private.ahora_local())::date, interval '1 day') g loop
      select hd.hora_entrada, hd.hora_salida into v_he, v_hs
      from public.horario_dias hd where hd.horario_id = e.horario_id and hd.dia_semana = extract(isodow from d);
      continue when not found or exists (select 1 from public.dias_inhabiles di where di.fecha = d);
      r := abs(hashtext(e.id::text || d::text)) % 100;
      continue when r >= 96;  -- falta
      -- Llega entre 12 min antes y 3 después; 9 de cada 100 días, con retardo de 11 a 27 min.
      v_ent := ((d + v_he) + make_interval(mins => case when r < 9 then 11 + r * 2 else (r % 16) - 12 end))
               at time zone 'America/Monterrey';
      continue when v_ent > now();
      insert into public.checadas (empleado_id, sede_id, tipo, fecha, fecha_hora, latitud, longitud, precision_m, distancia_m, origen)
      values (e.id, e.sede_id, 'entrada', d, v_ent,
              e.latitud + ((r % 7) - 3) * 0.00004, e.longitud + ((r % 5) - 2) * 0.00004, 6 + r % 20, 4 + r % 45, 'qr');
      v_sal := ((d + v_hs) + make_interval(mins => r % 23)) at time zone 'America/Monterrey';
      if v_sal <= now() then
        insert into public.checadas (empleado_id, sede_id, tipo, fecha, fecha_hora, latitud, longitud, precision_m, distancia_m, origen)
        values (e.id, e.sede_id, 'salida', d, v_sal,
                e.latitud + ((r % 3) - 1) * 0.00004, e.longitud + ((r % 7) - 3) * 0.00004, 6 + r % 15, 3 + r % 40, 'qr');
      end if;
    end loop;
  end loop;
end
$seed$;

commit;
