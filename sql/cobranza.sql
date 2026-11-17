-- =====================================================================
-- cobranza.sql — Antigüedad de saldos y recordatorios automáticos de cobro
-- =====================================================================
--  - Vencimiento de un saldo = fecha de entrega (o de creación si no tiene) + días de
--    crédito del cliente (0 si no tiene crédito: vence al entregar). Es la misma base
--    que usan las políticas de crédito (sql/politicas_venta.sql).
--  - Tramos: al corriente (aún no vence), 1–30, 31–60 y más de 60 días vencido.
--  - Saldo = private.saldo_orden (total − max(anticipo, pagos)); no cuentan órdenes
--    Canceladas ni con pago Cancelado.
--  - public.cartera_por_cobrar(): una fila por orden con saldo. Admins: todas;
--    vendedor: solo las suyas.
--  - Recordatorios: cada día a las 08:00 de Saltillo (pg_cron) se avisa al vendedor
--    (con la campana de notificaciones) cuando un saldo ENTRA a un tramo vencido:
--    al día 1, al 31 y al 61. Cada orden recibe un solo aviso por tramo
--    (cobranza_avisos). En el tramo de más de 60 días también se avisa al admin
--    primario; si el vendedor ya no está activo, el aviso va al admin primario.
--  - public.enviar_recordatorios_cobranza(): el admin primario puede correrlo a mano.
--
-- Depende de: private.current_user_role, private.mi_usuario_id (rls_por_rol.sql),
-- private.saldo_orden (politicas_venta.sql), private.ahora_local (asistencia.sql),
-- notificaciones (notificaciones.sql) y pg_cron.
-- =====================================================================

-- ------------------------------------------------------------------ 1. cartera (interna)
create or replace function private.cartera()
returns table (
  orden_id uuid,
  folio text,
  cliente_id uuid,
  cliente text,
  telefono text,
  email text,
  vendedor_id uuid,
  vendedor text,
  vendedor_activo boolean,
  fecha_creacion date,
  fecha_entrega date,
  dias_credito integer,
  vencimiento date,
  total numeric,
  pagado numeric,
  saldo numeric,
  dias_vencido integer,
  tramo text,
  ultimo_pago date
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select o.id, o.folio, o.cliente_id, o.vendedor_id, o.fecha_creacion, o.fecha_entrega, o.total,
           private.saldo_orden(o.id) as saldo,
           c.razon_social, c.telefono, c.email, c.dias_credito,
           u.nombre as vendedor, u.estado = 'activo' as vendedor_activo,
           coalesce(o.fecha_entrega, o.fecha_creacion) + coalesce(c.dias_credito, 0) as vencimiento
    from public.ordenes o
    left join public.clientes c on c.id = o.cliente_id
    left join public.usuarios u on u.id = o.vendedor_id
    left join public.estados_orden eo on eo.id = o.estado_id
    left join public.estados_pago ep on ep.id = o.estado_pago_id
    where coalesce(eo.nombre, '') <> 'Cancelada'
      and coalesce(ep.nombre, '') <> 'Cancelado'
  )
  select b.id, b.folio, b.cliente_id, coalesce(b.razon_social, 'Sin cliente'), b.telefono, b.email,
         b.vendedor_id, b.vendedor, coalesce(b.vendedor_activo, false),
         b.fecha_creacion, b.fecha_entrega, b.dias_credito, b.vencimiento,
         b.total, b.total - b.saldo, b.saldo,
         greatest((private.ahora_local())::date - b.vencimiento, 0),
         case
           when b.vencimiento is null or (private.ahora_local())::date <= b.vencimiento then 'corriente'
           when (private.ahora_local())::date - b.vencimiento <= 30 then '1_30'
           when (private.ahora_local())::date - b.vencimiento <= 60 then '31_60'
           else 'mas_60'
         end,
         (select max(p.fecha) from public.pagos p where p.orden_id = b.id)
  from base b
  where b.saldo > 0
$$;

revoke execute on function private.cartera() from public, anon, authenticated;

-- ------------------------------------------------------------------ 2. avisos enviados
create table if not exists public.cobranza_avisos (
  orden_id uuid not null references public.ordenes(id) on delete cascade,
  tramo text not null check (tramo in ('1_30', '31_60', 'mas_60')),
  enviado_at timestamptz not null default now(),
  primary key (orden_id, tramo)
);
comment on table public.cobranza_avisos is
  'Recordatorios de cobro ya enviados: uno por orden y tramo de vencimiento (lo llena el cron).';

-- Solo la usan las funciones security definer: RLS sin políticas y sin permisos.
alter table public.cobranza_avisos enable row level security;
revoke all on public.cobranza_avisos from anon, authenticated;

