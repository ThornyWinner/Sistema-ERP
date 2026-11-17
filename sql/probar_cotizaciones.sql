-- =====================================================================
-- probar_cotizaciones.sql — Prueba de sql/cotizaciones.sql (NO deja datos)
-- =====================================================================
-- Ejecútalo en el SQL Editor DESPUÉS de aplicar cotizaciones.sql. Simula a un vendedor
-- activo y termina SIEMPRE con un error "PRUEBA TERMINADA (no se guardó nada)": ese
-- error deshace toda la transacción (no quedan cotizaciones ni se mueve el contador de
-- folios) y su mensaje trae los resultados. Ninguna línea debe decir "(mal)".
-- Si sale otro error distinto, es un problema real de la migración.
-- =====================================================================
begin;

create temp table resultados (n serial, prueba text, resultado text) on commit drop;
grant all on resultados to authenticated;
grant usage on sequence resultados_n_seq to authenticated;

-- Sesión simulada de un vendedor activo.
select set_config('request.jwt.claims', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.usuarios u join public.roles r on r.id = u.rol_id
where r.nombre = 'vendedor' and u.estado = 'activo' and u.auth_user_id is not null
limit 1;
set local role authenticated;

do $t$
declare
  v jsonb;
  v_id uuid;
  c record;
begin
  -- 1. Alta con cliente en minúsculas (debe ligarse al catálogo) y descuento de 5 %.
  --    Esperado: sub 3000, desc 150, IVA 456, total 3306, vigencia +15 días, borrador.
  v := public.guardar_cotizacion(null,
    '{"cliente":"agroindustrias la laguna","telefono":"8441234567","vigencia":"","descuento":150,"notas":"Entrega 3 semanas"}',
    '[{"nombre":"Camisa industrial","cantidad":10,"precio_unitario":250,"tipo_produccion":"fabricacion","captura":{"talla":"M","color":"Azul","talleres":["corte","costura"]}},
      {"nombre":"Gorra","cantidad":5,"precio_unitario":100,"tipo_produccion":"comercializacion","captura":{}}]');
  v_id := (v->>'id')::uuid;
  select * into c from public.cotizaciones where id = v_id;
  insert into resultados (prueba, resultado) values ('1 alta', format(
    'folio=%s sub=%s desc=%s iva=%s total=%s cliente_ligado=%s vigencia=+%s días estado=%s',
    c.folio, c.subtotal, c.descuento, c.iva, c.total, c.cliente_id is not null, c.vigencia - current_date, c.estado));

  -- 2. Subir el descuento a 20 % debe bloquearse (tope de 10 %).
  begin
    perform public.guardar_cotizacion(v_id, '{"cliente":"agroindustrias la laguna","descuento":600}',
      '[{"nombre":"Camisa industrial","cantidad":10,"precio_unitario":250},{"nombre":"Gorra","cantidad":5,"precio_unitario":100}]');
    insert into resultados (prueba, resultado) values ('2 descuento 20 %', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('2 descuento 20 %', 'bloqueado (bien): ' || sqlerrm);
  end;

  -- 3. Editar: prospecto que no está en el catálogo, otra partida. Esperado: sub 6000, total 6786.
  perform public.guardar_cotizacion(v_id, '{"cliente":"Prospecto Nuevo SA","descuento":150}',
    '[{"nombre":"Pantalón","cantidad":20,"precio_unitario":300}]');
  select * into c from public.cotizaciones where id = v_id;
  insert into resultados (prueba, resultado) values ('3 edición', format(
    'cliente=%s ligado=%s sub=%s desc=%s total=%s', c.cliente_nombre, c.cliente_id is not null, c.subtotal, c.descuento, c.total));

  -- 4. Marcar como enviada.
  perform public.cambiar_estado_cotizacion(v_id, 'enviada');
  select * into c from public.cotizaciones where id = v_id;
  insert into resultados (prueba, resultado) values ('4 enviada', format('estado=%s enviada_at=%s', c.estado, c.enviada_at is not null));

  -- 5. Transición inválida.
  begin
    perform public.cambiar_estado_cotizacion(v_id, 'borrador');
    insert into resultados (prueba, resultado) values ('5 enviada → borrador', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('5 enviada → borrador', 'bloqueado (bien): ' || sqlerrm);
  end;

  -- 6. Convertir sin orden.
  begin
    perform public.cambiar_estado_cotizacion(v_id, 'convertida');
    insert into resultados (prueba, resultado) values ('6 convertir sin orden', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('6 convertir sin orden', 'bloqueado (bien): ' || sqlerrm);
  end;

  -- 7. Convertir con una orden propia del vendedor (si tiene alguna).
  if exists (select 1 from public.ordenes where vendedor_id = (select private.mi_usuario_id())) then
    perform public.cambiar_estado_cotizacion(v_id, 'convertida', null,
      (select id from public.ordenes where vendedor_id = (select private.mi_usuario_id()) limit 1));
    select * into c from public.cotizaciones where id = v_id;
    insert into resultados (prueba, resultado) values ('7 convertir con orden propia',
      format('estado=%s orden_ligada=%s', c.estado, c.orden_id is not null));

    -- 8. Una convertida ya no se edita ni se borra.
    begin
      perform public.guardar_cotizacion(v_id, '{"cliente":"x"}', '[{"nombre":"a","cantidad":1,"precio_unitario":1}]');
      insert into resultados (prueba, resultado) values ('8 editar convertida', 'NO BLOQUEÓ (mal)');
    exception when others then
      insert into resultados (prueba, resultado) values ('8 editar convertida', 'bloqueado (bien): ' || sqlerrm);
    end;
    delete from public.cotizaciones where id = v_id;
    insert into resultados (prueba, resultado) values ('9 borrar convertida',
      case when exists (select 1 from public.cotizaciones where id = v_id) then 'no se borró (bien)' else 'SE BORRÓ (mal)' end);
  else
    insert into resultados (prueba, resultado) values ('7-9 conversión', 'omitida: el vendedor de prueba no tiene órdenes');
  end if;

  -- 10. El vendedor ve sus cotizaciones (RLS).
  insert into resultados (prueba, resultado) values ('10 vendedor ve', (select count(*)::text || ' cotización(es)' from public.cotizaciones));

  -- 11. No se puede insertar directo en la tabla (solo con la función).
  begin
    insert into public.cotizaciones (folio, vendedor_id, cliente_nombre, vigencia)
    values ('X', (select private.mi_usuario_id()), 'x', current_date);
    insert into resultados (prueba, resultado) values ('11 insert directo', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('11 insert directo', 'bloqueado (bien): ' || sqlerrm);
  end;

  -- 12. Borrar un borrador propio sí se puede.
  v := public.guardar_cotizacion(null, '{"cliente":"Otro"}', '[{"nombre":"a","cantidad":1,"precio_unitario":1}]');
  delete from public.cotizaciones where id = (v->>'id')::uuid;
  insert into resultados (prueba, resultado) values ('12 borrar borrador propio',
    case when exists (select 1 from public.cotizaciones where id = (v->>'id')::uuid)
         then 'NO se borró (mal)' else 'borrada (bien)' end);

  -- Se termina con un error a propósito: así la transacción se deshace completa y el
  -- SQL Editor muestra los resultados en el mensaje.
  raise exception E'PRUEBA TERMINADA (no se guardó nada). Resultados:\n%',
    (select string_agg(prueba || ' → ' || resultado, E'\n' order by n) from resultados);
end
$t$;
