-- =====================================================================
-- probar_metas_comisiones.sql — Prueba de sql/metas_comisiones.sql (NO deja datos)
-- =====================================================================
-- Ejecútalo en el SQL Editor DESPUÉS de aplicar metas_comisiones.sql. Simula al admin
-- primario, al secundario y a un vendedor, y termina SIEMPRE con el error
-- "PRUEBA TERMINADA (no se guardó nada)", que deshace todo y trae los resultados.
-- Ninguna línea debe decir "(mal)".
-- =====================================================================
begin;

create temp table resultados (n serial, prueba text, resultado text) on commit drop;
grant all on resultados to authenticated;
grant usage on sequence resultados_n_seq to authenticated;

-- Sesiones simuladas (se leen antes de cambiar de rol: con RLS no se verían).
select set_config('prueba.' || r.nombre,
                  json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true),
       set_config('prueba.id_' || r.nombre, u.id::text, true)
from public.usuarios u
join public.roles r on r.id = u.rol_id
where r.nombre in ('admin_primario', 'admin_secundario', 'vendedor')
  and u.estado = 'activo' and u.auth_user_id is not null
  and u.id = (select u2.id from public.usuarios u2
              where u2.rol_id = u.rol_id and u2.estado = 'activo' and u2.auth_user_id is not null
              order by u2.nombre limit 1);

-- Cobrado sin IVA esperado del vendedor este mes (calculado aparte, como postgres).
select set_config('prueba.cobrado_esperado', coalesce(round(sum(p.monto * (o.total - coalesce(o.iva, 0)) / nullif(o.total, 0)), 2), 0)::text, true)
from public.pagos p
join public.ordenes o on o.id = p.orden_id
left join public.estados_orden eo on eo.id = o.estado_id
where o.vendedor_id = current_setting('prueba.id_vendedor')::uuid
  and coalesce(eo.nombre, '') <> 'Cancelada'
  and p.fecha >= date_trunc('month', current_date) and p.fecha < date_trunc('month', current_date) + interval '1 month';

set local role authenticated;

do $t$
declare
  v_vend uuid := current_setting('prueba.id_vendedor')::uuid;
  v_mes date := date_trunc('month', current_date)::date;
  r record;
  cnt int;
begin
  ------------------------------------------------------------ admin primario
  perform set_config('request.jwt.claims', current_setting('prueba.admin_primario'), true);

  -- 1. Fija meta 50,000 y 5 % propio al vendedor.
  insert into public.metas_vendedor (vendedor_id, periodo, meta, comision_pct)
  values (v_vend, v_mes, 50000, 5)
  on conflict (vendedor_id, periodo) do update set meta = excluded.meta, comision_pct = excluded.comision_pct;
  select * into r from public.metas_vendedor where vendedor_id = v_vend and periodo = v_mes;
  insert into resultados (prueba, resultado) values ('1 admin fija meta',
    format('meta=%s pct=%s updated_by=%s', r.meta, r.comision_pct,
           case when r.updated_by = current_setting('prueba.id_admin_primario')::uuid then 'admin (bien)' else 'OTRO (mal)' end));

  -- 2. Periodo que no es día 1 → rechazado.
  begin
    insert into public.metas_vendedor (vendedor_id, periodo, meta) values (v_vend, v_mes + 3, 1);
    insert into resultados (prueba, resultado) values ('2 periodo día 4', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('2 periodo día 4', 'bloqueado (bien)');
  end;

  -- 3. El admin ve a todos.
  select count(*) into cnt from public.desempeno_vendedores(v_mes);
  insert into resultados (prueba, resultado) values ('3 admin ve', cnt || ' vendedor(es)');

  ------------------------------------------------------------ vendedor
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);

  -- 4. Solo su fila, con su meta, % propio y la comisión correcta.
  select count(*) into cnt from public.desempeno_vendedores(v_mes);
  select * into r from public.desempeno_vendedores(v_mes) limit 1;
  insert into resultados (prueba, resultado) values ('4 vendedor ve', format(
    '%s fila(s) %s; meta=%s pct=%s cobrado=%s (esperado %s) comisión=%s %s',
    cnt, case when cnt = 1 and r.vendedor_id = v_vend then '(bien)' else '(mal)' end,
    r.meta, r.comision_pct, r.cobrado, current_setting('prueba.cobrado_esperado'), r.comision,
    case when r.cobrado = current_setting('prueba.cobrado_esperado')::numeric
          and r.comision = round(r.cobrado * 5 / 100, 2) then '(bien)' else '(mal)' end));

  -- 5. No puede cambiarse la meta.
  update public.metas_vendedor set meta = 1 where vendedor_id = v_vend and periodo = v_mes;
  get diagnostics cnt = row_count;
  insert into resultados (prueba, resultado) values ('5 vendedor edita su meta',
    case when cnt = 0 then 'sin efecto (bien)' else 'LA CAMBIÓ (mal)' end);
  begin
    insert into public.metas_vendedor (vendedor_id, periodo, meta) values (v_vend, (v_mes + interval '1 month')::date, 1);
    insert into resultados (prueba, resultado) values ('6 vendedor crea meta', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('6 vendedor crea meta', 'bloqueado (bien)');
  end;

  -- 7. Ni el % global.
  update public.politicas_venta set comision_pct = 50;
  get diagnostics cnt = row_count;
  insert into resultados (prueba, resultado) values ('7 vendedor cambia % global',
    case when cnt = 0 then 'sin efecto (bien)' else 'LO CAMBIÓ (mal)' end);

  ------------------------------------------------------------ admin secundario
  perform set_config('request.jwt.claims', current_setting('prueba.admin_secundario'), true);

  select count(*) into cnt from public.desempeno_vendedores(v_mes);
  insert into resultados (prueba, resultado) values ('8 admin secundario ve', cnt || ' vendedor(es)');
  update public.metas_vendedor set meta = 1 where vendedor_id = v_vend and periodo = v_mes;
  get diagnostics cnt = row_count;
  insert into resultados (prueba, resultado) values ('9 admin secundario edita',
    case when cnt = 0 then 'sin efecto (bien)' else 'LA CAMBIÓ (mal)' end);

  raise exception E'PRUEBA TERMINADA (no se guardó nada). Resultados:\n%',
    (select string_agg(prueba || ' → ' || resultado, E'\n' order by n) from resultados);
end
$t$;
