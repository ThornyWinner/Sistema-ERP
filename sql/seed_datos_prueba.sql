-- =============================================================================
-- seed_datos_prueba.sql — Completa los datos de prueba del sistema.
--
-- 1. Llena los campos vacíos de los registros existentes (solo donde hay NULL,
--    nunca sobrescribe un valor capturado).
-- 2. Agrega registros de ejemplo en tablas que estaban vacías: comentarios de
--    órdenes, movimientos de material, incidencias y vacaciones.
--
-- Es idempotente: se puede ejecutar varias veces sin duplicar nada (los INSERT
-- solo corren si la tabla sigue vacía). Busca los registros por folio, razón
-- social o nombre, no por UUID.
--
-- Campos que se dejan en NULL a propósito, porque el vacío tiene significado:
--   empleados.fecha_baja / causa_baja      → el empleado sigue activo.
--   historial_ordenes.estado_anterior_id   → registro de creación de la orden.
--   notificaciones.leida_at                → notificación aún no leída.
--   notificaciones.remitente_id / enlace   → avisos automáticos o sin página destino.
--   orden_detalles.variante_id             → fabricación a la medida (sin stock).
--   produccion_taller.fecha_inicio / _fin  → el taller aún no empieza o no termina.
-- Tampoco se llenan productos.imagen_url ni personalizaciones.logo_url: necesitan
-- archivos reales en Storage (se suben desde la app).
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Campos vacíos de registros existentes
-- ---------------------------------------------------------------------------

-- Clientes: dirección, contacto y notas.
update public.clientes c set
  direccion = coalesce(c.direccion, v.direccion),
  contacto  = coalesce(c.contacto, v.contacto),
  notas     = coalesce(c.notas, v.notas)
from (values
  ('Constructora del Norte S.A. de C.V.', 'Blvd. Venustiano Carranza 2450, Col. República, Saltillo, Coah.', 'Ing. Raúl Garza', 'Cliente frecuente; pide factura y entrega en obra.'),
  ('Minera Peñoles Unidad Saltillo', 'Carr. Saltillo–Monterrey Km 12.5, Ramos Arizpe, Coah.', 'Lic. Sofía Ramos', 'Requiere uniformes con reflejante y logo bordado en pecho.'),
  ('Hospital San José de Coahuila', 'Av. Universidad 1180, Col. Los Maestros, Saltillo, Coah.', 'Mtra. Elena Villarreal', 'Filipinas y batas; tallas por departamento.'),
  ('Transportes Rápidos del Bajío', 'Calle Industria 315, Parque Industrial, Celaya, Gto.', 'Sr. Jorge Medina', 'Envío por paquetería; paga por transferencia.'),
  ('Escuela Técnica Industrial No. 12', 'Calle Hidalgo 742, Zona Centro, Saltillo, Coah.', 'Prof. Martín Esquivel', 'Pedido anual al inicio del ciclo escolar.'),
  ('Taller Mecánico Hernández', 'Calle Allende 98, Col. Bellavista, Saltillo, Coah.', 'Sr. Luis Hernández', 'Overoles con nombre bordado por empleado.'),
  ('Agroindustrias La Laguna', 'Carr. Torreón–San Pedro Km 7, Torreón, Coah.', 'Ing. Patricia Reyes', 'Prefiere tela drill; entrega en planta.'),
  ('Restaurante El Fogón Norteño', 'Blvd. Nazario Ortiz Garza 1501, Col. Alpes, Saltillo, Coah.', 'Sra. Adriana Lozano', 'Mandiles y filipinas de cocina con logo.'),
  ('Magna International', 'Blvd. Isidro López Zertuche 4500, Saltillo, Coah.', 'Ing. Frank Stronach', 'Registro utilizado para pruebas del sistema'),
  ('luna labs ', 'Av. Presidente Cárdenas 640, Zona Centro, Saltillo, Coah.', 'Lic. Andrea Luna', 'Cliente nuevo; primera compra de mostrador.')
) as v(razon_social, direccion, contacto, notas)
where c.razon_social = v.razon_social;

