-- =============================================================================
-- editar_orden.sql — Edición de una orden cuando el cliente pide cambios.
-- Puede editar: el admin primario (cualquier orden) y el admin secundario o un
-- vendedor (solo las órdenes que registraron). Ver sql/permisos_edicion_ordenes.sql.
--
-- public.editar_orden(p_orden, p_cambios, p_motivo) aplica TODO en una sola
-- transacción (si algo falla, no se guarda nada):
--
--  1. Permisos: private.puede_editar_orden (admin primario: todas; admin secundario
--     y vendedor: solo las suyas). Exige un motivo.
--  2. Estado: no se edita una orden Entregada ni Cancelada.
--  3. Datos generales: fecha de entrega, notas, descuento y contacto del cliente.
--  4. Partidas (p_cambios.partidas = lista COMPLETA deseada):
--     - Partida "en producción" (algún taller ya la empezó o terminó): queda
--       bloqueada; no se puede quitar ni cambiar producto, cantidad, precio, tipo,
--       talleres ni personalización.
--     - Partida existente sin avance: se actualiza; talleres y personalización se
--       reemplazan.
--     - Partida sin id: se agrega (el trigger trg_inventario_salida descuenta stock).
--     - Partida que ya no viene en la lista: se elimina (y su stock regresa).
--  5. Inventario: al cambiar la variante o la cantidad, o al quitar una partida, se
--     devuelve el stock anterior y se descuenta el nuevo, con su movimiento en
--     movimientos_producto. Falla si no alcanza el stock.
--  6. Importes: private.recalcular_totales_orden (sql/iva_ordenes.sql) calcula subtotal,
--     IVA por partida y total = subtotal − descuento + IVA, y el estado de pago. Falla si
--     el nuevo total queda por debajo de lo ya pagado.
--  7. Constancia: guarda en historial_ordenes el motivo y el detalle de lo que cambió,
--     y avisa por la campana al admin primario y a los talleres afectados.
--
-- Formato de p_cambios (jsonb):
--   { "fecha_entrega": "2026-11-30" | null, "notas": "..." | null, "descuento": 0,
--     "cliente_telefono": "..." | null, "cliente_email": "..." | null,
--     "partidas": [ { "id": uuid | null, "variante_id": uuid | null, "producto_id": uuid | null,
--                     "cantidad": 10, "precio_unitario": 250, "tipo_produccion": "fabricacion",
--                     "notas": "..." | null, "talleres": ["corte","costura"],
--                     "personalizacion": null | { "lugar_bordado": "bolsillo", "logo_url": null,
--                                                 "notas": null, "hilos": ["Azul"] } } ] }
-- =============================================================================

