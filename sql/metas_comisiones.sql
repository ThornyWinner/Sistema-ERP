-- =====================================================================
-- metas_comisiones.sql — Metas mensuales y comisiones de vendedores
-- =====================================================================
--  - Meta: monto de VENTA mensual (órdenes registradas en el mes, sin IVA) por vendedor.
--  - Comisión: % sobre lo COBRADO en el mes (pagos con fecha del mes, sin IVA), para no
--    pagar comisión de ventas que el cliente todavía no paga. Si una venta de octubre se
--    cobra en noviembre, la comisión cae en noviembre.
--  - % de comisión: el global de politicas_venta.comision_pct (3 % por omisión) o uno
--    propio del vendedor para ese mes (metas_vendedor.comision_pct).
--  - No cuentan las órdenes Canceladas.
--  - Las metas y los % los fija el administrador primario; el secundario las consulta;
--    el vendedor solo ve las suyas.
--
-- public.desempeno_vendedores(mes) entrega meta, vendido, cobrado y comisión por
-- vendedor (todos para los admins; solo su fila para el vendedor).
-- =====================================================================

-- ------------------------------------------------------------------ 1. % global
alter table public.politicas_venta
  add column if not exists comision_pct numeric(5,2) not null default 3
    check (comision_pct >= 0 and comision_pct <= 100);
comment on column public.politicas_venta.comision_pct is
  'Comisión por omisión, en % de lo cobrado sin IVA, para quien no tenga % propio en el mes.';

-- ------------------------------------------------------------------ 2. metas por mes
create table if not exists public.metas_vendedor (
  vendedor_id uuid not null references public.usuarios(id) on delete cascade,
  periodo date not null check (periodo = date_trunc('month', periodo)::date),
  meta numeric(14,2) not null default 0 check (meta >= 0),
  comision_pct numeric(5,2) check (comision_pct >= 0 and comision_pct <= 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuarios(id),
  primary key (vendedor_id, periodo)
);
comment on table public.metas_vendedor is
  'Meta mensual de venta (sin IVA) y % de comisión propio de cada vendedor; periodo = día 1 del mes.';
comment on column public.metas_vendedor.comision_pct is
  'null = usa politicas_venta.comision_pct.';

create index if not exists metas_vendedor_periodo_idx on public.metas_vendedor (periodo);

alter table public.metas_vendedor enable row level security;

drop policy if exists metas_select on public.metas_vendedor;
create policy metas_select on public.metas_vendedor for select to authenticated
  using ((select private.current_user_role()) in ('admin_primario', 'admin_secundario')
         or vendedor_id = (select private.mi_usuario_id()));

drop policy if exists metas_insert on public.metas_vendedor;
create policy metas_insert on public.metas_vendedor for insert to authenticated
  with check ((select private.current_user_role()) = 'admin_primario');

drop policy if exists metas_update on public.metas_vendedor;
create policy metas_update on public.metas_vendedor for update to authenticated
  using ((select private.current_user_role()) = 'admin_primario')
  with check ((select private.current_user_role()) = 'admin_primario');

drop policy if exists metas_delete on public.metas_vendedor;
create policy metas_delete on public.metas_vendedor for delete to authenticated
  using ((select private.current_user_role()) = 'admin_primario');

grant select, insert, update, delete on public.metas_vendedor to authenticated;

-- Quién y cuándo modificó la meta (no se confía en lo que mande la app).
create or replace function private.metas_vendedor_auditoria()
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

drop trigger if exists trg_metas_vendedor_auditoria on public.metas_vendedor;
create trigger trg_metas_vendedor_auditoria
  before insert or update on public.metas_vendedor
  for each row execute function private.metas_vendedor_auditoria();

-- ------------------------------------------------------------------ 3. desempeño del mes
create or replace function public.desempeno_vendedores(p_periodo date)
returns table (
  vendedor_id uuid,
  nombre text,
  rol text,
  meta numeric,
  comision_pct numeric,
  comision_propia boolean,
  ordenes integer,
  vendido numeric,
  cobrado numeric,
  comision numeric
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
    -- Parte sin IVA de cada pago, en proporción al total de su orden.
    select v.vendedor_id,
           sum(case when v.total > 0 then p.monto * (v.total - v.iva) / v.total else 0 end) as cobrado
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

comment on function public.desempeno_vendedores(date) is
  'Meta, vendido (sin IVA), cobrado (sin IVA) y comisión del mes de p_periodo por vendedor. Admins: todos; vendedor: solo él.';

revoke execute on function public.desempeno_vendedores(date) from public, anon;
grant execute on function public.desempeno_vendedores(date) to authenticated;
revoke execute on function private.metas_vendedor_auditoria() from public, anon;
