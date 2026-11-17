-- =====================================================================
-- probar_cobranza.sql — Prueba de sql/cobranza.sql (NO deja datos)
-- =====================================================================
-- Ejecútalo en el SQL Editor DESPUÉS de aplicar cobranza.sql (elige "Run without RLS":
-- la tabla `resultados` es temporal). Simula dos órdenes atrasadas de un vendedor
-- (una 10 días y otra 100 días vencida), corre los recordatorios y revisa quién ve
-- qué. Termina SIEMPRE con el error "PRUEBA TERMINADA (no se guardó nada)", que
-- deshace todo (fechas, avisos y notificaciones) y trae los resultados.
-- Ninguna línea debe decir "(mal)".
-- =====================================================================
begin;

create temp table resultados (n serial, prueba text, resultado text) on commit drop;
grant all on resultados to authenticated;
grant usage on sequence resultados_n_seq to authenticated;

-- Vendedor con al menos dos órdenes con saldo, y sus dos órdenes a atrasar.
select set_config('prueba.vendedor_id', x.vendedor_id::text, true),
       set_config('prueba.orden_a', x.ordenes[1]::text, true),
       set_config('prueba.orden_b', x.ordenes[2]::text, true)
from (
  select c.vendedor_id, array_agg(c.orden_id order by c.folio) as ordenes
  from private.cartera() c
  join public.usuarios u on u.id = c.vendedor_id
  join public.roles r on r.id = u.rol_id
  where r.nombre = 'vendedor' and u.estado = 'activo' and u.auth_user_id is not null
  group by c.vendedor_id
  having count(*) >= 2
  order by count(*) desc
  limit 1
) x;

