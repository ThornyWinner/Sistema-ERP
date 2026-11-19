-- =====================================================================
-- probar_historial_clientes.sql — Prueba de sql/historial_clientes.sql (NO deja datos)
-- =====================================================================
-- Ejecútalo en el SQL Editor DESPUÉS de aplicar historial_clientes.sql (elige "Run
-- without RLS": la tabla `resultados` es temporal). Revisa que las partidas guarden su
-- descripción / talla / color, la bitácora de contactos con sus permisos y el resumen
-- por cliente (qué ve cada rol y que no cuente órdenes canceladas). Termina SIEMPRE con
-- el error "PRUEBA TERMINADA (no se guardó nada)", que deshace todo.
-- Ninguna línea debe decir "(mal)".
-- =====================================================================
begin;

create temp table resultados (n serial, prueba text, resultado text) on commit drop;
grant all on resultados to authenticated;
grant usage on sequence resultados_n_seq to authenticated;

-- Vendedor activo con órdenes con cliente, y uno de sus clientes.
select set_config('prueba.vendedor_id', u.id::text, true),
       set_config('prueba.vendedor', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true),
       set_config('prueba.cliente', o.cliente_id::text, true)
from public.ordenes o
join public.usuarios u on u.id = o.vendedor_id
join public.roles r on r.id = u.rol_id
where o.cliente_id is not null and r.nombre = 'vendedor' and u.estado = 'activo' and u.auth_user_id is not null
order by o.created_at desc limit 1;

select set_config('prueba.otro', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true),
       set_config('prueba.otro_id', u.id::text, true)
from public.usuarios u join public.roles r on r.id = u.rol_id
where r.nombre = 'vendedor' and u.estado = 'activo' and u.auth_user_id is not null
  and u.id <> nullif(current_setting('prueba.vendedor_id', true), '')::uuid
order by u.nombre limit 1;

select set_config('prueba.admin', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.usuarios u join public.roles r on r.id = u.rol_id
where r.nombre = 'admin_primario' and u.estado = 'activo' and u.auth_user_id is not null
order by u.nombre limit 1;

select set_config('prueba.taller', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.usuarios u join public.roles r on r.id = u.rol_id
where r.nombre in ('disenador', 'sublimador', 'cortador', 'costurera', 'bordador') and u.estado = 'activo' and u.auth_user_id is not null
order by u.nombre limit 1;

-- Partida con variante, y otra variante del mismo producto con distinta talla o color.
select set_config('prueba.detalle', d.id::text, true),
       set_config('prueba.var_nueva', v2.id::text, true)
from public.orden_detalles d
join public.variantes_producto v1 on v1.id = d.variante_id
join public.variantes_producto v2 on v2.producto_id = v1.producto_id and v2.id <> v1.id
  and (v2.talla is distinct from v1.talla or v2.color is distinct from v1.color)
limit 1;

do $t$
declare
  v_vend uuid := nullif(current_setting('prueba.vendedor_id', true), '')::uuid;
  v_cli uuid := nullif(current_setting('prueba.cliente', true), '')::uuid;
  v_otro_id uuid := nullif(current_setting('prueba.otro_id', true), '')::uuid;
  v_det uuid := nullif(current_setting('prueba.detalle', true), '')::uuid;
  v_var uuid := nullif(current_setting('prueba.var_nueva', true), '')::uuid;
  v_contacto uuid;
  v_nombre text;
  v_talla text;
  v_esperada text;
  cnt int;
  cnt2 int;
  st text;
begin
  if v_vend is null then
    raise exception 'No hay un vendedor activo con órdenes con cliente para probar';
  end if;

  ------------------------------------------------------------ 1. datos de la partida
  select count(*) into cnt from public.orden_detalles where producto_id is not null and descripcion is null;
  insert into resultados (prueba, resultado) values ('1 partidas existentes con descripción', cnt || ' sin descripción' ||
    case when cnt = 0 then ' (bien)' else ' (mal)' end);

  if v_det is not null then
    -- Se borra la descripción: el trigger la vuelve a tomar del catálogo.
    update public.orden_detalles set descripcion = '  ' where id = v_det;
    select d.descripcion, p.nombre into v_nombre, st
    from public.orden_detalles d join public.productos p on p.id = d.producto_id where d.id = v_det;
    insert into resultados (prueba, resultado) values ('2 descripción vacía → catálogo', coalesce(v_nombre, 'NULL') ||
      case when v_nombre = st then ' (bien)' else ' (mal)' end);

    -- Cambia la variante: la talla y el color se toman de la nueva. (Directo, sin
    -- pasar por el inventario: solo se prueba el trigger de datos.)
    alter table public.orden_detalles disable trigger user;
    alter table public.orden_detalles enable trigger trg_orden_detalles_datos;
    update public.orden_detalles set variante_id = v_var where id = v_det;
    alter table public.orden_detalles enable trigger user;
    select d.talla, v.talla into v_talla, v_esperada
    from public.orden_detalles d join public.variantes_producto v on v.id = v_var where d.id = v_det;
    insert into resultados (prueba, resultado) values ('3 cambio de variante', format('talla %s', coalesce(v_talla, 'NULL')) ||
      case when v_talla is not distinct from nullif(v_esperada, '') then ' (bien)' else ' (mal)' end);
  else
    insert into resultados (prueba, resultado) values ('2-3 partida con variante', 'omitidas: no hay partidas con variantes alternativas');
  end if;

  set local role authenticated;

  ------------------------------------------------------------ 4. bitácora de contactos
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
  insert into public.contactos_cliente (cliente_id, canal, resultado, notas, proximo_contacto)
  values (v_cli, 'whatsapp', 'interesado', 'Quiere repetir el pedido del año pasado', current_date + 7)
  returning id, (usuario_id = v_vend)::text into v_contacto, st;
  insert into resultados (prueba, resultado) values ('4a vendedor registra contacto', 'a su nombre: ' || st ||
    case when st = 'true' then ' (bien)' else ' (mal)' end);

  if v_otro_id is not null then
    begin
      insert into public.contactos_cliente (cliente_id, usuario_id, canal, resultado)
      values (v_cli, v_otro_id, 'llamada', 'pedido');
      insert into resultados (prueba, resultado) values ('4b registrar a nombre de otro', 'NO BLOQUEÓ (mal)');
    exception when others then
      insert into resultados (prueba, resultado) values ('4b registrar a nombre de otro', 'bloqueado (bien)');
    end;

    perform set_config('request.jwt.claims', current_setting('prueba.otro'), true);
    select count(*) into cnt from public.contactos_cliente where id = v_contacto;
    insert into resultados (prueba, resultado) values ('4c otro vendedor no lo ve', cnt || ' visible(s)' ||
      case when cnt = 0 then ' (bien)' else ' (mal)' end);
    delete from public.contactos_cliente where id = v_contacto;
    get diagnostics cnt = row_count;
    insert into resultados (prueba, resultado) values ('4d otro vendedor no lo borra', cnt || ' borrado(s)' ||
      case when cnt = 0 then ' (bien)' else ' (mal)' end);
  else
    insert into resultados (prueba, resultado) values ('4b-4d otro vendedor', 'omitidas: solo hay un vendedor activo');
  end if;

  if coalesce(current_setting('prueba.taller', true), '') <> '' then
    perform set_config('request.jwt.claims', current_setting('prueba.taller'), true);
    begin
      insert into public.contactos_cliente (cliente_id, canal, resultado) values (v_cli, 'llamada', 'pedido');
      insert into resultados (prueba, resultado) values ('4e taller registra contacto', 'NO BLOQUEÓ (mal)');
    exception when others then
      insert into resultados (prueba, resultado) values ('4e taller registra contacto', 'bloqueado (bien)');
    end;
    begin
      perform * from public.resumen_clientes();
      insert into resultados (prueba, resultado) values ('5 taller consulta el resumen', 'NO BLOQUEÓ (mal)');
    exception when others then
      insert into resultados (prueba, resultado) values ('5 taller consulta el resumen', 'bloqueado (bien)');
    end;
  else
    insert into resultados (prueba, resultado) values ('4e-5 roles de taller', 'omitidas: no hay usuarios de taller activos');
  end if;

  ------------------------------------------------------------ 6. resumen del vendedor
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
  select count(*) into cnt from public.resumen_clientes() r
  where not exists (select 1 from public.ordenes o where o.cliente_id = r.cliente_id and o.vendedor_id = v_vend)
    and not exists (select 1 from public.contactos_cliente c where c.cliente_id = r.cliente_id and c.usuario_id = v_vend);
  insert into resultados (prueba, resultado) values ('6a vendedor solo ve sus clientes', cnt || ' ajeno(s)' ||
    case when cnt = 0 then ' (bien)' else ' (mal)' end);

  select r.ordenes, r.proximo_contacto::text into cnt, st from public.resumen_clientes() r where r.cliente_id = v_cli;
  reset role;
  select count(*) into cnt2 from public.ordenes o left join public.estados_orden eo on eo.id = o.estado_id
  where o.cliente_id = v_cli and o.vendedor_id = v_vend and coalesce(eo.nombre, '') <> 'Cancelada';
  insert into resultados (prueba, resultado) values ('6b órdenes sin canceladas', format('%s de %s', cnt, cnt2) ||
    case when cnt = cnt2 then ' (bien)' else ' (mal)' end);
  insert into resultados (prueba, resultado) values ('6c próximo contacto', coalesce(st, 'NULL') ||
    case when st = (current_date + 7)::text then ' (bien)' else ' (mal)' end);

  ------------------------------------------------------------ 7. resumen del admin
  if coalesce(current_setting('prueba.admin', true), '') <> '' then
    select count(*) into cnt2 from public.clientes;
    set local role authenticated;
    perform set_config('request.jwt.claims', current_setting('prueba.admin'), true);
    select count(*) into cnt from public.resumen_clientes();
    insert into resultados (prueba, resultado) values ('7 admin ve todos los clientes', format('%s de %s', cnt, cnt2) ||
      case when cnt = cnt2 then ' (bien)' else ' (mal)' end);
    reset role;
  end if;

  ------------------------------------------------------------ 8. el vendedor borra lo suyo
  set local role authenticated;
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
  delete from public.contactos_cliente where id = v_contacto;
  get diagnostics cnt = row_count;
  insert into resultados (prueba, resultado) values ('8 vendedor borra su contacto', cnt || ' borrado(s)' ||
    case when cnt = 1 then ' (bien)' else ' (mal)' end);
  reset role;

  raise exception E'PRUEBA TERMINADA (no se guardó nada). Resultados:\n%',
    (select string_agg(prueba || ' → ' || resultado, E'\n' order by n) from resultados);
end
$t$;
