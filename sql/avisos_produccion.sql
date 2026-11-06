-- =============================================================================
-- avisos_produccion.sql — Avisos automáticos de cambio de etapa/taller.
--
-- Cuando un taller marca un producto de una orden como terminado ('completed'):
--  1. Si ese producto tiene otro taller pendiente más adelante en el flujo
--     (diseño → sublimación → corte → costura → bordado), se notifica a todos los
--     usuarios activos del rol de ese siguiente taller: "listo para <taller>".
--  2. Si con eso TODOS los productos de la orden terminaron todos sus talleres, se
--     notifica al vendedor de la orden y a los administradores primarios que la
--     orden terminó producción.
--
-- Los avisos se guardan en `notificaciones` (sql/notificaciones.sql) sin remitente
-- (remitente_id null, remitente_nombre 'Aviso automático'), así que no aparecen en
-- las "Enviadas" de quien terminó el taller. Quien hizo el cambio no se avisa a sí mismo.
-- =============================================================================

-- Nombre legible de cada taller para los mensajes.
create or replace function private.etiqueta_taller(p_taller text)
returns text language sql immutable set search_path = ''
as $$
  select case p_taller
    when 'diseno'      then 'Diseño'
    when 'sublimacion' then 'Sublimación'
    when 'corte'       then 'Corte'
    when 'costura'     then 'Costura'
    when 'bordado'     then 'Bordado'
    else coalesce(p_taller, 'taller')
  end
$$;

create or replace function private.avisar_cambio_taller()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  -- Orden del flujo de producción y rol que atiende cada taller.
  v_flujo text[] := array['diseno','sublimacion','corte','costura','bordado'];
  v_actor uuid := private.mi_usuario_id();
  v_actor_nombre text;
  v_taller text;
  v_taller_etq text;
  v_siguiente text;
  v_orden_id uuid;
  v_folio text;
  v_vendedor uuid;
  v_producto text;
  v_cantidad integer;
  v_pendientes integer;
begin
  -- Solo cuando el estado pasa a 'completed'.
  if new.estado is distinct from 'completed' or old.estado is not distinct from 'completed' then
    return new;
  end if;

  select t.nombre into v_taller from public.talleres t where t.id = new.taller_id;
  v_taller_etq := private.etiqueta_taller(v_taller);
  select coalesce(u.nombre, 'Un usuario') into v_actor_nombre from public.usuarios u where u.id = v_actor;
  v_actor_nombre := coalesce(v_actor_nombre, 'Un usuario');

  select o.id, o.folio, o.vendedor_id, d.cantidad, coalesce(p.nombre, 'Producto')
    into v_orden_id, v_folio, v_vendedor, v_cantidad, v_producto
  from public.orden_detalles d
  join public.ordenes o on o.id = d.orden_id
  left join public.productos p on p.id = d.producto_id
  where d.id = new.orden_detalle_id;
  if not found then
    return new;
  end if;

  -- 1. Siguiente taller pendiente de este producto, según el orden del flujo.
  select t.nombre into v_siguiente
  from public.produccion_taller pt
  join public.talleres t on t.id = pt.taller_id
  where pt.orden_detalle_id = new.orden_detalle_id
    and pt.id <> new.id
    and coalesce(pt.estado, 'pending') <> 'completed'
    and array_position(v_flujo, t.nombre) > coalesce(array_position(v_flujo, v_taller), 0)
  order by array_position(v_flujo, t.nombre)
  limit 1;

  if v_siguiente is not null then
    insert into public.notificaciones
      (envio_id, destinatario_id, destinatario_nombre, remitente_id, remitente_nombre, titulo, mensaje, enlace)
    select e.envio, u.id, u.nombre, null, 'Aviso automático',
           format('Orden %s lista para %s', v_folio, private.etiqueta_taller(v_siguiente)),
           format('%s × %s terminó %s (por %s). Ya puede pasar a %s.',
                  v_cantidad, v_producto, v_taller_etq, v_actor_nombre, private.etiqueta_taller(v_siguiente)),
           '/talleres/' || v_siguiente
    from (select gen_random_uuid() as envio) e
    cross join public.usuarios u
    join public.roles r on r.id = u.rol_id
    where u.estado = 'activo'
      and u.id is distinct from v_actor
      and r.nombre = case v_siguiente
        when 'diseno'      then 'disenador'
        when 'sublimacion' then 'sublimador'
        when 'corte'       then 'cortador'
        when 'costura'     then 'costurera'
        when 'bordado'     then 'bordador'
      end;
  end if;

  -- 2. ¿Toda la orden terminó producción?
  select count(*) into v_pendientes
  from public.orden_detalles d
  join public.produccion_taller pt on pt.orden_detalle_id = d.id
  where d.orden_id = v_orden_id
    and coalesce(pt.estado, 'pending') <> 'completed';

  if v_pendientes = 0 then
    insert into public.notificaciones
      (envio_id, destinatario_id, destinatario_nombre, remitente_id, remitente_nombre, titulo, mensaje, enlace)
    select e.envio, u.id, u.nombre, null, 'Aviso automático',
           format('Orden %s terminó producción', v_folio),
           format('Todos los productos completaron sus talleres (último: %s, por %s). Lista para revisión y entrega.',
                  v_taller_etq, v_actor_nombre),
           '/ordenes/' || v_orden_id
    from (select gen_random_uuid() as envio) e
    cross join public.usuarios u
    join public.roles r on r.id = u.rol_id
    where u.estado = 'activo'
      and u.id is distinct from v_actor
      and (u.id = v_vendedor or r.nombre = 'admin_primario');
  end if;

  return new;
exception when others then
  -- Un aviso fallido nunca debe impedir que el taller registre su avance.
  raise warning 'avisar_cambio_taller: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_produccion_taller_avisos on public.produccion_taller;
create trigger trg_produccion_taller_avisos
  after update of estado on public.produccion_taller
  for each row execute function private.avisar_cambio_taller();