-- ------------------------------------------------------------------ 3. consulta para la app
create or replace function public.cartera_por_cobrar()
returns table (
  orden_id uuid,
  folio text,
  cliente_id uuid,
  cliente text,
  telefono text,
  email text,
  vendedor_id uuid,
  vendedor text,
  fecha_creacion date,
  fecha_entrega date,
  dias_credito integer,
  vencimiento date,
  total numeric,
  pagado numeric,
  saldo numeric,
  dias_vencido integer,
  tramo text,
  ultimo_pago date,
  ultimo_aviso timestamptz
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
begin
  if v_rol is null or v_rol not in ('admin_primario', 'admin_secundario', 'vendedor') then
    raise exception 'Sin permiso para consultar la cobranza' using errcode = '42501';
  end if;

  return query
  select c.orden_id, c.folio, c.cliente_id, c.cliente, c.telefono, c.email,
         c.vendedor_id, c.vendedor, c.fecha_creacion, c.fecha_entrega, c.dias_credito,
         c.vencimiento, c.total, c.pagado, c.saldo, c.dias_vencido, c.tramo, c.ultimo_pago,
         (select max(a.enviado_at) from public.cobranza_avisos a where a.orden_id = c.orden_id)
  from private.cartera() c
  where v_rol in ('admin_primario', 'admin_secundario') or c.vendedor_id = v_yo
  order by c.dias_vencido desc, c.saldo desc;
end;
$$;

comment on function public.cartera_por_cobrar() is
  'Órdenes con saldo, su vencimiento y tramo de antigüedad. Admins: todas; vendedor: las suyas.';

revoke execute on function public.cartera_por_cobrar() from public, anon;
grant execute on function public.cartera_por_cobrar() to authenticated;

-- ------------------------------------------------------------------ 4. recordatorios
-- Envía los avisos pendientes y devuelve cuántas órdenes se avisaron.
create or replace function private.recordatorios_cobranza()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_envio uuid;
  v_total integer := 0;
  v_etiqueta text;
begin
  for r in
    select c.*
    from private.cartera() c
    where c.tramo <> 'corriente'
      and not exists (select 1 from public.cobranza_avisos a where a.orden_id = c.orden_id and a.tramo = c.tramo)
    order by c.dias_vencido desc
  loop
    v_envio := gen_random_uuid();
    v_etiqueta := case r.tramo when '1_30' then 'vencido' when '31_60' then 'con más de 30 días vencido'
                               else 'con más de 60 días vencido' end;

    insert into public.notificaciones
      (envio_id, destinatario_id, destinatario_nombre, remitente_id, remitente_nombre, titulo, mensaje, enlace)
    select v_envio, u.id, u.nombre, null, 'Aviso automático',
           left(format('Saldo %s: %s (%s)', v_etiqueta, r.folio, r.cliente), 120),
           format('%s debe %s de la orden %s. Venció el %s (hace %s %s)%s.%s Registra el abono o contacta al cliente desde Cobranza.',
                  r.cliente,
                  '$' || to_char(r.saldo, 'FM999,999,990.00'),
                  r.folio,
                  to_char(r.vencimiento, 'DD/MM/YYYY'),
                  r.dias_vencido, case when r.dias_vencido = 1 then 'día' else 'días' end,
                  case when r.dias_credito is not null then format(', crédito de %s días', r.dias_credito) else '' end,
                  case when r.ultimo_pago is not null then format(' Último pago: %s.', to_char(r.ultimo_pago, 'DD/MM/YYYY'))
                       else ' No ha hecho pagos.' end)
           || case when u.id is distinct from r.vendedor_id then format(' Vendedor: %s.', coalesce(r.vendedor, 'sin vendedor')) else '' end,
           '/ordenes/' || r.orden_id
    from public.usuarios u
    join public.roles ro on ro.id = u.rol_id
    where u.estado = 'activo'
      and (
        (u.id = r.vendedor_id)
        or (ro.nombre = 'admin_primario' and (r.tramo = 'mas_60' or not r.vendedor_activo or r.vendedor_id is null))
      );

    insert into public.cobranza_avisos (orden_id, tramo) values (r.orden_id, r.tramo)
    on conflict do nothing;
    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

revoke execute on function private.recordatorios_cobranza() from public, anon, authenticated;

-- El admin primario puede correrlos a mano (botón en Cobranza).
create or replace function public.enviar_recordatorios_cobranza()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(private.current_user_role(), '') <> 'admin_primario' then
    raise exception 'Solo el administrador primario puede enviar los recordatorios' using errcode = '42501';
  end if;
  return private.recordatorios_cobranza();
end;
$$;

revoke execute on function public.enviar_recordatorios_cobranza() from public, anon;
grant execute on function public.enviar_recordatorios_cobranza() to authenticated;

-- ------------------------------------------------------------------ 5. cron diario
-- 08:00 hora de Saltillo = 14:00 UTC. cron.schedule con el mismo nombre actualiza el job.
select cron.schedule(
  'cobranza-recordatorios-diarios',
  '0 14 * * *',
  $$select private.recordatorios_cobranza()$$
);
