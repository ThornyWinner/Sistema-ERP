-- =====================================================================
-- historial_clientes.sql — Historial del cliente / CRM ligero
-- =====================================================================
-- 1. Lo que se capturó en cada partida queda guardado en la partida misma:
--    descripción (nombre del producto), tipo de prenda, talla, color y marca. Antes las
--    partidas de fabricación "a la medida" (sin variante de inventario) perdían el
--    nombre, la talla y el color al guardarse; ahora se conservan, y en las que vienen
--    del catálogo se copian del producto / variante (trigger), para que el historial no
--    cambie aunque después se edite el catálogo.
-- 2. contactos_cliente: bitácora de seguimiento (llamadas, WhatsApp, visitas…) con la
--    fecha del próximo contacto, para recontactar clientes inactivos.
-- 3. public.resumen_clientes(): por cliente, número de órdenes, piezas, monto comprado,
--    primera / última compra, días sin comprar, frecuencia promedio entre compras y el
--    último / próximo contacto. Admins: todos los clientes; vendedor: los clientes con
--    los que tiene órdenes o contactos (y solo cuenta sus propias órdenes).
--
-- No cuenta órdenes canceladas. Lo que se compró se mide con el total de la orden
-- (con IVA; ya descuenta devoluciones si las hay, ver sql/devoluciones.sql).
-- =====================================================================

-- ------------------------------------------------------------------ 1. datos de la partida
alter table public.orden_detalles
  add column if not exists descripcion text,
  add column if not exists tipo_prenda text,
  add column if not exists talla text,
  add column if not exists color text,
  add column if not exists marca text;

comment on column public.orden_detalles.descripcion is
  'Nombre del producto tal como se capturó (o el del catálogo). Se conserva aunque cambie el catálogo.';
comment on column public.orden_detalles.talla is 'Talla de la partida (de la variante o capturada a mano).';
comment on column public.orden_detalles.color is 'Color de la partida (de la variante o capturado a mano).';

-- Completa los datos que falten con el producto y la variante del catálogo. Si cambia la
-- variante (cambio de producto al editar la orden), toma la talla y el color de la nueva.
create or replace function private.trg_partida_datos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_var public.variantes_producto%rowtype;
  v_prod public.productos%rowtype;
  v_cambio_var boolean := tg_op = 'UPDATE' and new.variante_id is distinct from old.variante_id;
  v_cambio_prod boolean := tg_op = 'UPDATE' and new.producto_id is distinct from old.producto_id;
begin
  if new.variante_id is not null then
    select * into v_var from public.variantes_producto where id = new.variante_id;
  end if;
  if new.producto_id is not null then
    select * into v_prod from public.productos where id = new.producto_id;
  end if;

  if v_cambio_var and new.variante_id is not null then
    new.talla := v_var.talla;
    new.color := v_var.color;
  end if;
  if v_cambio_prod and new.producto_id is not null then
    new.descripcion := v_prod.nombre;
    new.tipo_prenda := v_prod.tipo_prenda;
  end if;

  new.descripcion := coalesce(nullif(btrim(new.descripcion), ''), v_prod.nombre);
  new.tipo_prenda := coalesce(nullif(btrim(new.tipo_prenda), ''), v_prod.tipo_prenda);
  new.talla := coalesce(nullif(btrim(new.talla), ''), nullif(v_var.talla, ''));
  new.color := coalesce(nullif(btrim(new.color), ''), nullif(v_var.color, ''));
  new.marca := nullif(btrim(new.marca), '');
  return new;
end;
$$;
revoke execute on function private.trg_partida_datos() from public, anon, authenticated;

drop trigger if exists trg_orden_detalles_datos on public.orden_detalles;
create trigger trg_orden_detalles_datos
  before insert or update of producto_id, variante_id, descripcion, tipo_prenda, talla, color, marca
  on public.orden_detalles
  for each row execute function private.trg_partida_datos();

-- Partidas existentes: se llenan con su producto / variante.
-- (Basta con "tocar" las columnas: el trigger completa lo que falte.)
update public.orden_detalles
set descripcion = descripcion
where descripcion is null or tipo_prenda is null or talla is null or color is null;

-- ------------------------------------------------------------------ 2. bitácora de contactos
create table if not exists public.contactos_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete set null default private.mi_usuario_id(),
  fecha timestamptz not null default now(),
  canal text not null check (canal in ('whatsapp', 'llamada', 'correo', 'visita', 'otro')),
  resultado text not null check (resultado in ('interesado', 'cotizacion', 'pedido', 'sin_respuesta', 'no_interesado', 'otro')),
  notas text check (notas is null or char_length(notas) <= 2000),
  proximo_contacto date,
  created_at timestamptz not null default now()
);
comment on table public.contactos_cliente is
  'Seguimiento comercial a clientes (CRM ligero): cuándo se les contactó, por qué medio, qué respondieron y cuándo volver a buscarlos.';

create index if not exists contactos_cliente_cliente_idx on public.contactos_cliente (cliente_id, fecha desc);
create index if not exists contactos_cliente_usuario_idx on public.contactos_cliente (usuario_id);

alter table public.contactos_cliente enable row level security;

