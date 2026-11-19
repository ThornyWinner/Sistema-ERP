-- =====================================================================
-- devoluciones.sql — Devoluciones y cambios de talla
-- =====================================================================
-- Hasta ahora una devolución se resolvía editando la orden, sin regresar el stock y sin
-- constancia. Con esto, desde la orden se registra una devolución (folio DEV-AAAA-NNNNNN):
--
--  • Piezas devueltas: se marcan en la partida (orden_detalles.cantidad_devuelta; la
--    cantidad original no se toca) y, si están en buen estado, regresan al inventario
--    (a su misma variante o a otra del mismo producto, p. ej. una prenda a la medida
--    que coincide con una talla de stock). Si no regresan (dañadas, a la medida), quedan
--    como merma.
--  • Cambio de talla / color: las piezas que se lleva el cliente a cambio salen del
--    inventario como una partida nueva de venta directa (con el precio que se indique;
--    por omisión, el de la pieza devuelta).
--  • Importes: el total de la orden se recalcula sin las piezas devueltas y con las
--    nuevas. Si el cliente ya había pagado de más, se le puede reembolsar: queda como
--    un pago NEGATIVO ligado a la devolución (así cobranza, saldo y comisiones lo
--    descuentan solos); si no, queda como saldo a favor. Si el cambio sale más caro,
--    la diferencia queda por cobrar en la orden.
--  • Constancia: historial de la orden y aviso al admin primario (y al vendedor si la
--    registró otro). Si la orden ya tiene factura vigente, el aviso pide emitir la nota
--    de crédito.
--
-- Solo se devuelven piezas TERMINADAS (sin pasos de producción pendientes). Antes de
-- eso, los cambios se hacen con "Editar orden" (sql/editar_orden.sql), que ya regresa el
-- stock. Registra: quien puede editar la orden (private.puede_editar_orden).
-- =====================================================================

-- ------------------------------------------------------------------ 1. partidas
alter table public.orden_detalles
  add column if not exists cantidad_devuelta integer not null default 0;

alter table public.orden_detalles drop constraint if exists chk_cantidad_devuelta;
alter table public.orden_detalles
  add constraint chk_cantidad_devuelta check (cantidad_devuelta >= 0 and cantidad_devuelta <= cantidad);

comment on column public.orden_detalles.cantidad_devuelta is
  'Piezas de la partida que el cliente devolvió (sql/devoluciones.sql). El importe de la orden se calcula con cantidad − cantidad_devuelta.';

