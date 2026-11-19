-- =====================================================================
-- recordatorios_recompra.sql — Avisos de recompra y de seguimientos vencidos
-- =====================================================================
-- Requiere sql/historial_clientes.sql (contactos_cliente). Corre diario a las 08:05 de
-- Saltillo (14:05 UTC) y manda notificaciones dentro del sistema:
--
--  1. Recompra: clientes con 2 o más órdenes (no canceladas) que compran cada 21 días o
--     más. Cuando faltan 14 días o menos para su próxima compra estimada (última compra +
--     frecuencia promedio), se avisa al vendedor de su última orden (si ya no está activo,
--     a los administradores primarios). Un aviso por cada "última compra": si el cliente
--     vuelve a comprar, el siguiente ciclo avisa otra vez. No se avisa de clientes que
--     llevan más del triple de su frecuencia sin comprar (esos salen como inactivos en
--     el historial).
--
--  2. Seguimiento: cuando llega (o pasó, hasta 30 días) la fecha de "próximo contacto"
--     que el vendedor anotó en la bitácora y no ha registrado un contacto más reciente
--     con ese cliente, se le recuerda una vez.
--
-- recompra_avisos guarda lo ya avisado. public.enviar_recordatorios_recompra() deja al
-- admin primario correrlo a mano.
-- =====================================================================

-- ------------------------------------------------------------------ 1. avisos enviados
create table if not exists public.recompra_avisos (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo text not null check (tipo in ('recompra', 'seguimiento')),
  -- recompra: fecha de la última compra; seguimiento: id del contacto.
  referencia text not null,
  created_at timestamptz not null default now(),
  primary key (cliente_id, tipo, referencia)
);
comment on table public.recompra_avisos is
  'Recordatorios de recompra y seguimiento ya enviados (para no repetirlos).';

alter table public.recompra_avisos enable row level security;
drop policy if exists lectura_admin on public.recompra_avisos;
create policy lectura_admin on public.recompra_avisos for select to authenticated
  using ((select private.current_user_role()) = 'admin_primario');
revoke all on public.recompra_avisos from anon, authenticated;
grant select on public.recompra_avisos to authenticated;

-- Para buscar el contacto más reciente por cliente y usuario.
create index if not exists contactos_cliente_cliente_usuario on public.contactos_cliente (cliente_id, usuario_id, fecha desc);

-- ------------------------------------------------------------------ 2. recordatorios
create or replace function private.recordatorios_recompra()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_hoy date := (private.ahora_local())::date;
  v_total integer := 0;
