-- =============================================================================
-- asistencia.sql — Reloj checador con celular + código QR de la sede.
--
-- Flujo:
--  1. En cada sede (Establecimiento, Taller de Costura, Taller de Bordado) hay un QR
--     que abre /checar?sede=<token>. El empleado entra con su usuario del ERP, se toma
--     una selfie y el navegador envía su ubicación.
--  2. public.registrar_checada valida el QR, que esté dentro del radio de la sede y la
--     selfie; la primera checada del día es la ENTRADA y las siguientes, la SALIDA.
--  3. Retardo: si la entrada pasa de hora_entrada + tolerancia (15 min), se registra
--     automáticamente una incidencia 'retardo' con los minutos tarde (desde la hora de
--     entrada). La salida solo se guarda para las horas trabajadas.
--  4. Falta: cada noche (pg_cron, 00:30 hora de Saltillo) se revisa el día anterior; quien
--     tenía día laboral y no checó entrada recibe una incidencia 'falta_injustificada',
--     salvo día inhábil, vacaciones o una incidencia que ya cubra ese día (incapacidad,
--     permiso, falta justificada, suspensión). Para justificarla después, se cambia su
--     tipo en Incidencias (si se borra y se vuelve a procesar el día, se recrea).
--  5. El control solo aplica a empleados con horario asignado y fecha de inicio de
--     control (empleados.asistencia_desde); antes de esa fecha no se generan incidencias.
--
-- Zona horaria: America/Monterrey (Saltillo, Coahuila; sin horario de verano).
-- =============================================================================

-- ----- Tablas -------------------------------------------------------------------
create table if not exists public.sedes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  latitud double precision check (latitud between -90 and 90),
  longitud double precision check (longitud between -180 and 180),
  radio_m integer not null default 150 check (radio_m between 20 and 2000),
  token_qr text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.horarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  sede_id uuid not null references public.sedes (id) on delete restrict,
  tolerancia_min integer not null default 15 check (tolerancia_min between 0 and 120),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.horario_dias (
  horario_id uuid not null references public.horarios (id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 1 and 7),  -- ISO: 1 = lunes … 7 = domingo
  hora_entrada time not null,
  hora_salida time not null,
  primary key (horario_id, dia_semana),
  check (hora_salida > hora_entrada)
);

alter table public.empleados
  add column if not exists horario_id uuid references public.horarios (id) on delete set null,
  add column if not exists asistencia_desde date;

create table if not exists public.checadas (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados (id) on delete cascade,
  sede_id uuid references public.sedes (id) on delete set null,
  tipo text not null check (tipo in ('entrada', 'salida')),
  fecha date not null,                                  -- día local (America/Monterrey)
  fecha_hora timestamptz not null default now(),
  latitud double precision,
  longitud double precision,
  precision_m real,
  distancia_m real,
  foto_path text,
  origen text not null default 'qr' check (origen in ('qr', 'manual')),
  registrado_por uuid references public.usuarios (id) on delete set null,
  notas text,
  created_at timestamptz not null default now()
);
create index if not exists idx_checadas_empleado_fecha on public.checadas (empleado_id, fecha);
create index if not exists idx_checadas_fecha on public.checadas (fecha);
create index if not exists idx_checadas_sede on public.checadas (sede_id);
create index if not exists idx_checadas_registrado_por on public.checadas (registrado_por);
create index if not exists idx_horarios_sede on public.horarios (sede_id);
create index if not exists idx_empleados_horario on public.empleados (horario_id);

create table if not exists public.dias_inhabiles (
  fecha date primary key,
  descripcion text not null
);

-- Incidencias generadas por el checador (para distinguirlas y no duplicarlas).
alter table public.incidencias
  add column if not exists origen text not null default 'manual' check (origen in ('manual', 'checador')),
  add column if not exists checada_id uuid references public.checadas (id) on delete set null;
create unique index if not exists uq_incidencias_checador
  on public.incidencias (empleado_id, fecha_inicio, tipo) where origen = 'checador';
