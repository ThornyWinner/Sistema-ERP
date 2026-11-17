-- =====================================================================
-- aprobacion_disenos.sql — Bocetos y aprobación del diseño por el cliente
-- =====================================================================
-- Flujo (una propuesta = una versión del boceto de un producto de la orden):
--  1. El diseñador (o el admin primario) sube el boceto (imagen o PDF) al bucket privado
--     `disenos` y lo registra con subir_propuesta_diseno(): queda "por enviar" y se
--     avisa al vendedor de la orden. Una versión nueva reemplaza a las anteriores que no
--     estén rechazadas (si el diseño cambia, la aprobación anterior ya no vale).
--  2. El vendedor se lo manda al cliente (enlace temporal o en persona) y lo marca como
--     enviado con marcar_propuesta_enviada().
--  3. El vendedor registra la respuesta del cliente con responder_propuesta_diseno():
--     aprobada (quién, cuándo y por qué medio) o rechazada (con los cambios pedidos).
--     Se avisa a los diseñadores.
--  4. El taller de Diseño no puede marcar el producto como terminado sin una propuesta
--     aprobada vigente (trigger en produccion_taller). El admin primario puede saltarlo.
--
-- Quién: ven las propuestas quienes ven la orden (private.puede_ver_orden: admins, su
-- vendedor y los talleres por los que pasa, que así ven el diseño aprobado). Suben:
-- diseñadores y admin primario. Envían y registran la respuesta: quien puede editar la
-- orden (private.puede_editar_orden: admin primario, y el vendedor / admin secundario
-- dueños de la orden).
--
-- Archivos: disenos/<orden_id>/<orden_detalle_id>/<archivo>.
-- =====================================================================

