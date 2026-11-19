-- =====================================================================
-- probar_ventas_y_proveedores.sql — Prueba de los 5 scripts nuevos (NO deja datos)
-- =====================================================================
-- Ejecútalo en el SQL Editor DESPUÉS de aplicar, en este orden:
--   proveedores_cuentas.sql, autorizaciones_venta.sql, recordatorios_recompra.sql,
--   seguimiento_publico.sql y listas_tallas.sql
-- (elige "Run without RLS": la tabla `resultados` es temporal). Prueba con cada rol
-- (admin primario, admin secundario, vendedor y anónimo = el cliente con el enlace).
-- Termina SIEMPRE con el error "PRUEBA TERMINADA (no se guardó nada)", que deshace todo.
-- Ninguna línea debe decir "(mal)".
-- =====================================================================
begin;

create temp table resultados (n serial, prueba text, resultado text) on commit drop;
grant all on resultados to authenticated, anon;
grant usage on sequence resultados_n_seq to authenticated, anon;

-- Usuarios de prueba (activos y con cuenta).
select set_config('prueba.admin', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true),
       set_config('prueba.admin_id', u.id::text, true)
from public.usuarios u join public.roles r on r.id = u.rol_id
where r.nombre = 'admin_primario' and u.estado = 'activo' and u.auth_user_id is not null
order by u.nombre limit 1;

