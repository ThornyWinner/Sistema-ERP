-- =====================================================================
-- probar_devoluciones.sql — Prueba de sql/devoluciones.sql (NO deja datos)
-- =====================================================================
-- Ejecútalo en el SQL Editor DESPUÉS de aplicar historial_clientes.sql y
-- devoluciones.sql (elige "Run without RLS": la tabla `resultados` es temporal).
-- Toma una partida terminada (sin talleres pendientes, 2 o más piezas) de una orden de
-- un vendedor activo y prueba: validaciones, devolución con reingreso al inventario,
-- cambio por otra prenda del inventario, reembolso y permisos. Termina SIEMPRE con el
-- error "PRUEBA TERMINADA (no se guardó nada)", que deshace todo (stock incluido).
-- Ninguna línea debe decir "(mal)".
-- =====================================================================
begin;

create temp table resultados (n serial, prueba text, resultado text) on commit drop;
grant all on resultados to authenticated;
grant usage on sequence resultados_n_seq to authenticated;

-- Partida terminada con 2+ piezas por devolver, de una orden de un vendedor activo.
select set_config('prueba.detalle', d.id::text, true),
       set_config('prueba.orden', o.id::text, true),
       set_config('prueba.producto', d.producto_id::text, true),
       set_config('prueba.vendedor_id', u.id::text, true),
       set_config('prueba.vendedor', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.orden_detalles d
join public.ordenes o on o.id = d.orden_id
join public.estados_orden eo on eo.id = o.estado_id
join public.usuarios u on u.id = o.vendedor_id
join public.roles r on r.id = u.rol_id
where eo.nombre <> 'Cancelada' and r.nombre = 'vendedor' and u.estado = 'activo' and u.auth_user_id is not null
  and d.producto_id is not null and d.cantidad - d.cantidad_devuelta >= 2 and d.precio_unitario > 0
  and exists (select 1 from public.variantes_producto v where v.producto_id = d.producto_id)
  and not exists (select 1 from public.produccion_taller pt
                  where pt.orden_detalle_id = d.id and coalesce(pt.estado, 'pending') <> 'completed')
order by o.folio limit 1;

-- Variante del mismo producto (para el reingreso) y una de otro producto.
select set_config('prueba.var_mismo', v.id::text, true)
from public.variantes_producto v where v.producto_id = nullif(current_setting('prueba.producto', true), '')::uuid
order by v.talla limit 1;
select set_config('prueba.var_otro', v.id::text, true)
from public.variantes_producto v where v.producto_id <> nullif(current_setting('prueba.producto', true), '')::uuid
order by v.created_at limit 1;
-- Prenda con existencia para el cambio.
select set_config('prueba.var_cambio', v.id::text, true)
from public.variantes_producto v where v.stock >= 1
order by v.stock desc limit 1;

-- Otro vendedor (no es dueño de la orden).
select set_config('prueba.otro', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.usuarios u join public.roles r on r.id = u.rol_id
where r.nombre = 'vendedor' and u.estado = 'activo' and u.auth_user_id is not null
  and u.id <> nullif(current_setting('prueba.vendedor_id', true), '')::uuid
order by u.nombre limit 1;

-- Partida del mismo vendedor que sigue en producción (para la prueba 4).
select set_config('prueba.en_produccion', d.id::text, true),
       set_config('prueba.orden_produccion', d.orden_id::text, true)
from public.orden_detalles d
join public.ordenes o on o.id = d.orden_id
join public.estados_orden eo on eo.id = o.estado_id
where o.vendedor_id = nullif(current_setting('prueba.vendedor_id', true), '')::uuid
  and eo.nombre not in ('Cancelada', 'Entregada')
  and exists (select 1 from public.produccion_taller pt
              where pt.orden_detalle_id = d.id and coalesce(pt.estado, 'pending') <> 'completed')
limit 1;

do $t$
declare
  v_det uuid := nullif(current_setting('prueba.detalle', true), '')::uuid;
  v_ord uuid := nullif(current_setting('prueba.orden', true), '')::uuid;
  v_mismo uuid := nullif(current_setting('prueba.var_mismo', true), '')::uuid;
  v_otro uuid := nullif(current_setting('prueba.var_otro', true), '')::uuid;
  v_cambio uuid := nullif(current_setting('prueba.var_cambio', true), '')::uuid;
  v_prod_det uuid := nullif(current_setting('prueba.en_produccion', true), '')::uuid;
  v_prod_ord uuid := nullif(current_setting('prueba.orden_produccion', true), '')::uuid;
  v jsonb;
  v_stock_antes int;
  v_stock int;
  v_total_antes numeric;
  v_pagado_antes numeric;
  v_total numeric;
  v_pagado numeric;
  v_anticipo numeric;
  v_dev int;
  cnt int;
  st text;
begin
  if v_det is null or v_mismo is null then
    raise exception 'No hay una partida terminada (2+ piezas, con variantes en el catálogo) de un vendedor activo para probar';
  end if;

  select total into v_total_antes from public.ordenes where id = v_ord;
  select coalesce(sum(monto), 0) into v_pagado_antes from public.pagos where orden_id = v_ord;
  select stock into v_stock_antes from public.variantes_producto where id = v_mismo;

  set local role authenticated;

  ------------------------------------------------------------ 1. otro vendedor
  if coalesce(current_setting('prueba.otro', true), '') <> '' then
    perform set_config('request.jwt.claims', current_setting('prueba.otro'), true);
    begin
      perform public.registrar_devolucion(v_ord, jsonb_build_object('motivo', 'talla',
        'devueltas', jsonb_build_array(jsonb_build_object('detalle_id', v_det, 'cantidad', 1))));
      insert into resultados (prueba, resultado) values ('1 otro vendedor registra', 'NO BLOQUEÓ (mal)');
    exception when others then
      insert into resultados (prueba, resultado) values ('1 otro vendedor registra', 'bloqueado (bien)');
    end;
  else
    insert into resultados (prueba, resultado) values ('1 otro vendedor registra', 'omitida: solo hay un vendedor activo');
  end if;

  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);

  ------------------------------------------------------------ 2. validaciones
  begin
    perform public.registrar_devolucion(v_ord, jsonb_build_object('motivo', 'otro',
      'devueltas', jsonb_build_array(jsonb_build_object('detalle_id', v_det, 'cantidad', 1))));
    insert into resultados (prueba, resultado) values ('2a motivo "otro" sin detalle', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('2a motivo "otro" sin detalle', 'bloqueado (bien)');
  end;
  begin
    perform public.registrar_devolucion(v_ord, jsonb_build_object('motivo', 'talla',
      'devueltas', jsonb_build_array(jsonb_build_object('detalle_id', v_det, 'cantidad', 100000))));
    insert into resultados (prueba, resultado) values ('2b devolver más de lo vendido', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('2b devolver más de lo vendido', 'bloqueado (bien)');
  end;

  ------------------------------------------------------------ 3. reingreso a otro producto
  if v_otro is not null then
    begin
      perform public.registrar_devolucion(v_ord, jsonb_build_object('motivo', 'talla',
        'devueltas', jsonb_build_array(jsonb_build_object('detalle_id', v_det, 'cantidad', 1, 'reingresar_variante_id', v_otro))));
      insert into resultados (prueba, resultado) values ('3 reingresar a otro producto', 'NO BLOQUEÓ (mal)');
    exception when others then
      insert into resultados (prueba, resultado) values ('3 reingresar a otro producto', 'bloqueado (bien)');
    end;
  else
    insert into resultados (prueba, resultado) values ('3 reingresar a otro producto', 'omitida: el catálogo tiene un solo producto');
  end if;

  ------------------------------------------------------------ 4. partida en producción
  if v_prod_det is not null then
    begin
      perform public.registrar_devolucion(v_prod_ord, jsonb_build_object('motivo', 'talla',
        'devueltas', jsonb_build_array(jsonb_build_object('detalle_id', v_prod_det, 'cantidad', 1))));
      insert into resultados (prueba, resultado) values ('4 devolver pieza en producción', 'NO BLOQUEÓ (mal)');
    exception when others then
      insert into resultados (prueba, resultado) values ('4 devolver pieza en producción', 'bloqueado (bien)');
    end;
  else
    insert into resultados (prueba, resultado) values ('4 devolver pieza en producción', 'omitida: el vendedor no tiene piezas en producción');
  end if;

  ------------------------------------------------------------ 5. devolución con reingreso y reembolso
  v := public.registrar_devolucion(v_ord, jsonb_build_object('motivo', 'defecto', 'descripcion', 'Costura abierta',
    'devueltas', jsonb_build_array(jsonb_build_object('detalle_id', v_det, 'cantidad', 1, 'reingresar_variante_id', v_mismo)),
    'reembolsar', true, 'metodo_reembolso', 'Efectivo'));
  insert into resultados (prueba, resultado) values ('5a folio', (v->>'folio') ||
    case when v->>'folio' like 'DEV-____-______' then ' (bien)' else ' (mal)' end);

  reset role;
  select stock into v_stock from public.variantes_producto where id = v_mismo;
  insert into resultados (prueba, resultado) values ('5b stock reingresado', format('%s → %s', v_stock_antes, v_stock) ||
    case when v_stock = v_stock_antes + 1 then ' (bien)' else ' (mal)' end);
  select cantidad_devuelta into cnt from public.orden_detalles where id = v_det;
  insert into resultados (prueba, resultado) values ('5c pieza marcada como devuelta', 'devueltas: ' || cnt ||
    case when cnt >= 1 then ' (bien)' else ' (mal)' end);
  select total, anticipo into v_total, v_anticipo from public.ordenes where id = v_ord;
  select coalesce(sum(monto), 0) into v_pagado from public.pagos where orden_id = v_ord;
  insert into resultados (prueba, resultado) values ('5d total baja', format('%s → %s', v_total_antes, v_total) ||
    case when v_total < v_total_antes and v_total = (v->>'total_nuevo')::numeric then ' (bien)' else ' (mal)' end);
  insert into resultados (prueba, resultado) values ('5e reembolso', format('pagado %s → %s, reembolso %s',
    v_pagado_antes, v_pagado, v->>'reembolso') ||
    case when v_pagado_antes > v_total
           then case when v_pagado = v_total and (v->>'reembolso')::numeric = v_pagado_antes - v_total then ' (bien)' else ' (mal)' end
         else case when v_pagado = v_pagado_antes and (v->>'reembolso')::numeric = 0 then ' (bien: no había excedente)' else ' (mal)' end
    end);
  insert into resultados (prueba, resultado) values ('5f anticipo ≤ total', format('%s ≤ %s', v_anticipo, v_total) ||
    case when coalesce(v_anticipo, 0) <= v_total then ' (bien)' else ' (mal)' end);

  ------------------------------------------------------------ 6. cambio por otra prenda
  if v_cambio is not null then
    select stock into v_stock_antes from public.variantes_producto where id = v_cambio;
    set local role authenticated;
    perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
    v := public.registrar_devolucion(v_ord, jsonb_build_object('motivo', 'talla',
      'devueltas', jsonb_build_array(jsonb_build_object('detalle_id', v_det, 'cantidad', 1)),
      'nuevas', jsonb_build_array(jsonb_build_object('variante_id', v_cambio, 'cantidad', 1))));
    reset role;
    select stock into v_stock from public.variantes_producto where id = v_cambio;
    select tipo into st from public.devoluciones where id = (v->>'id')::uuid;
    select count(*) into cnt from public.orden_detalles
    where orden_id = v_ord and variante_id = v_cambio and tipo_produccion = 'directa' and notas = 'Cambio ' || (v->>'folio');
    insert into resultados (prueba, resultado) values ('6 cambio de talla', format('tipo %s, partida nueva %s, stock %s → %s',
      st, cnt, v_stock_antes, v_stock) ||
      case when st = 'cambio' and cnt = 1 and v_stock = v_stock_antes - 1 then ' (bien)' else ' (mal)' end);
  else
    insert into resultados (prueba, resultado) values ('6 cambio de talla', 'omitida: no hay prendas con existencia');
  end if;

  ------------------------------------------------------------ 7. reembolso a mano
  set local role authenticated;
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
  begin
    insert into public.pagos (orden_id, fecha, monto, metodo_pago) values (v_ord, current_date, -10, 'Efectivo');
    insert into resultados (prueba, resultado) values ('7 pago negativo a mano', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('7 pago negativo a mano', 'bloqueado (bien)');
  end;

  ------------------------------------------------------------ 8. el vendedor ve sus devoluciones
  select count(*) into v_dev from public.devoluciones where orden_id = v_ord;
  insert into resultados (prueba, resultado) values ('8 vendedor consulta', v_dev || ' devolución(es) visibles' ||
    case when v_dev >= case when v_cambio is not null then 2 else 1 end then ' (bien)' else ' (mal)' end);
  reset role;

  raise exception E'PRUEBA TERMINADA (no se guardó nada). Resultados:\n%',
    (select string_agg(prueba || ' → ' || resultado, E'\n' order by n) from resultados);
end
$t$;