-- Empleados: RFC, CURP y NSS (datos ficticios con formato válido).
update public.empleados e set
  rfc  = coalesce(e.rfc, v.rfc),
  curp = coalesce(e.curp, v.curp),
  nss  = coalesce(e.nss, v.nss)
from (values
  ('Héctor Daniel Salas Pérez', 'SAPH950314K21', 'SAPH950314HCLLRC04', '43159512345'),
  ('Miguel Angél Salas Muñiz',  'SAMM700822T58', 'SAMM700822HCLLXG07', '43907012876'),
  ('Karla Flores',              'FOKA980517QW3', 'FOXK980517MCLLXR02', '43169823451'),
  ('Rosa Sosa',                 'SORO920103LM7', 'SOXR920103MCLSXS05', '43129245678'),
  ('Felipe López',              'LOFE010930HG4', 'LOXF010930HCLPXL08', '43190187654'),
  ('Ramón Sánchez',             'SARA850611BN2', 'SAXR850611HCLNXM03', '43088534567'),
  ('María Martínez',            'MAXM880227PR9', 'MAXM880227MCLRXR06', '43108876543'),
  ('Jesús Pérez Pérez',         'PEPJ030415DF6', 'PEPJ030415HCLRRS09', '43200398765'),
  ('Fernanda Vanegas',          'VAFE990708ZX5', 'VAXF990708MCLNXR01', '43179956789')
) as v(nombre, rfc, curp, nss)
where e.nombre = v.nombre;

-- Movimientos de producto: el usuario es el vendedor de la orden referenciada.
update public.movimientos_producto m set usuario_id = o.vendedor_id
from public.ordenes o
where m.usuario_id is null and m.referencia = o.id::text;

-- Órdenes y renglones sin notas.
update public.ordenes set notas = 'Venta de mostrador; el cliente se llevó la mercancía el mismo día.'
where folio = 'ORD-2026-000008' and notas is null;

update public.orden_detalles d set notas = v.notas
from public.ordenes o, public.productos p,
  (values
    ('Camisa Industrial Manga Larga', 'Producto de existencia; sin personalización.'),
    ('Pantalón Cargo Reforzado', 'Producto de existencia; dobladillo estándar.')
  ) as v(producto, notas)
where d.orden_id = o.id and o.folio = 'ORD-2026-000008'
  and d.producto_id = p.id and p.nombre = v.producto and d.notas is null;

-- Pagos sin referencia: recibo para efectivo, clave SPEI para transferencia,
-- autorización para tarjeta. Se numeran por fecha para que sean únicas.
update public.pagos p set referencia = case
    when p.metodo_pago ilike 'efectivo' then 'REC-' || lpad(x.n::text, 5, '0')
    when p.metodo_pago ilike 'transferencia' then 'SPEI-' || lpad((640000 + x.n * 137)::text, 6, '0')
    else 'AUT-' || lpad((310000 + x.n * 211)::text, 6, '0')
  end
from (select id, row_number() over (order by fecha, created_at) n from public.pagos) x
where p.id = x.id and p.referencia is null;

-- Producción por taller: responsable = el usuario con el rol de ese taller
-- (si hay varios, el primero por nombre); observaciones según el estado.
update public.produccion_taller pt set
  usuario_id = coalesce(pt.usuario_id, r.usuario_id),
  observaciones = coalesce(pt.observaciones, case pt.estado
    when 'completed'   then 'Terminado y revisado; se pasó al siguiente taller.'
    when 'in-progress' then 'En proceso; avance conforme al programa.'
    else 'En espera de que termine el taller anterior.'
  end)
from public.talleres t
left join lateral (
  select u.id as usuario_id
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where ro.nombre = case t.nombre
    when 'diseno' then 'disenador' when 'sublimacion' then 'sublimador'
    when 'corte' then 'cortador'   when 'costura' then 'costurera'
    when 'bordado' then 'bordador' end
  order by u.nombre limit 1
) r on true
where pt.taller_id = t.id and (pt.usuario_id is null or pt.observaciones is null);

-- ---------------------------------------------------------------------------
-- 2. Tablas vacías
-- ---------------------------------------------------------------------------