select set_config('prueba.secundario', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.usuarios u join public.roles r on r.id = u.rol_id
where r.nombre = 'admin_secundario' and u.estado = 'activo' and u.auth_user_id is not null
order by u.nombre limit 1;

select set_config('prueba.vendedor', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true),
       set_config('prueba.vendedor_id', u.id::text, true)
from public.usuarios u join public.roles r on r.id = u.rol_id
where r.nombre = 'vendedor' and u.estado = 'activo' and u.auth_user_id is not null
order by u.nombre limit 1;

select set_config('prueba.otro', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.usuarios u join public.roles r on r.id = u.rol_id
where r.nombre = 'vendedor' and u.estado = 'activo' and u.auth_user_id is not null
  and u.id <> nullif(current_setting('prueba.vendedor_id', true), '')::uuid
order by u.nombre limit 1;

do $t$
declare
  v_admin_id uuid := nullif(current_setting('prueba.admin_id', true), '')::uuid;
  v_vend_id uuid := nullif(current_setting('prueba.vendedor_id', true), '')::uuid;
  v_hoy date := (private.ahora_local())::date;
  v_prov uuid;
  v_cuenta1 uuid;
  v_cuenta2 uuid;
  v_cliente uuid;
  v_cliente_nombre text;
  v_pendiente uuid;
  v_metodo uuid;
  v_orden uuid;
  v_orden2 uuid;
  v_token uuid;
  v_aut uuid;
  v_lista uuid;
  v_lista_token uuid;
  v_j jsonb;
  v_n int;
  v_n2 int;
  st text;
  ok boolean;
begin
  if v_admin_id is null or v_vend_id is null then
    raise exception 'Se necesita al menos un admin primario y un vendedor activos con cuenta';
  end if;

  select id into v_prov from public.proveedores order by nombre limit 1;
  select id, razon_social into v_cliente, v_cliente_nombre from public.clientes
  where coalesce(limite_credito, 0) = 0 order by created_at limit 1;
  select id into v_pendiente from public.estados_orden where nombre = 'Pendiente';
  select id into v_metodo from public.metodos_pago where nombre = 'Efectivo';

  ------------------------------------------------------------ 1. validaciones
  insert into resultados (prueba, resultado) values ('1a CLABE válida / inválida',
    format('%s / %s', private.clabe_valida('032180000118359719'), private.clabe_valida('032180000118359718')) ||
    case when private.clabe_valida('032180000118359719') and not private.clabe_valida('032180000118359718') then ' (bien)' else ' (mal)' end);
  insert into resultados (prueba, resultado) values ('1b tarjeta (Luhn) válida / inválida',
    format('%s / %s', private.luhn_valido('4111111111111111'), private.luhn_valido('4111111111111112')) ||
    case when private.luhn_valido('4111111111111111') and not private.luhn_valido('4111111111111112') then ' (bien)' else ' (mal)' end);

  ------------------------------------------------------------ 2. cuentas de proveedores
  set local role authenticated;
  perform set_config('request.jwt.claims', current_setting('prueba.admin'), true);
  insert into public.proveedores_cuentas (proveedor_id, tipo, numero, banco)
  values (v_prov, 'clabe', '0321 8000 0118 3597 19', 'BBVA')
  returning id, principal::text into v_cuenta1, st;
  insert into resultados (prueba, resultado) values ('2a admin agrega CLABE (con espacios)', 'principal: ' || st ||
    case when st = 'true' or exists (select 1 from public.proveedores_cuentas c where c.proveedor_id = v_prov and c.principal and c.id <> v_cuenta1)
         then ' (bien)' else ' (mal)' end);

  begin
    insert into public.proveedores_cuentas (proveedor_id, tipo, numero) values (v_prov, 'clabe', '032180000118359718');
    insert into resultados (prueba, resultado) values ('2b CLABE con dígito verificador mal', 'NO BLOQUEÓ (mal)');
  exception when check_violation then
    insert into resultados (prueba, resultado) values ('2b CLABE con dígito verificador mal', 'rechazada (bien)');
  end;

  insert into public.proveedores_cuentas (proveedor_id, tipo, numero, principal)
  values (v_prov, 'tarjeta', '4111111111111111', true) returning id into v_cuenta2;
  select count(*) into v_n from public.proveedores_cuentas where proveedor_id = v_prov and principal;
  insert into resultados (prueba, resultado) values ('2c nueva principal quita la anterior', v_n || ' principal(es)' ||
    case when v_n = 1 and (select principal from public.proveedores_cuentas where id = v_cuenta2) then ' (bien)' else ' (mal)' end);

  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
  select count(*) into v_n from public.proveedores_cuentas;
  insert into resultados (prueba, resultado) values ('2d vendedor no ve cuentas', v_n || ' visible(s)' ||
    case when v_n = 0 then ' (bien)' else ' (mal)' end);
  begin
    insert into public.proveedores_cuentas (proveedor_id, tipo, numero) values (v_prov, 'cuenta', '12345678');
    insert into resultados (prueba, resultado) values ('2e vendedor agrega cuenta', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('2e vendedor agrega cuenta', 'bloqueado (bien)');
  end;

  if coalesce(current_setting('prueba.secundario', true), '') <> '' then
    perform set_config('request.jwt.claims', current_setting('prueba.secundario'), true);
    select count(*) into v_n from public.proveedores_cuentas where proveedor_id = v_prov;
    update public.proveedores_cuentas set banco = 'X' where id = v_cuenta1;
    get diagnostics v_n2 = row_count;
    insert into resultados (prueba, resultado) values ('2f secundario consulta, no edita', format('ve %s, editó %s', v_n, v_n2) ||
      case when v_n >= 2 and v_n2 = 0 then ' (bien)' else ' (mal)' end);
  end if;
  reset role;

  ------------------------------------------------------------ 3. autorizaciones de venta
  if v_cliente is null then
    insert into resultados (prueba, resultado) values ('3 autorizaciones', 'omitidas: no hay clientes sin límite de crédito');
  else
    set local role authenticated;
    perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
    -- Orden de $1,000 (antes de IVA) del vendedor; descuento de 50 % (pasa del tope).
    insert into public.ordenes (cliente_id, vendedor_id, fecha_creacion, subtotal, iva, total, anticipo, estado_id, metodo_pago_id)
    values (v_cliente, v_vend_id, current_date, 1000, 160, 1160, 0, v_pendiente, v_metodo)
    returning id, token_seguimiento into v_orden, v_token;
    insert into public.orden_detalles (orden_id, cantidad, precio_unitario, tipo_produccion, descripcion)
    values (v_orden, 1, 1000, 'fabricacion', 'Prueba autorización');

    begin
      update public.ordenes set descuento = 500 where id = v_orden;
      insert into resultados (prueba, resultado) values ('3a descuento 50 % sin autorización', 'NO BLOQUEÓ (mal)');
    exception when others then
      insert into resultados (prueba, resultado) values ('3a descuento 50 % sin autorización', 'bloqueado (bien)');
    end;

    v_aut := public.solicitar_autorizacion_venta(v_cliente_nombre, 500, null, 1000, 580, 'tope', 'Cliente frecuente, pedido grande',
                                                 jsonb_build_object('cliente', v_cliente_nombre, 'descuento', 500, 'productos', '[]'::jsonb));
    reset role;
    select count(*) into v_n from public.notificaciones n
    join public.usuarios u on u.id = n.destinatario_id join public.roles r on r.id = u.rol_id
    where r.nombre = 'admin_primario' and n.enlace = '/autorizaciones' and n.created_at = now();
    insert into resultados (prueba, resultado) values ('3b solicitud avisa al admin primario', v_n || ' aviso(s)' ||
      case when v_n >= 1 then ' (bien)' else ' (mal)' end);

    set local role authenticated;
    perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
    begin
      perform public.resolver_autorizacion_venta(v_aut, true);
      insert into resultados (prueba, resultado) values ('3c vendedor se autoriza solo', 'NO BLOQUEÓ (mal)');
    exception when others then
      insert into resultados (prueba, resultado) values ('3c vendedor se autoriza solo', 'bloqueado (bien)');
    end;

    perform set_config('request.jwt.claims', current_setting('prueba.admin'), true);
    begin
      perform public.resolver_autorizacion_venta(v_aut, false, '');
      insert into resultados (prueba, resultado) values ('3d rechazar sin motivo', 'NO BLOQUEÓ (mal)');
    exception when others then
      insert into resultados (prueba, resultado) values ('3d rechazar sin motivo', 'bloqueado (bien)');
    end;
    perform public.resolver_autorizacion_venta(v_aut, true, 'Va', null, null, 7);
    select estado into st from public.autorizaciones_venta where id = v_aut;
    insert into resultados (prueba, resultado) values ('3e admin aprueba', st || case when st = 'aprobada' then ' (bien)' else ' (mal)' end);

    perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
    begin
      update public.ordenes set descuento = 500 where id = v_orden;
      select (orden_id = v_orden)::text into st from public.autorizaciones_venta where id = v_aut;
      insert into resultados (prueba, resultado) values ('3f con autorización pasa y se liga', 'ligada: ' || coalesce(st, 'NULL') ||
        case when st = 'true' then ' (bien)' else ' (mal)' end);
    exception when others then
      insert into resultados (prueba, resultado) values ('3f con autorización pasa y se liga', 'BLOQUEÓ: ' || sqlerrm || ' (mal)');
    end;

    -- La misma autorización no sirve para otra orden.
    insert into public.ordenes (cliente_id, vendedor_id, fecha_creacion, subtotal, iva, total, anticipo, estado_id, metodo_pago_id)
    values (v_cliente, v_vend_id, current_date, 1000, 160, 1160, 0, v_pendiente, v_metodo)
    returning id into v_orden2;
    insert into public.orden_detalles (orden_id, cantidad, precio_unitario, tipo_produccion, descripcion)
    values (v_orden2, 1, 1000, 'fabricacion', 'Prueba autorización 2');
    begin
      update public.ordenes set descuento = 500 where id = v_orden2;
      insert into resultados (prueba, resultado) values ('3g autorización usada no se repite', 'NO BLOQUEÓ (mal)');
    exception when others then
      insert into resultados (prueba, resultado) values ('3g autorización usada no se repite', 'bloqueado (bien)');
    end;

    if coalesce(current_setting('prueba.otro', true), '') <> '' then
      perform set_config('request.jwt.claims', current_setting('prueba.otro'), true);
      select count(*) into v_n from public.autorizaciones_venta where id = v_aut;
      insert into resultados (prueba, resultado) values ('3h otro vendedor no la ve', v_n || ' visible(s)' ||
        case when v_n = 0 then ' (bien)' else ' (mal)' end);
    end if;
    reset role;

    select count(*) into v_n from public.notificaciones
    where destinatario_id = v_vend_id and enlace = '/autorizaciones' and created_at = now();
    insert into resultados (prueba, resultado) values ('3i el vendedor recibe la respuesta', v_n || ' aviso(s)' ||
      case when v_n >= 1 then ' (bien)' else ' (mal)' end);

    ------------------------------------------------------------ 4. seguimiento público
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    v_j := public.seguimiento_orden(v_token);
    insert into resultados (prueba, resultado) values ('4a el cliente abre su enlace', coalesce(v_j ->> 'folio', 'NULL') ||
      case when v_j ->> 'folio' is not null and jsonb_array_length(v_j -> 'productos') = 1 then ' (bien)' else ' (mal)' end);
    insert into resultados (prueba, resultado) values ('4b no expone datos de contacto',
      case when v_j ? 'telefono' or v_j ? 'email' or v_j ? 'notas' then 'los expone (mal)' else 'no (bien)' end);
    v_j := public.seguimiento_orden(gen_random_uuid());
    insert into resultados (prueba, resultado) values ('4c enlace inventado', coalesce(v_j::text, 'NULL') ||
      case when v_j is null then ' (bien)' else ' (mal)' end);
    begin
      select count(*) into v_n from public.ordenes;
      insert into resultados (prueba, resultado) values ('4d anónimo lee la tabla de órdenes', 'NO BLOQUEÓ (mal)');
    exception when others then
      insert into resultados (prueba, resultado) values ('4d anónimo lee la tabla de órdenes', 'bloqueado (bien)');
    end;
    reset role;

    set local role authenticated;
    perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
    perform public.regenerar_token_seguimiento(v_orden);
    reset role;
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    v_j := public.seguimiento_orden(v_token);
    insert into resultados (prueba, resultado) values ('4e el enlace anterior deja de servir', coalesce(v_j ->> 'folio', 'NULL') ||
      case when v_j is null then ' (bien)' else ' (mal)' end);
    reset role;
  end if;

  ------------------------------------------------------------ 5. listas de tallas
  set local role authenticated;
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
  insert into public.listas_tallas (cliente_nombre, titulo, productos)
  values (coalesce(v_cliente_nombre, 'CLIENTE DE PRUEBA'), 'Prueba de tallas',
          '[{"clave":"a","nombre":"Camisa","color":"Azul","tallas":["S","M","L"],"precioUnitario":250},
            {"clave":"b","nombre":"Pantalón","color":"Negro","tallas":["30","32"]}]'::jsonb)
  returning id, token into v_lista, v_lista_token;
  reset role;

  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_j := public.lista_tallas_publica(v_lista_token);
  insert into resultados (prueba, resultado) values ('5a el cliente abre la lista',
    format('%s prendas, abierta %s', jsonb_array_length(v_j -> 'productos'), v_j ->> 'abierta') ||
    case when jsonb_array_length(v_j -> 'productos') = 2 and (v_j ->> 'abierta')::boolean
              and not (v_j -> 'productos' -> 0 ? 'precioUnitario') then ' (bien)' else ' (mal)' end);
  begin
    perform public.registrar_tallas_publica(v_lista_token, 'Ana López', 'Almacén', '{"a":"XL"}'::jsonb);
    insert into resultados (prueba, resultado) values ('5b talla que no existe', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('5b talla que no existe', 'rechazada (bien)');
  end;
  v_j := public.registrar_tallas_publica(v_lista_token, 'Ana López', 'Almacén', '{"a":"M","b":"30"}'::jsonb);
  insert into resultados (prueba, resultado) values ('5c registra tallas', 'actualizado: ' || (v_j ->> 'actualizado') ||
    case when not (v_j ->> 'actualizado')::boolean then ' (bien)' else ' (mal)' end);
  v_j := public.registrar_tallas_publica(v_lista_token, '  ana   lópez ', null, '{"a":"L"}'::jsonb);
  insert into resultados (prueba, resultado) values ('5d mismo nombre actualiza', 'actualizado: ' || (v_j ->> 'actualizado') ||
    case when (v_j ->> 'actualizado')::boolean then ' (bien)' else ' (mal)' end);
  begin
    select count(*) into v_n from public.listas_tallas_respuestas;
    insert into resultados (prueba, resultado) values ('5e anónimo lee las respuestas', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('5e anónimo lee las respuestas', 'bloqueado (bien)');
  end;
  reset role;

  select count(*), max(tallas ->> 'a') into v_n, st from public.listas_tallas_respuestas where lista_id = v_lista;
  insert into resultados (prueba, resultado) values ('5f una respuesta con la talla nueva', format('%s respuesta(s), talla %s', v_n, st) ||
    case when v_n = 1 and st = 'L' then ' (bien)' else ' (mal)' end);

  if coalesce(current_setting('prueba.otro', true), '') <> '' then
    set local role authenticated;
    perform set_config('request.jwt.claims', current_setting('prueba.otro'), true);
    select count(*) into v_n from public.listas_tallas where id = v_lista;
    delete from public.listas_tallas_respuestas where lista_id = v_lista;
    get diagnostics v_n2 = row_count;
    insert into resultados (prueba, resultado) values ('5g otro vendedor no ve ni borra', format('ve %s, borró %s', v_n, v_n2) ||
      case when v_n = 0 and v_n2 = 0 then ' (bien)' else ' (mal)' end);
    reset role;
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
  update public.listas_tallas set estado = 'cerrada' where id = v_lista;
  reset role;
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform public.registrar_tallas_publica(v_lista_token, 'Luis Pérez', null, '{"a":"S"}'::jsonb);
    insert into resultados (prueba, resultado) values ('5h lista cerrada', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('5h lista cerrada', 'rechazada (bien)');
  end;
  reset role;

  ------------------------------------------------------------ 6. recordatorios de recompra
  if v_cliente is not null then
    set local role authenticated;
    perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
    insert into public.contactos_cliente (cliente_id, canal, resultado, notas, proximo_contacto, fecha)
    values (v_cliente, 'llamada', 'interesado', 'Prueba de recordatorio', v_hoy, now() + interval '1 minute');
    reset role;

    v_n := private.recordatorios_recompra();
    select count(*) into v_n2 from public.notificaciones
    where destinatario_id = v_vend_id and titulo like 'Seguimiento pendiente:%' and created_at = now();
    insert into resultados (prueba, resultado) values ('6a avisa el seguimiento de hoy', format('%s aviso(s) en total, %s al vendedor', v_n, v_n2) ||
      case when v_n2 >= 1 then ' (bien)' else ' (mal)' end);
    v_n := private.recordatorios_recompra();
    insert into resultados (prueba, resultado) values ('6b no repite avisos', v_n || ' nuevo(s)' ||
      case when v_n = 0 then ' (bien)' else ' (mal)' end);

    set local role authenticated;
    perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
    begin
      perform public.enviar_recordatorios_recompra();
      insert into resultados (prueba, resultado) values ('6c vendedor los dispara a mano', 'NO BLOQUEÓ (mal)');
    exception when others then
      insert into resultados (prueba, resultado) values ('6c vendedor los dispara a mano', 'bloqueado (bien)');
    end;
    reset role;
  end if;

  select exists (select 1 from cron.job where jobname = 'recompra-recordatorios-diarios') into ok;
  insert into resultados (prueba, resultado) values ('6d cron diario programado', ok::text || case when ok then ' (bien)' else ' (mal)' end);

  raise exception E'PRUEBA TERMINADA (no se guardó nada). Resultados:\n%',
    (select string_agg(prueba || ' → ' || resultado, E'\n' order by n) from resultados);
end
$t$;