-- Sesiones simuladas.
select set_config('prueba.vendedor', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.usuarios u where u.id = current_setting('prueba.vendedor_id')::uuid;
select set_config('prueba.admin', json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true),
       set_config('prueba.admin_id', u.id::text, true)
from public.usuarios u join public.roles r on r.id = u.rol_id
where r.nombre = 'admin_primario' and u.estado = 'activo' and u.auth_user_id is not null
order by u.nombre limit 1;

-- Atrasar: A vence hace 10 días (tramo 1–30) y B hace 100 días (tramo +60).
update public.ordenes o set fecha_entrega = (private.ahora_local())::date - 10 - coalesce(c.dias_credito, 0)
from public.clientes c
where o.id = current_setting('prueba.orden_a')::uuid and c.id = o.cliente_id;
update public.ordenes o set fecha_entrega = (private.ahora_local())::date - 100 - coalesce(c.dias_credito, 0)
from public.clientes c
where o.id = current_setting('prueba.orden_b')::uuid and c.id = o.cliente_id;

select set_config('prueba.total_cartera', (select count(*) from private.cartera())::text, true);
select set_config('prueba.cartera_vendedor',
  (select count(*) from private.cartera() where vendedor_id = current_setting('prueba.vendedor_id')::uuid)::text, true);

-- 1-3. Recordatorios (como lo corre el cron).
insert into resultados (prueba, resultado)
select '1 tramos simulados', string_agg(folio || '=' || tramo || ' (' || dias_vencido || ' días)', ', ' order by folio)
from private.cartera()
where orden_id in (current_setting('prueba.orden_a')::uuid, current_setting('prueba.orden_b')::uuid);

select set_config('prueba.antes', (select count(*) from public.notificaciones)::text, true);
select set_config('prueba.enviados', private.recordatorios_cobranza()::text, true);

insert into resultados (prueba, resultado)
select '2 recordatorios', format('%s orden(es) avisada(s) %s; al vendedor: %s, al admin primario: %s %s',
  current_setting('prueba.enviados'),
  case when current_setting('prueba.enviados')::int >= 2 then '(bien)' else '(mal)' end,
  count(*) filter (where n.destinatario_id = current_setting('prueba.vendedor_id')::uuid
                   and n.enlace in ('/ordenes/' || current_setting('prueba.orden_a'), '/ordenes/' || current_setting('prueba.orden_b'))),
  count(*) filter (where n.destinatario_id = current_setting('prueba.admin_id')::uuid
                   and n.enlace = '/ordenes/' || current_setting('prueba.orden_b')),
  case when count(*) filter (where n.destinatario_id = current_setting('prueba.vendedor_id')::uuid
                             and n.enlace in ('/ordenes/' || current_setting('prueba.orden_a'), '/ordenes/' || current_setting('prueba.orden_b'))) = 2
        and count(*) filter (where n.destinatario_id = current_setting('prueba.admin_id')::uuid
                             and n.enlace = '/ordenes/' || current_setting('prueba.orden_a')) = 0
        and count(*) filter (where n.destinatario_id = current_setting('prueba.admin_id')::uuid
                             and n.enlace = '/ordenes/' || current_setting('prueba.orden_b')) = 1
       then '(bien: el admin solo recibe el de +60)' else '(mal)' end)
from public.notificaciones n
where n.created_at >= now() and n.remitente_nombre = 'Aviso automático';

insert into resultados (prueba, resultado)
select '3 ejemplo de aviso', n.titulo || ' — ' || n.mensaje
from public.notificaciones n
where n.enlace = '/ordenes/' || current_setting('prueba.orden_b')
  and n.destinatario_id = current_setting('prueba.vendedor_id')::uuid and n.created_at >= now()
limit 1;

insert into resultados (prueba, resultado)
values ('4 segunda corrida', case when private.recordatorios_cobranza() = 0 then '0 avisos, no repite (bien)' else 'REPITIÓ AVISOS (mal)' end);

set local role authenticated;

do $t$
declare
  cnt int;
begin
  -- 5. El vendedor ve solo su cartera.
  perform set_config('request.jwt.claims', current_setting('prueba.vendedor'), true);
  select count(*) into cnt from public.cartera_por_cobrar();
  insert into resultados (prueba, resultado) values ('5 vendedor ve', format('%s de %s orden(es) con saldo %s',
    cnt, current_setting('prueba.total_cartera'),
    case when cnt = current_setting('prueba.cartera_vendedor')::int
          and not exists (select 1 from public.cartera_por_cobrar() where vendedor_id <> current_setting('prueba.vendedor_id')::uuid)
         then '(bien: solo las suyas)' else '(mal)' end));

  select count(*) into cnt from public.cartera_por_cobrar() where ultimo_aviso is not null;
  insert into resultados (prueba, resultado) values ('6 último aviso visible',
    case when cnt = 2 then '2 órdenes con aviso (bien)' else cnt || ' (mal)' end);

  -- 7. El vendedor no puede correr los recordatorios ni leer los avisos directo.
  begin
    perform public.enviar_recordatorios_cobranza();
    insert into resultados (prueba, resultado) values ('7 vendedor corre recordatorios', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('7 vendedor corre recordatorios', 'bloqueado (bien)');
  end;
  begin
    perform 1 from public.cobranza_avisos;
    insert into resultados (prueba, resultado) values ('8 vendedor lee cobranza_avisos', 'NO BLOQUEÓ (mal)');
  exception when others then
    insert into resultados (prueba, resultado) values ('8 vendedor lee cobranza_avisos', 'bloqueado (bien)');
  end;

  -- 9. El admin primario ve toda la cartera y puede correr los recordatorios.
  perform set_config('request.jwt.claims', current_setting('prueba.admin'), true);
  select count(*) into cnt from public.cartera_por_cobrar();
  insert into resultados (prueba, resultado) values ('9 admin ve', format('%s de %s %s',
    cnt, current_setting('prueba.total_cartera'),
    case when cnt = current_setting('prueba.total_cartera')::int then '(bien)' else '(mal)' end));
  insert into resultados (prueba, resultado) values ('10 admin corre recordatorios',
    format('%s pendiente(s) (bien)', public.enviar_recordatorios_cobranza()));

  raise exception E'PRUEBA TERMINADA (no se guardó nada). Resultados:\n%',
    (select string_agg(prueba || ' → ' || resultado, E'\n' order by n) from resultados);
end
$t$;