-- ------------------------------------------------------------------ 1. bucket privado
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('disenos', 'disenos', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Orden de la ruta "<orden_id>/<detalle>/archivo" (null si la ruta no tiene ese formato).
create or replace function private.orden_de_ruta_diseno(p_nombre text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when split_part(p_nombre, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_nombre, '/', 1)::uuid end
$$;

drop policy if exists disenos_lectura on storage.objects;
create policy disenos_lectura on storage.objects for select to authenticated
  using (bucket_id = 'disenos'
         and (select private.puede_ver_orden(private.orden_de_ruta_diseno(name))));

drop policy if exists disenos_alta on storage.objects;
create policy disenos_alta on storage.objects for insert to authenticated
  with check (bucket_id = 'disenos'
              and private.orden_de_ruta_diseno(name) is not null
              and ((select private.current_user_role()) = 'admin_primario'
                   or ((select private.current_user_role()) = 'disenador'
                       and (select private.taller_ve_orden(private.orden_de_ruta_diseno(name))))));

drop policy if exists disenos_baja on storage.objects;
create policy disenos_baja on storage.objects for delete to authenticated
  using (bucket_id = 'disenos' and (select private.current_user_role()) = 'admin_primario');

-- ------------------------------------------------------------------ 2. propuestas
create table if not exists public.propuestas_diseno (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes(id) on delete cascade,
  orden_detalle_id uuid not null references public.orden_detalles(id) on delete cascade,
  version integer not null check (version >= 1),
  archivo_path text not null,
  notas text check (notas is null or char_length(notas) <= 1000),
  estado text not null default 'por_enviar'
    check (estado in ('por_enviar', 'enviada', 'aprobada', 'rechazada', 'reemplazada')),
  subida_por uuid references public.usuarios(id) on delete set null,
  subida_at timestamptz not null default now(),
  enviada_por uuid references public.usuarios(id) on delete set null,
  enviada_at timestamptz,
  canal_envio text,
  -- Respuesta del cliente (la registra el vendedor).
  respuesta_fecha date,
  respuesta_quien text check (respuesta_quien is null or char_length(respuesta_quien) <= 120),
  respuesta_canal text check (respuesta_canal is null
                              or respuesta_canal in ('whatsapp', 'correo', 'telefono', 'presencial', 'otro')),
  respuesta_comentarios text check (respuesta_comentarios is null or char_length(respuesta_comentarios) <= 2000),
  respuesta_registrada_por uuid references public.usuarios(id) on delete set null,
  respuesta_registrada_at timestamptz,
  constraint propuestas_diseno_version_unica unique (orden_detalle_id, version)
);
comment on table public.propuestas_diseno is
  'Versiones del boceto de cada producto de una orden y la respuesta (aprobación o cambios) del cliente.';

create index if not exists propuestas_diseno_orden_idx on public.propuestas_diseno (orden_id);

alter table public.propuestas_diseno enable row level security;

drop policy if exists propuestas_lectura on public.propuestas_diseno;
create policy propuestas_lectura on public.propuestas_diseno for select to authenticated
  using ((select private.puede_ver_orden(orden_id)));

-- Sin insert/update/delete directos: solo con las funciones de abajo.
revoke all on public.propuestas_diseno from anon, authenticated;
grant select on public.propuestas_diseno to authenticated;

-- ------------------------------------------------------------------ 3. avisos (interno)
create or replace function private.avisar_diseno(
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
revoke execute on function private.avisar_diseno(uuid[], text[], text, text, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ 4. subir versión
create or replace function public.subir_propuesta_diseno(p_detalle uuid, p_archivo text, p_notas text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text := private.current_user_role();
  v_orden public.ordenes%rowtype;
  v_producto text;
  v_version integer;
  v_id uuid;
begin
  select o.* into v_orden from public.ordenes o join public.orden_detalles d on d.orden_id = o.id where d.id = p_detalle;
  if not found then
    raise exception 'El producto de la orden no existe';
  end if;
  if not (v_rol = 'admin_primario' or (v_rol = 'disenador' and private.taller_ve_orden(v_orden.id))) then
    raise exception 'Solo el taller de Diseño o el administrador primario suben bocetos' using errcode = '42501';
  end if;
  if not exists (select 1 from public.produccion_taller pt join public.talleres t on t.id = pt.taller_id
                 where pt.orden_detalle_id = p_detalle and t.nombre = 'diseno') then
    raise exception 'Este producto no pasa por el taller de Diseño';
  end if;
  if p_archivo is null or p_archivo not like v_orden.id::text || '/' || p_detalle::text || '/%' then
    raise exception 'Ruta de archivo inválida';
  end if;

  -- Bloquea las propuestas del producto para numerar sin choques.
  perform 1 from public.orden_detalles where id = p_detalle for update;
  select coalesce(max(version), 0) + 1 into v_version from public.propuestas_diseno where orden_detalle_id = p_detalle;

  update public.propuestas_diseno set estado = 'reemplazada'
  where orden_detalle_id = p_detalle and estado in ('por_enviar', 'enviada', 'aprobada');

  insert into public.propuestas_diseno (orden_id, orden_detalle_id, version, archivo_path, notas, subida_por)
  values (v_orden.id, p_detalle, v_version, p_archivo, nullif(btrim(coalesce(p_notas, '')), ''), private.mi_usuario_id())
  returning id into v_id;

  select coalesce(p.nombre, 'Producto') into v_producto
  from public.orden_detalles d left join public.productos p on p.id = d.producto_id where d.id = p_detalle;

  perform private.avisar_diseno(array[v_orden.vendedor_id], '{}',
    format('Boceto listo para el cliente: %s', v_orden.folio),
    format('Diseño subió la versión %s del boceto de "%s". Envíalo al cliente y registra su aprobación desde la orden.',
           v_version, v_producto),
    '/ordenes/' || v_orden.id);

  return jsonb_build_object('id', v_id, 'version', v_version);
end;
$$;

-- ------------------------------------------------------------------ 5. marcar enviada
create or replace function public.marcar_propuesta_enviada(p_id uuid, p_canal text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.propuestas_diseno%rowtype;
begin
  select * into v from public.propuestas_diseno where id = p_id for update;
  if not found then
    raise exception 'La propuesta no existe';
  end if;
  if not private.puede_editar_orden(v.orden_id) then
    raise exception 'Sin permiso para esta orden' using errcode = '42501';
  end if;
  if v.estado not in ('por_enviar', 'enviada') then
    raise exception 'Esta versión ya no está pendiente (estado: %)', v.estado;
  end if;
  update public.propuestas_diseno
  set estado = 'enviada', enviada_at = now(), enviada_por = private.mi_usuario_id(),
      canal_envio = nullif(btrim(coalesce(p_canal, '')), '')
  where id = p_id;
end;
$$;

-- ------------------------------------------------------------------ 6. respuesta del cliente
create or replace function public.responder_propuesta_diseno(
  p_id uuid,
  p_aprobada boolean,
  p_quien text,
  p_canal text,
  p_fecha date default null,
  p_comentarios text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.propuestas_diseno%rowtype;
  v_folio text;
  v_fecha date := coalesce(p_fecha, (private.ahora_local())::date);
begin
  select * into v from public.propuestas_diseno where id = p_id for update;
  if not found then
    raise exception 'La propuesta no existe';
  end if;
  if not private.puede_editar_orden(v.orden_id) then
    raise exception 'Sin permiso para esta orden' using errcode = '42501';
  end if;
  if v.estado not in ('por_enviar', 'enviada') then
    raise exception 'Esta versión ya no está pendiente (estado: %)', v.estado;
  end if;
  if p_aprobada and nullif(btrim(coalesce(p_quien, '')), '') is null then
    raise exception 'Indica quién aprobó el diseño por parte del cliente';
  end if;
  if not p_aprobada and nullif(btrim(coalesce(p_comentarios, '')), '') is null then
    raise exception 'Indica qué cambios pidió el cliente';
  end if;
  if v_fecha > (private.ahora_local())::date or v_fecha < (v.subida_at at time zone 'America/Monterrey')::date then
    raise exception 'La fecha de respuesta debe estar entre la subida del boceto y hoy';
  end if;

  update public.propuestas_diseno
  set estado = case when p_aprobada then 'aprobada' else 'rechazada' end,
      enviada_at = coalesce(enviada_at, now()),
      enviada_por = coalesce(enviada_por, private.mi_usuario_id()),
      respuesta_fecha = v_fecha,
      respuesta_quien = nullif(btrim(coalesce(p_quien, '')), ''),
      respuesta_canal = nullif(btrim(coalesce(p_canal, '')), ''),
      respuesta_comentarios = nullif(btrim(coalesce(p_comentarios, '')), ''),
      respuesta_registrada_por = private.mi_usuario_id(),
      respuesta_registrada_at = now()
  where id = p_id;

  select folio into v_folio from public.ordenes where id = v.orden_id;
  perform private.avisar_diseno(array[v.subida_por], array['disenador'],
    case when p_aprobada then format('Diseño aprobado: %s (v%s)', v_folio, v.version)
         else format('El cliente pidió cambios: %s (v%s)', v_folio, v.version) end,
    case when p_aprobada then format('Aprobado por %s el %s. Ya puede terminarse en Diseño.',
                                     btrim(p_quien), to_char(v_fecha, 'DD/MM/YYYY'))
         else 'Cambios pedidos: ' || btrim(p_comentarios) end,
    '/talleres/diseno');
end;
$$;

revoke execute on function public.subir_propuesta_diseno(uuid, text, text) from public, anon;
revoke execute on function public.marcar_propuesta_enviada(uuid, text) from public, anon;
revoke execute on function public.responder_propuesta_diseno(uuid, boolean, text, text, date, text) from public, anon;
grant execute on function public.subir_propuesta_diseno(uuid, text, text) to authenticated;
grant execute on function public.marcar_propuesta_enviada(uuid, text) to authenticated;
grant execute on function public.responder_propuesta_diseno(uuid, boolean, text, text, date, text) to authenticated;

-- ------------------------------------------------------------------ 7. Diseño requiere aprobación
create or replace function private.exigir_diseno_aprobado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text := private.current_user_role();
begin
  if new.estado = 'completed'
     and old.estado is distinct from 'completed'
     and v_rol is not null
     and v_rol <> 'admin_primario'
     and exists (select 1 from public.talleres t where t.id = new.taller_id and t.nombre = 'diseno')
     and not exists (select 1 from public.propuestas_diseno p
                     where p.orden_detalle_id = new.orden_detalle_id and p.estado = 'aprobada') then
    raise exception 'El cliente aún no aprueba el diseño: sube el boceto y que el vendedor registre su aprobación'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function private.exigir_diseno_aprobado() from public, anon;

drop trigger if exists trg_produccion_exigir_diseno_aprobado on public.produccion_taller;
create trigger trg_produccion_exigir_diseno_aprobado
  before update of estado on public.produccion_taller
  for each row execute function private.exigir_diseno_aprobado();