create index if not exists idx_incidencias_checada on public.incidencias (checada_id);

comment on table public.sedes is
  'Lugares de trabajo donde se checa asistencia: ubicación (latitud/longitud), radio permitido en metros y token del código QR que abre /checar.';
comment on table public.horarios is
  'Horarios de trabajo (p. ej. Taller de Costura, Bordado turno diurno) con su sede y minutos de tolerancia para la entrada.';
comment on table public.horario_dias is
  'Días laborales de cada horario (ISO: 1 = lunes … 7 = domingo) con su hora de entrada y salida.';
comment on table public.checadas is
  'Registro de entradas y salidas del personal (reloj checador por QR + selfie + ubicación, o captura manual del administrador).';
comment on table public.dias_inhabiles is
  'Días de descanso obligatorio (Art. 74 LFT) y otros días no laborables de la empresa: no generan faltas.';

-- ----- Datos iniciales ------------------------------------------------------------
insert into public.sedes (nombre) values ('Establecimiento'), ('Taller de Costura'), ('Taller de Bordado')
on conflict (nombre) do nothing;

insert into public.horarios (nombre, sede_id, tolerancia_min)
select h.nombre, s.id, 15
from (values ('Establecimiento', 'Establecimiento'),
             ('Taller de Costura', 'Taller de Costura'),
             ('Bordado - turno diurno', 'Taller de Bordado'),
             ('Bordado - turno vespertino', 'Taller de Bordado')) h (nombre, sede)
join public.sedes s on s.nombre = h.sede
on conflict (nombre) do nothing;

insert into public.horario_dias (horario_id, dia_semana, hora_entrada, hora_salida)
select h.id, d.dia, d.entrada::time, d.salida::time
from (values
  -- Establecimiento: L-V 09:00-18:00, sábado 10:00-14:00
  ('Establecimiento', 1, '09:00', '18:00'), ('Establecimiento', 2, '09:00', '18:00'),
  ('Establecimiento', 3, '09:00', '18:00'), ('Establecimiento', 4, '09:00', '18:00'),
  ('Establecimiento', 5, '09:00', '18:00'), ('Establecimiento', 6, '10:00', '14:00'),
  -- Taller de Costura: L-V 08:00-17:00, sábado 08:00-12:00
  ('Taller de Costura', 1, '08:00', '17:00'), ('Taller de Costura', 2, '08:00', '17:00'),
  ('Taller de Costura', 3, '08:00', '17:00'), ('Taller de Costura', 4, '08:00', '17:00'),
  ('Taller de Costura', 5, '08:00', '17:00'), ('Taller de Costura', 6, '08:00', '12:00'),
  -- Bordado diurno: L, Mi, V 08:00-16:00; Ma, J 08:00-17:00; sábado 08:00-14:00
  ('Bordado - turno diurno', 1, '08:00', '16:00'), ('Bordado - turno diurno', 2, '08:00', '17:00'),
  ('Bordado - turno diurno', 3, '08:00', '16:00'), ('Bordado - turno diurno', 4, '08:00', '17:00'),
  ('Bordado - turno diurno', 5, '08:00', '16:00'), ('Bordado - turno diurno', 6, '08:00', '14:00'),
  -- Bordado vespertino: L-V 13:00-20:00; sábado 08:00-14:00
  ('Bordado - turno vespertino', 1, '13:00', '20:00'), ('Bordado - turno vespertino', 2, '13:00', '20:00'),
  ('Bordado - turno vespertino', 3, '13:00', '20:00'), ('Bordado - turno vespertino', 4, '13:00', '20:00'),
  ('Bordado - turno vespertino', 5, '13:00', '20:00'), ('Bordado - turno vespertino', 6, '08:00', '14:00')
) d (horario, dia, entrada, salida)
join public.horarios h on h.nombre = d.horario
on conflict (horario_id, dia_semana) do nothing;

