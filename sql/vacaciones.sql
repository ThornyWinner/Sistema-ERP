-- =============================================================================
-- vacaciones.sql — Control de vacaciones conforme a la Ley Federal del Trabajo (LFT).
--
--  empleados   catálogo de personal (puede o no tener usuario en el sistema).
--  vacaciones  periodos de vacaciones otorgados, ligados al año de servicio que cubren.
--
-- Reglas que se validan aquí (además de en la app):
--  - Días por año de servicio según el Art. 76 (reforma 2023).
--  - Solo se pueden tomar después de cumplir el año de servicio correspondiente.
--  - No se pueden otorgar más días de los que corresponden a ese año.
--  - Un empleado no puede tener dos periodos de vacaciones que se traslapen.
--  - Prima vacacional mínima de 25 % (Art. 80).
-- Acceso: solo el administrador primario (incluye datos de salario).
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

create table public.empleados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  puesto text,
  fecha_ingreso date not null,
  salario_diario numeric(10,2) not null default 0 check (salario_diario >= 0),
  porcentaje_prima numeric(5,2) not null default 25
    check (porcentaje_prima >= 25 and porcentaje_prima <= 100),
  usuario_id uuid unique references public.usuarios(id) on delete set null,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now()
);

create table public.vacaciones (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  -- Año de servicio que cubren (1 = vacaciones ganadas al cumplir el primer año).
  anio_servicio integer not null check (anio_servicio >= 1),
  fecha_inicio date not null,
  fecha_fin date not null,
  -- Días laborables (lunes a sábado sin descansos obligatorios), calculados por la app.
  dias integer not null check (dias > 0),
  -- Prima vacacional pagada: salario diario × días × porcentaje al momento del registro.
  prima_vacacional numeric(12,2) not null default 0 check (prima_vacacional >= 0),
  notas text,
  registrado_por uuid references public.usuarios(id) on delete set null
    default private.mi_usuario_id(),
  created_at timestamptz not null default now(),
  constraint chk_vacaciones_fechas check (fecha_fin >= fecha_inicio),
  -- Un empleado no puede estar de vacaciones dos veces en las mismas fechas.
  constraint vacaciones_sin_traslape exclude using gist (
    empleado_id with =,
    daterange(fecha_inicio, fecha_fin, '[]') with &&
  )
);

create index idx_vacaciones_empleado_anio on public.vacaciones (empleado_id, anio_servicio);
create index idx_vacaciones_registrado_por on public.vacaciones (registrado_por);

-- Días de vacaciones que corresponden por años de servicio (Art. 76 LFT, reforma 2023):
-- 1→12, 2→14, 3→16, 4→18, 5→20; de 6 a 10 → 22; y +2 por cada 5 años adicionales.
create or replace function private.dias_vacaciones_lft(anios integer)
returns integer language sql immutable set search_path = ''
as $$
  select case
    when anios < 1 then 0
    when anios <= 5 then 10 + 2 * anios
    else 22 + 2 * ((anios - 6) / 5)
  end
$$;

-- Valida cada periodo antes de guardarlo.
create or replace function private.validar_vacaciones()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_ingreso date;
  v_aniversario date;
  v_derecho integer;
  v_usados integer;
begin
  select e.fecha_ingreso into v_ingreso from public.empleados e where e.id = new.empleado_id;
  v_aniversario := (v_ingreso + make_interval(years => new.anio_servicio))::date;
  v_derecho := private.dias_vacaciones_lft(new.anio_servicio);

  if new.fecha_inicio < v_aniversario then
    raise exception 'Las vacaciones del año % solo pueden tomarse a partir del %',
      new.anio_servicio, to_char(v_aniversario, 'DD/MM/YYYY');
  end if;

  select coalesce(sum(v.dias), 0) into v_usados
  from public.vacaciones v
  where v.empleado_id = new.empleado_id and v.anio_servicio = new.anio_servicio
    and v.id <> new.id;

  if v_usados + new.dias > v_derecho then
    raise exception 'El año % de servicio da derecho a % días y ya se registraron %',
      new.anio_servicio, v_derecho, v_usados;
  end if;

  return new;
end
$$;

create trigger trg_validar_vacaciones
  before insert or update on public.vacaciones
  for each row execute function private.validar_vacaciones();

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Acceso exclusivo del administrador primario.
revoke all on public.empleados, public.vacaciones from anon;
alter table public.empleados enable row level security;
alter table public.vacaciones enable row level security;

do $$
declare t text;
begin
  foreach t in array array['empleados','vacaciones'] loop
    execute format($p$create policy lectura_admin on public.%I for select to authenticated
      using ((select private.current_user_role()) = 'admin_primario')$p$, t);
    execute format($p$create policy alta_admin on public.%I for insert to authenticated
      with check ((select private.current_user_role()) = 'admin_primario')$p$, t);
    execute format($p$create policy edicion_admin on public.%I for update to authenticated
      using ((select private.current_user_role()) = 'admin_primario')
      with check ((select private.current_user_role()) = 'admin_primario')$p$, t);
    execute format($p$create policy baja_admin on public.%I for delete to authenticated
      using ((select private.current_user_role()) = 'admin_primario')$p$, t);
  end loop;
end $$;