-- Comentarios internos en las órdenes.
insert into public.comentarios_orden (orden_id, usuario_id, comentario, visibilidad, created_at)
select o.id, u.id, v.comentario, 'interno', v.fecha::timestamptz
from (values
  ('ORD-2026-000001', 'Karla Flores',              'El cliente confirmó el logo; se envió la prueba de diseño por correo.', '2026-07-08 10:30-06'),
  ('ORD-2026-000001', 'Rosa Sosa',                 'Ajusté el tamaño del logo a 9 cm para el bolsillo.',                   '2026-07-09 12:15-06'),
  ('ORD-2026-000002', 'Karla Flores',              'Lista para entrega; el cliente pasa a recoger y liquidar.',            '2026-09-30 17:00-06'),
  ('ORD-2026-000003', 'Ramón Sánchez',             'Corte terminado; se entregaron 40 piezas a costura.',                  '2026-09-27 16:20-06'),
  ('ORD-2026-000004', 'Fernanda Vanegas',          'El cliente pidió agregar 5 tallas XL; pendiente de confirmar precio.', '2026-09-28 09:45-06'),
  ('ORD-2026-000006', 'Felipe López',              'Sublimación al 60 %; falta la segunda tanda de playeras.',             '2026-10-05 13:10-06'),
  ('ORD-2026-000009', 'Jesús Pérez Pérez',         'Bordado en proceso; hilo blanco por reabastecer.',                     '2026-10-14 11:00-06'),
  ('ORD-2026-000010', 'Héctor Daniel Salas Pérez', 'Orden en espera del anticipo para iniciar diseño.',                    '2026-10-13 18:30-06')
) as v(folio, usuario, comentario, fecha)
join public.ordenes o on o.folio = v.folio
join public.usuarios u on u.nombre = v.usuario
where not exists (select 1 from public.comentarios_orden);

-- Movimientos de material: historial que termina en el stock actual de cada material
-- (stock_nuevo de la última entrada = stock_actual), sin modificar el inventario.
insert into public.movimientos_material (material_id, usuario_id, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, motivo, created_at)
select m.id, adm.id, v.tipo, v.cantidad,
       m.stock_actual - v.delta_final - v.signo * v.cantidad,
       m.stock_actual - v.delta_final,
       v.motivo, v.fecha::timestamptz
from (values
  -- material, tipo, cantidad, signo (+1 entrada / −1 salida), delta_final = cuánto cambia el stock DESPUÉS de este movimiento, motivo, fecha
  ('Tela Gabardina Azul Marino', 'entrada', 100, 1, -40, 'Compra a proveedor (factura F-2210)',             '2026-09-15 10:00-06'),
  ('Tela Gabardina Azul Marino', 'salida',   40, -1,  0, 'Consumo para ORD-2026-000003',                    '2026-09-24 09:00-06'),
  ('Tela Drill Gris',            'entrada',  30, 1, -35, 'Compra a proveedor (factura F-2231)',             '2026-09-18 11:30-06'),
  ('Tela Drill Gris',            'salida',   35, -1,  0, 'Consumo para ORD-2026-000004',                    '2026-09-27 12:40-06'),
  ('Hilo Poliéster Negro',       'entrada', 300, 1,   0, 'Compra a proveedor (factura F-2245)',             '2026-09-20 09:15-06'),
  ('Hilo Poliéster Blanco',      'entrada', 200, 1, -50, 'Compra a proveedor (factura F-2245)',             '2026-09-20 09:20-06'),
  ('Hilo Poliéster Blanco',      'salida',   50, -1,  0, 'Consumo de bordado para ORD-2026-000009',         '2026-10-12 10:45-06'),
  ('Cierre Metálico 20cm',       'entrada', 500, 1,   0, 'Compra a proveedor (factura F-2260)',             '2026-09-22 16:00-06'),
  ('Botones Metálicos Grande',   'ajuste',   20, -1,  0, 'Ajuste por conteo físico (piezas dañadas)',       '2026-10-01 18:00-06'),
  ('Tela Oxford Verde',          'entrada', 120, 1,   0, 'Compra a proveedor (factura F-2274)',             '2026-10-02 10:10-06'),
  ('Elástico 3cm',               'salida',   20, -1,  0, 'Consumo para ORD-2026-000006',                    '2026-10-03 15:30-06')
) as v(material, tipo, cantidad, signo, delta_final, motivo, fecha)
join public.materiales m on m.nombre = v.material
cross join lateral (
  select u.id from public.usuarios u join public.roles r on r.id = u.rol_id
  where r.nombre = 'admin_primario' order by u.nombre limit 1
) adm
where not exists (select 1 from public.movimientos_material);

