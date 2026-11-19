-- =====================================================================
-- autorizaciones_venta.sql — Pedir autorización en vez de quedar bloqueado
-- =====================================================================
-- Requiere sql/politicas_venta.sql. Cuando el tope de descuento o el crédito del cliente
-- impiden guardar una orden, el vendedor (o el admin secundario) manda la orden tal como
-- la capturó al administrador primario, que la aprueba o la rechaza con un clic.
--
--  1. solicitar_autorizacion_venta(...): guarda la captura (para retomarla después), el
--     descuento y/o el saldo que deja la orden, y avisa a los administradores primarios.
--  2. resolver_autorizacion_venta(...): solo el admin primario. Al aprobar puede ajustar
--     el descuento o saldo autorizados y la vigencia (7 días por omisión). Avisa al
--     vendedor.
--  3. Los triggers de politicas_venta.sql, antes de rechazar una orden, buscan una
--     autorización APROBADA y vigente del mismo vendedor para el mismo cliente que cubra
--     el descuento (en pesos) o el saldo pendiente de la orden (más el descuento capturado
--     con IVA, porque la orden se guarda primero sin descuento). Si la hay, dejan pasar la
--     orden y la ligan a ella (orden_id): ya no sirve para otra orden. Si la orden se
--     borra, la autorización vuelve a quedar disponible.
--  4. cancelar_autorizacion_venta(id): el vendedor retira su solicitud.
--
-- Nadie escribe directo en la tabla: todo pasa por las funciones.
-- =====================================================================

-- ------------------------------------------------------------------ 1. tabla
create table if not exists public.autorizaciones_venta (
  id uuid primary key default gen_random_uuid(),
  solicitante_id uuid not null references public.usuarios(id),
  cliente_id uuid references public.clientes(id) on delete set null,
  cliente_nombre text not null,
  -- Descuento (pesos, sobre el subtotal antes de IVA) y saldo pendiente que se piden;
  -- null = esa política no se pide.
  descuento numeric(12,2) check (descuento > 0),
  saldo numeric(12,2) check (saldo >= 0),
  subtotal numeric(12,2),
  total numeric(12,2),
  -- Mensaje de la política que bloqueó la orden y por qué la pide el vendedor.
  motivo_bloqueo text,
  justificacion text not null check (length(trim(justificacion)) between 3 and 1000),
  -- Captura del formulario (CapturaInicial + fecha de entrega, método de pago y anticipo).
  captura jsonb not null check (jsonb_typeof(captura) = 'object'),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
  resuelta_por uuid references public.usuarios(id),
  resuelta_at timestamptz,
  comentario text,
  vence date,
  orden_id uuid references public.ordenes(id) on delete set null deferrable initially deferred,
  usada_at timestamptz,
  created_at timestamptz not null default now(),
  constraint autorizaciones_venta_algo check (descuento is not null or saldo is not null)
);

comment on table public.autorizaciones_venta is
  'Excepciones a las políticas de venta (descuento / crédito) que el vendedor pide y el admin primario aprueba.';

create index if not exists autorizaciones_venta_solicitante on public.autorizaciones_venta (solicitante_id, estado);
create index if not exists autorizaciones_venta_pendientes on public.autorizaciones_venta (created_at) where estado = 'pendiente';
create index if not exists autorizaciones_venta_orden on public.autorizaciones_venta (orden_id) where orden_id is not null;
create index if not exists autorizaciones_venta_cliente on public.autorizaciones_venta (cliente_id);
create index if not exists autorizaciones_venta_resuelta_por on public.autorizaciones_venta (resuelta_por);

alter table public.autorizaciones_venta enable row level security;

-- Admins: todas; los demás: las suyas.
drop policy if exists lectura on public.autorizaciones_venta;
create policy lectura on public.autorizaciones_venta for select to authenticated
  using (
    (select private.current_user_role()) in ('admin_primario', 'admin_secundario')
    or solicitante_id = (select private.mi_usuario_id())
  );

revoke all on public.autorizaciones_venta from anon, authenticated;
grant select on public.autorizaciones_venta to authenticated;