-- Etiqueta legible de una partida: "10 × Camisa Industrial (M / Azul)".
create or replace function private.etiqueta_partida(p_cantidad integer, p_producto uuid, p_variante uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select format('%s × %s%s',
    p_cantidad,
    coalesce((select p.nombre from public.productos p where p.id = p_producto), 'Producto'),
    coalesce((select format(' (%s / %s)', v.talla, v.color) from public.variantes_producto v where v.id = p_variante), ''))
$$;

-- Personalización de una partida en un formato comparable (jsonb) o null.
create or replace function private.personalizacion_de_detalle(p_detalle uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'lugar_bordado', pz.lugar_bordado,
           'logo_url', pz.logo_url,
           'notas', pz.notas,
           'hilos', coalesce((select jsonb_agg(h.color_hilo order by h.color_hilo)
                              from public.personalizacion_hilos h where h.personalizacion_id = pz.id), '[]'::jsonb))
  from public.personalizaciones pz
  where pz.orden_detalle_id = p_detalle
  order by pz.created_at
  limit 1
$$;

-- Normaliza la personalización recibida (null si viene vacía) para compararla.
create or replace function private.normalizar_personalizacion(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then null
    when nullif(trim(p->>'lugar_bordado'), '') is null
         and nullif(trim(p->>'logo_url'), '') is null
         and coalesce(jsonb_array_length(p->'hilos'), 0) = 0 then null
    else jsonb_build_object(
           'lugar_bordado', nullif(trim(p->>'lugar_bordado'), ''),
           'logo_url', nullif(trim(p->>'logo_url'), ''),
           'notas', nullif(trim(p->>'notas'), ''),
           'hilos', coalesce((select jsonb_agg(trim(x) order by trim(x))
                              from jsonb_array_elements_text(coalesce(p->'hilos', '[]'::jsonb)) x
                              where trim(x) <> ''), '[]'::jsonb))
  end
$$;

-- Mueve stock de una variante (positivo = regresa, negativo = sale) y deja su movimiento.
create or replace function private.mover_stock_variante(
  p_variante uuid, p_delta integer, p_orden uuid, p_tipo text, p_obs text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stock integer;
begin
  if p_variante is null or p_delta = 0 then
    return;
  end if;
  select stock into v_stock from public.variantes_producto where id = p_variante for update;
  if v_stock is null then
    raise exception 'La variante de producto ya no existe';
  end if;
  if v_stock + p_delta < 0 then
    raise exception 'Stock insuficiente: hay % pieza(s) disponibles de %',
      v_stock, private.etiqueta_partida(-p_delta, (select producto_id from public.variantes_producto where id = p_variante), p_variante);
  end if;
  update public.variantes_producto set stock = v_stock + p_delta where id = p_variante;
  insert into public.movimientos_producto
    (variante_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia, observaciones)
  values
    (p_variante, private.mi_usuario_id(), p_tipo, abs(p_delta), v_stock, v_stock + p_delta, p_orden::text, p_obs);
end;
$$;

create or replace function public.editar_orden(p_orden uuid, p_cambios jsonb, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_talleres constant text[] := array['diseno','sublimacion','corte','costura','bordado'];
  v_usuario uuid := private.mi_usuario_id();
  v_usuario_nombre text;
  v_orden public.ordenes%rowtype;
  v_estado_nombre text;
  v_estado_pago_nombre text;
  v_folio text;
  v_cambios text[] := '{}';
  v_afectados text[] := '{}';
  v_p jsonb;
  v_d public.orden_detalles%rowtype;
  v_bloqueada boolean;
  v_ids uuid[];
  v_id uuid;
  v_variante uuid;
  v_producto uuid;
  v_cantidad integer;
  v_precio numeric;
  v_tipo text;
  v_notas text;
  v_talleres text[];
  v_talleres_ant text[];
  v_pers jsonb;
  v_pers_ant jsonb;
  v_pers_id uuid;
  v_detalle_id uuid;
  v_pendiente_prod uuid;
  v_etq_ant text;
  v_etq_nueva text;
  v_cambio_partida text[];
  v_descuento numeric;
  v_subtotal numeric;
  v_total numeric;
  v_pagado numeric;
  v_fecha date;
  v_texto text;
  v_tel text;
  v_email text;
  v_tel_ant text;
  v_email_ant text;
begin
  -- 1. Permisos y motivo -------------------------------------------------------
  if v_usuario is null or not private.puede_editar_orden(p_orden) then
    raise exception 'No tienes permiso para editar esta orden' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo del cambio';
  end if;
  select nombre into v_usuario_nombre from public.usuarios where id = v_usuario;

  -- 2. Estado de la orden (se bloquea la fila para evitar ediciones simultáneas) ---
  select * into v_orden from public.ordenes where id = p_orden for update;
  if not found then
    raise exception 'La orden no existe';
  end if;
  v_folio := v_orden.folio;
  select nombre into v_estado_nombre from public.estados_orden where id = v_orden.estado_id;
  if v_estado_nombre in ('Entregada', 'Cancelada') then
    raise exception 'La orden % ya está %; no se puede editar', v_folio, lower(v_estado_nombre);
  end if;

  -- 3. Datos generales ------------------------------------------------------------
  v_fecha := nullif(p_cambios->>'fecha_entrega', '')::date;
  if v_fecha is distinct from v_orden.fecha_entrega then
    v_cambios := v_cambios || format('Fecha de entrega: %s → %s',
      coalesce(to_char(v_orden.fecha_entrega, 'DD/MM/YYYY'), 'sin fecha'), coalesce(to_char(v_fecha, 'DD/MM/YYYY'), 'sin fecha'));
  end if;

  v_texto := nullif(trim(p_cambios->>'notas'), '');
  if v_texto is distinct from nullif(trim(v_orden.notas), '') then
    v_cambios := v_cambios || 'Notas de la orden actualizadas';
  end if;

  if v_orden.cliente_id is not null and (p_cambios ? 'cliente_telefono' or p_cambios ? 'cliente_email') then
    select telefono, email into v_tel_ant, v_email_ant from public.clientes where id = v_orden.cliente_id;
    v_tel := nullif(trim(p_cambios->>'cliente_telefono'), '');
    v_email := nullif(trim(p_cambios->>'cliente_email'), '');
    if v_tel is distinct from nullif(trim(v_tel_ant), '') or v_email is distinct from nullif(trim(v_email_ant), '') then
      update public.clientes set telefono = v_tel, email = v_email where id = v_orden.cliente_id;
      if v_tel is distinct from nullif(trim(v_tel_ant), '') then
        v_cambios := v_cambios || format('Teléfono del cliente: %s → %s', coalesce(v_tel_ant, '—'), coalesce(v_tel, '—'));
      end if;
      if v_email is distinct from nullif(trim(v_email_ant), '') then
        v_cambios := v_cambios || format('Correo del cliente: %s → %s', coalesce(v_email_ant, '—'), coalesce(v_email, '—'));
      end if;
    end if;
  end if;

  -- 4. Partidas ------------------------------------------------------------------
  if jsonb_typeof(p_cambios->'partidas') is distinct from 'array' or jsonb_array_length(p_cambios->'partidas') = 0 then
    raise exception 'La orden debe tener al menos un producto';
  end if;

  select coalesce(array_agg((x->>'id')::uuid), '{}') into v_ids
  from jsonb_array_elements(p_cambios->'partidas') x
  where nullif(x->>'id', '') is not null;

  if exists (select 1 from unnest(v_ids) i
             where not exists (select 1 from public.orden_detalles d where d.id = i and d.orden_id = p_orden)) then
    raise exception 'Una de las partidas no pertenece a esta orden';
  end if;

  select id into v_pendiente_prod from public.estados_produccion where nombre = 'Pendiente';

  -- 4a. Partidas eliminadas.
  for v_d in select * from public.orden_detalles where orden_id = p_orden and not (id = any (v_ids)) loop
    v_etq_ant := private.etiqueta_partida(v_d.cantidad, v_d.producto_id, v_d.variante_id);
    if exists (select 1 from public.produccion_taller pt
               where pt.orden_detalle_id = v_d.id and coalesce(pt.estado, 'pending') <> 'pending') then
      raise exception 'No se puede quitar "%": ya está en producción', v_etq_ant;
    end if;
    v_afectados := v_afectados || coalesce((select array_agg(t.nombre) from public.produccion_taller pt
                                            join public.talleres t on t.id = pt.taller_id
                                            where pt.orden_detalle_id = v_d.id), '{}');
    perform private.mover_stock_variante(v_d.variante_id, v_d.cantidad, p_orden, 'Devolución',
      format('Partida quitada de la orden %s', v_folio));
    delete from public.orden_detalles where id = v_d.id;
    v_cambios := v_cambios || format('Se quitó: %s', v_etq_ant);
  end loop;

  -- 4b. Partidas nuevas o modificadas.
  for v_p in select * from jsonb_array_elements(p_cambios->'partidas') loop
    v_id := nullif(v_p->>'id', '')::uuid;
    v_variante := nullif(v_p->>'variante_id', '')::uuid;
    v_producto := nullif(v_p->>'producto_id', '')::uuid;
    v_cantidad := (v_p->>'cantidad')::integer;
    v_precio := round(coalesce((v_p->>'precio_unitario')::numeric, 0), 2);
    v_tipo := coalesce(nullif(v_p->>'tipo_produccion', ''), 'fabricacion');
    v_notas := nullif(trim(v_p->>'notas'), '');
    select coalesce(array_agg(t order by array_position(c_talleres, t)), '{}') into v_talleres
    from (select distinct jsonb_array_elements_text(coalesce(v_p->'talleres', '[]'::jsonb)) t) s;
    v_pers := private.normalizar_personalizacion(v_p->'personalizacion');

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada producto debe ser mayor a cero';
    end if;
    if v_precio < 0 then
      raise exception 'El precio no puede ser negativo';
    end if;
    if v_tipo not in ('directa', 'fabricacion', 'comercializacion') then
      raise exception 'Tipo de producción no válido: %', v_tipo;
    end if;
    if not (v_talleres <@ c_talleres) then
      raise exception 'Taller no válido en la lista de talleres';
    end if;
    -- La variante manda: el producto se toma de ella.
    if v_variante is not null then
      select producto_id into v_producto from public.variantes_producto where id = v_variante;
      if not found then
        raise exception 'La variante de producto no existe';
      end if;
    end if;

    if v_id is null then
      -- Nueva partida (el trigger de inventario valida y descuenta el stock).
      if v_producto is null then
        raise exception 'Elige el producto de cada partida nueva';
      end if;
      insert into public.orden_detalles (orden_id, producto_id, variante_id, cantidad, precio_unitario, tipo_produccion, notas)
      values (p_orden, v_producto, v_variante, v_cantidad, v_precio, v_tipo, v_notas)
      returning id into v_detalle_id;
      insert into public.produccion_taller (orden_detalle_id, taller_id, estado, estado_id)
      select v_detalle_id, t.id, 'pending', v_pendiente_prod from public.talleres t where t.nombre = any (v_talleres);
      if v_pers is not null then
        insert into public.personalizaciones (orden_detalle_id, lugar_bordado, logo_url, notas)
        values (v_detalle_id, v_pers->>'lugar_bordado', v_pers->>'logo_url', v_pers->>'notas')
        returning id into v_pers_id;
        insert into public.personalizacion_hilos (personalizacion_id, color_hilo)
        select v_pers_id, h from jsonb_array_elements_text(v_pers->'hilos') h;
      end if;
      v_afectados := v_afectados || v_talleres;
      v_cambios := v_cambios || format('Se agregó: %s a $%s', private.etiqueta_partida(v_cantidad, v_producto, v_variante),
                                       to_char(v_precio, 'FM999,999,990.00'));
      continue;
    end if;

    -- Partida existente.
    select * into v_d from public.orden_detalles where id = v_id for update;
    v_etq_ant := private.etiqueta_partida(v_d.cantidad, v_d.producto_id, v_d.variante_id);
    if v_variante is null and v_producto is null then
      -- Partida a la medida (sin catálogo): conserva su producto.
      v_producto := v_d.producto_id;
    end if;
    select coalesce(array_agg(t.nombre order by array_position(c_talleres, t.nombre)), '{}') into v_talleres_ant
    from public.produccion_taller pt join public.talleres t on t.id = pt.taller_id
    where pt.orden_detalle_id = v_id;
    v_pers_ant := private.normalizar_personalizacion(private.personalizacion_de_detalle(v_id));
    v_bloqueada := exists (select 1 from public.produccion_taller pt
                           where pt.orden_detalle_id = v_id and coalesce(pt.estado, 'pending') <> 'pending');

    v_cambio_partida := '{}';
    if v_variante is distinct from v_d.variante_id or v_producto is distinct from v_d.producto_id then
      v_cambio_partida := v_cambio_partida || format('producto → %s', private.etiqueta_partida(v_cantidad, v_producto, v_variante));
    end if;
    if v_cantidad <> v_d.cantidad then
      v_cambio_partida := v_cambio_partida || format('cantidad %s → %s', v_d.cantidad, v_cantidad);
    end if;
    if v_precio <> round(coalesce(v_d.precio_unitario, 0), 2) then
      v_cambio_partida := v_cambio_partida || format('precio $%s → $%s',
        to_char(coalesce(v_d.precio_unitario, 0), 'FM999,999,990.00'), to_char(v_precio, 'FM999,999,990.00'));
    end if;
    if v_tipo is distinct from coalesce(v_d.tipo_produccion, v_tipo) then
      v_cambio_partida := v_cambio_partida || format('tipo %s → %s', v_d.tipo_produccion, v_tipo);
    end if;
    if v_talleres <> v_talleres_ant then
      v_cambio_partida := v_cambio_partida || format('talleres: %s → %s',
        coalesce(nullif(array_to_string(v_talleres_ant, ', '), ''), 'ninguno'), coalesce(nullif(array_to_string(v_talleres, ', '), ''), 'ninguno'));
    end if;
    if v_pers is distinct from v_pers_ant then
      v_cambio_partida := v_cambio_partida || 'personalización actualizada';
    end if;
    if v_notas is distinct from nullif(trim(v_d.notas), '') then
      v_cambio_partida := v_cambio_partida || 'notas actualizadas';
    end if;

    if cardinality(v_cambio_partida) = 0 then
      continue;
    end if;
    if v_bloqueada then
      raise exception '"%" ya está en producción; no se puede modificar', v_etq_ant;
    end if;

    -- Inventario: regresa lo anterior y descuenta lo nuevo (si cambió variante o cantidad).
    if v_variante is distinct from v_d.variante_id then
      perform private.mover_stock_variante(v_d.variante_id, v_d.cantidad, p_orden, 'Devolución',
        format('Cambio de producto en la orden %s', v_folio));
      perform private.mover_stock_variante(v_variante, -v_cantidad, p_orden, 'Venta',
        format('Cambio de producto en la orden %s', v_folio));
    elsif v_cantidad <> v_d.cantidad then
      perform private.mover_stock_variante(v_variante, v_d.cantidad - v_cantidad, p_orden,
        case when v_cantidad < v_d.cantidad then 'Devolución' else 'Venta' end,
        format('Cambio de cantidad en la orden %s', v_folio));
    end if;

    update public.orden_detalles
       set producto_id = v_producto, variante_id = v_variante, cantidad = v_cantidad,
           precio_unitario = v_precio, tipo_produccion = v_tipo, notas = v_notas
     where id = v_id;

    -- Talleres: quita los que ya no van y agrega los nuevos (todos están pendientes).
    if v_talleres <> v_talleres_ant then
      delete from public.produccion_taller pt using public.talleres t
       where pt.orden_detalle_id = v_id and t.id = pt.taller_id and not (t.nombre = any (v_talleres));
      insert into public.produccion_taller (orden_detalle_id, taller_id, estado, estado_id)
      select v_id, t.id, 'pending', v_pendiente_prod from public.talleres t
       where t.nombre = any (v_talleres) and not (t.nombre = any (v_talleres_ant));
    end if;

    -- Personalización: se reemplaza completa.
    if v_pers is distinct from v_pers_ant then
      delete from public.personalizaciones where orden_detalle_id = v_id;
      if v_pers is not null then
        insert into public.personalizaciones (orden_detalle_id, lugar_bordado, logo_url, notas)
        values (v_id, v_pers->>'lugar_bordado', v_pers->>'logo_url', v_pers->>'notas')
        returning id into v_pers_id;
        insert into public.personalizacion_hilos (personalizacion_id, color_hilo)
        select v_pers_id, h from jsonb_array_elements_text(v_pers->'hilos') h;
      end if;
    end if;

    v_afectados := v_afectados || v_talleres_ant || v_talleres;
    v_cambios := v_cambios || format('%s: %s', v_etq_ant, array_to_string(v_cambio_partida, '; '));
  end loop;

  -- 5. Importes: los calcula private.recalcular_totales_orden (IVA por partida) -------
  v_descuento := round(coalesce((p_cambios->>'descuento')::numeric, v_orden.descuento, 0), 2);
  select coalesce(sum(round(cantidad * coalesce(precio_unitario, 0), 2)), 0) into v_subtotal
  from public.orden_detalles where orden_id = p_orden;
  if v_descuento < 0 or v_descuento > v_subtotal then
    raise exception 'El descuento debe estar entre $0 y el subtotal ($%)', to_char(v_subtotal, 'FM999,999,990.00');
  end if;
  if v_descuento <> round(coalesce(v_orden.descuento, 0), 2) then
    v_cambios := v_cambios || format('Descuento: $%s → $%s',
      to_char(coalesce(v_orden.descuento, 0), 'FM999,999,990.00'), to_char(v_descuento, 'FM999,999,990.00'));
  end if;

  update public.ordenes
     set fecha_entrega = v_fecha,
         notas = nullif(trim(p_cambios->>'notas'), ''),
         descuento = v_descuento
   where id = p_orden;
  -- Subtotal, IVA, total y estado de pago (el trigger del descuento también lo hace;
  -- se llama explícito para cubrir el caso en que el descuento no cambió).
  perform private.recalcular_totales_orden(p_orden);

  select total into v_total from public.ordenes where id = p_orden;
  select coalesce(sum(monto), 0) into v_pagado from public.pagos where orden_id = p_orden;
  if v_total < v_pagado then
    raise exception 'El nuevo total ($%, con IVA) es menor a lo que el cliente ya pagó ($%)',
      to_char(v_total, 'FM999,999,990.00'), to_char(v_pagado, 'FM999,999,990.00');
  end if;
  if v_total <> round(coalesce(v_orden.total, 0), 2) then
    v_cambios := v_cambios || format('Total con IVA: $%s → $%s',
      to_char(coalesce(v_orden.total, 0), 'FM999,999,990.00'), to_char(v_total, 'FM999,999,990.00'));
  end if;

  if cardinality(v_cambios) = 0 then
    raise exception 'No hay cambios que guardar';
  end if;

  -- 6. Constancia: historial y avisos ------------------------------------------------
  insert into public.historial_ordenes (orden_id, usuario_id, estado_anterior_id, estado_nuevo_id, comentario)
  values (p_orden, v_usuario, v_orden.estado_id, v_orden.estado_id,
          format(E'Orden editada. Motivo: %s\n- %s', trim(p_motivo), array_to_string(v_cambios, E'\n- ')));

  -- Admin primario: enlace a la orden.
  insert into public.notificaciones
    (envio_id, destinatario_id, destinatario_nombre, remitente_id, remitente_nombre, titulo, mensaje, enlace)
  select e.envio, u.id, u.nombre, v_usuario, coalesce(v_usuario_nombre, 'Un usuario'),
         format('Orden %s modificada', v_folio),
         left(format(E'Motivo: %s\n- %s', trim(p_motivo), array_to_string(v_cambios, E'\n- ')), 2000),
         '/ordenes/' || p_orden
  from (select gen_random_uuid() as envio) e
  cross join public.usuarios u
  join public.roles r on r.id = u.rol_id
  where u.estado = 'activo' and u.id <> v_usuario and r.nombre = 'admin_primario';

  -- Talleres afectados (partidas agregadas, quitadas o cambiadas): enlace a su tablero.
  insert into public.notificaciones
    (envio_id, destinatario_id, destinatario_nombre, remitente_id, remitente_nombre, titulo, mensaje, enlace)
  select e.envio, u.id, u.nombre, v_usuario, coalesce(v_usuario_nombre, 'Un usuario'),
         format('Cambios en la orden %s', v_folio),
         left(format(E'El cliente pidió cambios. Motivo: %s\n- %s', trim(p_motivo), array_to_string(v_cambios, E'\n- ')), 2000),
         '/talleres/' || ta.taller
  from (select gen_random_uuid() as envio) e
  cross join (select distinct unnest(v_afectados) as taller) ta
  join public.roles r on r.nombre = case ta.taller
        when 'diseno' then 'disenador' when 'sublimacion' then 'sublimador' when 'corte' then 'cortador'
        when 'costura' then 'costurera' when 'bordado' then 'bordador' end
  join public.usuarios u on u.rol_id = r.id
  where u.estado = 'activo' and u.id <> v_usuario;
end;
$$;

comment on function public.editar_orden(uuid, jsonb, text) is
  'Edita una orden (admin primario: todas; admin secundario y vendedor: solo las que registraron) en una sola transacción: datos generales, partidas, inventario, total y estado de pago; registra el motivo en historial_ordenes y avisa al admin y a los talleres afectados.';

revoke execute on function public.editar_orden(uuid, jsonb, text) from public, anon;
grant execute on function public.editar_orden(uuid, jsonb, text) to authenticated;

revoke execute on function private.etiqueta_partida(integer, uuid, uuid) from public, anon;
revoke execute on function private.personalizacion_de_detalle(uuid) from public, anon;
revoke execute on function private.normalizar_personalizacion(jsonb) from public, anon;
revoke execute on function private.mover_stock_variante(uuid, integer, uuid, text, text) from public, anon, authenticated;
