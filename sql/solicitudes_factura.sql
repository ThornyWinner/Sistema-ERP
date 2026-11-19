-- =====================================================================
-- solicitudes_factura.sql — El vendedor pide la factura desde la orden
-- =====================================================================
-- El vendedor no entra a Facturación, pero sí sabe si el cliente requiere factura y
-- tiene sus datos. Desde la orden marca "el cliente requiere factura" con los datos
-- fiscales del receptor (RFC, razón social, régimen, C.P.), el uso de CFDI, la forma y
-- el método de pago; el admin primario la emite con todo ya cargado.
--
-- Estados de la solicitud:
--   pendiente → en_proceso (el admin ya preparó un borrador de factura ligado a la orden)
--             → emitida    (la factura de la orden quedó vigente, o el admin la marcó
--                           como emitida fuera del sistema, p. ej. en CONTPAQi)
--   pendiente / en_proceso → rechazada (el admin explica qué falta) · cancelada (quien
--                           la pidió ya no la necesita)
-- El avance a en_proceso / emitida es automático (trigger en cfdis). Se avisa al admin
-- primario al pedirla y a quien la pidió cuando se emite o se rechaza.
--
-- Los datos fiscales que capture el vendedor también se guardan en el cliente
-- (RFC, régimen, C.P., uso, forma y método de pago; el correo solo si no tenía), para
-- la siguiente factura. La razón social del catálogo no se cambia: la fiscal va en la
-- solicitud (el nombre del catálogo es con el que se buscan las órdenes del cliente).
--
-- Quién: piden y cancelan quienes pueden editar la orden (private.puede_editar_orden);
-- atiende el admin primario; el admin secundario consulta.
-- =====================================================================

