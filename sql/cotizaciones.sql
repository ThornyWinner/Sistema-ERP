-- =====================================================================
-- cotizaciones.sql — Cotizaciones a clientes y su conversión en orden
-- =====================================================================
-- Flujo: borrador → enviada → aceptada | rechazada → convertida (al crear la orden).
-- "Vencida" no se guarda: es una cotización borrador/enviada con vigencia pasada
-- (la interfaz la muestra así; se puede editar para extender la vigencia).
--
-- Reglas:
--  - Las ven: admin primario y secundario (todas) y el vendedor (las suyas).
--  - Crean y editan: admin primario (todas), admin secundario y vendedor (las suyas),
--    solo mientras estén en borrador o enviadas.
--  - Se guardan SOLO con public.guardar_cotizacion() (encabezado + partidas en una
--    sola transacción, con importes calculados aquí) y cambian de estado con
--    public.cambiar_estado_cotizacion(). No hay políticas de insert/update directas.
--  - El tope de descuento de politicas_venta.sql también aplica (salvo admin primario).
--  - El cliente puede ser un prospecto (aún no está en el catálogo): se guarda su
--    nombre y, si existe en `clientes`, también su id.
--
-- Depende de: rls_por_rol.sql (private.current_user_role, private.mi_usuario_id),
-- permisos_edicion_ordenes.sql (private.puede_editar_orden) y politicas_venta.sql.
-- =====================================================================

-- ------------------------------------------------------------------ 1. tablas
create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  vendedor_id uuid not null references public.usuarios(id),
  cliente_id uuid references public.clientes(id) on delete set null,
  cliente_nombre text not null check (char_length(btrim(cliente_nombre)) between 1 and 200),
  cliente_telefono text,
  cliente_email text,
  fecha date not null default current_date,
  vigencia date not null,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'enviada', 'aceptada', 'rechazada', 'convertida')),
  subtotal numeric(14,2) not null default 0,
  descuento numeric(14,2) not null default 0 check (descuento >= 0),
  iva numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  notas text check (notas is null or char_length(notas) <= 2000),
  motivo_rechazo text,
  orden_id uuid references public.ordenes(id) on delete set null,
  enviada_at timestamptz,
  cerrada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (vigencia >= fecha)
);
comment on table public.cotizaciones is
  'Cotizaciones a clientes o prospectos. Se convierten en orden (orden_id) cuando el cliente acepta.';

create index if not exists cotizaciones_vendedor_idx on public.cotizaciones (vendedor_id, fecha desc);
create index if not exists cotizaciones_cliente_idx on public.cotizaciones (cliente_id);

create table if not exists public.cotizacion_partidas (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
  posicion integer not null,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 200),
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(14,2) not null check (precio_unitario >= 0),
  tasa_iva numeric(5,4) not null default 0.16,
  tipo_produccion text not null default 'fabricacion'
    check (tipo_produccion in ('directa', 'fabricacion', 'comercializacion')),
  producto_id uuid references public.productos(id) on delete set null,
  variante_id uuid references public.variantes_producto(id) on delete set null,
  -- Resto de lo capturado (tipo de prenda, marca, talla, color, corte, manga, talleres,
  -- proveedor, bordado, notas), para volver a llenar el formulario al convertirla.
  captura jsonb not null default '{}'::jsonb
);
create index if not exists cotizacion_partidas_cot_idx on public.cotizacion_partidas (cotizacion_id, posicion);

-- ------------------------------------------------------------------ 2. RLS (solo lectura y baja)
alter table public.cotizaciones enable row level security;
alter table public.cotizacion_partidas enable row level security;

create or replace function private.puede_ver_cotizacion(p_cot uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cotizaciones c
    where c.id = p_cot
      and ((select private.current_user_role()) in ('admin_primario', 'admin_secundario')
           or ((select private.current_user_role()) = 'vendedor'
               and c.vendedor_id = (select private.mi_usuario_id())))
  )
$$;