-- ------------------------------------------------------------------ 2. solicitar
create or replace function public.solicitar_autorizacion_venta(
  p_cliente text,
  p_descuento numeric,
  p_saldo numeric,
  p_subtotal numeric,
  p_total numeric,
  p_motivo text,
  p_justificacion text,
  p_captura jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text := private.current_user_role();
  v_yo uuid := private.mi_usuario_id();
  v_nombre text;
  v_cliente uuid;
  v_id uuid;
  v_envio uuid := gen_random_uuid();
  v_fmt constant text := 'FM999,999,990.00';
begin
  if v_rol is null or v_rol not in ('vendedor', 'admin_secundario') then
    raise exception 'Solo vendedores y el administrador secundario piden autorizaciones (el primario no las necesita)'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_cliente), '') = '' then
    raise exception 'Captura el cliente antes de pedir la autorización';
  end if;
  if coalesce(p_descuento, 0) <= 0 and p_saldo is null then
    raise exception 'Indica qué se autoriza: el descuento o el saldo a crédito';
  end if;
  if length(trim(coalesce(p_justificacion, ''))) < 3 then
    raise exception 'Explica brevemente por qué se necesita la excepción';
  end if;
  if p_captura is null or jsonb_typeof(p_captura) <> 'object' or pg_column_size(p_captura) > 200000 then
    raise exception 'La captura de la orden no es válida';
  end if;

  select nombre into v_nombre from public.usuarios where id = v_yo;
  select id into v_cliente from public.clientes
  where upper(trim(razon_social)) = upper(trim(p_cliente))
  order by created_at limit 1;

  insert into public.autorizaciones_venta
    (solicitante_id, cliente_id, cliente_nombre, descuento, saldo, subtotal, total,
     motivo_bloqueo, justificacion, captura)
  values
    (v_yo, v_cliente, trim(p_cliente), nullif(round(coalesce(p_descuento, 0), 2), 0),
     case when p_saldo is not null then round(greatest(p_saldo, 0), 2) end,
     round(p_subtotal, 2), round(p_total, 2),
     left(nullif(trim(p_motivo), ''), 1000), trim(p_justificacion), p_captura)
  returning id into v_id;

  insert into public.notificaciones
    (envio_id, destinatario_id, destinatario_nombre, remitente_id, remitente_nombre, titulo, mensaje, enlace)
  select v_envio, u.id, u.nombre, v_yo, v_nombre,
         left(format('Autorización solicitada: %s', trim(p_cliente)), 120),
         format('%s pide autorizar una orden de %s por $%s.%s%s Motivo: %s',
                v_nombre, trim(p_cliente), to_char(coalesce(p_total, 0), v_fmt),
                case when coalesce(p_descuento, 0) > 0
                     then format(' Descuento: $%s.', to_char(p_descuento, v_fmt)) else '' end,
                case when p_saldo is not null
                     then format(' Saldo a crédito: $%s.', to_char(p_saldo, v_fmt)) else '' end,
                trim(p_justificacion)),
         '/autorizaciones'
  from public.usuarios u
  join public.roles r on r.id = u.rol_id
  where r.nombre = 'admin_primario' and u.estado = 'activo';

  return v_id;
end;
$$;

revoke execute on function public.solicitar_autorizacion_venta(text, numeric, numeric, numeric, numeric, text, text, jsonb) from public, anon;
grant execute on function public.solicitar_autorizacion_venta(text, numeric, numeric, numeric, numeric, text, text, jsonb) to authenticated;