-- Admins ven todo; el vendedor, lo que él registró.
drop policy if exists contactos_lectura on public.contactos_cliente;
create policy contactos_lectura on public.contactos_cliente for select to authenticated
  using ((select private.current_user_role()) in ('admin_primario', 'admin_secundario')
         or usuario_id = (select private.mi_usuario_id()));

-- Registran admins y vendedores, siempre a su propio nombre.
drop policy if exists contactos_alta on public.contactos_cliente;
create policy contactos_alta on public.contactos_cliente for insert to authenticated
  with check ((select private.current_user_role()) in ('admin_primario', 'admin_secundario', 'vendedor')
              and usuario_id = (select private.mi_usuario_id()));

-- Borra quien lo registró o el admin primario (no se editan: se registra uno nuevo).
drop policy if exists contactos_baja on public.contactos_cliente;
create policy contactos_baja on public.contactos_cliente for delete to authenticated
  using ((select private.current_user_role()) = 'admin_primario'
         or usuario_id = (select private.mi_usuario_id()));

revoke all on public.contactos_cliente from anon, authenticated;
grant select, insert, delete on public.contactos_cliente to authenticated;

-- ------------------------------------------------------------------ 3. resumen por cliente
create or replace function public.resumen_clientes()
returns table (
  cliente_id uuid,
  razon_social text,
  nombre_comercial text,
  telefono text,
  email text,
  ordenes integer,
  piezas integer,
  comprado numeric,
  ticket_promedio numeric,
  primera_compra date,
  ultima_compra date,
  dias_sin_comprar integer,
  frecuencia_dias integer,
  vendedor_id uuid,
  vendedor text,
  ultimo_contacto timestamptz,
  ultimo_resultado text,
  proximo_contacto date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_rol text := private.current_user_role();
  v_yo uuid := private.mi_usuario_id();
  v_admin boolean := v_rol in ('admin_primario', 'admin_secundario');
  v_hoy date := (private.ahora_local())::date;
begin
  if v_rol is null or v_rol not in ('admin_primario', 'admin_secundario', 'vendedor') then
    raise exception 'Sin permiso para consultar el historial de clientes' using errcode = '42501';
  end if;

  return query
  with ords as (
    select o.id, o.cliente_id, o.vendedor_id, o.fecha_creacion, o.total, o.created_at
    from public.ordenes o
    left join public.estados_orden eo on eo.id = o.estado_id
    where o.cliente_id is not null
      and coalesce(eo.nombre, '') <> 'Cancelada'
      and (v_admin or o.vendedor_id = v_yo)
  ),
  pzs as (
    -- Piezas netas: descuenta las devueltas (columna de sql/devoluciones.sql; se lee vía
    -- jsonb para que esta función también funcione si ese script aún no se aplica).
    select o.cliente_id,
           sum(d.cantidad - coalesce((to_jsonb(d) ->> 'cantidad_devuelta')::integer, 0))::integer as piezas
    from ords o join public.orden_detalles d on d.orden_id = o.id
    group by o.cliente_id
  ),
  agg as (
    select o.cliente_id,
           count(*)::integer as n,
           sum(o.total) as comprado,
           min(o.fecha_creacion) as primera,
           max(o.fecha_creacion) as ultima
    from ords o group by o.cliente_id
  ),
  -- Vendedor de la orden más reciente del cliente.
  ult as (
    select distinct on (o.cliente_id) o.cliente_id, o.vendedor_id
    from ords o order by o.cliente_id, o.fecha_creacion desc, o.created_at desc
  ),
  cont as (
    select distinct on (c.cliente_id) c.cliente_id, c.fecha, c.resultado, c.proximo_contacto
    from public.contactos_cliente c
    where v_admin or c.usuario_id = v_yo
    order by c.cliente_id, c.fecha desc
  )
  select c.id,
         c.razon_social,
         c.nombre_comercial,
         c.telefono,
         c.email,
         coalesce(a.n, 0),
         coalesce(p.piezas, 0),
         round(coalesce(a.comprado, 0), 2),
         case when a.n > 0 then round(a.comprado / a.n, 2) end,
         a.primera,
         a.ultima,
         case when a.ultima is not null then v_hoy - a.ultima end,
         -- Días promedio entre la primera y la última compra (con 2 o más órdenes).
         case when a.n > 1 then round((a.ultima - a.primera)::numeric / (a.n - 1))::integer end,
         u.vendedor_id,
         us.nombre,
         ct.fecha,
         ct.resultado,
         ct.proximo_contacto
  from public.clientes c
  left join agg a on a.cliente_id = c.id
  left join pzs p on p.cliente_id = c.id
  left join ult u on u.cliente_id = c.id
  left join public.usuarios us on us.id = u.vendedor_id
  left join cont ct on ct.cliente_id = c.id
  where v_admin or a.cliente_id is not null or ct.cliente_id is not null
  order by a.ultima desc nulls last, c.razon_social;
end;
$$;

comment on function public.resumen_clientes() is
  'Historial comercial por cliente (órdenes, piezas, compras, última compra, frecuencia y seguimiento). Admins: todos; vendedor: sus clientes y sus órdenes.';

revoke execute on function public.resumen_clientes() from public, anon;
grant execute on function public.resumen_clientes() to authenticated;
