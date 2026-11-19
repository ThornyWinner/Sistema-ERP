-- =====================================================================
-- datos_demo_ventas.sql — Datos de demostración: autorizaciones, listas de tallas y
-- cuentas bancarias de proveedores
-- =====================================================================
-- Requiere los scripts autorizaciones_venta.sql, listas_tallas.sql y
-- proveedores_cuentas.sql. Todo se crea en una transacción, así que comparte la misma
-- marca de tiempo (created_at); sql/borrar_datos_demo_ventas.sql la usa para quitarlo.
-- Las cuentas bancarias son ficticias (pasan las validaciones, pero no existen).
--
--  - Cuentas: 6 cuentas en los 4 proveedores (CLABE, tarjeta y cuenta).
--  - Autorizaciones: 2 pendientes, 1 aprobada sin usar (Karla puede crear la orden) y
--    1 rechazada, con sus notificaciones.
--  - Listas de tallas: Magna (abierta, 14 personas), Agroindustrias (abierta, 6) y
--    Fogón Norteño (cerrada, 4).
-- El seguimiento público no necesita datos: cada orden ya tiene su enlace.
-- =====================================================================
begin;

-- Partida de la captura (ProductoCaptura del formulario de orden).
create function pg_temp.p(p_nombre text, p_tipo text, p_talla text, p_color text, p_cantidad integer, p_precio numeric)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'nombre', p_nombre, 'tipoPrenda', p_tipo, 'marca', '', 'talla', p_talla, 'color', p_color,
    'cantidad', p_cantidad, 'precioUnitario', p_precio, 'tipoProduccion', 'fabricacion',
    'talleres', jsonb_build_array('corte', 'costura'), 'requiereBordado', false,
    'bordadoUbicacion', 'bolsillo', 'bordadoColores', '', 'bordadoNotas', '')
$$;

do $demo$
declare
  v_admin uuid;
  v_admin_nombre text;
  v_karla uuid;
  v_fernanda uuid;
  v_ts timestamptz := now();
  v_hoy date := (private.ahora_local())::date;
  v_saldo_constructora numeric;
  v_lista uuid;
