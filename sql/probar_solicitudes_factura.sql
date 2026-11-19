-- =====================================================================
-- probar_solicitudes_factura.sql — Prueba de sql/solicitudes_factura.sql (NO deja datos)
-- =====================================================================
-- Ejecútalo en el SQL Editor DESPUÉS de aplicar solicitudes_factura.sql (elige "Run
-- without RLS": la tabla `resultados` es temporal). Toma una orden abierta, con cliente
-- y sin factura, de un vendedor activo y recorre: validaciones, solicitud, rechazo,
-- nueva solicitud, cancelación y el enlace con la factura (borrador → en preparación,
-- borrado → pendiente, timbrada → facturada). Las facturas de prueba se insertan
-- directo (sin timbrar). Termina SIEMPRE con el error "PRUEBA TERMINADA (no se guardó
-- nada)", que deshace todo (incluidos los datos fiscales que se copian al cliente).
-- Ninguna línea debe decir "(mal)".
-- =====================================================================
begin;

create temp table resultados (n serial, prueba text, resultado text) on commit drop;
grant all on resultados to authenticated;
grant usage on sequence resultados_n_seq to authenticated;

select set_config('prueba.orden', o.id::text, true),
       set_config('prueba.cliente', o.cliente_id::text, true),
       set_config('prueba.vendedor_id', u.id::text, true),
       set_config('prueba.vendedor', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.ordenes o
join public.estados_orden eo on eo.id = o.estado_id
join public.usuarios u on u.id = o.vendedor_id
join public.roles r on r.id = u.rol_id
where eo.nombre <> 'Cancelada' and o.cliente_id is not null
  and r.nombre = 'vendedor' and u.estado = 'activo' and u.auth_user_id is not null
  and not exists (select 1 from public.cfdis c where c.orden_id = o.id and c.estado <> 'cancelado')
  and not exists (select 1 from public.solicitudes_factura s where s.orden_id = o.id and s.estado in ('pendiente', 'en_proceso'))
order by o.folio limit 1;

select set_config('prueba.admin', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.usuarios u join public.roles r on r.id = u.rol_id
where r.nombre = 'admin_primario' and u.estado = 'activo' and u.auth_user_id is not null
order by u.nombre limit 1;

select set_config('prueba.otro', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.usuarios u join public.roles r on r.id = u.rol_id
where r.nombre = 'vendedor' and u.estado = 'activo' and u.auth_user_id is not null
  and u.id <> nullif(current_setting('prueba.vendedor_id', true), '')::uuid
order by u.nombre limit 1;

do $t$
declare
  v_ord uuid := nullif(current_setting('prueba.orden', true), '')::uuid;
  v_cli uuid := nullif(current_setting('prueba.cliente', true), '')::uuid;
  v_vend uuid := nullif(current_setting('prueba.vendedor_id', true), '')::uuid;
  v_datos jsonb := jsonb_build_object('rfc', 'xaxx010101000', 'razon_social', 'Cliente de Prueba',
    'regimen_fiscal', '601', 'codigo_postal', '64000', 'email', 'facturas@ejemplo.com',
    'uso_cfdi', 'G03', 'metodo_pago', 'PUE', 'forma_pago', '03', 'notas', 'Prueba');
  s1 uuid;
  s2 uuid;
  s3 uuid;
  v_cfdi uuid;
  st text;
  cnt int;
  txt text;
begin
  if v_ord is null then
    raise exception 'No hay una orden abierta con cliente y sin factura de un vendedor activo para probar';
  end if;
  if coalesce(current_setting('prueba.admin', true), '') = '' then
    raise exception 'No hay un administrador primario activo con acceso para probar';
  end if;

  set local role authenticated;

  ------------------------------------------------------------ 1. otro vendedor
  if coalesce(current_setting('prueba.otro', true), '') <> '' then
    perform set_config('request.jwt.claims', current_setting('prueba.otro'), true);
    begin
      perform public.solicitar_factura(v_ord, v_datos);
      insert into resultados (prueba, resultado) values ('1 otro vendedor solicita', 'NO BLOQUEÓ (mal)');
    exception when others then
      insert into resultados (prueba, resultado) values ('1 otro vendedor solicita', 'bloqueado (bien)');
    end;
  else
    insert into resultados (prueba, resultado) values ('1 otro vendedor solicita', 'omitida: solo hay un vendedor activo');
  end if;

  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);

  ------------------------------------------------------------ 2. validaciones
  begin
    perform public.solicitar_factura(v_ord, v_datos || '{"rfc": "ABC123"}');
    insert into resultados (prueba, resultado) values ('2a RFC inválido', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('2a RFC inválido', 'bloqueado (bien)');
  end;
  begin
    perform public.solicitar_factura(v_ord, v_datos || '{"metodo_pago": "PPD", "forma_pago": "03"}');
    insert into resultados (prueba, resultado) values ('2b PPD con forma 03', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('2b PPD con forma 03', 'bloqueado (bien)');
  end;
  begin
    perform public.solicitar_factura(v_ord, v_datos || '{"codigo_postal": "640"}');
    insert into resultados (prueba, resultado) values ('2c C.P. de 3 dígitos', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('2c C.P. de 3 dígitos', 'bloqueado (bien)');
  end;

  ------------------------------------------------------------ 3. solicitud
  s1 := public.solicitar_factura(v_ord, v_datos);
  select estado, receptor_rfc into st, txt from public.solicitudes_factura where id = s1;
  insert into resultados (prueba, resultado) values ('3a vendedor solicita', format('%s, RFC %s', st, txt) ||
    case when st = 'pendiente' and txt = 'XAXX010101000' then ' (bien)' else ' (mal)' end);
  reset role;
  select rfc into txt from public.clientes where id = v_cli;
  insert into resultados (prueba, resultado) values ('3b datos fiscales al cliente', coalesce(txt, 'sin RFC') ||
    case when txt = 'XAXX010101000' then ' (bien)' else ' (mal)' end);
  select count(*) into cnt from public.notificaciones where enlace = '/facturacion/solicitudes' and titulo like 'Factura solicitada:%'
    and created_at >= now();
  insert into resultados (prueba, resultado) values ('3c aviso al admin primario', cnt || ' aviso(s)' ||
    case when cnt >= 1 then ' (bien)' else ' (mal)' end);
  set local role authenticated;
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);

  begin
    perform public.solicitar_factura(v_ord, v_datos);
    insert into resultados (prueba, resultado) values ('4 segunda solicitud abierta', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('4 segunda solicitud abierta', 'bloqueada (bien)');
  end;

  begin
    perform public.atender_solicitud_factura(s1, 'emitida', 'A-1');
    insert into resultados (prueba, resultado) values ('5 vendedor la atiende', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('5 vendedor la atiende', 'bloqueado (bien)');
  end;

  ------------------------------------------------------------ 6. rechazo
  perform set_config('request.jwt.claims', current_setting('prueba.admin'), true);
  begin
    perform public.atender_solicitud_factura(s1, 'rechazada', '  ');
    insert into resultados (prueba, resultado) values ('6a rechazar sin motivo', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('6a rechazar sin motivo', 'bloqueado (bien)');
  end;
  perform public.atender_solicitud_factura(s1, 'rechazada', 'El régimen no coincide con la constancia');
  reset role;
  select estado into st from public.solicitudes_factura where id = s1;
  select count(*) into cnt from public.notificaciones
  where destinatario_id = v_vend and titulo like 'Factura rechazada:%' and created_at >= now();
  insert into resultados (prueba, resultado) values ('6b admin rechaza', format('%s, avisos al vendedor %s', st, cnt) ||
    case when st = 'rechazada' and cnt = 1 then ' (bien)' else ' (mal)' end);

  ------------------------------------------------------------ 7. vuelve a pedirla y la cancela
  set local role authenticated;
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
  s2 := public.solicitar_factura(v_ord, v_datos || '{"regimen_fiscal": "612"}');
  perform public.cancelar_solicitud_factura(s2);
  select estado into st from public.solicitudes_factura where id = s2;
  insert into resultados (prueba, resultado) values ('7 nueva solicitud y cancelación', st ||
    case when st = 'cancelada' then ' (bien)' else ' (mal)' end);

  ------------------------------------------------------------ 8. enlace con la factura
  s3 := public.solicitar_factura(v_ord, v_datos);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into public.cfdis (orden_id, tipo_comprobante, estado) values (v_ord, 'I', 'borrador') returning id into v_cfdi;
  select estado into st from public.solicitudes_factura where id = s3;
  insert into resultados (prueba, resultado) values ('8a borrador de factura', st ||
    case when st = 'en_proceso' then ' (bien)' else ' (mal)' end);

  set local role authenticated;
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
  begin
    perform public.cancelar_solicitud_factura(s3);
    insert into resultados (prueba, resultado) values ('8b cancelar en preparación', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('8b cancelar en preparación', 'bloqueado (bien)');
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  delete from public.cfdis where id = v_cfdi;
  select estado into st from public.solicitudes_factura where id = s3;
  insert into resultados (prueba, resultado) values ('8c se borra el borrador', st ||
    case when st = 'pendiente' then ' (bien)' else ' (mal)' end);

  insert into public.cfdis (orden_id, tipo_comprobante, estado) values (v_ord, 'I', 'borrador') returning id into v_cfdi;
  update public.cfdis set estado = 'vigente', serie = 'PRB', folio = 1, uuid = gen_random_uuid() where id = v_cfdi;
  select estado, cfdi_folio into st, txt from public.solicitudes_factura where id = s3;
  select count(*) into cnt from public.notificaciones
  where destinatario_id = v_vend and titulo like 'Factura emitida:%' and created_at >= now();
  insert into resultados (prueba, resultado) values ('8d factura timbrada', format('%s %s, avisos %s', st, txt, cnt) ||
    case when st = 'emitida' and txt = 'PRB-1' and cnt = 1 then ' (bien)' else ' (mal)' end);

  set local role authenticated;
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
  begin
    perform public.solicitar_factura(v_ord, v_datos);
    insert into resultados (prueba, resultado) values ('9 pedir otra con factura vigente', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('9 pedir otra con factura vigente', 'bloqueado (bien)');
  end;

  select count(*) into cnt from public.solicitudes_factura where orden_id = v_ord;
  insert into resultados (prueba, resultado) values ('10 vendedor consulta', cnt || ' solicitudes visibles' ||
    case when cnt = 3 then ' (bien)' else ' (mal)' end);
  reset role;

  raise exception E'PRUEBA TERMINADA (no se guardó nada). Resultados:\n%',
    (select string_agg(prueba || ' → ' || resultado, E'\n' order by n) from resultados);
end
$t$;