create table if not exists public.solicitudes_factura (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_proceso', 'emitida', 'rechazada', 'cancelada')),
  receptor_rfc text not null check (receptor_rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  receptor_nombre text not null check (char_length(receptor_nombre) between 1 and 300),
  receptor_regimen text not null,
  receptor_cp text not null check (receptor_cp ~ '^[0-9]{5}$'),
  receptor_email text check (receptor_email is null or char_length(receptor_email) <= 200),
  uso_cfdi text not null,
  metodo_pago text not null check (metodo_pago in ('PUE', 'PPD')),
  forma_pago text not null,
  notas text check (notas is null or char_length(notas) <= 1000),
  solicitada_por uuid references public.usuarios(id) on delete set null,
  solicitada_at timestamptz not null default now(),
  atendida_por uuid references public.usuarios(id) on delete set null,
  atendida_at timestamptz,
  respuesta text check (respuesta is null or char_length(respuesta) <= 1000),
  cfdi_id uuid references public.cfdis(id) on delete set null,
  cfdi_folio text,
  cfdi_uuid uuid
);
comment on table public.solicitudes_factura is
  'Solicitudes de factura que hace el vendedor desde la orden, con los datos fiscales del cliente; el admin primario las emite.';

-- Una sola solicitud abierta por orden.
create unique index if not exists solicitudes_factura_abierta_uidx
  on public.solicitudes_factura (orden_id) where estado in ('pendiente', 'en_proceso');
create index if not exists solicitudes_factura_estado_idx on public.solicitudes_factura (estado, solicitada_at);

alter table public.solicitudes_factura enable row level security;

drop policy if exists solicitudes_lectura on public.solicitudes_factura;
create policy solicitudes_lectura on public.solicitudes_factura for select to authenticated
  using ((select private.current_user_role()) in ('admin_primario', 'admin_secundario')
         or private.puede_editar_orden(orden_id));

revoke all on public.solicitudes_factura from anon, authenticated;
grant select on public.solicitudes_factura to authenticated;

-- ------------------------------------------------------------------ avisos
create or replace function private.avisar_factura(
  p_destinatarios uuid[], p_roles text[], p_titulo text, p_mensaje text, p_enlace text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notificaciones
    (envio_id, destinatario_id, destinatario_nombre, remitente_id, remitente_nombre, titulo, mensaje, enlace)
  select e.envio, u.id, u.nombre, null, 'Aviso automático', left(p_titulo, 120), left(p_mensaje, 2000), p_enlace
  from (select gen_random_uuid() as envio) e
  cross join public.usuarios u
  join public.roles r on r.id = u.rol_id
  where u.estado = 'activo'
    and u.id is distinct from private.mi_usuario_id()
    and (u.id = any(coalesce(p_destinatarios, '{}')) or r.nombre = any(coalesce(p_roles, '{}')))
$$;
revoke execute on function private.avisar_factura(uuid[], text[], text, text, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ solicitar
-- p_datos: { "rfc", "razon_social", "regimen_fiscal", "codigo_postal", "email",
--            "uso_cfdi", "metodo_pago": "PUE"|"PPD", "forma_pago": "03", "notas" }
create or replace function public.solicitar_factura(p_orden uuid, p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orden public.ordenes%rowtype;
  v_estado text;
  v_rfc text := upper(btrim(coalesce(p_datos->>'rfc', '')));
  v_nombre text := upper(btrim(coalesce(p_datos->>'razon_social', '')));
  v_regimen text := nullif(btrim(p_datos->>'regimen_fiscal'), '');
  v_cp text := btrim(coalesce(p_datos->>'codigo_postal', ''));
  v_email text := nullif(btrim(p_datos->>'email'), '');
  v_uso text := nullif(btrim(p_datos->>'uso_cfdi'), '');
  v_metodo text := upper(btrim(coalesce(p_datos->>'metodo_pago', '')));
  v_forma text := nullif(btrim(p_datos->>'forma_pago'), '');
  v_notas text := nullif(btrim(p_datos->>'notas'), '');
  v_factura text;
  v_id uuid;
  v_quien text;
begin
  if private.mi_usuario_id() is null or not private.puede_editar_orden(p_orden) then
    raise exception 'No tienes permiso para pedir la factura de esta orden' using errcode = '42501';
  end if;
  select * into v_orden from public.ordenes where id = p_orden for update;
  if not found then
    raise exception 'La orden no existe';
  end if;
  select nombre into v_estado from public.estados_orden where id = v_orden.estado_id;
  if v_estado = 'Cancelada' then
    raise exception 'La orden % está cancelada', v_orden.folio;
  end if;
  if v_orden.cliente_id is null then
    raise exception 'La orden no tiene cliente';
  end if;
  if exists (select 1 from public.solicitudes_factura
             where orden_id = p_orden and estado in ('pendiente', 'en_proceso')) then
    raise exception 'La factura de la orden % ya se pidió y está en trámite', v_orden.folio;
  end if;
  select string_agg(coalesce(c.serie || '-', '') || coalesce(c.folio::text, ''), ', ') into v_factura
  from public.cfdis c where c.orden_id = p_orden and c.tipo_comprobante = 'I' and c.estado = 'vigente';
  if v_factura is not null then
    raise exception 'La orden % ya está facturada (%)', v_orden.folio, v_factura;
  end if;

  if v_rfc !~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$' then
    raise exception 'El RFC no es válido (12 caracteres para persona moral, 13 para física)';
  end if;
  if v_nombre = '' then
    raise exception 'Escribe la razón social tal como aparece en la constancia de situación fiscal';
  end if;
  if v_regimen is null then
    raise exception 'Elige el régimen fiscal del cliente';
  end if;
  if v_cp !~ '^[0-9]{5}$' then
    raise exception 'El código postal fiscal debe tener 5 dígitos';
  end if;
  if v_uso is null then
    raise exception 'Elige el uso del CFDI';
  end if;
  if v_metodo not in ('PUE', 'PPD') then
    raise exception 'Elige el método de pago (PUE o PPD)';
  end if;
  if v_forma is null then
    raise exception 'Elige la forma de pago';
  end if;
  if v_metodo = 'PPD' and v_forma <> '99' then
    raise exception 'Con pago en parcialidades o diferido (PPD) la forma de pago debe ser 99 - Por definir';
  end if;

  insert into public.solicitudes_factura
    (orden_id, cliente_id, receptor_rfc, receptor_nombre, receptor_regimen, receptor_cp, receptor_email,
     uso_cfdi, metodo_pago, forma_pago, notas, solicitada_por)
  values (p_orden, v_orden.cliente_id, v_rfc, v_nombre, v_regimen, v_cp, v_email,
          v_uso, v_metodo, v_forma, v_notas, private.mi_usuario_id())
  returning id into v_id;

  -- Se quedan en el cliente para la próxima factura.
  update public.clientes
     set rfc = v_rfc, regimen_fiscal = v_regimen, codigo_postal = v_cp, uso_cfdi = v_uso,
         metodo_pago_cfdi = v_metodo, forma_pago_cfdi = v_forma,
         email = coalesce(nullif(btrim(email), ''), v_email)
   where id = v_orden.cliente_id;

  select nombre into v_quien from public.usuarios where id = private.mi_usuario_id();
  perform private.avisar_factura('{}', array['admin_primario'],
    format('Factura solicitada: %s', v_orden.folio),
    format(E'%s pidió la factura de la orden %s ($%s).\n%s · %s\nUso %s · %s · forma %s%s',
           coalesce(v_quien, 'Un vendedor'), v_orden.folio, to_char(v_orden.total, 'FM999,999,990.00'),
           v_nombre, v_rfc, v_uso, v_metodo, v_forma, coalesce(E'\nNotas: ' || v_notas, '')),
    '/facturacion/solicitudes');
  return v_id;
end;
$$;
revoke execute on function public.solicitar_factura(uuid, jsonb) from public, anon;
grant execute on function public.solicitar_factura(uuid, jsonb) to authenticated;

-- ------------------------------------------------------------------ cancelar (quien la pidió)
create or replace function public.cancelar_solicitud_factura(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.solicitudes_factura%rowtype;
begin
  select * into v from public.solicitudes_factura where id = p_id for update;
  if not found then
    raise exception 'La solicitud no existe';
  end if;
  if not private.puede_editar_orden(v.orden_id) then
    raise exception 'Sin permiso para esta solicitud' using errcode = '42501';
  end if;
  if v.estado <> 'pendiente' then
    raise exception 'Solo se cancela una solicitud pendiente (esta está %)', replace(v.estado, '_', ' ');
  end if;
  update public.solicitudes_factura
     set estado = 'cancelada', atendida_por = private.mi_usuario_id(), atendida_at = now()
   where id = p_id;
end;
$$;
revoke execute on function public.cancelar_solicitud_factura(uuid) from public, anon;
grant execute on function public.cancelar_solicitud_factura(uuid) to authenticated;

-- ------------------------------------------------------------------ atender (admin primario)
-- p_accion: 'emitida' (facturada fuera del sistema; p_respuesta = folio o UUID) o
-- 'rechazada' (p_respuesta = qué falta o por qué no procede).
create or replace function public.atender_solicitud_factura(p_id uuid, p_accion text, p_respuesta text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.solicitudes_factura%rowtype;
  v_folio text;
  v_resp text := nullif(btrim(p_respuesta), '');
begin
  if private.current_user_role() is distinct from 'admin_primario' then
    raise exception 'Solo el administrador principal atiende solicitudes de factura' using errcode = '42501';
  end if;
  select * into v from public.solicitudes_factura where id = p_id for update;
  if not found then
    raise exception 'La solicitud no existe';
  end if;
  if v.estado not in ('pendiente', 'en_proceso') then
    raise exception 'La solicitud ya está %', replace(v.estado, '_', ' ');
  end if;
  if p_accion not in ('emitida', 'rechazada') then
    raise exception 'Acción no válida';
  end if;
  if v_resp is null then
    raise exception '%', case when p_accion = 'emitida' then 'Escribe el folio o UUID de la factura emitida'
                              else 'Explica por qué se rechaza (qué dato falta o está mal)' end;
  end if;

  update public.solicitudes_factura
     set estado = p_accion, respuesta = v_resp, atendida_por = private.mi_usuario_id(), atendida_at = now(),
         cfdi_folio = case when p_accion = 'emitida' then coalesce(cfdi_folio, left(v_resp, 60)) else cfdi_folio end
   where id = p_id;

  select folio into v_folio from public.ordenes where id = v.orden_id;
  perform private.avisar_factura(array[v.solicitada_por], '{}',
    case when p_accion = 'emitida' then format('Factura emitida: %s', v_folio)
         else format('Factura rechazada: %s', v_folio) end,
    case when p_accion = 'emitida' then format('La factura de la orden %s ya se emitió (%s).', v_folio, v_resp)
         else format(E'No se pudo emitir la factura de la orden %s:\n%s\nCorrige los datos y vuelve a pedirla desde la orden.', v_folio, v_resp) end,
    '/ordenes/' || v.orden_id);
end;
$$;
revoke execute on function public.atender_solicitud_factura(uuid, text, text) from public, anon;
grant execute on function public.atender_solicitud_factura(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------ enlace con la factura
-- Borrador ligado a la orden → en_proceso; factura vigente → emitida (y aviso).
create or replace function private.trg_cfdi_solicitud()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_folio_cfdi text;
begin
  if tg_op = 'DELETE' then
    update public.solicitudes_factura set estado = 'pendiente', cfdi_id = null
     where cfdi_id = old.id and estado = 'en_proceso';
    return old;
  end if;

  if new.tipo_comprobante <> 'I' then
    return new;
  end if;

  -- La factura dejó de estar ligada a la orden, o se canceló: la solicitud vuelve a pendiente.
  if tg_op = 'UPDATE' and (new.orden_id is distinct from old.orden_id or new.estado = 'cancelado') then
    update public.solicitudes_factura set estado = 'pendiente', cfdi_id = null
     where cfdi_id = new.id and estado = 'en_proceso';
  end if;

  if new.orden_id is null then
    return new;
  end if;

  v_folio_cfdi := nullif(coalesce(new.serie || '-', '') || coalesce(new.folio::text, ''), '');

  if new.estado = 'vigente' then
    for r in
      update public.solicitudes_factura s
         set estado = 'emitida', cfdi_id = new.id, cfdi_folio = v_folio_cfdi, cfdi_uuid = new.uuid,
             atendida_por = coalesce(private.mi_usuario_id(), new.created_by), atendida_at = now()
       where s.orden_id = new.orden_id and s.estado in ('pendiente', 'en_proceso')
      returning s.solicitada_por, s.orden_id
    loop
      perform private.avisar_factura(array[r.solicitada_por], '{}',
        format('Factura emitida: %s', (select folio from public.ordenes where id = r.orden_id)),
        format('La factura %s de la orden %s ya está timbrada.', coalesce(v_folio_cfdi, ''),
               (select folio from public.ordenes where id = r.orden_id)),
        '/ordenes/' || r.orden_id);
    end loop;
  elsif new.estado in ('borrador', 'en_proceso') then
    update public.solicitudes_factura s
       set estado = 'en_proceso', cfdi_id = new.id
     where s.orden_id = new.orden_id and s.estado = 'pendiente';
  end if;
  return new;
end;
$$;
revoke execute on function private.trg_cfdi_solicitud() from public, anon, authenticated;

drop trigger if exists trg_cfdis_solicitud on public.cfdis;
create trigger trg_cfdis_solicitud
  after insert or update of estado, orden_id, serie, folio, uuid on public.cfdis
  for each row execute function private.trg_cfdi_solicitud();

drop trigger if exists trg_cfdis_solicitud_baja on public.cfdis;
create trigger trg_cfdis_solicitud_baja
  before delete on public.cfdis
  for each row execute function private.trg_cfdi_solicitud();