-- Editar/eliminar: admin primario cualquiera; admin secundario y vendedor las suyas.
create or replace function private.puede_editar_cotizacion(p_cot uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cotizaciones c
    where c.id = p_cot
      and ((select private.current_user_role()) = 'admin_primario'
           or ((select private.current_user_role()) in ('admin_secundario', 'vendedor')
               and c.vendedor_id = (select private.mi_usuario_id())))
  )
$$;
-- Las usan las políticas RLS, que se evalúan con los permisos del usuario: necesitan
-- EXECUTE para authenticated (igual que el resto de private.*, ver rls_por_rol.sql).
revoke execute on function private.puede_ver_cotizacion(uuid) from public, anon;
revoke execute on function private.puede_editar_cotizacion(uuid) from public, anon;
grant execute on function private.puede_ver_cotizacion(uuid) to authenticated;
grant execute on function private.puede_editar_cotizacion(uuid) to authenticated;

drop policy if exists lectura on public.cotizaciones;
create policy lectura on public.cotizaciones for select to authenticated
  using ((select private.current_user_role()) in ('admin_primario', 'admin_secundario')
         or ((select private.current_user_role()) = 'vendedor'
             and vendedor_id = (select private.mi_usuario_id())));

-- Se elimina mientras no se haya convertido en orden.
drop policy if exists baja on public.cotizaciones;
create policy baja on public.cotizaciones for delete to authenticated
  using (estado <> 'convertida' and private.puede_editar_cotizacion(id));

drop policy if exists lectura on public.cotizacion_partidas;
create policy lectura on public.cotizacion_partidas for select to authenticated
  using (private.puede_ver_cotizacion(cotizacion_id));

grant select, delete on public.cotizaciones to authenticated;
grant select on public.cotizacion_partidas to authenticated;

-- ------------------------------------------------------------------ 3. importes
-- Mismo cálculo que private.recalcular_totales_orden (iva_ordenes.sql): el descuento se
-- reparte entre partidas según su importe y la de mayor importe absorbe el redondeo.
create or replace function private.recalcular_totales_cotizacion(p_cot uuid)
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
  r record;
begin
  select coalesce(descuento, 0) into v_desc from public.cotizaciones where id = p_cot;
  select coalesce(sum(round(cantidad * precio_unitario, 2)), 0), count(*)
    into v_sub, v_n
  from public.cotizacion_partidas where cotizacion_id = p_cot;

  v_desc := least(greatest(v_desc, 0), v_sub);
  v_resto := v_desc;
  for r in
    select round(cantidad * precio_unitario, 2) as importe, tasa_iva
    from public.cotizacion_partidas where cotizacion_id = p_cot
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

  update public.cotizaciones
     set subtotal = v_sub, descuento = v_desc, iva = v_iva, total = v_sub - v_desc + v_iva
   where id = p_cot;