begin
  -- 2a. Recompra
  for r in
    with ords as (
      select o.cliente_id, o.vendedor_id, o.fecha_creacion, o.created_at
      from public.ordenes o
      left join public.estados_orden eo on eo.id = o.estado_id
      where o.cliente_id is not null and coalesce(eo.nombre, '') <> 'Cancelada'
    ),
    agg as (
      select cliente_id, count(*) as n, min(fecha_creacion) as primera, max(fecha_creacion) as ultima
      from ords group by cliente_id
    ),
    ult as (
      select distinct on (cliente_id) cliente_id, vendedor_id
      from ords order by cliente_id, fecha_creacion desc, created_at desc
    )
    select c.id as cliente_id, coalesce(c.nombre_comercial, c.razon_social) as cliente,
           a.ultima, round((a.ultima - a.primera)::numeric / nullif(a.n - 1, 0))::integer as frecuencia,
           u.vendedor_id, us.estado = 'activo' as vendedor_activo
    from agg a
    join public.clientes c on c.id = a.cliente_id
    left join ult u on u.cliente_id = a.cliente_id
    left join public.usuarios us on us.id = u.vendedor_id
    -- nullif: el orden en que se evalúan las condiciones no está garantizado.
    where a.n >= 2
      and (a.ultima - a.primera)::numeric / nullif(a.n - 1, 0) >= 21
  loop
    continue when r.ultima + r.frecuencia - 14 > v_hoy      -- todavía no le toca
               or r.ultima + r.frecuencia * 3 < v_hoy;      -- ya es inactivo
    continue when exists (select 1 from public.recompra_avisos x
                          where x.cliente_id = r.cliente_id and x.tipo = 'recompra' and x.referencia = r.ultima::text);

    insert into public.notificaciones
      (envio_id, destinatario_id, destinatario_nombre, remitente_id, remitente_nombre, titulo, mensaje, enlace)
    select gen_random_uuid(), u.id, u.nombre, null, 'Aviso automático',
           left(format('Le toca recompra: %s', r.cliente), 120),
           format('%s compra cada %s días en promedio. Su última compra fue el %s (hace %s días); la siguiente sería alrededor del %s. Contáctalo o repite su pedido desde su historial.%s',
                  r.cliente, r.frecuencia, to_char(r.ultima, 'DD/MM/YYYY'), v_hoy - r.ultima,
                  to_char(r.ultima + r.frecuencia, 'DD/MM/YYYY'),
                  case when u.id is distinct from r.vendedor_id then ' (Su vendedor ya no está activo.)' else '' end),
           '/clientes/historial/' || r.cliente_id
    from public.usuarios u
    join public.roles ro on ro.id = u.rol_id
    where u.estado = 'activo'
      and (u.id = r.vendedor_id
           or (ro.nombre = 'admin_primario' and (r.vendedor_id is null or not coalesce(r.vendedor_activo, false))));

    insert into public.recompra_avisos (cliente_id, tipo, referencia) values (r.cliente_id, 'recompra', r.ultima::text)
    on conflict do nothing;
    v_total := v_total + 1;
  end loop;

  -- 2b. Seguimientos que vencen hoy o vencieron (hasta 30 días)
  for r in
    select k.id, k.cliente_id, k.usuario_id, k.proximo_contacto, k.notas,
           coalesce(c.nombre_comercial, c.razon_social) as cliente,
           us.estado = 'activo' as usuario_activo
    from public.contactos_cliente k
    join public.clientes c on c.id = k.cliente_id
    left join public.usuarios us on us.id = k.usuario_id
    where k.proximo_contacto between v_hoy - 30 and v_hoy
      -- Es el último contacto que ese usuario registró con el cliente.
      and not exists (select 1 from public.contactos_cliente k2
                      where k2.cliente_id = k.cliente_id
                        and k2.usuario_id is not distinct from k.usuario_id
                        and k2.fecha > k.fecha)
      and not exists (select 1 from public.recompra_avisos x
                      where x.cliente_id = k.cliente_id and x.tipo = 'seguimiento' and x.referencia = k.id::text)
  loop
    insert into public.notificaciones
      (envio_id, destinatario_id, destinatario_nombre, remitente_id, remitente_nombre, titulo, mensaje, enlace)
    select gen_random_uuid(), u.id, u.nombre, null, 'Aviso automático',
           left(format('Seguimiento pendiente: %s', r.cliente), 120),
           format('Quedó programado contactar a %s el %s%s.%s',
                  r.cliente, to_char(r.proximo_contacto, 'DD/MM/YYYY'),
                  case when r.proximo_contacto < v_hoy then format(' (hace %s días)', v_hoy - r.proximo_contacto) else ' (hoy)' end,
                  case when r.notas is not null then ' Nota: ' || left(r.notas, 300) else '' end),
           '/clientes/historial/' || r.cliente_id
    from public.usuarios u
    join public.roles ro on ro.id = u.rol_id
    where u.estado = 'activo'
      and (u.id = r.usuario_id
           or (ro.nombre = 'admin_primario' and (r.usuario_id is null or not coalesce(r.usuario_activo, false))));

    insert into public.recompra_avisos (cliente_id, tipo, referencia) values (r.cliente_id, 'seguimiento', r.id::text)
    on conflict do nothing;
    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;
revoke execute on function private.recordatorios_recompra() from public, anon, authenticated;

-- El admin primario puede correrlos a mano.
create or replace function public.enviar_recordatorios_recompra()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(private.current_user_role(), '') <> 'admin_primario' then
    raise exception 'Solo el administrador primario puede enviar los recordatorios' using errcode = '42501';
  end if;
  return private.recordatorios_recompra();
end;
$$;
revoke execute on function public.enviar_recordatorios_recompra() from public, anon;
grant execute on function public.enviar_recordatorios_recompra() to authenticated;

-- ------------------------------------------------------------------ 3. cron diario
-- 08:05 hora de Saltillo = 14:05 UTC (cinco minutos después de los de cobranza).
select cron.schedule(
  'recompra-recordatorios-diarios',
  '5 14 * * *',
  $$select private.recordatorios_recompra()$$
);