-- Incidencias del expediente laboral (registradas por el administrador primario).
insert into public.incidencias (empleado_id, tipo, fecha_inicio, fecha_fin, minutos_retardo, motivo, acta_administrativa, registrado_por)
select e.id, v.tipo, v.ini::date, v.fin::date, v.minutos, v.motivo, v.acta, adm.id
from (values
  ('Felipe López',      'retardo',            '2026-10-20', '2026-10-20', 25,   'Llegó 25 minutos tarde por falla en el transporte.', false),
  ('Felipe López',      'retardo',            '2026-10-27', '2026-10-27', 15,   'Retardo sin justificación.',                         false),
  ('María Martínez',    'falta_justificada',  '2026-09-14', '2026-09-14', null, 'Cita médica con comprobante.',                       false),
  ('Ramón Sánchez',     'incapacidad',        '2026-08-03', '2026-08-07', null, 'Incapacidad IMSS por enfermedad general.',           false),
  ('Karla Flores',      'permiso_con_goce',   '2026-10-09', '2026-10-09', null, 'Trámite personal autorizado por gerencia.',          false),
  ('Jesús Pérez Pérez', 'falta_injustificada','2026-10-16', '2026-10-16', null, 'No se presentó ni avisó.',                           true)
) as v(empleado, tipo, ini, fin, minutos, motivo, acta)
join public.empleados e on e.nombre = v.empleado
cross join lateral (
  select u.id from public.usuarios u join public.roles r on r.id = u.rol_id
  where r.nombre = 'admin_primario' order by u.nombre limit 1
) adm
where not exists (select 1 from public.incidencias);

-- Vacaciones (Art. 76 LFT). Cada periodo empieza después del aniversario del año
-- de servicio que cubre y no excede los días que corresponden; el trigger
-- trg_validar_vacaciones lo vuelve a validar. Todos son de lunes a sábado, sin
-- días de descanso obligatorio. Prima = salario diario × días × porcentaje.
insert into public.vacaciones (empleado_id, anio_servicio, fecha_inicio, fecha_fin, dias, prima_vacacional, notas, registrado_por)
select e.id, v.anio, v.ini::date, v.fin::date, v.dias,
       round(e.salario_diario * v.dias * e.porcentaje_prima / 100, 2),
       v.notas, adm.id
from (values
  ('Ramón Sánchez',            11, '2026-04-06', '2026-04-11', 6, 'Primer periodo del año 11 de servicio.'),
  ('Miguel Angél Salas Muñiz',  7, '2026-08-17', '2026-08-22', 6, 'Vacaciones de verano.'),
  ('María Martínez',            6, '2026-07-20', '2026-07-25', 6, 'Primer periodo del año 6 de servicio.'),
  ('Karla Flores',              3, '2026-06-15', '2026-06-20', 6, 'Primer periodo del año 3 de servicio.'),
  ('Rosa Sosa',                 4, '2026-10-19', '2026-10-24', 6, 'Primer periodo del año 4 de servicio.'),
  ('Fernanda Vanegas',          2, '2026-08-10', '2026-08-15', 6, 'Primer periodo del año 2 de servicio.')
) as v(empleado, anio, ini, fin, dias, notas)
join public.empleados e on e.nombre = v.empleado
cross join lateral (
  select u.id from public.usuarios u join public.roles r on r.id = u.rol_id
  where r.nombre = 'admin_primario' order by u.nombre limit 1
) adm
where not exists (select 1 from public.vacaciones);

commit;