-- Subtotal, IVA y total sin las piezas devueltas (mismo cálculo de sql/iva_ordenes.sql).
create or replace function private.recalcular_totales_orden(p_orden uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_desc numeric;
  v_sub numeric;
  v_n integer;
  v_i integer := 0;
  v_resto numeric;
  v_d numeric;
  v_imp1 numeric;
  v_tasa1 numeric;
  v_iva numeric := 0;
  v_total numeric;
  v_pagado numeric;
  v_estado_pago text;
  r record;
begin
  select coalesce(descuento, 0) into v_desc from public.ordenes where id = p_orden;
  if not found then
    return;
  end if;

  select coalesce(sum(round((cantidad - cantidad_devuelta) * coalesce(precio_unitario, 0), 2)), 0), count(*)
    into v_sub, v_n
  from public.orden_detalles where orden_id = p_orden;

  v_desc := least(greatest(v_desc, 0), v_sub);
  v_resto := v_desc;
  for r in
    select round((cantidad - cantidad_devuelta) * coalesce(precio_unitario, 0), 2) as importe, tasa_iva
    from public.orden_detalles where orden_id = p_orden
    order by 1 desc, tasa_iva desc, id
  loop
    v_i := v_i + 1;
    if v_i = 1 then
      v_imp1 := r.importe;
      v_tasa1 := r.tasa_iva;
    else
      v_d := case when v_sub > 0 then round(v_desc * r.importe / v_sub, 2) else 0 end;
      v_resto := v_resto - v_d;
      v_iva := v_iva + round((r.importe - v_d) * r.tasa_iva, 2);
    end if;
  end loop;
  if v_n > 0 then
    v_iva := v_iva + round((v_imp1 - v_resto) * v_tasa1, 2);
  end if;
  v_total := v_sub - v_desc + v_iva;

  update public.ordenes
     set subtotal = v_sub, iva = v_iva, total = v_total
   where id = p_orden
     and (subtotal, iva, total) is distinct from (v_sub, v_iva, v_total);

  select ep.nombre into v_estado_pago
  from public.ordenes o left join public.estados_pago ep on ep.id = o.estado_pago_id
  where o.id = p_orden;
  if coalesce(v_estado_pago, 'Pendiente') in ('Pendiente', 'Anticipo', 'Pagado') then
    select coalesce(sum(monto), 0) into v_pagado from public.pagos where orden_id = p_orden;
    update public.ordenes
       set estado_pago_id = (select id from public.estados_pago where nombre =
             case when v_pagado = 0 then 'Pendiente' when v_pagado < v_total then 'Anticipo' else 'Pagado' end)
     where id = p_orden;
  end if;
end;
$$;

-- El trigger de totales también reacciona a las piezas devueltas.
drop trigger if exists trg_orden_detalles_totales on public.orden_detalles;
create trigger trg_orden_detalles_totales
  after insert or delete or update of cantidad, cantidad_devuelta, precio_unitario, tasa_iva, orden_id
  on public.orden_detalles
  for each row execute function private.trg_totales_por_partida();

-- ------------------------------------------------------------------ 2. tablas
create table if not exists public.devoluciones (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  orden_id uuid not null references public.ordenes(id) on delete cascade,
  tipo text not null check (tipo in ('devolucion', 'cambio')),
  motivo text not null check (motivo in ('talla', 'defecto', 'error_pedido', 'no_le_gusto', 'otro')),
  descripcion text check (descripcion is null or char_length(descripcion) <= 2000),
  fecha date not null default ((now() at time zone 'America/Monterrey')::date),
  total_anterior numeric(14,2) not null,
  total_nuevo numeric(14,2) not null,
  reembolso numeric(14,2) not null default 0 check (reembolso >= 0),
  metodo_reembolso text,
  registrada_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.devoluciones is
  'Devoluciones y cambios (de talla, color o producto) de piezas ya terminadas o entregadas. Las crea public.registrar_devolucion.';

create table if not exists public.devolucion_partidas (
  id uuid primary key default gen_random_uuid(),
  devolucion_id uuid not null references public.devoluciones(id) on delete cascade,
  orden_detalle_id uuid not null references public.orden_detalles(id) on delete cascade,
  -- devuelve: piezas que regresa el cliente; entrega: piezas que se lleva a cambio.
  sentido text not null check (sentido in ('devuelve', 'entrega')),
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(14,2) not null check (precio_unitario >= 0),
  -- devuelve: variante a la que reingresó (null = no regresó al inventario).
  -- entrega: variante que salió del inventario.
  variante_id uuid references public.variantes_producto(id) on delete set null,
  descripcion text
);
comment on table public.devolucion_partidas is
  'Piezas de cada devolución: las que regresó el cliente (y si volvieron al inventario) y las que se llevó a cambio.';

create index if not exists devoluciones_orden_idx on public.devoluciones (orden_id);
create index if not exists devolucion_partidas_dev_idx on public.devolucion_partidas (devolucion_id);
create index if not exists devolucion_partidas_detalle_idx on public.devolucion_partidas (orden_detalle_id);

alter table public.devoluciones enable row level security;
alter table public.devolucion_partidas enable row level security;

-- Las ven quienes ven los pagos de la orden: admin secundario y quien puede editarla.
drop policy if exists devoluciones_lectura on public.devoluciones;
create policy devoluciones_lectura on public.devoluciones for select to authenticated
  using ((select private.current_user_role()) = 'admin_secundario' or private.puede_editar_orden(orden_id));

drop policy if exists devolucion_partidas_lectura on public.devolucion_partidas;
create policy devolucion_partidas_lectura on public.devolucion_partidas for select to authenticated
  using (exists (select 1 from public.devoluciones d where d.id = devolucion_id));

revoke all on public.devoluciones, public.devolucion_partidas from anon, authenticated;
grant select on public.devoluciones, public.devolucion_partidas to authenticated;

-- ------------------------------------------------------------------ 3. reembolsos como pago negativo
alter table public.pagos
  add column if not exists devolucion_id uuid references public.devoluciones(id) on delete restrict;

alter table public.pagos drop constraint if exists chk_pago;
alter table public.pagos
  add constraint chk_pago check ((monto > 0 and devolucion_id is null) or (monto < 0 and devolucion_id is not null));

comment on column public.pagos.devolucion_id is
  'Si el renglón es un reembolso (monto negativo), la devolución que lo originó.';

-- Los usuarios solo capturan pagos normales; los reembolsos los crea registrar_devolucion
-- y no se pueden editar ni borrar a mano.
drop policy if exists alta on public.pagos;
create policy alta on public.pagos for insert to authenticated
  with check (private.puede_editar_orden(orden_id) and devolucion_id is null);

drop policy if exists edicion on public.pagos;
create policy edicion on public.pagos for update to authenticated
  using (private.puede_editar_orden(orden_id) and devolucion_id is null)
  with check (private.puede_editar_orden(orden_id) and devolucion_id is null);

drop policy if exists baja on public.pagos;
create policy baja on public.pagos for delete to authenticated
  using (private.puede_editar_orden(orden_id) and devolucion_id is null);

-- Comisiones (sql/metas_comisiones.sql): el reembolso descuenta lo cobrado en el mes en
-- que se devuelve. Si la orden quedó en $0 (devolución total) se descuenta la parte sin
-- IVA con la tasa general.
create or replace function public.desempeno_vendedores(p_periodo date)
returns table (vendedor_id uuid, nombre text, rol text, meta numeric, comision_pct numeric, comision_propia boolean,
               ordenes integer, vendido numeric, cobrado numeric, comision numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_rol text := private.current_user_role();
  v_yo uuid := private.mi_usuario_id();
  v_ini date := date_trunc('month', coalesce(p_periodo, current_date))::date;
  v_fin date := (date_trunc('month', coalesce(p_periodo, current_date)) + interval '1 month')::date;
  v_pct numeric;
begin
  if v_rol is null or v_rol not in ('admin_primario', 'admin_secundario', 'vendedor') then
    raise exception 'Sin permiso para consultar metas y comisiones' using errcode = '42501';
  end if;

  select pv.comision_pct into v_pct from public.politicas_venta pv limit 1;
  v_pct := coalesce(v_pct, 0);

  return query
  with vivas as (
    select o.id, o.vendedor_id, o.fecha_creacion, o.total, coalesce(o.iva, 0) as iva
    from public.ordenes o
    left join public.estados_orden eo on eo.id = o.estado_id
    where coalesce(eo.nombre, '') <> 'Cancelada'
  ),
  ventas as (
    select v.vendedor_id, count(*)::integer as n, sum(v.total - v.iva) as vendido
    from vivas v
    where v.fecha_creacion >= v_ini and v.fecha_creacion < v_fin
    group by v.vendedor_id
  ),
  cobros as (
    -- Parte sin IVA de cada pago (o reembolso), en proporción al total de su orden.
    select v.vendedor_id,
           sum(case when v.total > 0 then p.monto * (v.total - v.iva) / v.total else p.monto / 1.16 end) as cobrado
    from public.pagos p
    join vivas v on v.id = p.orden_id
    where p.fecha >= v_ini and p.fecha < v_fin
    group by v.vendedor_id
  ),
  metas as (
    select m.vendedor_id, m.meta, m.comision_pct
    from public.metas_vendedor m
    where m.periodo = v_ini
  ),
  gente as (
    select u.id, u.nombre, r.nombre as rol
    from public.usuarios u
    join public.roles r on r.id = u.rol_id
    where (r.nombre = 'vendedor' and u.estado = 'activo')
       or u.id in (select x.vendedor_id from ventas x)
       or u.id in (select x.vendedor_id from cobros x)
       or u.id in (select x.vendedor_id from metas x)
  )
  select g.id,
         g.nombre,
         g.rol,
         m.meta,
         coalesce(m.comision_pct, v_pct),
         m.comision_pct is not null,
         coalesce(ve.n, 0),
         round(coalesce(ve.vendido, 0), 2),
         round(coalesce(c.cobrado, 0), 2),
         round(coalesce(c.cobrado, 0) * coalesce(m.comision_pct, v_pct) / 100, 2)
  from gente g
  left join ventas ve on ve.vendedor_id = g.id
  left join cobros c on c.vendedor_id = g.id
  left join metas m on m.vendedor_id = g.id
  where v_rol in ('admin_primario', 'admin_secundario') or g.id = v_yo
  order by coalesce(ve.vendido, 0) desc, g.nombre;
end;
$$;

-- El trigger de salida de inventario (antiguo) no fija su search_path: llamado desde una
-- función con search_path vacío (como registrar_devolucion al entregar piezas a cambio)
-- no encuentra variantes_producto. Se fija aquí.
alter function public.inventario_procesar_salida() set search_path = public, pg_temp;

-- ------------------------------------------------------------------ 4. registrar
-- p_datos:
-- { "motivo": "talla", "descripcion": "Le quedó chica",
--   "devueltas": [ { "detalle_id": uuid, "cantidad": 2, "reingresar_variante_id": uuid | null } ],
--   "nuevas":    [ { "variante_id": uuid, "cantidad": 2, "precio_unitario": 250 | null } ],
--   "reembolsar": true, "metodo_reembolso": "Efectivo" }
create or replace function public.registrar_devolucion(p_orden uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_yo uuid := private.mi_usuario_id();
  v_yo_nombre text;
  v_orden public.ordenes%rowtype;
  v_estado text;
  v_motivo text := nullif(btrim(p_datos->>'motivo'), '');
  v_desc text := nullif(btrim(p_datos->>'descripcion'), '');
  v_anio integer := extract(year from (private.ahora_local())::date);
  v_num integer;
  v_folio text;
  v_id uuid;
  v_x jsonb;
  v_d public.orden_detalles%rowtype;
  v_cant integer;
  v_var uuid;
  v_var_prod uuid;
  v_precio numeric;
  v_nuevo_det uuid;
  v_anticipo numeric;
  v_total_ant numeric;
  v_total numeric;
  v_pagado numeric;
  v_reembolso numeric := 0;
  v_metodo text := nullif(btrim(p_datos->>'metodo_reembolso'), '');
  v_metodo_id uuid;
  v_hay_nuevas boolean := jsonb_typeof(p_datos->'nuevas') = 'array' and jsonb_array_length(p_datos->'nuevas') > 0;
  v_lineas text[] := '{}';
  v_factura text;
  v_mensaje text;
begin
  if v_yo is null or not private.puede_editar_orden(p_orden) then
    raise exception 'No tienes permiso para registrar devoluciones de esta orden' using errcode = '42501';
  end if;
  select * into v_orden from public.ordenes where id = p_orden for update;
  if not found then
    raise exception 'La orden no existe';
  end if;
  select nombre into v_estado from public.estados_orden where id = v_orden.estado_id;
  if v_estado = 'Cancelada' then
    raise exception 'La orden % está cancelada', v_orden.folio;
  end if;
  if v_motivo is null or v_motivo not in ('talla', 'defecto', 'error_pedido', 'no_le_gusto', 'otro') then
    raise exception 'Indica el motivo de la devolución';
  end if;
  if v_motivo = 'otro' and v_desc is null then
    raise exception 'Describe el motivo de la devolución';
  end if;
  if jsonb_typeof(p_datos->'devueltas') is distinct from 'array' or jsonb_array_length(p_datos->'devueltas') = 0 then
    raise exception 'Indica qué piezas devuelve el cliente';
  end if;
  select nombre into v_yo_nombre from public.usuarios where id = v_yo;

  -- Folio DEV-AAAA-NNNNNN.
  insert into public.consecutivos_documentos (tipo_documento, anio, ultimo_numero)
  values ('DEVOLUCION', v_anio, 0)
  on conflict (tipo_documento, anio) do nothing;
  update public.consecutivos_documentos set ultimo_numero = ultimo_numero + 1
  where tipo_documento = 'DEVOLUCION' and anio = v_anio
  returning ultimo_numero into v_num;
  v_folio := 'DEV-' || v_anio || '-' || lpad(v_num::text, 6, '0');

  v_total_ant := coalesce(v_orden.total, 0);
  insert into public.devoluciones (folio, orden_id, tipo, motivo, descripcion, total_anterior, total_nuevo, registrada_por)
  values (v_folio, p_orden, case when v_hay_nuevas then 'cambio' else 'devolucion' end,
          v_motivo, v_desc, v_total_ant, v_total_ant, v_yo)
  returning id into v_id;

  -- El anticipo no puede quedar arriba del total (chk_anticipo_no_mayor_total): se
  -- libera mientras se recalcula y al final se ajusta.
  v_anticipo := coalesce(v_orden.anticipo, 0);
  if v_anticipo > 0 then
    update public.ordenes set anticipo = 0 where id = p_orden;
  end if;

  -- Piezas que regresa el cliente.
  for v_x in select * from jsonb_array_elements(p_datos->'devueltas') loop
    select * into v_d from public.orden_detalles
    where id = nullif(v_x->>'detalle_id', '')::uuid and orden_id = p_orden
    for update;
    if not found then
      raise exception 'Una de las partidas no pertenece a esta orden';
    end if;
    v_cant := (v_x->>'cantidad')::integer;
    if v_cant is null or v_cant <= 0 then
      raise exception 'La cantidad devuelta debe ser mayor a cero';
    end if;
    if v_cant > v_d.cantidad - v_d.cantidad_devuelta then
      raise exception '"%": solo quedan % pieza(s) por devolver',
        coalesce(v_d.descripcion, 'Producto'), v_d.cantidad - v_d.cantidad_devuelta;
    end if;
    if exists (select 1 from public.produccion_taller pt
               where pt.orden_detalle_id = v_d.id and coalesce(pt.estado, 'pending') <> 'completed') then
      raise exception '"%" todavía está en producción: para cambiarla usa "Editar orden"', coalesce(v_d.descripcion, 'Producto');
    end if;

    v_var := nullif(v_x->>'reingresar_variante_id', '')::uuid;
    if v_var is not null then
      select producto_id into v_var_prod from public.variantes_producto where id = v_var;
      if not found then
        raise exception 'La variante de inventario no existe';
      end if;
      if v_d.producto_id is not null and v_var_prod <> v_d.producto_id then
        raise exception '"%" solo puede reingresar a una variante del mismo producto', coalesce(v_d.descripcion, 'Producto');
      end if;
      perform private.mover_stock_variante(v_var, v_cant, p_orden, 'Devolución',
        format('%s: devolución del cliente (orden %s)', v_folio, v_orden.folio));
    end if;

    update public.orden_detalles set cantidad_devuelta = cantidad_devuelta + v_cant where id = v_d.id;

    insert into public.devolucion_partidas (devolucion_id, orden_detalle_id, sentido, cantidad, precio_unitario, variante_id, descripcion)
    values (v_id, v_d.id, 'devuelve', v_cant, coalesce(v_d.precio_unitario, 0), v_var,
            private.etiqueta_partida(v_cant, v_d.producto_id, v_d.variante_id));
    v_lineas := v_lineas || format('Devuelve %s × %s%s%s', v_cant, coalesce(v_d.descripcion, 'Producto'),
      coalesce(' ' || nullif(concat_ws(' / ', v_d.talla, v_d.color), ''), ''),
      case when v_var is null then ' (no regresa al inventario)' else ' (regresa al inventario)' end);
  end loop;

  -- Piezas que se lleva a cambio (salen del inventario).
  if v_hay_nuevas then
    for v_x in select * from jsonb_array_elements(p_datos->'nuevas') loop
      v_var := nullif(v_x->>'variante_id', '')::uuid;
      v_cant := (v_x->>'cantidad')::integer;
      if v_var is null then
        raise exception 'Elige del inventario la prenda que se lleva a cambio';
      end if;
      if v_cant is null or v_cant <= 0 then
        raise exception 'La cantidad a cambio debe ser mayor a cero';
      end if;
      select producto_id, precio into v_var_prod, v_precio from public.variantes_producto where id = v_var;
      if not found then
        raise exception 'La variante de inventario no existe';
      end if;
      v_precio := round(coalesce(nullif(v_x->>'precio_unitario', '')::numeric, v_precio, 0), 2);
      if v_precio < 0 then
        raise exception 'El precio no puede ser negativo';
      end if;
      -- trg_inventario_salida descuenta el stock (y falla si no alcanza).
      insert into public.orden_detalles (orden_id, producto_id, variante_id, cantidad, precio_unitario, tipo_produccion, notas)
      values (p_orden, v_var_prod, v_var, v_cant, v_precio, 'directa', format('Cambio %s', v_folio))
      returning id into v_nuevo_det;
      insert into public.devolucion_partidas (devolucion_id, orden_detalle_id, sentido, cantidad, precio_unitario, variante_id, descripcion)
      values (v_id, v_nuevo_det, 'entrega', v_cant, v_precio, v_var, private.etiqueta_partida(v_cant, v_var_prod, v_var));
      v_lineas := v_lineas || format('Se lleva a cambio %s a $%s c/u', private.etiqueta_partida(v_cant, v_var_prod, v_var),
        to_char(v_precio, 'FM999,999,990.00'));
    end loop;
  end if;

  -- Importes y reembolso.
  perform private.recalcular_totales_orden(p_orden);
  select total into v_total from public.ordenes where id = p_orden;
  select coalesce(sum(monto), 0) into v_pagado from public.pagos where orden_id = p_orden;

  if v_pagado > v_total and coalesce((p_datos->>'reembolsar')::boolean, false) then
    v_reembolso := round(v_pagado - v_total, 2);
    select id into v_metodo_id from public.metodos_pago where nombre = coalesce(v_metodo, 'Efectivo');
    insert into public.pagos (orden_id, fecha, monto, metodo_pago, metodo_pago_id, referencia, devolucion_id)
    values (p_orden, (private.ahora_local())::date, -v_reembolso, coalesce(v_metodo, 'Efectivo'), v_metodo_id,
            'Reembolso ' || v_folio, v_id);
    v_pagado := v_pagado - v_reembolso;
  end if;

  if v_anticipo > 0 then
    update public.ordenes set anticipo = least(v_anticipo, v_total) where id = p_orden;
  end if;

  update public.devoluciones
     set total_nuevo = v_total, reembolso = v_reembolso,
         metodo_reembolso = case when v_reembolso > 0 then coalesce(v_metodo, 'Efectivo') end
   where id = v_id;

  -- Constancia.
  v_lineas := v_lineas || format('Total con IVA: $%s → $%s', to_char(v_total_ant, 'FM999,999,990.00'), to_char(v_total, 'FM999,999,990.00'));
  if v_reembolso > 0 then
    v_lineas := v_lineas || format('Reembolso al cliente: $%s (%s)', to_char(v_reembolso, 'FM999,999,990.00'), coalesce(v_metodo, 'Efectivo'));
  elsif v_pagado > v_total then
    v_lineas := v_lineas || format('Saldo a favor del cliente: $%s', to_char(v_pagado - v_total, 'FM999,999,990.00'));
  elsif v_total > v_pagado and v_total > v_total_ant then
    v_lineas := v_lineas || format('Diferencia por cobrar: $%s', to_char(v_total - v_pagado, 'FM999,999,990.00'));
  end if;

  insert into public.historial_ordenes (orden_id, usuario_id, estado_anterior_id, estado_nuevo_id, comentario)
  values (p_orden, v_yo, v_orden.estado_id, v_orden.estado_id,
          format(E'%s %s. Motivo: %s%s\n- %s', case when v_hay_nuevas then 'Cambio' else 'Devolución' end, v_folio,
                 v_motivo, coalesce(' — ' || v_desc, ''), array_to_string(v_lineas, E'\n- ')));

  select string_agg(coalesce(c.serie, '') || coalesce(c.folio::text, ''), ', ') into v_factura
  from public.cfdis c
  where c.orden_id = p_orden and c.tipo_comprobante = 'I' and c.estado = 'vigente';

  v_mensaje := array_to_string(v_lineas, E'\n')
    || case when v_factura is not null
            then format(E'\nLa orden tiene factura vigente (%s): emite la nota de crédito por la devolución.', v_factura)
            else '' end;

  insert into public.notificaciones
    (envio_id, destinatario_id, destinatario_nombre, remitente_id, remitente_nombre, titulo, mensaje, enlace)
  select e.envio, u.id, u.nombre, v_yo, coalesce(v_yo_nombre, 'Un usuario'),
         format('%s en la orden %s', case when v_hay_nuevas then 'Cambio' else 'Devolución' end, v_orden.folio),
         left(v_mensaje, 2000), '/ordenes/' || p_orden
  from (select gen_random_uuid() as envio) e
  cross join public.usuarios u
  join public.roles r on r.id = u.rol_id
  where u.estado = 'activo' and u.id <> v_yo
    and (r.nombre = 'admin_primario' or u.id = v_orden.vendedor_id);

  return jsonb_build_object(
    'id', v_id, 'folio', v_folio, 'total_anterior', v_total_ant, 'total_nuevo', v_total,
    'reembolso', v_reembolso, 'saldo_a_favor', greatest(v_pagado - v_total, 0),
    'por_cobrar', greatest(v_total - v_pagado, 0), 'factura', v_factura);
end;
$$;

comment on function public.registrar_devolucion(uuid, jsonb) is
  'Registra una devolución o cambio de piezas terminadas: reingreso al inventario, piezas a cambio, nuevo total, reembolso (pago negativo), historial y avisos.';
revoke execute on function public.registrar_devolucion(uuid, jsonb) from public, anon;
grant execute on function public.registrar_devolucion(uuid, jsonb) to authenticated;
