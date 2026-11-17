-- =====================================================================
-- probar_listas_precios.sql — Prueba de sql/listas_precios.sql (NO deja datos)
-- =====================================================================
-- Ejecútalo en el SQL Editor DESPUÉS de aplicar listas_precios.sql (elige "Run without
-- RLS": la tabla `resultados` es temporal). Termina SIEMPRE con el error "PRUEBA
-- TERMINADA (no se guardó nada)", que deshace todo y trae los resultados.
-- Ninguna línea debe decir "(mal)".
-- =====================================================================
begin;

create temp table resultados (n serial, prueba text, resultado text) on commit drop;
grant all on resultados to authenticated;
grant usage on sequence resultados_n_seq to authenticated;

select set_config('prueba.' || r.nombre, json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.usuarios u join public.roles r on r.id = u.rol_id
where r.nombre in ('admin_primario', 'vendedor') and u.estado = 'activo' and u.auth_user_id is not null
  and u.id = (select u2.id from public.usuarios u2 where u2.rol_id = u.rol_id and u2.estado = 'activo'
              and u2.auth_user_id is not null order by u2.nombre limit 1);
select set_config('prueba.producto', (select id from public.productos order by nombre limit 1)::text, true);
select set_config('prueba.cliente', (select id from public.clientes order by razon_social limit 1)::text, true);

set local role authenticated;

do $t$
declare
  v_prod uuid := current_setting('prueba.producto')::uuid;
  v_cli uuid := current_setting('prueba.cliente')::uuid;
  cnt int;
begin
  ------------------------------------------------------------ admin primario
  perform set_config('request.jwt.claims', current_setting('prueba.admin_primario'), true);

  -- 1. Escala general y de un producto.
  perform public.guardar_escalas_mayoreo(null, '[{"cantidad_min":50,"descuento_pct":5},{"cantidad_min":100,"descuento_pct":8}]');
  perform public.guardar_escalas_mayoreo(v_prod, '[{"cantidad_min":24,"descuento_pct":4}]');
  select count(*) into cnt from public.escalas_mayoreo;
  insert into resultados (prueba, resultado) values ('1 escalas guardadas', cnt || ' escalas ' || case when cnt = 3 then '(bien)' else '(mal)' end);

  -- 2. Reemplazar (no duplica) las generales.
  perform public.guardar_escalas_mayoreo(null, '[{"cantidad_min":30,"descuento_pct":3}]');
  select count(*) into cnt from public.escalas_mayoreo where producto_id is null;
  insert into resultados (prueba, resultado) values ('2 reemplazo generales', cnt || ' general(es) ' || case when cnt = 1 then '(bien)' else '(mal)' end);

  -- 3. Escala incoherente (más piezas, menos descuento) → rechazada.
  begin
    perform public.guardar_escalas_mayoreo(null, '[{"cantidad_min":50,"descuento_pct":8},{"cantidad_min":100,"descuento_pct":5}]');
    insert into resultados (prueba, resultado) values ('3 escala incoherente', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('3 escala incoherente', 'bloqueada (bien)');
  end;

  -- 4. Precios del cliente: % general y precio fijo de un producto.
  insert into public.precios_cliente (cliente_id, producto_id, descuento_pct) values (v_cli, null, 7);
  insert into public.precios_cliente (cliente_id, producto_id, precio) values (v_cli, v_prod, 199.50);
  select count(*) into cnt from public.precios_cliente where cliente_id = v_cli and updated_by is not null;
  insert into resultados (prueba, resultado) values ('4 precios del cliente', cnt || ' condiciones con auditoría ' || case when cnt = 2 then '(bien)' else '(mal)' end);

  -- 5. Duplicado (mismo cliente, todos los productos) → rechazado.
  begin
    insert into public.precios_cliente (cliente_id, producto_id, descuento_pct) values (v_cli, null, 3);
    insert into resultados (prueba, resultado) values ('5 duplicado', 'NO BLOQUEÓ (mal)');
  exception when unique_violation then
    insert into resultados (prueba, resultado) values ('5 duplicado', 'bloqueado (bien)');
  end;

  -- 6. Precio fijo sin producto → rechazado.
  begin
    insert into public.precios_cliente (cliente_id, producto_id, precio) values ((select id from public.clientes where id <> v_cli limit 1), null, 100);
    insert into resultados (prueba, resultado) values ('6 precio fijo sin producto', 'NO BLOQUEÓ (mal)');
  exception when check_violation then
    insert into resultados (prueba, resultado) values ('6 precio fijo sin producto', 'bloqueado (bien)');
  end;

  ------------------------------------------------------------ vendedor
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);

  select count(*) into cnt from public.escalas_mayoreo;
  insert into resultados (prueba, resultado) values ('7 vendedor lee mayoreo', cnt || ' escalas ' || case when cnt = 2 then '(bien)' else '(mal)' end);
  select count(*) into cnt from public.precios_cliente where cliente_id = v_cli;
  insert into resultados (prueba, resultado) values ('8 vendedor lee precios', cnt || ' condiciones ' || case when cnt = 2 then '(bien)' else '(mal)' end);

  begin
    perform public.guardar_escalas_mayoreo(null, '[]');
    insert into resultados (prueba, resultado) values ('9 vendedor cambia mayoreo', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('9 vendedor cambia mayoreo', 'bloqueado (bien)');
  end;

  update public.precios_cliente set descuento_pct = 50 where cliente_id = v_cli and producto_id is null;
  get diagnostics cnt = row_count;
  insert into resultados (prueba, resultado) values ('10 vendedor edita precio', case when cnt = 0 then 'sin efecto (bien)' else 'LO CAMBIÓ (mal)' end);

  begin
    insert into public.precios_cliente (cliente_id, descuento_pct) values (v_cli, 1);
    insert into resultados (prueba, resultado) values ('11 vendedor crea precio', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('11 vendedor crea precio', 'bloqueado (bien)');
  end;

  raise exception E'PRUEBA TERMINADA (no se guardó nada). Resultados:\n%',
    (select string_agg(prueba || ' → ' || resultado, E'\n' order by n) from resultados);
end
$t$;
