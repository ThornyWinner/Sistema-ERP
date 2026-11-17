-- =====================================================================
-- seed_cotizaciones_prueba.sql — Cotizaciones de ejemplo (SÍ guarda datos)
-- =====================================================================
-- Crea 8 cotizaciones con las funciones reales (guardar_cotizacion /
-- cambiar_estado_cotizacion), cada una como el vendedor que la hace, para que
-- folios, importes, IVA y tope de descuento salgan igual que desde la app.
-- Estados: borrador, enviada, aceptada, rechazada y una vencida.
-- Requiere: sql/cotizaciones.sql aplicado y los usuarios Karla Flores,
-- Fernanda Vanegas y Miguel Angél Salas Muñiz activos.
-- =====================================================================
begin;

-- Sesiones simuladas (se leen antes de cambiar de rol: con RLS no se verían).
select set_config('seed.' || k, json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from (values ('karla', 'Karla Flores'), ('fernanda', 'Fernanda Vanegas'), ('miguel', 'Miguel Angél Salas Muñiz')) t(k, nombre)
join public.usuarios u on u.nombre = t.nombre;

set local role authenticated;

do $s$
declare
  v jsonb;
  ids uuid[] := '{}';

begin
  ---------------------------------------------------------------- Karla Flores
  perform set_config('request.jwt.claims', current_setting('seed.karla'), true);

  -- 1. Constructora del Norte → enviada
  v := public.guardar_cotizacion(null,
    '{"cliente":"Constructora del Norte S.A. de C.V.","telefono":"844 415 2230","email":"compras@constructoranorte.mx","descuento":1500,
      "notas":"Precios por pieza. Entrega 3 semanas después del anticipo (50 %). Bordado del logo incluido."}',
    '[{"nombre":"Camisa industrial manga larga","cantidad":40,"precio_unitario":285,"tipo_produccion":"fabricacion",
       "captura":{"tipoPrenda":"camisa","talla":"M a XL","color":"Azul marino","talleres":["corte","costura","bordado"],
                  "requiereBordado":true,"bordadoUbicacion":"bolsillo","bordadoColores":"Blanco y amarillo","bordadoNotas":"Logo Constructora del Norte"}},
      {"nombre":"Pantalón de gabardina","cantidad":40,"precio_unitario":320,"tipo_produccion":"fabricacion",
       "captura":{"tipoPrenda":"pantalon","talla":"30 a 38","color":"Azul marino","talleres":["corte","costura"]}}]');
  perform public.cambiar_estado_cotizacion((v->>'id')::uuid, 'enviada');

  -- 2. Minera Peñoles → aceptada
  v := public.guardar_cotizacion(null,
    '{"cliente":"Minera Peñoles Unidad Saltillo","telefono":"844 230 7781","email":"sramos@minerasaltillo.com","descuento":2500,
      "notas":"Overol con cinta reflejante 3M de 2\". Entrega en 4 semanas."}',
    '[{"nombre":"Overol industrial con reflejante","cantidad":60,"precio_unitario":690,"tipo_produccion":"fabricacion",
       "captura":{"tipoPrenda":"overol","talla":"M a 2XL","color":"Naranja","talleres":["corte","costura","bordado"],
                  "requiereBordado":true,"bordadoUbicacion":"espalda","bordadoColores":"Negro","bordadoNotas":"Nombre de la unidad"}},
      {"nombre":"Chaleco de seguridad reflejante","cantidad":60,"precio_unitario":145,"tipo_produccion":"comercializacion",
       "captura":{"tipoPrenda":"chaleco","talla":"Unitalla","color":"Verde limón"}}]');
  perform public.cambiar_estado_cotizacion((v->>'id')::uuid, 'enviada');
  perform public.cambiar_estado_cotizacion((v->>'id')::uuid, 'aceptada');

  -- 3. Prospecto nuevo → borrador
  v := public.guardar_cotizacion(null,
    '{"cliente":"Logística Arteaga S.A. de C.V.","telefono":"844 109 3365","descuento":0,
      "notas":"Primera cotización; pendiente confirmar colores corporativos."}',
    '[{"nombre":"Playera polo piqué","cantidad":30,"precio_unitario":210,"tipo_produccion":"fabricacion",
       "captura":{"tipoPrenda":"playera","talla":"S a XL","color":"Gris Oxford","talleres":["corte","costura","bordado"],
                  "requiereBordado":true,"bordadoUbicacion":"frente","bordadoColores":"Rojo"}}]');
  ids := ids || (v->>'id')::uuid;

  ------------------------------------------------------------ Fernanda Vanegas
  perform set_config('request.jwt.claims', current_setting('seed.fernanda'), true);

  -- 4. Hospital San José → enviada
  v := public.guardar_cotizacion(null,
    '{"cliente":"Hospital San José de Coahuila","telefono":"844 412 9050","email":"adquisiciones@hsanjose.org.mx","descuento":1000,
      "notas":"Tela antifluidos. Nombre bordado por pieza sin costo extra."}',
    '[{"nombre":"Bata médica","cantidad":25,"precio_unitario":380,"tipo_produccion":"fabricacion",
       "captura":{"tipoPrenda":"bata","talla":"Varias","color":"Blanco","talleres":["corte","costura","bordado"],
                  "requiereBordado":true,"bordadoUbicacion":"bolsillo","bordadoColores":"Azul rey","bordadoNotas":"Nombre y especialidad"}},
      {"nombre":"Filipina quirúrgica","cantidad":50,"precio_unitario":340,"tipo_produccion":"fabricacion",
       "captura":{"tipoPrenda":"uniforme","talla":"XS a XL","color":"Azul cielo","talleres":["corte","costura"]}}]');
  perform public.cambiar_estado_cotizacion((v->>'id')::uuid, 'enviada');

  -- 5. Restaurante El Fogón → rechazada
  v := public.guardar_cotizacion(null,
    '{"cliente":"Restaurante El Fogón Norteño","telefono":"844 488 1200","email":"gerencia@elfogon.mx","descuento":0}',
    '[{"nombre":"Filipina de chef","cantidad":12,"precio_unitario":420,"tipo_produccion":"fabricacion",
       "captura":{"tipoPrenda":"uniforme","talla":"M a XL","color":"Negro","talleres":["corte","costura","bordado"],
                  "requiereBordado":true,"bordadoUbicacion":"frente","bordadoColores":"Dorado"}},
      {"nombre":"Mandil de mezclilla","cantidad":15,"precio_unitario":150,"tipo_produccion":"comercializacion",
       "captura":{"tipoPrenda":"accesorio","talla":"Unitalla","color":"Azul índigo"}}]');
  perform public.cambiar_estado_cotizacion((v->>'id')::uuid, 'enviada');
  perform public.cambiar_estado_cotizacion((v->>'id')::uuid, 'rechazada', 'Eligió otro proveedor por precio');

  -- 6. Escuela Técnica → enviada (luego se deja vencida)
  v := public.guardar_cotizacion(null,
    '{"cliente":"Escuela Técnica Industrial No. 12","telefono":"844 438 6612","email":"direccion@eti12.edu.mx","descuento":3000,
      "notas":"Uniforme escolar del ciclo 2026-2027."}',
    '[{"nombre":"Playera escolar con escudo","cantidad":120,"precio_unitario":165,"tipo_produccion":"fabricacion",
       "captura":{"tipoPrenda":"playera","talla":"CH a G","color":"Blanco","talleres":["diseno","sublimacion","corte","costura"]}},
      {"nombre":"Sudadera escolar","cantidad":120,"precio_unitario":290,"tipo_produccion":"fabricacion",
       "captura":{"tipoPrenda":"sudadera","talla":"CH a G","color":"Guinda","talleres":["corte","costura","bordado"],
                  "requiereBordado":true,"bordadoUbicacion":"frente","bordadoColores":"Blanco","bordadoNotas":"Escudo ETI 12"}}]');
  perform public.cambiar_estado_cotizacion((v->>'id')::uuid, 'enviada');
  ids := ids || (v->>'id')::uuid;

  ------------------------------------------------------- Miguel (admin secundario)
  perform set_config('request.jwt.claims', current_setting('seed.miguel'), true);

  -- 7. Magna International → enviada
  v := public.guardar_cotizacion(null,
    '{"cliente":"Magna International","telefono":"844 354 0994","email":"compras.saltillo@magna.example.com","descuento":4000,
      "notas":"Pedido anual en dos entregas (mayo y noviembre)."}',
    '[{"nombre":"Camisa de trabajo manga corta","cantidad":200,"precio_unitario":260,"tipo_produccion":"fabricacion",
       "captura":{"tipoPrenda":"camisa","talla":"S a 3XL","color":"Gris","talleres":["corte","costura","bordado"],
                  "requiereBordado":true,"bordadoUbicacion":"bolsillo","bordadoColores":"Rojo y negro","bordadoNotas":"Logo Magna"}}]');
  perform public.cambiar_estado_cotizacion((v->>'id')::uuid, 'enviada');

  -- 8. Agroindustrias La Laguna → borrador
  v := public.guardar_cotizacion(null,
    '{"cliente":"Agroindustrias La Laguna","telefono":"871 750 2290","email":"preyes@agrolaguna.mx","descuento":0,
      "notas":"Chamarra con forro térmico para temporada de invierno."}',
    '[{"nombre":"Chamarra térmica","cantidad":35,"precio_unitario":650,"tipo_produccion":"fabricacion",
       "captura":{"tipoPrenda":"chamarra","talla":"M a XL","color":"Verde olivo","talleres":["corte","costura","bordado"],
                  "requiereBordado":true,"bordadoUbicacion":"frente","bordadoColores":"Blanco"}}]');

  -- Guarda los ids que se ajustan con fechas pasadas (paso siguiente, ya sin RLS).
  perform set_config('seed.ids', array_to_string(ids, ','), true);
end
$s$;

reset role;

-- 3 (prospecto) se hizo hace 2 días; 6 (escuela) se envió hace un mes y ya venció.
update public.cotizaciones set fecha = current_date - 2,  created_at = now() - interval '2 days'
where id = split_part(current_setting('seed.ids'), ',', 1)::uuid;
update public.cotizaciones set fecha = current_date - 30, vigencia = current_date - 15,
       created_at = now() - interval '30 days', enviada_at = now() - interval '29 days'
where id = split_part(current_setting('seed.ids'), ',', 2)::uuid;

commit;

select c.folio, u.nombre as vendedor, c.cliente_nombre, c.cliente_id is not null as en_catalogo,
       c.estado, c.vigencia, c.subtotal, c.descuento, c.iva, c.total
from public.cotizaciones c join public.usuarios u on u.id = c.vendedor_id
order by c.folio;
