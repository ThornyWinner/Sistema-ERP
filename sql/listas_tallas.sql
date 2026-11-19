-- =====================================================================
-- listas_tallas.sql — Enlace para que el cliente capture las tallas de su personal
-- =====================================================================
-- El vendedor arma una lista (cliente, productos, colores y tallas disponibles) y le
-- manda el enlace https://<sistema>/captura-tallas/<token> al contacto del cliente. Cada
-- empleado abre el enlace SIN iniciar sesión, escribe su nombre y elige su talla de cada
-- prenda. El vendedor ve el concentrado (piezas por producto y talla) y crea la orden
-- con un clic.
--
--  - listas_tallas: la lista. productos es un arreglo de
--      {clave, nombre, color, tallas: [..], tipoPrenda, productoId, precioUnitario}
--    (el enlace público solo muestra clave, nombre, color y tallas).
--  - listas_tallas_respuestas: una fila por persona; tallas = {clave: talla}.
--    Si alguien vuelve a mandar el mismo nombre, se actualiza su respuesta.
--  - public.lista_tallas_publica(token) y public.registrar_tallas_publica(...): lo que
--    usa el enlace (rol anon). Solo listas abiertas y antes de la fecha de cierre; hasta
--    1,000 respuestas por lista.
--
-- Permisos: el vendedor ve y edita sus listas; los admins, todas.
-- =====================================================================

-- ------------------------------------------------------------------ 1. tablas
create table if not exists public.listas_tallas (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  vendedor_id uuid not null references public.usuarios(id) default private.mi_usuario_id(),
  cliente_id uuid references public.clientes(id) on delete set null,
  cliente_nombre text not null check (length(trim(cliente_nombre)) between 1 and 200),
  titulo text not null check (length(trim(titulo)) between 1 and 150),
  instrucciones text check (length(instrucciones) <= 1000),
  productos jsonb not null check (
    jsonb_typeof(productos) = 'array' and jsonb_array_length(productos) between 1 and 20
  ),
  cierra date,
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  orden_id uuid references public.ordenes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.listas_tallas is
  'Listas de tallas que el cliente llena desde un enlace público (/captura-tallas/<token>).';

create index if not exists listas_tallas_vendedor on public.listas_tallas (vendedor_id, created_at desc);
create index if not exists listas_tallas_cliente on public.listas_tallas (cliente_id);
create index if not exists listas_tallas_orden on public.listas_tallas (orden_id);

create table if not exists public.listas_tallas_respuestas (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.listas_tallas(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) between 2 and 120),
  area text check (length(area) <= 120),
  tallas jsonb not null check (jsonb_typeof(tallas) = 'object'),
  notas text check (length(notas) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.listas_tallas_respuestas is
  'Una fila por persona: su talla de cada producto de la lista ({clave: talla}).';

create unique index if not exists listas_tallas_respuestas_nombre
  on public.listas_tallas_respuestas (lista_id, lower(trim(nombre)));

-- Cliente ligado por razón social (como en las órdenes) y fecha de modificación.
create or replace function private.trg_listas_tallas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.cliente_nombre := trim(new.cliente_nombre);
  new.titulo := trim(new.titulo);
  new.instrucciones := nullif(trim(new.instrucciones), '');
  new.updated_at := now();
  if tg_op = 'INSERT' or new.cliente_nombre is distinct from old.cliente_nombre then
    select id into new.cliente_id from public.clientes
    where upper(trim(razon_social)) = upper(new.cliente_nombre)
    order by created_at limit 1;
  end if;
  return new;
end;
$$;
revoke execute on function private.trg_listas_tallas() from public, anon, authenticated;

drop trigger if exists trg_listas_tallas on public.listas_tallas;
create trigger trg_listas_tallas
  before insert or update on public.listas_tallas
  for each row execute function private.trg_listas_tallas();

-- ------------------------------------------------------------------ 2. permisos
alter table public.listas_tallas enable row level security;
alter table public.listas_tallas_respuestas enable row level security;

create or replace function private.puede_ver_lista_tallas(p_lista uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.listas_tallas l
    where l.id = p_lista
      and (private.current_user_role() in ('admin_primario', 'admin_secundario')
           or l.vendedor_id = private.mi_usuario_id())
  )
$$;
revoke execute on function private.puede_ver_lista_tallas(uuid) from public, anon;
grant execute on function private.puede_ver_lista_tallas(uuid) to authenticated;

drop policy if exists lectura on public.listas_tallas;
create policy lectura on public.listas_tallas for select to authenticated
  using (
    (select private.current_user_role()) in ('admin_primario', 'admin_secundario')
    or vendedor_id = (select private.mi_usuario_id())
  );

drop policy if exists alta on public.listas_tallas;
create policy alta on public.listas_tallas for insert to authenticated
  with check (
    (select private.current_user_role()) in ('admin_primario', 'admin_secundario', 'vendedor')
    and vendedor_id = (select private.mi_usuario_id())
  );

drop policy if exists edicion on public.listas_tallas;
create policy edicion on public.listas_tallas for update to authenticated
  using (
    (select private.current_user_role()) = 'admin_primario'
    or vendedor_id = (select private.mi_usuario_id())
  )
  with check (
    (select private.current_user_role()) = 'admin_primario'
    or vendedor_id = (select private.mi_usuario_id())
  );

drop policy if exists baja on public.listas_tallas;
create policy baja on public.listas_tallas for delete to authenticated
  using (
    (select private.current_user_role()) = 'admin_primario'
    or vendedor_id = (select private.mi_usuario_id())
  );

drop policy if exists lectura on public.listas_tallas_respuestas;
create policy lectura on public.listas_tallas_respuestas for select to authenticated
  using ((select private.puede_ver_lista_tallas(lista_id)));

-- El dueño de la lista (o el admin primario) también puede capturar o corregir a mano
-- (alguien le dictó su talla) y borrar respuestas.
create or replace function private.puede_editar_lista_tallas(p_lista uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.listas_tallas l
    where l.id = p_lista
      and (private.current_user_role() = 'admin_primario' or l.vendedor_id = private.mi_usuario_id())
  )
$$;
revoke execute on function private.puede_editar_lista_tallas(uuid) from public, anon;
grant execute on function private.puede_editar_lista_tallas(uuid) to authenticated;

drop policy if exists escritura on public.listas_tallas_respuestas;
drop policy if exists alta on public.listas_tallas_respuestas;
create policy alta on public.listas_tallas_respuestas for insert to authenticated
  with check ((select private.puede_editar_lista_tallas(lista_id)));
drop policy if exists edicion on public.listas_tallas_respuestas;
create policy edicion on public.listas_tallas_respuestas for update to authenticated
  using ((select private.puede_editar_lista_tallas(lista_id)))
  with check ((select private.puede_editar_lista_tallas(lista_id)));
drop policy if exists baja on public.listas_tallas_respuestas;
create policy baja on public.listas_tallas_respuestas for delete to authenticated
  using ((select private.puede_editar_lista_tallas(lista_id)));

revoke all on public.listas_tallas, public.listas_tallas_respuestas from anon;
grant select, insert, update, delete on public.listas_tallas, public.listas_tallas_respuestas to authenticated;

-- ------------------------------------------------------------------ 3. enlace público
create or replace function public.lista_tallas_publica(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.listas_tallas%rowtype;
  v_hoy date := (private.ahora_local())::date;
begin
  select * into l from public.listas_tallas where token = p_token;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'titulo', l.titulo,
    'cliente', l.cliente_nombre,
    'instrucciones', l.instrucciones,
    'cierra', l.cierra,
    'abierta', l.estado = 'abierta' and (l.cierra is null or l.cierra >= v_hoy),
    'empresa', (select coalesce(e.nombre_comercial, e.razon_social) from public.empresa_fiscal e limit 1),
    'productos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'clave', p ->> 'clave',
               'nombre', p ->> 'nombre',
               'color', p ->> 'color',
               'tallas', coalesce(p -> 'tallas', '[]'::jsonb))), '[]'::jsonb)
      from jsonb_array_elements(l.productos) p),
    -- Quién ya capturó (solo el nombre), para no repetirse.
    'capturados', (
      select coalesce(jsonb_agg(r.nombre order by r.nombre), '[]'::jsonb)
      from public.listas_tallas_respuestas r where r.lista_id = l.id)
  );