begin
  if exists (select 1 from public.autorizaciones_venta where justificacion like '%(demo)%') then
    raise exception 'Los datos de demostración de ventas ya están cargados';
  end if;

  select u.id, u.nombre into v_admin, v_admin_nombre from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where ro.nombre = 'admin_primario' and u.estado = 'activo' order by u.created_at limit 1;
  select id into v_karla from public.usuarios where nombre = 'Karla Flores';
  select id into v_fernanda from public.usuarios where nombre = 'Fernanda Vanegas';
  if v_admin is null or v_karla is null or v_fernanda is null then
    raise exception 'Faltan usuarios de demostración (admin primario, Karla Flores, Fernanda Vanegas)';
  end if;

  ------------------------------------------------------------ cuentas de proveedores
  insert into public.proveedores_cuentas (proveedor_id, tipo, numero, banco, titular, principal, notas)
  select p.id, x.tipo, x.numero, x.banco, x.titular, x.principal, x.notas
  from (values
    ('Textiles del Norte', 'clabe', '012078012345678901', 'BBVA México', 'Textiles del Norte S.A. de C.V.', true,
     'Mandar comprobante a cobranza@textilesdelnorte.mx con el número de pedido'),
    ('Textiles del Norte', 'tarjeta', '4152310000123456', 'BBVA México', 'Juan Pérez', false,
     'Solo para compras urgentes de mostrador'),
    ('Telas Industriales SA', 'clabe', '072078055512345679', 'Banorte', 'Telas Industriales S.A.', true, null),
    ('Mercería Central', 'tarjeta', '4931720000987650', 'Santander', 'Carlos Ramírez', true,
     'Depósito en Oxxo o transferencia a tarjeta'),
    ('Accesorios Industriales', 'clabe', '002078098765432104', 'Banamex', 'Accesorios Industriales del Norte', true, null),
    ('Accesorios Industriales', 'cuenta', '7012345678', 'Banamex', 'Accesorios Industriales del Norte', false,
     'Número de cuenta para depósito en ventanilla')
  ) as x(proveedor, tipo, numero, banco, titular, principal, notas)
  join public.proveedores p on p.nombre = x.proveedor;

  ------------------------------------------------------------ autorizaciones
  select coalesce(sum(s.saldo), 0) into v_saldo_constructora
  from private.ordenes_con_saldo('cc8c4082-f316-4177-9307-f91e1dc05514', null) s;

  -- 1. Pendiente (crédito): Karla, Constructora del Norte, deja $59,344 a crédito.
  insert into public.autorizaciones_venta
    (solicitante_id, cliente_id, cliente_nombre, descuento, saldo, subtotal, total, motivo_bloqueo, justificacion, captura, estado, created_at)
  select v_karla, c.id, c.razon_social, null, 59344, 68400, 79344,
    format('Se excede el límite de crédito: disponible %s y esta orden deja $59,344.00 pendientes. Pide un anticipo mayor o autorización al administrador.',
           '$' || to_char(greatest(80000 - v_saldo_constructora, 0), 'FM999,999,990.00')),
    'Arranque de obra en Derramadero; liquidan la orden anterior el viernes y el residente firma la orden de compra hoy. (demo)',
    jsonb_build_object(
      'cliente', c.razon_social, 'clienteTelefono', coalesce(c.telefono, ''), 'clienteEmail', coalesce(c.email, ''),
      'descuento', 0, 'notas', 'Bordado del logo en pecho izquierdo.', 'fechaEntrega', (v_hoy + 21)::text,
      'metodoPago', 'credito', 'anticipo', 20000,
      'productos', jsonb_build_array(
        pg_temp.p('Camisa Industrial Manga Larga', 'camisa', 'M', 'Azul marino', 20, 520),
        pg_temp.p('Camisa Industrial Manga Larga', 'camisa', 'L', 'Azul marino', 25, 520),
        pg_temp.p('Camisa Industrial Manga Larga', 'camisa', 'XL', 'Azul marino', 15, 520),
        pg_temp.p('Pantalón Cargo Reforzado', 'pantalon', '32', 'Azul marino', 20, 620),
        pg_temp.p('Pantalón Cargo Reforzado', 'pantalon', '34', 'Azul marino', 25, 620),
        pg_temp.p('Pantalón Cargo Reforzado', 'pantalon', '36', 'Azul marino', 15, 620))),
    'pendiente', v_ts
  from public.clientes c where c.id = 'cc8c4082-f316-4177-9307-f91e1dc05514';

  -- 2. Pendiente (descuento 15 %): Fernanda, Escuela Técnica.
  insert into public.autorizaciones_venta
    (solicitante_id, cliente_id, cliente_nombre, descuento, saldo, subtotal, total, motivo_bloqueo, justificacion, captura, estado, created_at)
  select v_fernanda, c.id, c.razon_social, 5062.50, null, 33750, 33277.50,
    'El descuento de $5,062.50 (15 %) pasa del máximo permitido de 10 % del subtotal. Pide autorización al administrador.',
    'Licitación de la escuela: la competencia cotizó 14 % abajo de nuestra lista. Son 150 playeras y repiten cada semestre. (demo)',
    jsonb_build_object(
      'cliente', c.razon_social, 'clienteTelefono', coalesce(c.telefono, ''), 'clienteEmail', coalesce(c.email, ''),
      'descuento', 5062.50, 'notas', 'Escudo de la escuela bordado al frente.', 'fechaEntrega', (v_hoy + 30)::text,
      'metodoPago', 'transferencia', 'anticipo', 16000,
      'productos', jsonb_build_array(
        pg_temp.p('Playera Tipo Polo · Gildan', 'playera', 'CH', 'Blanco', 30, 225),
        pg_temp.p('Playera Tipo Polo · Gildan', 'playera', 'M', 'Blanco', 50, 225),
        pg_temp.p('Playera Tipo Polo · Gildan', 'playera', 'G', 'Blanco', 45, 225),
        pg_temp.p('Playera Tipo Polo · Gildan', 'playera', 'XG', 'Blanco', 25, 225))),
    'pendiente', v_ts
  from public.clientes c where c.id = '1e5b09db-167a-424f-a166-593b818c6c90';

  -- 3. Aprobada, sin usar (descuento 12 %): Karla, Hospital San José.
  insert into public.autorizaciones_venta
    (solicitante_id, cliente_id, cliente_nombre, descuento, saldo, subtotal, total, motivo_bloqueo, justificacion, captura,
     estado, resuelta_por, resuelta_at, comentario, vence, created_at)
  select v_karla, c.id, c.razon_social, 2160, null, 18000, 18374.40,
    'El descuento de $2,160.00 (12 %) pasa del máximo permitido de 10 % del subtotal. Pide autorización al administrador.',
    'Renovación anual del personal de enfermería; nos dieron el pedido completo si igualamos el precio del año pasado. (demo)',
    jsonb_build_object(
      'cliente', c.razon_social, 'clienteTelefono', coalesce(c.telefono, ''), 'clienteEmail', coalesce(c.email, ''),
      'descuento', 2160, 'notas', 'Nombre bordado en cada camisa (lista aparte).', 'fechaEntrega', (v_hoy + 15)::text,
      'metodoPago', 'transferencia', 'anticipo', 9000,
      'productos', jsonb_build_array(
        pg_temp.p('Camisa Ejecutiva', 'camisa', 'M', 'Blanco', 15, 450),
        pg_temp.p('Camisa Ejecutiva', 'camisa', 'L', 'Blanco', 15, 450),
        pg_temp.p('Camisa Ejecutiva', 'camisa', 'XL', 'Blanco', 10, 450))),
    'aprobada', v_admin, v_ts, 'Autorizado por volumen; que deje 50 % de anticipo.', v_hoy + 7, v_ts
  from public.clientes c where c.id = '99d58d2d-8d99-492c-854f-cfb16847a3dd';

  -- 4. Rechazada (descuento 25 %): Fernanda, Transportes Rápidos del Bajío.
  insert into public.autorizaciones_venta
    (solicitante_id, cliente_id, cliente_nombre, descuento, saldo, subtotal, total, motivo_bloqueo, justificacion, captura,
     estado, resuelta_por, resuelta_at, comentario, created_at)
  select v_fernanda, c.id, c.razon_social, 7600, null, 30400, 26448,
    'El descuento de $7,600.00 (25 %) pasa del máximo permitido de 10 % del subtotal. Pide autorización al administrador.',
    'El cliente pide el mismo precio que le da su proveedor actual de chalecos. (demo)',
    jsonb_build_object(
      'cliente', c.razon_social, 'clienteTelefono', coalesce(c.telefono, ''), 'clienteEmail', coalesce(c.email, ''),
      'descuento', 7600, 'notas', '', 'fechaEntrega', (v_hoy + 10)::text, 'metodoPago', 'efectivo', 'anticipo', 0,
      'productos', jsonb_build_array(
        pg_temp.p('Chaleco Reflectivo', 'chaleco', 'L', 'Naranja', 40, 380),
        pg_temp.p('Chaleco Reflectivo', 'chaleco', 'XL', 'Naranja', 40, 380))),
    'rechazada', v_admin, v_ts, 'Máximo 15 % aunque sea volumen; ofrécele 12 % y entrega en 10 días.', v_ts
  from public.clientes c where c.id = 'b63bb77b-1dcf-4d7c-abf2-d767252ca294';

  -- Notificaciones como las que mandan las funciones.
  insert into public.notificaciones
    (envio_id, destinatario_id, destinatario_nombre, remitente_id, remitente_nombre, titulo, mensaje, enlace)
  select gen_random_uuid(), v_admin, v_admin_nombre, a.solicitante_id, u.nombre,
         left('Autorización solicitada: ' || a.cliente_nombre, 120),
         format('%s pide autorizar una orden de %s por $%s. Motivo: %s', u.nombre, a.cliente_nombre,
                to_char(a.total, 'FM999,999,990.00'), replace(a.justificacion, ' (demo)', '')),
         '/autorizaciones'
  from public.autorizaciones_venta a join public.usuarios u on u.id = a.solicitante_id
  where a.created_at = v_ts and a.estado = 'pendiente';

  insert into public.notificaciones
    (envio_id, destinatario_id, destinatario_nombre, remitente_id, remitente_nombre, titulo, mensaje, enlace)
  select gen_random_uuid(), a.solicitante_id, u.nombre, v_admin, v_admin_nombre,
         left(format('Autorización %s: %s', a.estado, a.cliente_nombre), 120),
         case when a.estado = 'aprobada'
           then format('%s autorizó la orden de %s. Descuento: $%s. Vigente hasta el %s: entra a Autorizaciones y crea la orden. Nota: %s',
                       v_admin_nombre, a.cliente_nombre, to_char(a.descuento, 'FM999,999,990.00'), to_char(a.vence, 'DD/MM/YYYY'), a.comentario)
           else format('%s no autorizó la orden de %s. Motivo: %s', v_admin_nombre, a.cliente_nombre, a.comentario) end,
         '/autorizaciones'
  from public.autorizaciones_venta a join public.usuarios u on u.id = a.solicitante_id
  where a.created_at = v_ts and a.estado in ('aprobada', 'rechazada');

  ------------------------------------------------------------ listas de tallas
  -- A. Magna (Karla): abierta, 14 personas.
  insert into public.listas_tallas (vendedor_id, cliente_nombre, titulo, instrucciones, productos, cierra, estado, created_at)
  values (v_karla, 'Magna International', 'Uniformes 2027 — Planta Ramos Arizpe',
    E'Elige tu talla de siempre. La camisa es corte regular; si estás entre dos tallas, elige la mayor.\nSi no usas pantalón (oficinas), déjalo sin elegir.',
    '[{"clave":"camisa","nombre":"Camisa / Blusa Corporativa Oxford Heli · Big Bang","color":"Azul cielo","tallas":["XCH","CH","M","G","XG","2XG","3XG"],"tipoPrenda":"camisa","precioUnitario":550},
      {"clave":"pantalon","nombre":"Pantalón Cargo Reforzado","color":"Azul marino","tallas":["28","30","32","34","36","38","40"],"tipoPrenda":"pantalon","precioUnitario":620}]'::jsonb,
    v_hoy + 10, 'abierta', v_ts)
  returning id into v_lista;
  insert into public.listas_tallas_respuestas (lista_id, nombre, area, tallas, notas, created_at, updated_at)
  select v_lista, x.nombre, x.area, x.tallas::jsonb, x.notas, v_ts - (x.h || ' hours')::interval, v_ts - (x.h || ' hours')::interval
  from (values
    ('Ricardo Gutiérrez Treviño', 'Producción', '{"camisa":"G","pantalon":"34"}', null, 30),
    ('Mariana Castillo Ramos', 'Calidad', '{"camisa":"CH","pantalon":"28"}', 'Corte de dama, por favor', 29),
    ('José Luis Aguirre', 'Producción', '{"camisa":"XG","pantalon":"36"}', null, 27),
    ('Ana Sofía Villarreal', 'Recursos Humanos', '{"camisa":"CH"}', null, 26),
    ('Fernando Garza Leal', 'Mantenimiento', '{"camisa":"2XG","pantalon":"38"}', 'Manga larga si se puede', 24),
    ('Daniela Ortiz', 'Calidad', '{"camisa":"M","pantalon":"30"}', null, 22),
    ('Héctor Valdés Rocha', 'Almacén', '{"camisa":"G","pantalon":"34"}', null, 20),
    ('Luis Ángel Mendoza', 'Producción', '{"camisa":"M","pantalon":"32"}', null, 18),
    ('Patricia Rodríguez', 'Compras', '{"camisa":"M"}', null, 15),
    ('Jorge Alberto Cantú', 'Mantenimiento', '{"camisa":"3XG","pantalon":"40"}', null, 12),
    ('Brenda Salinas', 'Producción', '{"camisa":"CH","pantalon":"30"}', null, 9),
    ('Óscar de la Fuente', 'Seguridad e Higiene', '{"camisa":"G","pantalon":"36"}', null, 6),
    ('Karen Elizondo', 'Ingeniería', '{"camisa":"M","pantalon":"30"}', null, 4),
    ('Roberto Saucedo', 'Producción', '{"camisa":"XG","pantalon":"34"}', null, 2)
  ) as x(nombre, area, tallas, notas, h);

  -- B. Agroindustrias (Fernanda): abierta, sin fecha límite, 6 personas.
  insert into public.listas_tallas (vendedor_id, cliente_nombre, titulo, instrucciones, productos, cierra, estado, created_at)
  values (v_fernanda, 'Agroindustrias La Laguna', 'Playeras temporada de cosecha', 'Una playera por persona.',
    '[{"clave":"polo","nombre":"Playera Tipo Polo · Dry UIS","color":"Verde","tallas":["CH","M","G","XG","2XG","3XG"],"tipoPrenda":"playera","precioUnitario":220}]'::jsonb,
    null, 'abierta', v_ts)
  returning id into v_lista;
  insert into public.listas_tallas_respuestas (lista_id, nombre, area, tallas, created_at, updated_at)
  select v_lista, x.nombre, x.area, x.tallas::jsonb, v_ts - (x.h || ' hours')::interval, v_ts - (x.h || ' hours')::interval
  from (values
    ('Gerardo Martínez', 'Campo', '{"polo":"G"}', 20),
    ('Rosa Elena Hernández', 'Empaque', '{"polo":"M"}', 18),
    ('Juan Carlos Ibarra', 'Campo', '{"polo":"XG"}', 10),
    ('Silvia Moreno', 'Empaque', '{"polo":"CH"}', 8),
    ('Martín Esparza', 'Riego', '{"polo":"2XG"}', 5),
    ('Leticia Chávez', 'Administración', '{"polo":"M"}', 1)
  ) as x(nombre, area, tallas, h);

  -- C. Fogón Norteño (Karla): cerrada, 4 personas, aún sin orden.
  insert into public.listas_tallas (vendedor_id, cliente_nombre, titulo, instrucciones, productos, cierra, estado, created_at)
  values (v_karla, 'Restaurante El Fogón Norteño', 'Filipinas para cocina', null,
    '[{"clave":"filipina","nombre":"Filipina Chef · Big Bang","color":"Negro","tallas":["CH","M","G","XG","2XG"],"tipoPrenda":"camisa","precioUnitario":480},
      {"clave":"mandil","nombre":"Mandil Sencillo · Big Bang","color":"Negro","tallas":["Unitalla"],"tipoPrenda":"accesorio","precioUnitario":150}]'::jsonb,
    v_hoy - 2, 'cerrada', v_ts)
  returning id into v_lista;
  insert into public.listas_tallas_respuestas (lista_id, nombre, area, tallas, created_at, updated_at)
  select v_lista, x.nombre, x.area, x.tallas::jsonb, v_ts - (x.h || ' hours')::interval, v_ts - (x.h || ' hours')::interval
  from (values
    ('Chef Raúl Alvarado', 'Cocina', '{"filipina":"G","mandil":"Unitalla"}', 72),
    ('Miguel Rangel', 'Cocina', '{"filipina":"M","mandil":"Unitalla"}', 70),
    ('Javier Pérez', 'Parrilla', '{"filipina":"XG","mandil":"Unitalla"}', 60),
    ('Lucía Torres', 'Repostería', '{"filipina":"CH"}', 50)
  ) as x(nombre, area, tallas, h);
end
$demo$;

commit;
