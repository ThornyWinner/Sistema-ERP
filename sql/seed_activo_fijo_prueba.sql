-- =====================================================================================
-- seed_activo_fijo_prueba.sql — Activos fijos de PRUEBA (aplicar después de activo_fijo.sql).
-- Todos llevan la nota 'DATO DE PRUEBA'. Para quitarlos:
--   delete from public.activos where notas = 'DATO DE PRUEBA';
-- =====================================================================================
with v(nombre, categoria, marca, modelo, serie, sede, ubicacion, emp, prov, factura, f_adq, f_uso, costo, estado, f_baja, motivo, valor_baja) as (values
  ('Máquina de coser recta industrial', 'Maquinaria textil (corte, costura, bordado)', 'Juki', 'DDL-8700', 'JK8700-PR-001', 'Taller de Costura', 'Línea 1', 0, null, 'A-PR-101', '2023-02-10', '2023-02-15', 14500.00, 'activo', null, null, null),
  ('Máquina de coser recta industrial', 'Maquinaria textil (corte, costura, bordado)', 'Juki', 'DDL-8700', 'JK8700-PR-002', 'Taller de Costura', 'Línea 1', 1, null, 'A-PR-101', '2023-02-10', '2023-02-15', 14500.00, 'activo', null, null, null),
  ('Máquina overlock 5 hilos', 'Maquinaria textil (corte, costura, bordado)', 'Siruba', '757F', 'SR757-PR-010', 'Taller de Costura', 'Línea 2', 2, null, 'A-PR-145', '2024-05-20', null, 18900.00, 'mantenimiento', null, null, null),
  ('Bordadora multicabeza 6 cabezas', 'Maquinaria textil (corte, costura, bordado)', 'Tajima', 'TMEZ-SC1506', 'TJ-PR-6C-01', 'Taller de Bordado', 'Nave principal', 3, null, 'A-PR-200', '2022-08-01', '2022-09-01', 485000.00, 'activo', null, null, null),
  ('Cortadora de tela vertical 8"', 'Maquinaria textil (corte, costura, bordado)', 'Eastman', 'Blue Streak II', 'ES-PR-8812', 'Taller de Costura', 'Mesa de corte', 4, null, 'A-PR-178', '2025-01-15', null, 32000.00, 'activo', null, null, null),
  ('Computadora de escritorio ventas', 'Equipo de cómputo', 'Dell', 'OptiPlex 7010', 'DL-PR-7010', 'Establecimiento', 'Mostrador', 5, null, 'A-PR-233', '2024-03-04', null, 16999.00, 'activo', null, null, null),
  ('Impresora láser multifuncional', 'Equipo de cómputo', 'HP', 'LaserJet M428', 'HP-PR-M428', 'Establecimiento', 'Oficina', null, null, 'A-PR-234', '2024-03-04', null, 7850.00, 'activo', null, null, null),
  ('Escritorio ejecutivo en L', 'Mobiliario y equipo de oficina', 'Offiho', 'L-160', null, 'Establecimiento', 'Oficina de administración', null, null, 'A-PR-090', '2021-11-22', null, 6400.00, 'activo', null, null, null),
  ('Camioneta de reparto', 'Equipo de transporte', 'Nissan', 'NP300 2022', 'NP300-PR-VIN-0001', 'Establecimiento', 'Estacionamiento', 6, null, 'A-PR-120', '2022-04-05', null, 389000.00, 'activo', null, null, null),
  ('Plancha industrial de vapor', 'Otro equipo', 'Silver Star', 'ES-300', 'SS-PR-300', 'Taller de Costura', 'Planchado', null, null, 'A-PR-050', '2020-06-12', null, 4200.00, 'baja', '2026-08-31', 'desecho', 0)
),
emp as (select id, row_number() over (order by nombre) - 1 as n from public.empleados where activo)
insert into public.activos (nombre, categoria_id, marca, modelo, numero_serie, sede_id, ubicacion, responsable_id, proveedor_id, factura_compra,
  fecha_adquisicion, fecha_inicio_uso, costo_adquisicion, tasa_depreciacion, estado, fecha_baja, motivo_baja, valor_baja, notas)
select v.nombre, c.id, v.marca, v.modelo, v.serie, s.id, v.ubicacion, emp.id,
  (select id from public.proveedores order by nombre limit 1), v.factura,
  v.f_adq::date, v.f_uso::date, v.costo, c.tasa_depreciacion, v.estado, v.f_baja::date, v.motivo, v.valor_baja, 'DATO DE PRUEBA'
from v
join public.activo_categorias c on c.nombre = v.categoria
left join public.sedes s on s.nombre = v.sede
left join emp on emp.n = v.emp;

insert into public.activo_mantenimientos (activo_id, fecha, tipo, descripcion, costo, realizado_por, proximo)
select a.id, m.fecha::date, m.tipo, m.descripcion, m.costo, m.quien, m.proximo::date
from (values
  ('TJ-PR-6C-01', '2026-03-10', 'preventivo', 'Limpieza, lubricación y ajuste de tensiones', 2800.00, 'Servicio técnico externo', '2026-09-10'),
  ('TJ-PR-6C-01', '2026-09-12', 'preventivo', 'Limpieza, lubricación y cambio de agujas', 3100.00, 'Servicio técnico externo', '2027-03-12'),
  ('SR757-PR-010', '2026-11-12', 'correctivo', 'Reemplazo de cuchilla y ajuste de lazadores', 950.00, 'Mecánico de planta', null),
  ('NP300-PR-VIN-0001', '2026-07-20', 'preventivo', 'Servicio de 60,000 km', 4650.00, 'Agencia', '2027-01-20')
) as m(serie, fecha, tipo, descripcion, costo, quien, proximo)
join public.activos a on a.numero_serie = m.serie;
