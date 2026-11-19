-- =====================================================================
-- avance_produccion.sql — El estado de la orden sigue al avance de los talleres
-- =====================================================================
-- Hasta ahora el estado de la orden (Pendiente, En Diseño, En Corte…, Lista para
-- Entrega, Entregada) no se movía solo y no había forma de marcar una orden como
-- entregada desde la app. Con esto:
--
--  1. private.sincronizar_estado_orden(orden): calcula el estado a partir de
--     produccion_taller y lo guarda (queda en historial_ordenes con el trigger que ya
--     existe):
--       - ningún taller ha empezado ............ Pendiente
--       - algún paso sin terminar ............. "En <taller>" del taller MÁS ATRASADO
--         (el primero del flujo diseño → sublimación → corte → costura → bordado que
--         tiene algún producto sin terminar: es lo que detiene la entrega)
--       - todos los pasos terminados .......... Lista para Entrega
--     No toca órdenes Entregadas ni Canceladas, ni las que no pasan por talleres.
--  2. Trigger en produccion_taller: se recalcula cada vez que un taller cambia un estado
--     (o se agregan / quitan talleres al editar la orden).
--  3. public.marcar_orden_entregada(orden, comentario): el vendedor dueño de la orden
--     (o el admin primario) la marca como entregada cuando ya no tiene producción
--     pendiente. Queda en el historial con quién la entregó.
--
-- El aviso al vendedor cuando la orden termina producción ya existe
-- (sql/avisos_produccion.sql).
-- =====================================================================

create or replace function private.sincronizar_estado_orden(p_orden uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_flujo constant text[] := array['diseno', 'sublimacion', 'corte', 'costura', 'bordado'];
  v_actual text;
  v_pasos integer;
  v_empezados integer;
  v_atrasado text;
  v_nuevo text;
begin
  select eo.nombre into v_actual
  from public.ordenes o left join public.estados_orden eo on eo.id = o.estado_id
  where o.id = p_orden;
  if not found or v_actual in ('Entregada', 'Cancelada') then
    return;
  end if;

  select count(*),
         count(*) filter (where coalesce(pt.estado, 'pending') <> 'pending')
    into v_pasos, v_empezados
  from public.produccion_taller pt
  join public.orden_detalles d on d.id = pt.orden_detalle_id
  where d.orden_id = p_orden;

  if v_pasos = 0 then
    return;
  end if;

  select t.nombre into v_atrasado
  from public.produccion_taller pt
  join public.orden_detalles d on d.id = pt.orden_detalle_id
  join public.talleres t on t.id = pt.taller_id
  where d.orden_id = p_orden and coalesce(pt.estado, 'pending') <> 'completed'
  order by array_position(c_flujo, t.nombre) nulls last
  limit 1;

  v_nuevo := case
    when v_atrasado is null then 'Lista para Entrega'
    when v_empezados = 0 then 'Pendiente'
    else 'En ' || private.etiqueta_taller(v_atrasado)
  end;

  if v_nuevo is distinct from v_actual then
    update public.ordenes
       set estado_id = (select id from public.estados_orden where nombre = v_nuevo)
     where id = p_orden
       and exists (select 1 from public.estados_orden where nombre = v_nuevo);
  end if;
end;
$$;
revoke execute on function private.sincronizar_estado_orden(uuid) from public, anon, authenticated;

create or replace function private.trg_estado_por_produccion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orden uuid;
begin
  select d.orden_id into v_orden
  from public.orden_detalles d
  where d.id = case when tg_op = 'DELETE' then old.orden_detalle_id else new.orden_detalle_id end;
  if v_orden is not null then
    perform private.sincronizar_estado_orden(v_orden);
  end if;
  return null;
end;
$$;
revoke execute on function private.trg_estado_por_produccion() from public, anon, authenticated;

drop trigger if exists trg_produccion_estado_orden on public.produccion_taller;
create trigger trg_produccion_estado_orden
  after insert or delete or update of estado on public.produccion_taller
  for each row execute function private.trg_estado_por_produccion();

-- ------------------------------------------------------------------ entregar
create or replace function public.marcar_orden_entregada(p_orden uuid, p_comentario text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orden public.ordenes%rowtype;
  v_estado text;
  v_pendientes integer;
  v_entregada uuid;
begin
  if not private.puede_editar_orden(p_orden) then
    raise exception 'Sin permiso para entregar esta orden' using errcode = '42501';
  end if;
  select * into v_orden from public.ordenes where id = p_orden for update;
  if not found then
    raise exception 'La orden no existe';
  end if;
  select nombre into v_estado from public.estados_orden where id = v_orden.estado_id;
  if v_estado = 'Entregada' then
    raise exception 'La orden % ya está entregada', v_orden.folio;
  elsif v_estado = 'Cancelada' then
    raise exception 'La orden % está cancelada', v_orden.folio;
  end if;

  select count(*) into v_pendientes
  from public.produccion_taller pt
  join public.orden_detalles d on d.id = pt.orden_detalle_id
  where d.orden_id = p_orden and coalesce(pt.estado, 'pending') <> 'completed';
  if v_pendientes > 0 then
    raise exception 'La orden % todavía tiene % paso(s) de producción sin terminar', v_orden.folio, v_pendientes;
  end if;

  select id into v_entregada from public.estados_orden where nombre = 'Entregada';
  update public.ordenes set estado_id = v_entregada where id = p_orden;

  -- El trigger de cambio de estado deja la entrada en el historial a nombre del
  -- vendedor; se completa con quién la entregó y el comentario.
  insert into public.historial_ordenes (orden_id, usuario_id, estado_anterior_id, estado_nuevo_id, comentario)
  values (p_orden, private.mi_usuario_id(), v_entregada, v_entregada,
          'Entregada al cliente' || coalesce('. ' || nullif(btrim(p_comentario), ''), ''));
end;
$$;

comment on function public.marcar_orden_entregada(uuid, text) is
  'Marca la orden como Entregada (vendedor dueño, admin secundario dueño o admin primario) si ya no tiene producción pendiente.';
revoke execute on function public.marcar_orden_entregada(uuid, text) from public, anon;
grant execute on function public.marcar_orden_entregada(uuid, text) to authenticated;

-- ------------------------------------------------------------------ poner al día
-- Órdenes abiertas cuyo estado no corresponde a su avance real.
do $$
declare
  r record;
begin
  for r in
    select o.id from public.ordenes o
    left join public.estados_orden eo on eo.id = o.estado_id
    where coalesce(eo.nombre, '') not in ('Entregada', 'Cancelada')
  loop
    perform private.sincronizar_estado_orden(r.id);
  end loop;
end
$$;
