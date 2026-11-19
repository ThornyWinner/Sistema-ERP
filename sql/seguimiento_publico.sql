-- =====================================================================
-- seguimiento_publico.sql — Enlace para que el cliente vea el avance de su orden
-- =====================================================================
-- Cada orden tiene un token aleatorio (token_seguimiento). El enlace
-- https://<sistema>/seguimiento/<token> se abre SIN iniciar sesión y muestra solo:
-- folio, cliente, fechas, en qué etapa va cada producto, y total / pagado / saldo.
-- No muestra teléfonos, correos, notas internas, vendedor completo ni costos.
--
--  - public.seguimiento_orden(token): la consulta del enlace (rol anon).
--  - public.regenerar_token_seguimiento(orden): invalida el enlace anterior (si se
--    compartió por error). Quien puede editar la orden.
-- =====================================================================

-- ------------------------------------------------------------------ 1. token por orden
-- gen_random_uuid() es volátil: al agregar la columna, cada orden recibe uno distinto.
alter table public.ordenes
  add column if not exists token_seguimiento uuid not null default gen_random_uuid();
create unique index if not exists ordenes_token_seguimiento on public.ordenes (token_seguimiento);
comment on column public.ordenes.token_seguimiento is
  'Clave del enlace público de seguimiento (/seguimiento/<token>). Se cambia con regenerar_token_seguimiento.';

-- ------------------------------------------------------------------ 2. consulta pública
create or replace function public.seguimiento_orden(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o record;
  v_pagado numeric;
  v_productos jsonb;
begin
  if p_token is null then
    return null;
  end if;

  select ord.id, ord.folio, ord.fecha_creacion, ord.fecha_entrega, ord.total, ord.anticipo,
         coalesce(c.nombre_comercial, c.razon_social) as cliente,
         eo.nombre as estado,
         split_part(trim(coalesce(u.nombre, '')), ' ', 1) as vendedor
    into o
  from public.ordenes ord
  left join public.clientes c on c.id = ord.cliente_id
  left join public.estados_orden eo on eo.id = ord.estado_id
  left join public.usuarios u on u.id = ord.vendedor_id
  where ord.token_seguimiento = p_token;

  if not found then
    return null;
  end if;

  -- Pagos netos (los reembolsos de devoluciones son negativos).
  select greatest(coalesce(o.anticipo, 0), coalesce(sum(p.monto), 0)) into v_pagado
  from public.pagos p where p.orden_id = o.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'descripcion', coalesce(d.descripcion, pr.nombre, 'Producto'),
           'talla', d.talla,
           'color', d.color,
           'cantidad', d.cantidad - coalesce(d.cantidad_devuelta, 0),
           'talleres', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'taller', t.nombre,
                      'estado', pt.estado,
                      'inicio', pt.fecha_inicio,
                      'fin', pt.fecha_fin))
             from public.produccion_taller pt
             join public.talleres t on t.id = pt.taller_id
             where pt.orden_detalle_id = d.id), '[]'::jsonb)
         ) order by d.created_at), '[]'::jsonb)
    into v_productos
  from public.orden_detalles d
  left join public.productos pr on pr.id = d.producto_id
  where d.orden_id = o.id;

  return jsonb_build_object(
    'folio', o.folio,
    'cliente', o.cliente,
    'vendedor', nullif(o.vendedor, ''),
    'estado', o.estado,
    'fecha_creacion', o.fecha_creacion,
    'fecha_entrega', o.fecha_entrega,
    'total', o.total,
    'pagado', least(v_pagado, o.total),
    'saldo', greatest(o.total - v_pagado, 0),
    'empresa', (select coalesce(e.nombre_comercial, e.razon_social) from public.empresa_fiscal e limit 1),
    'productos', v_productos,
    'consultado', now()
  );
end;
$$;

comment on function public.seguimiento_orden(uuid) is
  'Avance de una orden para el enlace público de seguimiento (sin sesión). Datos limitados.';
revoke execute on function public.seguimiento_orden(uuid) from public;
grant execute on function public.seguimiento_orden(uuid) to anon, authenticated;

-- ------------------------------------------------------------------ 3. cambiar el enlace
create or replace function public.regenerar_token_seguimiento(p_orden uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text := private.current_user_role();
  v_token uuid := gen_random_uuid();
begin
  if v_rol is null or v_rol not in ('admin_primario', 'admin_secundario', 'vendedor') then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  update public.ordenes set token_seguimiento = v_token
  where id = p_orden
    and (v_rol = 'admin_primario' or vendedor_id = private.mi_usuario_id());
  if not found then
    raise exception 'Solo el vendedor de la orden o el administrador primario pueden cambiar el enlace'
      using errcode = '42501';
  end if;
  return v_token;
end;
$$;
revoke execute on function public.regenerar_token_seguimiento(uuid) from public, anon;
grant execute on function public.regenerar_token_seguimiento(uuid) to authenticated;