-- ------------------------------------------------------------------ 3. aprobar / rechazar
create or replace function public.resolver_autorizacion_venta(
  p_id uuid,
  p_aprobar boolean,
  p_comentario text default null,
  p_descuento numeric default null,
  p_saldo numeric default null,
  p_dias_vigencia integer default 7
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_yo uuid := private.mi_usuario_id();
  v_nombre text;
  a public.autorizaciones_venta%rowtype;
  v_vence date;
  v_fmt constant text := 'FM999,999,990.00';
begin
  if coalesce(private.current_user_role(), '') <> 'admin_primario' then
    raise exception 'Solo el administrador primario autoriza excepciones' using errcode = '42501';
  end if;

  select * into a from public.autorizaciones_venta where id = p_id for update;
  if not found then
    raise exception 'La solicitud no existe';
  end if;
  if a.estado <> 'pendiente' then
    raise exception 'La solicitud ya fue %', a.estado;
  end if;
  if not p_aprobar and length(trim(coalesce(p_comentario, ''))) < 3 then
    raise exception 'Escribe el motivo del rechazo para el vendedor';
  end if;

  select nombre into v_nombre from public.usuarios where id = v_yo;

  if p_aprobar then
    v_vence := (private.ahora_local())::date + greatest(coalesce(p_dias_vigencia, 7), 1);
    update public.autorizaciones_venta
       set estado = 'aprobada',
           descuento = case when a.descuento is null then null
                            else round(coalesce(nullif(p_descuento, 0), a.descuento), 2) end,
           saldo = case when a.saldo is null then null
                        else round(greatest(coalesce(p_saldo, a.saldo), 0), 2) end,
           vence = v_vence,
           comentario = nullif(trim(p_comentario), ''),
           resuelta_por = v_yo,
           resuelta_at = now()
     where id = p_id
     returning * into a;
  else
    update public.autorizaciones_venta
       set estado = 'rechazada', comentario = trim(p_comentario), resuelta_por = v_yo, resuelta_at = now()
     where id = p_id
     returning * into a;
  end if;

  insert into public.notificaciones
    (envio_id, destinatario_id, destinatario_nombre, remitente_id, remitente_nombre, titulo, mensaje, enlace)
  select gen_random_uuid(), u.id, u.nombre, v_yo, v_nombre,
         left(format('Autorización %s: %s', case when p_aprobar then 'aprobada' else 'rechazada' end, a.cliente_nombre), 120),
         case when p_aprobar then
           format('%s autorizó la orden de %s.%s%s Vigente hasta el %s: entra a Autorizaciones y crea la orden.%s',
                  v_nombre, a.cliente_nombre,
                  case when a.descuento is not null then format(' Descuento: $%s.', to_char(a.descuento, v_fmt)) else '' end,
                  case when a.saldo is not null then format(' Saldo a crédito: $%s.', to_char(a.saldo, v_fmt)) else '' end,
                  to_char(a.vence, 'DD/MM/YYYY'),
                  case when a.comentario is not null then ' Nota: ' || a.comentario else '' end)
         else
           format('%s no autorizó la orden de %s. Motivo: %s', v_nombre, a.cliente_nombre, a.comentario)
         end,
         '/autorizaciones'
  from public.usuarios u
  where u.id = a.solicitante_id;
end;
$$;

revoke execute on function public.resolver_autorizacion_venta(uuid, boolean, text, numeric, numeric, integer) from public, anon;
grant execute on function public.resolver_autorizacion_venta(uuid, boolean, text, numeric, numeric, integer) to authenticated;

-- ------------------------------------------------------------------ 4. cancelar
create or replace function public.cancelar_autorizacion_venta(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.autorizaciones_venta
     set estado = 'cancelada', resuelta_at = coalesce(resuelta_at, now())
   where id = p_id
     and solicitante_id = private.mi_usuario_id()
     and (estado = 'pendiente' or (estado = 'aprobada' and orden_id is null));
  if not found then
    raise exception 'Solo puedes retirar tus solicitudes pendientes o aprobadas que no se han usado';
  end if;
end;
$$;

revoke execute on function public.cancelar_autorizacion_venta(uuid) from public, anon;
grant execute on function public.cancelar_autorizacion_venta(uuid) to authenticated;

-- ------------------------------------------------------------------ 5. ¿hay autorización?
-- ¿El usuario actual tiene una autorización aprobada y vigente para el cliente de la orden
-- que cubra p_monto (descuento en pesos, o saldo pendiente)? Si la hay, la liga a la orden.
create or replace function private.autorizacion_cubre(p_tipo text, p_orden uuid, p_cliente uuid, p_monto numeric)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_yo uuid := private.mi_usuario_id();
  v_id uuid;
begin
  if v_yo is null or p_cliente is null then
    return false;
  end if;

  select a.id into v_id
  from public.autorizaciones_venta a
  join public.clientes c on c.id = p_cliente
  where a.solicitante_id = v_yo
    and a.estado = 'aprobada'
    and a.vence >= (private.ahora_local())::date
    and (a.orden_id is null or a.orden_id = p_orden)
    and (a.cliente_id = p_cliente or upper(trim(a.cliente_nombre)) = upper(trim(c.razon_social)))
    and case p_tipo
          when 'descuento' then a.descuento >= coalesce(p_monto, 0) - 0.005
          -- ErpDataContext.crearOrden aplica el descuento al final: mientras tanto el
          -- saldo de la orden incluye el descuento capturado (con su IVA).
          else a.saldo + round(case when jsonb_typeof(a.captura -> 'descuento') = 'number'
                                    then greatest((a.captura ->> 'descuento')::numeric, 0) else 0 end * 1.16, 2)
               >= coalesce(p_monto, 0) - 0.005
        end
  -- Primero la que ya está ligada a esta orden; si no, la más antigua.
  order by (a.orden_id is not distinct from p_orden) desc, a.created_at
  limit 1
  for update of a;

  if v_id is null then
    return false;
  end if;

  update public.autorizaciones_venta
     set orden_id = p_orden, usada_at = coalesce(usada_at, now()), cliente_id = coalesce(cliente_id, p_cliente)
   where id = v_id;
  return true;
end;
$$;
revoke execute on function private.autorizacion_cubre(text, uuid, uuid, numeric) from public, anon, authenticated;

-- ------------------------------------------------------------------ 6. triggers de políticas
-- Mismas reglas que sql/politicas_venta.sql; antes de rechazar, buscan una autorización.
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

  if v_pct > v_tope + 0.005
     and not private.autorizacion_cubre('descuento', new.id, new.cliente_id, new.descuento) then
    raise exception 'El descuento de $% (% %%) pasa del máximo permitido de % %% del subtotal. Pide autorización al administrador.',
      to_char(new.descuento, 'FM999,999,990.00'), round(v_pct, 1), v_tope
      using errcode = 'P0001', hint = 'politica_descuento';
  end if;
  return new;
end;
$$;
revoke execute on function private.trg_politica_descuento() from public, anon, authenticated;

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
  v_motivo text;
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
    v_motivo := format('El cliente %s no tiene crédito autorizado. Cobra con otro método o pide al administrador que le asigne un límite de crédito.',
                       v_cliente.razon_social);
  elsif v_exp_nueva > 0 and coalesce(v_cliente.limite_credito, 0) > 0 then
    if v_cliente.dias_credito is not null then
      select string_agg(s.folio, ', ' order by s.fecha_base) into v_folios
      from private.ordenes_con_saldo(new.cliente_id, new.id) s
      where s.fecha_base + v_cliente.dias_credito < current_date;
      if v_folios is not null then
        v_motivo := format('El cliente %s tiene saldos vencidos (más de %s días de crédito): %s. Deben pagarse antes de dejarle un saldo nuevo; pide autorización al administrador.',
                           v_cliente.razon_social, v_cliente.dias_credito, v_folios);
      end if;
    end if;

    if v_motivo is null then
      select coalesce(sum(s.saldo), 0) into v_saldo_otros
      from private.ordenes_con_saldo(new.cliente_id, new.id) s;
      if v_saldo_otros + v_exp_nueva > v_cliente.limite_credito + 0.005 then
        v_motivo := format('Se excede el límite de crédito de %s ($%s): ya debe $%s y esta orden deja $%s pendientes (disponible: $%s). Pide un anticipo mayor o autorización al administrador.',
                           v_cliente.razon_social, to_char(v_cliente.limite_credito, v_fmt), to_char(v_saldo_otros, v_fmt),
                           to_char(v_exp_nueva, v_fmt), to_char(greatest(v_cliente.limite_credito - v_saldo_otros, 0), v_fmt));
      end if;
    end if;
  end if;

  if v_motivo is not null
     and not private.autorizacion_cubre('credito', new.id, new.cliente_id, v_exp_nueva) then
    raise exception '%', v_motivo using errcode = 'P0001', hint = 'politica_credito';
  end if;

  return new;
end;
$$;
revoke execute on function private.trg_politica_credito() from public, anon, authenticated;