-- Días de descanso obligatorio (Art. 74 LFT) 2026-2027.
insert into public.dias_inhabiles (fecha, descripcion) values
  ('2026-01-01', 'Año Nuevo'), ('2026-02-02', 'Día de la Constitución'),
  ('2026-03-16', 'Natalicio de Benito Juárez'), ('2026-05-01', 'Día del Trabajo'),
  ('2026-09-16', 'Día de la Independencia'), ('2026-11-16', 'Revolución Mexicana'),
  ('2026-12-25', 'Navidad'),
  ('2027-01-01', 'Año Nuevo'), ('2027-02-01', 'Día de la Constitución'),
  ('2027-03-15', 'Natalicio de Benito Juárez'), ('2027-05-01', 'Día del Trabajo'),
  ('2027-09-16', 'Día de la Independencia'), ('2027-11-15', 'Revolución Mexicana'),
  ('2027-12-25', 'Navidad')
on conflict (fecha) do nothing;

-- Horario por puesto donde no hay duda (todos en el Taller de Costura). Vendedores,
-- administradores y bordadores se asignan desde la pantalla Asistencia. El control
-- empieza cuando el administrador captura asistencia_desde.
update public.empleados e
   set horario_id = (select id from public.horarios where nombre = 'Taller de Costura')
  from public.usuarios u join public.roles r on r.id = u.rol_id
 where e.usuario_id = u.id and e.horario_id is null
   and r.nombre in ('costurera', 'cortador', 'sublimador', 'disenador');

-- ----- Funciones auxiliares ------------------------------------------------------
create or replace function private.ahora_local()
returns timestamp
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'America/Monterrey') $$;

-- Distancia en metros entre dos puntos (fórmula de Haversine).
create or replace function private.distancia_m(lat1 double precision, lon1 double precision,
                                               lat2 double precision, lon2 double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371000 * asin(sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2) +
           cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)))
$$;

-- ¿El día está cubierto por algo que justifica no checar o llegar tarde?
-- (día inhábil, vacaciones o una incidencia manual/justificante que lo abarque)
create or replace function private.dia_justificado(p_empleado uuid, p_fecha date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.dias_inhabiles d where d.fecha = p_fecha)
      or exists (select 1 from public.vacaciones v
                 where v.empleado_id = p_empleado and p_fecha between v.fecha_inicio and v.fecha_fin)
      or exists (select 1 from public.incidencias i
                 where i.empleado_id = p_empleado and p_fecha between i.fecha_inicio and i.fecha_fin
                   and i.tipo in ('incapacidad', 'permiso_con_goce', 'permiso_sin_goce',
                                  'falta_justificada', 'suspension', 'falta_injustificada'))
$$;