end;
$$;
revoke execute on function public.lista_tallas_publica(uuid) from public;
grant execute on function public.lista_tallas_publica(uuid) to anon, authenticated;

create or replace function public.registrar_tallas_publica(
  p_token uuid,
  p_nombre text,
  p_area text,
  p_tallas jsonb,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listas_tallas%rowtype;
  v_nombre text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_tallas jsonb := '{}'::jsonb;
  p jsonb;
  v_talla text;
  v_existia boolean;
begin
  select * into l from public.listas_tallas where token = p_token for share;
  if not found then
    raise exception 'El enlace no es válido';
  end if;
  if l.estado <> 'abierta' or (l.cierra is not null and l.cierra < (private.ahora_local())::date) then
    raise exception 'Esta lista ya se cerró. Comunícate con tu contacto para cualquier cambio.';
  end if;
  if length(v_nombre) < 2 or length(v_nombre) > 120 then
    raise exception 'Escribe tu nombre completo';
  end if;
  if p_tallas is null or jsonb_typeof(p_tallas) <> 'object' then
    raise exception 'Elige tus tallas';
  end if;

  -- Solo productos de la lista y tallas disponibles de cada uno.
  for p in select * from jsonb_array_elements(l.productos) loop
    v_talla := nullif(trim(p_tallas ->> (p ->> 'clave')), '');
    if v_talla is not null then
      if not exists (select 1 from jsonb_array_elements_text(coalesce(p -> 'tallas', '[]'::jsonb)) t where t = v_talla) then
        raise exception 'La talla % no está disponible para %', v_talla, p ->> 'nombre';
      end if;
      v_tallas := v_tallas || jsonb_build_object(p ->> 'clave', v_talla);
    end if;
  end loop;
  if v_tallas = '{}'::jsonb then
    raise exception 'Elige la talla de al menos una prenda';
  end if;

  v_existia := exists (select 1 from public.listas_tallas_respuestas r
                       where r.lista_id = l.id and lower(trim(r.nombre)) = lower(v_nombre));
  if not v_existia and (select count(*) from public.listas_tallas_respuestas r where r.lista_id = l.id) >= 1000 then
    raise exception 'La lista ya está llena. Comunícate con tu contacto.';
  end if;

  insert into public.listas_tallas_respuestas (lista_id, nombre, area, tallas, notas)
  values (l.id, v_nombre, left(nullif(trim(p_area), ''), 120), v_tallas, left(nullif(trim(p_notas), ''), 300))
  on conflict (lista_id, lower(trim(nombre))) do update
    set area = excluded.area, tallas = excluded.tallas, notas = excluded.notas, updated_at = now();

  return jsonb_build_object('actualizado', v_existia, 'nombre', v_nombre);
end;
$$;
revoke execute on function public.registrar_tallas_publica(uuid, text, text, jsonb, text) from public;
grant execute on function public.registrar_tallas_publica(uuid, text, text, jsonb, text) to anon, authenticated;
