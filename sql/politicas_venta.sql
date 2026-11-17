-- =====================================================================
-- politicas_venta.sql — Límite de crédito por cliente y tope de descuento
-- =====================================================================
-- Reglas (aplican a todos menos al administrador primario, que autoriza las excepciones):
--
--  1. Descuento: no puede pasar del % del subtotal fijado en politicas_venta
--     (10 % por omisión). Se valida cuando el descuento sube, contra la suma real de
--     las partidas.
--
--  2. Crédito:
--     a. Método de pago "Crédito" solo para clientes con límite de crédito > 0.
--     b. Si el cliente tiene límite, lo que ya debe (saldo de TODAS sus órdenes, de
--        cualquier vendedor) + el saldo de esta orden no puede pasar el límite.
--     c. Si además tiene días de crédito, no se le puede dejar saldo nuevo mientras
--        tenga órdenes con saldo cuya fecha de entrega (o de creación) + días de
--        crédito ya pasó.
--     Los clientes sin límite pueden seguir comprando con anticipo y saldo pendiente
--     (efectivo, transferencia...), como antes.
--
--  3. El límite y los días de crédito del cliente solo los cambia el admin primario.
--
-- Saldo de una orden = total − max(anticipo, pagos registrados); no cuentan las
-- órdenes Canceladas. El vendedor solo ve sus propias órdenes (RLS), así que el
-- saldo del cliente se calcula aquí con security definer.
--
-- public.estado_credito_cliente(razón social) le da al formulario el resumen del
-- cliente para avisar ANTES de guardar; los triggers trg_ordenes_politica_descuento y
-- trg_ordenes_politica_credito son los que hacen cumplir las reglas.
-- =====================================================================

