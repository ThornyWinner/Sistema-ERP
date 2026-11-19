-- =====================================================================
-- probar_avance_produccion.sql — Prueba de sql/avance_produccion.sql (NO deja datos)
-- =====================================================================
-- Ejecútalo en el SQL Editor DESPUÉS de aplicar avance_produccion.sql (elige "Run
-- without RLS": la tabla `resultados` es temporal). Toma una orden abierta con talleres
-- de un vendedor activo, mueve sus pasos de producción y revisa que el estado de la
-- orden los siga (Pendiente → En <taller> → Lista para Entrega) y que solo su vendedor
-- la pueda entregar, y únicamente con la producción terminada. Termina SIEMPRE con el
-- error "PRUEBA TERMINADA (no se guardó nada)", que deshace todo.
-- Ninguna línea debe decir "(mal)".
-- =====================================================================
begin;

create temp table resultados (n serial, prueba text, resultado text) on commit drop;
grant all on resultados to authenticated;
grant usage on sequence resultados_n_seq to authenticated;

-- Orden abierta con talleres, de un vendedor activo.
select set_config('prueba.orden', o.id::text, true),
       set_config('prueba.vendedor', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true),
       set_config('prueba.vendedor_id', u.id::text, true)
from public.ordenes o
join public.estados_orden eo on eo.id = o.estado_id
join public.usuarios u on u.id = o.vendedor_id
join public.roles r on r.id = u.rol_id
where eo.nombre not in ('Entregada', 'Cancelada')
  and r.nombre = 'vendedor' and u.estado = 'activo' and u.auth_user_id is not null
  and exists (select 1 from public.produccion_taller pt join public.orden_detalles d on d.id = pt.orden_detalle_id
              where d.orden_id = o.id)
order by o.folio limit 1;

-- Otro vendedor (no es dueño de la orden).
select set_config('prueba.otro', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.usuarios u join public.roles r on r.id = u.rol_id
where r.nombre = 'vendedor' and u.estado = 'activo' and u.auth_user_id is not null
  and u.id <> current_setting('prueba.vendedor_id')::uuid
order by u.nombre limit 1;

do $t$
declare
  v_ord uuid := current_setting('prueba.orden')::uuid;
  v_primero text;
  st text;
  cnt int;
begin
  -- Los pasos se mueven "como sistema" (sin sesión): así no aplica la regla de diseño
  -- aprobado ni la RLS de los talleres; lo que se prueba es el trigger de estado.
  if v_ord is null then
    raise exception 'No hay una orden abierta con talleres de un vendedor activo para probar';
  end if;

  -- 1. Todos los pasos sin empezar → Pendiente.
  perform set_config('request.jwt.claims', '', true);
  update public.produccion_taller pt set estado = 'pending'
  from public.orden_detalles d where d.id = pt.orden_detalle_id and d.orden_id = v_ord;
  select eo.nombre into st from public.ordenes o join public.estados_orden eo on eo.id = o.estado_id where o.id = v_ord;
  insert into resultados (prueba, resultado) values ('1 nada empezado', st || case when st = 'Pendiente' then ' (bien)' else ' (mal)' end);

  -- 2. Empieza el primer taller del flujo → "En <taller>".
  select t.nombre into v_primero
  from public.produccion_taller pt
  join public.orden_detalles d on d.id = pt.orden_detalle_id
  join public.talleres t on t.id = pt.taller_id
  where d.orden_id = v_ord
  order by array_position(array['diseno', 'sublimacion', 'corte', 'costura', 'bordado'], t.nombre) nulls last
  limit 1;
  update public.produccion_taller pt set estado = 'in-progress'
  from public.orden_detalles d, public.talleres t
  where d.id = pt.orden_detalle_id and t.id = pt.taller_id and d.orden_id = v_ord and t.nombre = v_primero;
  select eo.nombre into st from public.ordenes o join public.estados_orden eo on eo.id = o.estado_id where o.id = v_ord;
  insert into resultados (prueba, resultado) values ('2 empieza ' || v_primero,
    st || case when st = 'En ' || private.etiqueta_taller(v_primero) then ' (bien)' else ' (mal)' end);

  -- 3. Con producción pendiente, el vendedor no puede entregar.
  set local role authenticated;
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
  begin
    perform public.marcar_orden_entregada(v_ord, 'prueba');
    insert into resultados (prueba, resultado) values ('3 entregar con pendientes', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('3 entregar con pendientes', 'bloqueado (bien)');
  end;

  -- 4. Todo terminado → Lista para Entrega.
  reset role;
  perform set_config('request.jwt.claims', '', true);
  update public.produccion_taller pt set estado = 'completed'
  from public.orden_detalles d where d.id = pt.orden_detalle_id and d.orden_id = v_ord;
  select eo.nombre into st from public.ordenes o join public.estados_orden eo on eo.id = o.estado_id where o.id = v_ord;
  insert into resultados (prueba, resultado) values ('4 todo terminado', st || case when st = 'Lista para Entrega' then ' (bien)' else ' (mal)' end);

  -- 5. Otro vendedor no la entrega.
  set local role authenticated;
  if current_setting('prueba.otro', true) is not null and current_setting('prueba.otro', true) <> '' then
    perform set_config('request.jwt.claims', current_setting('prueba.otro'), true);
    begin
      perform public.marcar_orden_entregada(v_ord, 'prueba');
      insert into resultados (prueba, resultado) values ('5 otro vendedor entrega', 'NO BLOQUEÓ (mal)');
    exception when others then
      insert into resultados (prueba, resultado) values ('5 otro vendedor entrega', 'bloqueado (bien)');
    end;
  else
    insert into resultados (prueba, resultado) values ('5 otro vendedor entrega', 'omitida: solo hay un vendedor activo');
  end if;

  -- 6. Su vendedor la entrega; queda en el historial.
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
  perform public.marcar_orden_entregada(v_ord, 'Recibió el encargado');
  reset role;
  select eo.nombre into st from public.ordenes o join public.estados_orden eo on eo.id = o.estado_id where o.id = v_ord;
  select count(*) into cnt from public.historial_ordenes
  where orden_id = v_ord and comentario = 'Entregada al cliente. Recibió el encargado';
  insert into resultados (prueba, resultado) values ('6 vendedor entrega',
    st || ', historial ' || cnt || case when st = 'Entregada' and cnt = 1 then ' (bien)' else ' (mal)' end);

  -- 7. Una orden entregada ya no cambia de estado aunque se mueva un taller.
  perform set_config('request.jwt.claims', '', true);
  update public.produccion_taller pt set estado = 'in-progress'
  from public.orden_detalles d where d.id = pt.orden_detalle_id and d.orden_id = v_ord;
  select eo.nombre into st from public.ordenes o join public.estados_orden eo on eo.id = o.estado_id where o.id = v_ord;
  insert into resultados (prueba, resultado) values ('7 entregada no se mueve', st || case when st = 'Entregada' then ' (bien)' else ' (mal)' end);

  -- 8. No se entrega dos veces.
  set local role authenticated;
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
  begin
    perform public.marcar_orden_entregada(v_ord, null);
    insert into resultados (prueba, resultado) values ('8 entregar dos veces', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('8 entregar dos veces', 'bloqueado (bien)');
  end;
  reset role;

  raise exception E'PRUEBA TERMINADA (no se guardó nada). Resultados:\n%',
    (select string_agg(prueba || ' → ' || resultado, E'\n' order by n) from resultados);
end
$t$;