end;
$$;
revoke execute on function private.recalcular_totales_cotizacion(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ 4. guardar
-- p_datos:    { cliente, telefono, email, vigencia: "AAAA-MM-DD", descuento, notas }
-- p_partidas: [ { nombre, cantidad, precio_unitario, tipo_produccion, producto_id,
--                 variante_id, captura: {...} }, ... ]
-- p_id null = alta. Devuelve { id, folio }.
create or replace function public.guardar_cotizacion(p_id uuid, p_datos jsonb, p_partidas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text := coalesce((select private.current_user_role()), '');
  v_yo uuid := (select private.mi_usuario_id());
  v_cot public.cotizaciones%rowtype;
  v_cliente text := btrim(coalesce(p_datos->>'cliente', ''));
  v_cliente_id uuid;
  v_vigencia date;
  v_desc numeric := round(coalesce((p_datos->>'descuento')::numeric, 0), 2);
  v_desc_ant numeric := 0;
  v_sub numeric;
  v_tope numeric;
  v_anio integer := extract(year from current_date);
  v_num integer;
  v_folio text;
  v_p jsonb;
  v_pos integer := 0;
  v_cant integer;
  v_precio numeric;
begin
  if v_rol not in ('admin_primario', 'admin_secundario', 'vendedor') or v_yo is null then
    raise exception 'Sin permiso para guardar cotizaciones' using errcode = '42501';
  end if;
  if v_cliente = '' then
    raise exception 'Indica el cliente de la cotización';
  end if;
  if jsonb_typeof(p_partidas) is distinct from 'array' or jsonb_array_length(p_partidas) = 0 then
    raise exception 'La cotización necesita al menos un producto';
  end if;
  v_vigencia := coalesce(nullif(p_datos->>'vigencia', '')::date, current_date + 15);

  -- Cliente del catálogo (sin distinguir mayúsculas), si existe; si no, es prospecto.
  select id into v_cliente_id from public.clientes
  where upper(btrim(razon_social)) = upper(v_cliente)
  order by created_at limit 1;

  if p_id is not null then
    select * into v_cot from public.cotizaciones where id = p_id for update;
    if not found or not private.puede_editar_cotizacion(p_id) then
      raise exception 'Cotización no encontrada o sin permiso para editarla' using errcode = '42501';
    end if;
    if v_cot.estado not in ('borrador', 'enviada') then
      raise exception 'Una cotización % ya no se puede editar; duplícala para hacer una nueva.', v_cot.estado;
    end if;
    v_desc_ant := v_cot.descuento;
    if v_vigencia < v_cot.fecha then
      raise exception 'La vigencia no puede ser anterior a la fecha de la cotización';
    end if;
    update public.cotizaciones
       set cliente_nombre = v_cliente,
           cliente_id = v_cliente_id,
           cliente_telefono = nullif(btrim(p_datos->>'telefono'), ''),
           cliente_email = nullif(btrim(p_datos->>'email'), ''),
           vigencia = v_vigencia,
           descuento = v_desc,
           notas = nullif(btrim(p_datos->>'notas'), ''),
           updated_at = now()
     where id = p_id;
    delete from public.cotizacion_partidas where cotizacion_id = p_id;
  else
    if v_vigencia < current_date then
      raise exception 'La vigencia no puede ser anterior a hoy';
    end if;
    insert into public.consecutivos_documentos (tipo_documento, anio, ultimo_numero)
    values ('COTIZACION', v_anio, 0)
    on conflict (tipo_documento, anio) do nothing;
    update public.consecutivos_documentos
       set ultimo_numero = ultimo_numero + 1
     where tipo_documento = 'COTIZACION' and anio = v_anio
    returning ultimo_numero into v_num;
    v_folio := 'COT-' || v_anio || '-' || lpad(v_num::text, 6, '0');

    insert into public.cotizaciones
      (folio, vendedor_id, cliente_id, cliente_nombre, cliente_telefono, cliente_email, vigencia, descuento, notas)
    values
      (v_folio, v_yo, v_cliente_id, v_cliente, nullif(btrim(p_datos->>'telefono'), ''),
       nullif(btrim(p_datos->>'email'), ''), v_vigencia, v_desc, nullif(btrim(p_datos->>'notas'), ''))
    returning * into v_cot;
  end if;

  for v_p in select * from jsonb_array_elements(p_partidas) loop
    v_pos := v_pos + 1;
    v_cant := (v_p->>'cantidad')::integer;
    v_precio := round(coalesce((v_p->>'precio_unitario')::numeric, -1), 2);
    if btrim(coalesce(v_p->>'nombre', '')) = '' then
      raise exception 'Producto %: indica el nombre', v_pos;
    end if;
    if v_cant is null or v_cant <= 0 then
      raise exception 'Producto %: la cantidad debe ser mayor a cero', v_pos;
    end if;
    if v_precio < 0 then
      raise exception 'Producto %: el precio no puede ser negativo', v_pos;
    end if;
    insert into public.cotizacion_partidas
      (cotizacion_id, posicion, nombre, cantidad, precio_unitario, tipo_produccion, producto_id, variante_id, captura)
    values
      (v_cot.id, v_pos, btrim(v_p->>'nombre'), v_cant, v_precio,
       coalesce(nullif(v_p->>'tipo_produccion', ''), 'fabricacion'),
       nullif(v_p->>'producto_id', '')::uuid, nullif(v_p->>'variante_id', '')::uuid,
       coalesce(v_p->'captura', '{}'::jsonb));
  end loop;

  -- Tope de descuento (politicas_venta.sql): solo si el descuento sube.
  select coalesce(sum(round(cantidad * precio_unitario, 2)), 0) into v_sub
  from public.cotizacion_partidas where cotizacion_id = v_cot.id;
  if v_desc > v_sub then
    raise exception 'El descuento no puede ser mayor al subtotal ($%)', to_char(v_sub, 'FM999,999,990.00');
  end if;
  if private.politicas_aplican() and v_desc > v_desc_ant + 0.005 then
    select descuento_max_pct into v_tope from public.politicas_venta where id;
    v_tope := coalesce(v_tope, 10);
    if v_sub <= 0 or v_desc * 100 / v_sub > v_tope + 0.005 then
      raise exception 'El descuento de $% pasa del máximo permitido de % %% del subtotal. Pide autorización al administrador.',
        to_char(v_desc, 'FM999,999,990.00'), v_tope
        using hint = 'politica_descuento';
    end if;
  end if;

  perform private.recalcular_totales_cotizacion(v_cot.id);
  return jsonb_build_object('id', v_cot.id, 'folio', v_cot.folio);
end;
$$;
revoke execute on function public.guardar_cotizacion(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_cotizacion(uuid, jsonb, jsonb) to authenticated;

-- ------------------------------------------------------------------ 5. cambiar estado
-- Transiciones:
--   borrador → enviada | aceptada | rechazada
--   enviada  → aceptada | rechazada
--   aceptada → rechazada | convertida
--   rechazada → enviada (se reabre)
--   borrador/enviada → convertida también (cuando el cliente acepta y se captura de una vez)
-- 'convertida' exige p_orden: una orden que el usuario pueda editar.
create or replace function public.cambiar_estado_cotizacion(
  p_id uuid, p_estado text, p_motivo text default null, p_orden uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cot public.cotizaciones%rowtype;
begin
  select * into v_cot from public.cotizaciones where id = p_id for update;
  if not found or not private.puede_editar_cotizacion(p_id) then
    raise exception 'Cotización no encontrada o sin permiso' using errcode = '42501';
  end if;

  if not (
    (v_cot.estado = 'borrador' and p_estado in ('enviada', 'aceptada', 'rechazada', 'convertida'))
    or (v_cot.estado = 'enviada' and p_estado in ('aceptada', 'rechazada', 'convertida'))
    or (v_cot.estado = 'aceptada' and p_estado in ('rechazada', 'convertida'))
    or (v_cot.estado = 'rechazada' and p_estado = 'enviada')
  ) then
    raise exception 'No se puede pasar una cotización de % a %', v_cot.estado, p_estado;
  end if;

  if p_estado = 'convertida' then
    if p_orden is null or not private.puede_editar_orden(p_orden) then
      raise exception 'Indica una orden válida para convertir la cotización' using errcode = '42501';
    end if;
  end if;

  update public.cotizaciones
     set estado = p_estado,
         motivo_rechazo = case when p_estado = 'rechazada' then nullif(btrim(p_motivo), '')
                               when p_estado = 'enviada' then null else motivo_rechazo end,
         orden_id = case when p_estado = 'convertida' then p_orden else orden_id end,
         enviada_at = case when p_estado = 'enviada' and enviada_at is null then now() else enviada_at end,
         cerrada_at = case when p_estado in ('rechazada', 'convertida') then now()
                           when p_estado = 'enviada' then null else cerrada_at end,
         updated_at = now()
   where id = p_id;
end;
$$;
revoke execute on function public.cambiar_estado_cotizacion(uuid, text, text, uuid) from public, anon;
grant execute on function public.cambiar_estado_cotizacion(uuid, text, text, uuid) to authenticated;