-- ------------------------------------------------------------------ 1. tabla de políticas
create table if not exists public.politicas_venta (
  id boolean primary key default true check (id),
  descuento_max_pct numeric(5,2) not null default 10
    check (descuento_max_pct >= 0 and descuento_max_pct <= 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuarios(id)
);
comment on table public.politicas_venta is
  'Políticas comerciales (una sola fila): tope de descuento para quien no es administrador primario.';
comment on column public.politicas_venta.descuento_max_pct is
  'Descuento máximo, en % del subtotal, que puede dar un vendedor o admin secundario.';

insert into public.politicas_venta (id) values (true) on conflict (id) do nothing;

alter table public.politicas_venta enable row level security;

drop policy if exists lectura_politicas on public.politicas_venta;
create policy lectura_politicas on public.politicas_venta for select to authenticated
  using ((select private.current_user_role()) is not null);

drop policy if exists edicion_politicas on public.politicas_venta;
create policy edicion_politicas on public.politicas_venta for update to authenticated
  using ((select private.current_user_role()) = 'admin_primario')
  with check ((select private.current_user_role()) = 'admin_primario');

grant select, update on public.politicas_venta to authenticated;

-- ------------------------------------------------------------------ 2. saldos del cliente
-- Saldo pendiente de una orden (nunca negativo).
create or replace function private.saldo_orden(p_orden uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    o.total - greatest(coalesce(o.anticipo, 0),
                       coalesce((select sum(p.monto) from public.pagos p where p.orden_id = o.id), 0)),
    0)
  from public.ordenes o
  where o.id = p_orden
$$;

-- Órdenes vivas del cliente (no canceladas), salvo p_excluir, con su saldo.
create or replace function private.ordenes_con_saldo(p_cliente uuid, p_excluir uuid)
returns table (orden_id uuid, folio text, fecha_base date, saldo numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.folio, coalesce(o.fecha_entrega, o.fecha_creacion), private.saldo_orden(o.id)
  from public.ordenes o
  left join public.estados_orden eo on eo.id = o.estado_id
  left join public.estados_pago ep on ep.id = o.estado_pago_id
  where o.cliente_id = p_cliente
    and (p_excluir is null or o.id <> p_excluir)
    and coalesce(eo.nombre, '') <> 'Cancelada'
    and coalesce(ep.nombre, '') <> 'Cancelado'
    and private.saldo_orden(o.id) > 0
$$;

revoke execute on function private.saldo_orden(uuid) from public, anon, authenticated;
revoke execute on function private.ordenes_con_saldo(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ 3. consulta para el formulario
-- Resumen de crédito del cliente (por razón social, como se captura en la orden).
-- Devuelve null si el cliente aún no existe (cliente nuevo: sin crédito).
create or replace function public.estado_credito_cliente(p_razon_social text, p_excluir_orden uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cliente public.clientes%rowtype;
  v_saldo numeric;
  v_vencido numeric;
  v_folios text[];
begin
  if coalesce((select private.current_user_role()), '') not in ('admin_primario', 'admin_secundario', 'vendedor') then
    raise exception 'Sin permiso para consultar el crédito de clientes' using errcode = '42501';
  end if;

  -- Sin distinguir mayúsculas, igual que ErpDataContext.crearOrden al buscar el cliente.
  select * into v_cliente from public.clientes
  where upper(trim(razon_social)) = upper(trim(p_razon_social))
  order by created_at
  limit 1;
  if not found then
    return null;
  end if;

  select coalesce(sum(s.saldo), 0) into v_saldo
  from private.ordenes_con_saldo(v_cliente.id, p_excluir_orden) s;

  select coalesce(sum(s.saldo), 0), coalesce(array_agg(s.folio order by s.fecha_base), '{}')
    into v_vencido, v_folios
  from private.ordenes_con_saldo(v_cliente.id, p_excluir_orden) s
  where v_cliente.dias_credito is not null
    and s.fecha_base + v_cliente.dias_credito < current_date;

  return jsonb_build_object(
    'cliente_id', v_cliente.id,
    'limite_credito', v_cliente.limite_credito,
    'dias_credito', v_cliente.dias_credito,
    'saldo', v_saldo,
    'saldo_vencido', v_vencido,
    'folios_vencidos', to_jsonb(v_folios)
  );
end;
$$;

revoke execute on function public.estado_credito_cliente(text, uuid) from public, anon;
grant execute on function public.estado_credito_cliente(text, uuid) to authenticated;

-- ------------------------------------------------------------------ 4. triggers que hacen cumplir
-- El administrador primario autoriza las excepciones; los procesos sin sesión (SQL
-- editor, service role) tampoco se restringen.
create or replace function private.politicas_aplican()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_user_role()) not in ('admin_primario'), false)
$$;
revoke execute on function private.politicas_aplican() from public, anon, authenticated;

-- 4a. Tope de descuento. Se dispara cada vez que se escribe el descuento (alta de la
-- orden o UPDATE que lo incluya, como editar_orden) y lo compara contra la suma real
-- de las partidas. Solo bloquea si el descuento SUBE y queda arriba del tope, para
-- que editar otros datos de una orden con descuento autorizado no falle.
-- Al crear una orden se inserta con descuento 0 y se aplica al final, cuando ya
-- están todas las partidas (ErpDataContext.crearOrden).
create or replace function private.trg_politica_descuento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tope numeric;
  v_sub numeric;
  v_pct numeric;
begin
  if not private.politicas_aplican()
     or coalesce(new.descuento, 0) <= coalesce(case when tg_op = 'UPDATE' then old.descuento end, 0) + 0.005 then
    return new;
  end if;

  select coalesce(sum(round(cantidad * coalesce(precio_unitario, 0), 2)), 0) into v_sub
  from public.orden_detalles where orden_id = new.id;
  select descuento_max_pct into v_tope from public.politicas_venta where id;
  v_tope := coalesce(v_tope, 10);
  v_pct := case when v_sub > 0 then new.descuento * 100 / v_sub else 100 end;

  if v_pct > v_tope + 0.005 then
    raise exception 'El descuento de $% (% %%) pasa del máximo permitido de % %% del subtotal. Pide autorización al administrador.',
      to_char(new.descuento, 'FM999,999,990.00'), round(v_pct, 1), v_tope
      using errcode = 'P0001', hint = 'politica_descuento';
  end if;
  return new;
end;
$$;
revoke execute on function private.trg_politica_descuento() from public, anon, authenticated;

drop trigger if exists trg_ordenes_politica_descuento on public.ordenes;
create trigger trg_ordenes_politica_descuento
  before insert or update of descuento on public.ordenes
  for each row execute function private.trg_politica_descuento();

-- 4b. Crédito del cliente. Se revisa al crear la orden, al cambiarla de cliente o a
-- método "Crédito", y cada vez que su saldo pendiente crece (más partidas, menos
-- anticipo). Al crear, el saldo se evalúa antes del descuento, que se aplica al final.
create or replace function private.trg_politica_credito()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pagado numeric := 0;
  v_exp_nueva numeric;
  v_exp_ant numeric := 0;
  v_credito uuid;
  v_es_credito boolean;
  v_cliente public.clientes%rowtype;
  v_saldo_otros numeric;
  v_folios text;
  v_fmt constant text := 'FM999,999,990.00';
begin
  if not private.politicas_aplican() or new.cliente_id is null then
    return new;
  end if;

  -- Una orden cancelada no genera saldo.
  if exists (select 1 from public.estados_orden eo where eo.id = new.estado_id and eo.nombre = 'Cancelada')
     or exists (select 1 from public.estados_pago ep where ep.id = new.estado_pago_id and ep.nombre = 'Cancelado') then
    return new;
  end if;

  select id into v_credito from public.metodos_pago where nombre = 'Crédito';
  v_es_credito := v_credito is not null and new.metodo_pago_id is not distinct from v_credito;

  if tg_op = 'UPDATE' then
    select coalesce(sum(monto), 0) into v_pagado from public.pagos where orden_id = new.id;
    v_exp_ant := greatest(coalesce(old.total, 0) - greatest(coalesce(old.anticipo, 0), v_pagado), 0);
  end if;
  v_exp_nueva := greatest(coalesce(new.total, 0) - greatest(coalesce(new.anticipo, 0), v_pagado), 0);

  if not (tg_op = 'INSERT'
          or new.cliente_id is distinct from old.cliente_id
          or (v_es_credito and new.metodo_pago_id is distinct from old.metodo_pago_id)
          or v_exp_nueva > v_exp_ant + 0.005) then
    return new;
  end if;

  select * into v_cliente from public.clientes where id = new.cliente_id;

  if v_es_credito and coalesce(v_cliente.limite_credito, 0) <= 0 then
    raise exception 'El cliente % no tiene crédito autorizado. Cobra con otro método o pide al administrador que le asigne un límite de crédito.',
      v_cliente.razon_social
      using errcode = 'P0001', hint = 'politica_credito';
  end if;

  if v_exp_nueva > 0 and coalesce(v_cliente.limite_credito, 0) > 0 then
    if v_cliente.dias_credito is not null then
      select string_agg(s.folio, ', ' order by s.fecha_base) into v_folios
      from private.ordenes_con_saldo(new.cliente_id, new.id) s
      where s.fecha_base + v_cliente.dias_credito < current_date;
      if v_folios is not null then
        raise exception 'El cliente % tiene saldos vencidos (más de % días de crédito): %. Deben pagarse antes de dejarle un saldo nuevo; pide autorización al administrador.',
          v_cliente.razon_social, v_cliente.dias_credito, v_folios
          using errcode = 'P0001', hint = 'politica_credito';
      end if;
    end if;

    select coalesce(sum(s.saldo), 0) into v_saldo_otros
    from private.ordenes_con_saldo(new.cliente_id, new.id) s;
    if v_saldo_otros + v_exp_nueva > v_cliente.limite_credito + 0.005 then
      raise exception 'Se excede el límite de crédito de % ($%): ya debe $% y esta orden deja $% pendientes (disponible: $%). Pide un anticipo mayor o autorización al administrador.',
        v_cliente.razon_social, to_char(v_cliente.limite_credito, v_fmt), to_char(v_saldo_otros, v_fmt),
        to_char(v_exp_nueva, v_fmt), to_char(greatest(v_cliente.limite_credito - v_saldo_otros, 0), v_fmt)
        using errcode = 'P0001', hint = 'politica_credito';
    end if;
  end if;

  return new;
end;
$$;
revoke execute on function private.trg_politica_credito() from public, anon, authenticated;

drop trigger if exists trg_ordenes_politica_credito on public.ordenes;
create trigger trg_ordenes_politica_credito
  before insert or update of total, anticipo, cliente_id, metodo_pago_id on public.ordenes
  for each row execute function private.trg_politica_credito();

-- 4c. Límite y días de crédito: solo los asigna el administrador primario. Sin esto
-- un vendedor (que sí puede dar de alta y editar clientes) podría subirse el límite.
create or replace function private.trg_credito_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.politicas_aplican() then
    return new;
  end if;
  if (tg_op = 'INSERT' and (coalesce(new.limite_credito, 0) <> 0 or new.dias_credito is not null))
     or (tg_op = 'UPDATE' and (new.limite_credito is distinct from old.limite_credito
                               or new.dias_credito is distinct from old.dias_credito)) then
    raise exception 'Solo el administrador principal puede asignar o cambiar el límite y los días de crédito de un cliente.'
      using errcode = '42501', hint = 'politica_credito';
  end if;
  return new;
end;
$$;
revoke execute on function private.trg_credito_cliente() from public, anon, authenticated;

drop trigger if exists trg_clientes_credito on public.clientes;
create trigger trg_clientes_credito
  before insert or update of limite_credito, dias_credito on public.clientes
  for each row execute function private.trg_credito_cliente();
