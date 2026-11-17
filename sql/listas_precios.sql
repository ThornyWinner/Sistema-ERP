-- =====================================================================
-- listas_precios.sql — Precios de mayoreo y precios especiales por cliente
-- =====================================================================
--  1. escalas_mayoreo: % de descuento a partir de N piezas de un mismo producto.
--     producto_id null = escala general (aplica a todo producto sin escala propia);
--     un producto con escalas propias usa SOLO las suyas. Se expresa en % para respetar
--     el sobreprecio por talla de cada variante.
--  2. precios_cliente: condiciones especiales de un cliente:
--       - producto_id null  → % de descuento en todos sus productos;
--       - producto_id       → % de descuento o precio fijo por pieza de ese producto.
--     Con vigencia opcional (vigente_hasta, inclusive).
--
-- Regla de precio (la aplica la app, src/app/lib/listasPrecios.ts):
--   precio fijo del cliente para el producto, si existe; si no, el MAYOR descuento entre
--   (% del cliente para el producto, o su % general) y (escala de mayoreo que alcance la
--   cantidad). No se acumulan.
--
-- Estas reglas bajan el precio unitario de la partida (no usan el campo descuento de la
-- orden), por eso no cuentan contra el tope de descuento: las autoriza quien las define.
-- Lectura: admins y vendedores. Edición: solo el administrador primario.
-- =====================================================================

-- ------------------------------------------------------------------ 1. mayoreo
create table if not exists public.escalas_mayoreo (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid references public.productos(id) on delete cascade,
  cantidad_min integer not null check (cantidad_min >= 2),
  descuento_pct numeric(5,2) not null check (descuento_pct > 0 and descuento_pct < 100),
  created_at timestamptz not null default now(),
  constraint escalas_mayoreo_unica unique nulls not distinct (producto_id, cantidad_min)
);
comment on table public.escalas_mayoreo is
  'Descuento por volumen: % a partir de cantidad_min piezas. producto_id null = escala general.';

create index if not exists escalas_mayoreo_producto_idx on public.escalas_mayoreo (producto_id);

-- ------------------------------------------------------------------ 2. precios por cliente
create table if not exists public.precios_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  producto_id uuid references public.productos(id) on delete cascade,
  descuento_pct numeric(5,2) check (descuento_pct > 0 and descuento_pct < 100),
  precio numeric(12,2) check (precio >= 0),
  vigente_hasta date,
  notas text check (notas is null or char_length(notas) <= 500),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuarios(id),
  constraint precios_cliente_un_tipo check ((descuento_pct is null) <> (precio is null)),
  constraint precios_cliente_fijo_con_producto check (precio is null or producto_id is not null),
  constraint precios_cliente_unico unique nulls not distinct (cliente_id, producto_id)
);
comment on table public.precios_cliente is
  'Condiciones especiales por cliente: % general (producto_id null) o % / precio fijo de un producto.';

create index if not exists precios_cliente_producto_idx on public.precios_cliente (producto_id);

-- Quién y cuándo (no se confía en la app).
create or replace function private.precios_cliente_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := private.mi_usuario_id();
  return new;
end;
$$;
revoke execute on function private.precios_cliente_auditoria() from public, anon;

drop trigger if exists trg_precios_cliente_auditoria on public.precios_cliente;
create trigger trg_precios_cliente_auditoria
  before insert or update on public.precios_cliente
  for each row execute function private.precios_cliente_auditoria();

-- ------------------------------------------------------------------ 3. RLS
alter table public.escalas_mayoreo enable row level security;
alter table public.precios_cliente enable row level security;

drop policy if exists escalas_lectura on public.escalas_mayoreo;
create policy escalas_lectura on public.escalas_mayoreo for select to authenticated
  using ((select private.current_user_role()) in ('admin_primario', 'admin_secundario', 'vendedor'));
drop policy if exists escalas_edicion on public.escalas_mayoreo;
create policy escalas_edicion on public.escalas_mayoreo for all to authenticated
  using ((select private.current_user_role()) = 'admin_primario')
  with check ((select private.current_user_role()) = 'admin_primario');

drop policy if exists precios_cliente_lectura on public.precios_cliente;
create policy precios_cliente_lectura on public.precios_cliente for select to authenticated
  using ((select private.current_user_role()) in ('admin_primario', 'admin_secundario', 'vendedor'));
drop policy if exists precios_cliente_edicion on public.precios_cliente;
create policy precios_cliente_edicion on public.precios_cliente for all to authenticated
  using ((select private.current_user_role()) = 'admin_primario')
  with check ((select private.current_user_role()) = 'admin_primario');

grant select, insert, update, delete on public.escalas_mayoreo to authenticated;
grant select, insert, update, delete on public.precios_cliente to authenticated;

-- ------------------------------------------------------------------ 4. guardar escalas (atómico)
-- Reemplaza todas las escalas de un producto (o las generales con p_producto null).
-- p_escalas: [{"cantidad_min": 50, "descuento_pct": 5}, ...]; [] las borra.
create or replace function public.guardar_escalas_mayoreo(p_producto uuid, p_escalas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  if coalesce(private.current_user_role(), '') <> 'admin_primario' then
    raise exception 'Solo el administrador primario puede cambiar los precios de mayoreo' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_escalas, '[]'::jsonb)) <> 'array' then
    raise exception 'Las escalas deben ser una lista';
  end if;

  delete from public.escalas_mayoreo where producto_id is not distinct from p_producto;

  insert into public.escalas_mayoreo (producto_id, cantidad_min, descuento_pct)
  select p_producto, (e->>'cantidad_min')::integer, (e->>'descuento_pct')::numeric
  from jsonb_array_elements(coalesce(p_escalas, '[]'::jsonb)) e;
  get diagnostics v_total = row_count;

  -- A más piezas, igual o mayor descuento (si no, la escala sería incoherente).
  if exists (
    select 1 from (
      select descuento_pct, lag(descuento_pct) over (order by cantidad_min) as anterior
      from public.escalas_mayoreo where producto_id is not distinct from p_producto
    ) x where x.descuento_pct < x.anterior
  ) then
    raise exception 'A mayor cantidad el descuento no puede ser menor que el de una escala anterior';
  end if;

  return v_total;
end;
$$;

revoke execute on function public.guardar_escalas_mayoreo(uuid, jsonb) from public, anon;
grant execute on function public.guardar_escalas_mayoreo(uuid, jsonb) to authenticated;
