-- =====================================================================
-- probar_aprobacion_disenos.sql — Prueba de sql/aprobacion_disenos.sql (NO deja datos)
-- =====================================================================
-- Ejecútalo en el SQL Editor DESPUÉS de aplicar aprobacion_disenos.sql (elige "Run
-- without RLS": la tabla `resultados` es temporal). Recorre el flujo completo con un
-- producto cuyo Diseño no está terminado: el diseñador sube v1, el cliente pide
-- cambios, sube v2, el cliente aprueba y Diseño termina. Termina SIEMPRE con el error
-- "PRUEBA TERMINADA (no se guardó nada)", que deshace todo (propuestas, avance y
-- notificaciones). No sube archivos: las funciones solo validan la ruta.
-- Ninguna línea debe decir "(mal)".
-- =====================================================================
begin;

create temp table resultados (n serial, prueba text, resultado text) on commit drop;
grant all on resultados to authenticated;
grant usage on sequence resultados_n_seq to authenticated;

-- Producto que pasa por Diseño (sin terminar) de una orden de un vendedor activo.
select set_config('prueba.detalle', d.id::text, true),
       set_config('prueba.orden', o.id::text, true),
       set_config('prueba.vendedor_id', u.id::text, true),
       set_config('prueba.vendedor', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.produccion_taller pt
join public.talleres t on t.id = pt.taller_id and t.nombre = 'diseno'
join public.orden_detalles d on d.id = pt.orden_detalle_id
join public.ordenes o on o.id = d.orden_id
join public.usuarios u on u.id = o.vendedor_id
join public.roles r on r.id = u.rol_id
where pt.estado <> 'completed' and r.nombre = 'vendedor' and u.estado = 'activo' and u.auth_user_id is not null
order by o.folio limit 1;

select set_config('prueba.disenador_id', u.id::text, true),
       set_config('prueba.disenador', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.usuarios u join public.roles r on r.id = u.rol_id
where r.nombre = 'disenador' and u.estado = 'activo' and u.auth_user_id is not null
order by u.nombre limit 1;

-- Otro vendedor (no es dueño de la orden).
select set_config('prueba.otro', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.usuarios u join public.roles r on r.id = u.rol_id
where r.nombre = 'vendedor' and u.estado = 'activo' and u.auth_user_id is not null
  and u.id <> current_setting('prueba.vendedor_id')::uuid
order by u.nombre limit 1;

set local role authenticated;

do $t$
declare
  v_det uuid := current_setting('prueba.detalle')::uuid;
  v_ord uuid := current_setting('prueba.orden')::uuid;
  v_ruta text := current_setting('prueba.orden') || '/' || current_setting('prueba.detalle') || '/prueba.png';
  v jsonb;
  v1 uuid;
  v2 uuid;
  cnt int;
  st text;
begin
  ------------------------------------------------------------ vendedor no sube
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
  begin
    perform public.subir_propuesta_diseno(v_det, v_ruta, null);
    insert into resultados (prueba, resultado) values ('1 vendedor sube boceto', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('1 vendedor sube boceto', 'bloqueado (bien)');
  end;

  ------------------------------------------------------------ diseñador sube v1
  perform set_config('request.jwt.claims', current_setting('prueba.disenador'), true);
  begin
    perform public.subir_propuesta_diseno(v_det, 'otra/ruta.png', null);
    insert into resultados (prueba, resultado) values ('2 ruta inválida', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('2 ruta inválida', 'bloqueada (bien)');
  end;

  v := public.subir_propuesta_diseno(v_det, v_ruta, 'Logo al frente, 8 cm');
  v1 := (v->>'id')::uuid;
  select estado into st from public.propuestas_diseno where id = v1;
  insert into resultados (prueba, resultado) values ('3 diseñador sube v1', format('versión %s, %s %s',
    v->>'version', st, case when st = 'por_enviar' then '(bien)' else '(mal)' end));

  -- 4. Sin aprobación, Diseño no se completa.
  begin
    update public.produccion_taller pt set estado = 'completed'
    from public.talleres t where t.id = pt.taller_id and t.nombre = 'diseno' and pt.orden_detalle_id = v_det;
    insert into resultados (prueba, resultado) values ('4 completar sin aprobación', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('4 completar sin aprobación', 'bloqueado (bien)');
  end;

  ------------------------------------------------------------ otro vendedor
  perform set_config('request.jwt.claims', current_setting('prueba.otro'), true);
  select count(*) into cnt from public.propuestas_diseno where orden_id = v_ord;
  insert into resultados (prueba, resultado) values ('5 otro vendedor ve', cnt || ' propuesta(s) ' || case when cnt = 0 then '(bien)' else '(mal)' end);
  begin
    perform public.responder_propuesta_diseno(v1, true, 'Alguien', 'whatsapp');
    insert into resultados (prueba, resultado) values ('6 otro vendedor responde', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('6 otro vendedor responde', 'bloqueado (bien)');
  end;

  ------------------------------------------------------------ vendedor de la orden
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
  select count(*) into cnt from public.notificaciones
  where destinatario_id = current_setting('prueba.vendedor_id')::uuid and created_at >= now() and enlace = '/ordenes/' || v_ord;
  insert into resultados (prueba, resultado) values ('7 aviso al vendedor', cnt || ' aviso(s) ' || case when cnt = 1 then '(bien)' else '(mal)' end);

  perform public.marcar_propuesta_enviada(v1, 'whatsapp');
  select estado into st from public.propuestas_diseno where id = v1;
  insert into resultados (prueba, resultado) values ('8 marcar enviada', st || case when st = 'enviada' then ' (bien)' else ' (mal)' end);

  begin
    perform public.responder_propuesta_diseno(v1, false, null, 'whatsapp', null, '   ');
    insert into resultados (prueba, resultado) values ('9 cambios sin descripción', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('9 cambios sin descripción', 'bloqueado (bien)');
  end;

  perform public.responder_propuesta_diseno(v1, false, 'Ing. Medina', 'whatsapp', null, 'Logo más grande y azul marino');
  select estado into st from public.propuestas_diseno where id = v1;
  insert into resultados (prueba, resultado) values ('10 cliente pide cambios', st || case when st = 'rechazada' then ' (bien)' else ' (mal)' end);

  begin
    insert into public.propuestas_diseno (orden_id, orden_detalle_id, version, archivo_path)
    values (v_ord, v_det, 99, v_ruta);
    insert into resultados (prueba, resultado) values ('11 insert directo', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('11 insert directo', 'bloqueado (bien)');
  end;

  ------------------------------------------------------------ diseñador: aviso y v2
  perform set_config('request.jwt.claims', current_setting('prueba.disenador'), true);
  select count(*) into cnt from public.notificaciones
  where destinatario_id = current_setting('prueba.disenador_id')::uuid and created_at >= now() and titulo like 'El cliente pidió cambios%';
  insert into resultados (prueba, resultado) values ('12 aviso de cambios a Diseño', cnt || ' aviso(s) ' || case when cnt = 1 then '(bien)' else '(mal)' end);

  v := public.subir_propuesta_diseno(v_det, v_ruta, 'Ajustes del cliente');
  v2 := (v->>'id')::uuid;
  select estado into st from public.propuestas_diseno where id = v1;
  -- (El producto puede tener versiones previas reales: se compara contra la de v1.)
  insert into resultados (prueba, resultado) values ('13 diseñador sube v2', format('versión %s; la anterior sigue %s %s',
    v->>'version', st,
    case when (v->>'version')::int = (select version from public.propuestas_diseno where id = v1) + 1
              and st = 'rechazada' then '(bien)' else '(mal)' end));

  ------------------------------------------------------------ vendedor: aprobación
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
  begin
    perform public.responder_propuesta_diseno(v2, true, '', 'presencial');
    insert into resultados (prueba, resultado) values ('14 aprobar sin nombre', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('14 aprobar sin nombre', 'bloqueado (bien)');
  end;
  begin
    perform public.responder_propuesta_diseno(v2, true, 'Ing. Medina', 'presencial', current_date + 5);
    insert into resultados (prueba, resultado) values ('15 aprobar con fecha futura', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('15 aprobar con fecha futura', 'bloqueado (bien)');
  end;
  perform public.responder_propuesta_diseno(v2, true, 'Ing. Medina', 'presencial', null, 'Firmó la hoja');
  select estado into st from public.propuestas_diseno where id = v2;
  insert into resultados (prueba, resultado) values ('16 cliente aprueba v2', st || case when st = 'aprobada' then ' (bien)' else ' (mal)' end);

  ------------------------------------------------------------ diseñador completa
  perform set_config('request.jwt.claims', current_setting('prueba.disenador'), true);
  update public.produccion_taller pt set estado = 'completed'
  from public.talleres t where t.id = pt.taller_id and t.nombre = 'diseno' and pt.orden_detalle_id = v_det;
  get diagnostics cnt = row_count;
  insert into resultados (prueba, resultado) values ('17 completar con aprobación',
    case when cnt = 1 then 'completado (bien)' else cnt || ' filas (mal: revisa la RLS de produccion_taller)' end);

  -- 18. Una versión nueva invalida la aprobación anterior.
  perform public.subir_propuesta_diseno(v_det, v_ruta, 'Cambio tardío');
  select estado into st from public.propuestas_diseno where id = v2;
  insert into resultados (prueba, resultado) values ('18 nueva versión tras aprobar', 'v2 queda ' || st || case when st = 'reemplazada' then ' (bien)' else ' (mal)' end);

  raise exception E'PRUEBA TERMINADA (no se guardó nada). Resultados:\n%',
    (select string_agg(prueba || ' → ' || resultado, E'\n' order by n) from resultados);
end
$t$;