-- Evalúa la entrada de un empleado y, si es retardo, registra la incidencia.
-- Devuelve los minutos de retardo (null si llegó a tiempo o no aplica).
create or replace function private.evaluar_entrada(p_checada uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.checadas%rowtype;
  v_e public.empleados%rowtype;
  v_h public.horarios%rowtype;
  v_dia public.horario_dias%rowtype;
  v_hora time;
  v_min integer;
begin
  select * into v_c from public.checadas where id = p_checada;
  if v_c.tipo <> 'entrada' then return null; end if;
  select * into v_e from public.empleados where id = v_c.empleado_id;
  if v_e.horario_id is null or v_e.asistencia_desde is null or v_c.fecha < v_e.asistencia_desde then
    return null;
  end if;
  select * into v_h from public.horarios where id = v_e.horario_id;
  select * into v_dia from public.horario_dias
   where horario_id = v_e.horario_id and dia_semana = extract(isodow from v_c.fecha);
  if not found then return null; end if;                      -- día de descanso
  if private.dia_justificado(v_e.id, v_c.fecha)
     and not exists (select 1 from public.incidencias i       -- una falta automática no justifica
                     where i.empleado_id = v_e.id and i.fecha_inicio = v_c.fecha
                       and i.tipo = 'falta_injustificada' and i.origen = 'checador') then
    return null;
  end if;

  v_hora := (v_c.fecha_hora at time zone 'America/Monterrey')::time;
  v_min := floor(extract(epoch from (v_hora - v_dia.hora_entrada)) / 60)::integer;
  if v_min <= v_h.tolerancia_min then
    return null;
  end if;

  insert into public.incidencias
    (empleado_id, tipo, fecha_inicio, fecha_fin, minutos_retardo, motivo, registrado_por, origen, checada_id)
  values
    (v_e.id, 'retardo', v_c.fecha, v_c.fecha, v_min,
     format('Registrado por el checador: entrada a las %s (horario %s, tolerancia %s min).',
            to_char(v_hora, 'HH24:MI'), to_char(v_dia.hora_entrada, 'HH24:MI'), v_h.tolerancia_min),
     null, 'checador', v_c.id)
  on conflict (empleado_id, fecha_inicio, tipo) where origen = 'checador' do nothing;
  return v_min;
end;
$$;

-- Genera las faltas de los días [p_desde, p_hasta] (solo días ya terminados).
-- Devuelve cuántas faltas registró.
create or replace function private.procesar_faltas(p_desde date, p_hasta date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date := private.ahora_local()::date;
  v_hasta date := least(p_hasta, v_hoy - 1);
  v_total integer := 0;
  v_n integer;
begin
  if p_desde is null or v_hasta is null or p_desde > v_hasta then
    return 0;
  end if;
  insert into public.incidencias (empleado_id, tipo, fecha_inicio, fecha_fin, motivo, registrado_por, origen)
  select e.id, 'falta_injustificada', f.fecha::date, f.fecha::date,
         format('Registrada por el checador: sin checada de entrada en día laboral (%s, entrada %s).',
                h.nombre, to_char(hd.hora_entrada, 'HH24:MI')),
         null, 'checador'
  from public.empleados e
  join public.horarios h on h.id = e.horario_id
  cross join generate_series(greatest(p_desde, coalesce(e.asistencia_desde, p_desde)), v_hasta, interval '1 day') f (fecha)
  join public.horario_dias hd on hd.horario_id = h.id and hd.dia_semana = extract(isodow from f.fecha)
  where e.activo
    and e.asistencia_desde is not null
    and f.fecha::date >= e.fecha_ingreso
    and (e.fecha_baja is null or f.fecha::date <= e.fecha_baja)
    and not exists (select 1 from public.checadas c
                    where c.empleado_id = e.id and c.fecha = f.fecha::date and c.tipo = 'entrada')
    and not private.dia_justificado(e.id, f.fecha::date)
  on conflict (empleado_id, fecha_inicio, tipo) where origen = 'checador' do nothing;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;
  return v_total;
end;
$$;

-- Inserta una checada y aplica sus efectos (entrada: retardo; entrada que llega
-- después de procesar el día: quita la falta automática de ese día).
create or replace function private.insertar_checada(
  p_empleado uuid, p_sede uuid, p_fecha_hora timestamptz, p_tipo text,
  p_lat double precision, p_lng double precision, p_precision real, p_distancia real,
  p_foto text, p_origen text, p_notas text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha date := (p_fecha_hora at time zone 'America/Monterrey')::date;
  v_tipo text := p_tipo;
  v_id uuid;
  v_retardo integer;
begin
  if v_tipo is null then
    v_tipo := case when exists (select 1 from public.checadas
                                where empleado_id = p_empleado and fecha = v_fecha and tipo = 'entrada')
                   then 'salida' else 'entrada' end;
  end if;

  insert into public.checadas
    (empleado_id, sede_id, tipo, fecha, fecha_hora, latitud, longitud, precision_m, distancia_m,
     foto_path, origen, registrado_por, notas)
  values
    (p_empleado, p_sede, v_tipo, v_fecha, p_fecha_hora, p_lat, p_lng, p_precision, p_distancia,
     p_foto, p_origen, private.mi_usuario_id(), nullif(trim(p_notas), ''))
  returning id into v_id;

  if v_tipo = 'entrada' then
    -- Si ese día ya se había marcado falta automática, la entrada la reemplaza.
    delete from public.incidencias
     where empleado_id = p_empleado and fecha_inicio = v_fecha
       and tipo = 'falta_injustificada' and origen = 'checador';
    v_retardo := private.evaluar_entrada(v_id);
  end if;

  return jsonb_build_object('id', v_id, 'tipo', v_tipo, 'fecha', v_fecha,
                            'hora', to_char(p_fecha_hora at time zone 'America/Monterrey', 'HH24:MI'),
                            'retardo_min', v_retardo);
end;
$$;

-- ----- Funciones públicas (RPC) ---------------------------------------------------

-- Pantalla /checar: quién soy, la sede del QR, mi horario de hoy y mis checadas de hoy.
create or replace function public.mi_asistencia_hoy(p_token text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e public.empleados%rowtype;
  v_sede public.sedes%rowtype;
  v_hoy date := private.ahora_local()::date;
  v_horario jsonb;
begin
  select * into v_e from public.empleados
   where usuario_id = private.mi_usuario_id() and activo and fecha_baja is null
   limit 1;
  if p_token is not null then
    select * into v_sede from public.sedes where token_qr = p_token and activo;
  end if;
  if v_e.id is not null then
    select jsonb_build_object('nombre', h.nombre, 'tolerancia_min', h.tolerancia_min,
                              'entrada', to_char(hd.hora_entrada, 'HH24:MI'), 'salida', to_char(hd.hora_salida, 'HH24:MI'))
      into v_horario
    from public.horarios h
    left join public.horario_dias hd on hd.horario_id = h.id and hd.dia_semana = extract(isodow from v_hoy)
    where h.id = v_e.horario_id;
  end if;
  return jsonb_build_object(
    'empleado', case when v_e.id is null then null
                     else jsonb_build_object('id', v_e.id, 'nombre', v_e.nombre, 'puesto', v_e.puesto) end,
    'sede', case when v_sede.id is null then null
                 else jsonb_build_object('nombre', v_sede.nombre,
                                         'configurada', v_sede.latitud is not null and v_sede.longitud is not null,
                                         'radio_m', v_sede.radio_m) end,
    'hoy', v_hoy,
    'inhabil', (select descripcion from public.dias_inhabiles where fecha = v_hoy),
    'horario', v_horario,
    'checadas', coalesce((select jsonb_agg(jsonb_build_object(
                            'tipo', c.tipo,
                            'hora', to_char(c.fecha_hora at time zone 'America/Monterrey', 'HH24:MI'),
                            'sede', s.nombre) order by c.fecha_hora)
                          from public.checadas c left join public.sedes s on s.id = c.sede_id
                          where c.empleado_id = v_e.id and c.fecha = v_hoy), '[]'::jsonb)
  );
end;
$$;

-- Checada del empleado con QR + ubicación + selfie.
create or replace function public.registrar_checada(
  p_token text, p_lat double precision, p_lng double precision, p_precision real, p_foto_path text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.empleados%rowtype;
  v_sede public.sedes%rowtype;
  v_dist double precision;
  v_ultima timestamptz;
  v_res jsonb;
begin
  select * into v_e from public.empleados
   where usuario_id = private.mi_usuario_id() and activo and fecha_baja is null
   limit 1;
  if v_e.id is null then
    raise exception 'Tu usuario no está vinculado a un empleado activo. Avisa al administrador.';
  end if;

  select * into v_sede from public.sedes where token_qr = p_token and activo;
  if v_sede.id is null then
    raise exception 'El código QR no es válido o fue reemplazado. Escanea el QR vigente de la sede.';
  end if;
  if v_sede.latitud is null or v_sede.longitud is null then
    raise exception 'La sede % aún no tiene ubicación configurada. Avisa al administrador.', v_sede.nombre;
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'No se recibió tu ubicación. Activa la ubicación del celular e inténtalo de nuevo.';
  end if;

  v_dist := private.distancia_m(v_sede.latitud, v_sede.longitud, p_lat, p_lng);
  -- Se descuenta la imprecisión del GPS (hasta 100 m) antes de comparar con el radio.
  if v_dist - least(coalesce(p_precision, 0), 100) > v_sede.radio_m then
    raise exception 'Estás a % m de %; debes estar a menos de % m para checar.',
      round(v_dist), v_sede.nombre, v_sede.radio_m;
  end if;

  if coalesce(p_foto_path, '') = '' or split_part(p_foto_path, '/', 1) <> v_e.id::text then
    raise exception 'Falta la foto de la checada.';
  end if;

  select max(fecha_hora) into v_ultima from public.checadas where empleado_id = v_e.id;
  if v_ultima is not null and now() - v_ultima < interval '2 minutes' then
    raise exception 'Ya registraste una checada hace un momento.';
  end if;

  v_res := private.insertar_checada(v_e.id, v_sede.id, now(), null, p_lat, p_lng, p_precision,
                                    v_dist::real, p_foto_path, 'qr', null);
  return v_res || jsonb_build_object('sede', v_sede.nombre, 'distancia_m', round(v_dist));
end;
$$;

-- Checada manual del administrador (celular sin batería, olvido, corrección).
create or replace function public.registrar_checada_manual(
  p_empleado uuid, p_fecha_hora timestamptz, p_tipo text, p_notas text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.empleados%rowtype;
  v_sede uuid;
begin
  if private.current_user_role() is distinct from 'admin_primario' then
    raise exception 'Solo el administrador primario puede capturar checadas manuales' using errcode = '42501';
  end if;
  if p_tipo not in ('entrada', 'salida') then
    raise exception 'Tipo de checada no válido';
  end if;
  if p_fecha_hora > now() + interval '5 minutes' then
    raise exception 'No se pueden registrar checadas en el futuro';
  end if;
  if coalesce(trim(p_notas), '') = '' then
    raise exception 'Escribe el motivo de la checada manual';
  end if;
  select * into v_e from public.empleados where id = p_empleado;
  if v_e.id is null then
    raise exception 'El empleado no existe';
  end if;
  select h.sede_id into v_sede from public.horarios h where h.id = v_e.horario_id;
  return private.insertar_checada(v_e.id, v_sede, p_fecha_hora, p_tipo, null, null, null, null,
                                  null, 'manual', p_notas);
end;
$$;

-- Procesar faltas a mano (p. ej. para revisar un periodo); el cron lo hace cada noche.
create or replace function public.procesar_faltas(p_desde date, p_hasta date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.current_user_role() is distinct from 'admin_primario' then
    raise exception 'Solo el administrador primario puede procesar faltas' using errcode = '42501';
  end if;
  if p_hasta - p_desde > 62 then
    raise exception 'Procesa como máximo dos meses a la vez';
  end if;
  return private.procesar_faltas(p_desde, p_hasta);
end;
$$;

-- Nuevo QR de una sede (el anterior deja de funcionar).
create or replace function public.regenerar_qr_sede(p_sede uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  if private.current_user_role() is distinct from 'admin_primario' then
    raise exception 'Solo el administrador primario puede regenerar el QR' using errcode = '42501';
  end if;
  update public.sedes set token_qr = v_token where id = p_sede;
  return v_token;
end;
$$;

revoke execute on function public.mi_asistencia_hoy(text) from public, anon;
revoke execute on function public.registrar_checada(text, double precision, double precision, real, text) from public, anon;
revoke execute on function public.registrar_checada_manual(uuid, timestamptz, text, text) from public, anon;
revoke execute on function public.procesar_faltas(date, date) from public, anon;
revoke execute on function public.regenerar_qr_sede(uuid) from public, anon;
grant execute on function public.mi_asistencia_hoy(text) to authenticated;
grant execute on function public.registrar_checada(text, double precision, double precision, real, text) to authenticated;
grant execute on function public.registrar_checada_manual(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.procesar_faltas(date, date) to authenticated;
grant execute on function public.regenerar_qr_sede(uuid) to authenticated;

revoke execute on function private.insertar_checada(uuid, uuid, timestamptz, text, double precision, double precision, real, real, text, text, text) from public, anon, authenticated;
revoke execute on function private.evaluar_entrada(uuid) from public, anon, authenticated;
revoke execute on function private.procesar_faltas(date, date) from public, anon, authenticated;

-- ----- RLS ---------------------------------------------------------------------------
alter table public.sedes enable row level security;
alter table public.horarios enable row level security;
alter table public.horario_dias enable row level security;
alter table public.checadas enable row level security;
alter table public.dias_inhabiles enable row level security;

-- Configuración (sedes con su token QR, horarios): solo el admin primario.
create policy admin_todo on public.sedes for all to authenticated
  using ((select private.current_user_role()) = 'admin_primario')
  with check ((select private.current_user_role()) = 'admin_primario');
create policy admin_todo on public.horarios for all to authenticated
  using ((select private.current_user_role()) = 'admin_primario')
  with check ((select private.current_user_role()) = 'admin_primario');
create policy admin_todo on public.horario_dias for all to authenticated
  using ((select private.current_user_role()) = 'admin_primario')
  with check ((select private.current_user_role()) = 'admin_primario');

-- Checadas: el admin primario ve todas; cada empleado, las suyas. Se insertan solo
-- por las funciones (registrar_checada / registrar_checada_manual).
create policy lectura on public.checadas for select to authenticated
  using ((select private.current_user_role()) = 'admin_primario'
         or empleado_id in (select e.id from public.empleados e where e.usuario_id = (select private.mi_usuario_id())));
create policy edicion_admin on public.checadas for update to authenticated
  using ((select private.current_user_role()) = 'admin_primario')
  with check ((select private.current_user_role()) = 'admin_primario');
create policy baja_admin on public.checadas for delete to authenticated
  using ((select private.current_user_role()) = 'admin_primario');

-- Días inhábiles: todos los consultan; solo el admin primario los modifica.
create policy lectura on public.dias_inhabiles for select to authenticated using (true);
create policy alta_admin on public.dias_inhabiles for insert to authenticated
  with check ((select private.current_user_role()) = 'admin_primario');
create policy edicion_admin on public.dias_inhabiles for update to authenticated
  using ((select private.current_user_role()) = 'admin_primario')
  with check ((select private.current_user_role()) = 'admin_primario');
create policy baja_admin on public.dias_inhabiles for delete to authenticated
  using ((select private.current_user_role()) = 'admin_primario');

-- ----- Storage: selfies de las checadas (bucket privado) ------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('asistencia', 'asistencia', false, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Cada empleado sube solo a su carpeta (<empleado_id>/...); el admin primario ve todas.
create policy asistencia_alta on storage.objects for insert to authenticated
  with check (bucket_id = 'asistencia'
              and (storage.foldername(name))[1] in (select e.id::text from public.empleados e
                                                    where e.usuario_id = (select private.mi_usuario_id())));
create policy asistencia_lectura on storage.objects for select to authenticated
  using (bucket_id = 'asistencia'
         and ((select private.current_user_role()) = 'admin_primario'
              or (storage.foldername(name))[1] in (select e.id::text from public.empleados e
                                                   where e.usuario_id = (select private.mi_usuario_id()))));
create policy asistencia_baja on storage.objects for delete to authenticated
  using (bucket_id = 'asistencia' and (select private.current_user_role()) = 'admin_primario');

-- ----- Proceso nocturno de faltas (00:30 hora de Saltillo = 06:30 UTC) -----------------
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'asistencia-faltas-diarias',
  '30 6 * * *',
  $$select private.procesar_faltas(private.ahora_local()::date - 1, private.ahora_local()::date - 1)$$
);
