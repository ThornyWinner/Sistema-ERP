-- =============================================================================
-- expediente_laboral.sql — Incidencias, expediente documental y terminaciones
-- conforme a la Ley Federal del Trabajo (LFT) y al Art. 123 constitucional.
-- Complementa sql/vacaciones.sql. Acceso exclusivo del administrador primario.
--
--  empleados (+)  datos de identificación (RFC, CURP, NSS) y de baja.
--  incidencias    retardos, faltas, incapacidades, permisos y suspensiones.
--  finiquitos     cálculo guardado de finiquito o liquidación (desglose completo).
--  documentos     evidencia del expediente (Arts. 784 y 804), con archivo opcional
--                 en el bucket privado `expedientes`.
-- =============================================================================

-- Identificación y baja del empleado.
alter table public.empleados
  add column rfc text,
  add column curp text,
  add column nss text,
  add column fecha_baja date,
  add column causa_baja text check (causa_baja in
    ('renuncia', 'mutuo_acuerdo', 'despido_justificado', 'despido_injustificado', 'rescision_patron')),
  add constraint chk_empleado_baja check (
    (fecha_baja is null and causa_baja is null)
    or (fecha_baja is not null and causa_baja is not null and fecha_baja >= fecha_ingreso));

-- ---------------------------------------------------------------------------
-- Incidencias
-- ---------------------------------------------------------------------------
create table public.incidencias (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  tipo text not null check (tipo in ('retardo', 'falta_injustificada', 'falta_justificada',
    'incapacidad', 'permiso_con_goce', 'permiso_sin_goce', 'suspension')),
  fecha_inicio date not null,
  fecha_fin date not null,
  -- Solo para retardos: minutos de retraso respecto a la hora de entrada.
  minutos_retardo integer check (minutos_retardo > 0),
  motivo text,
  -- Si se levantó acta administrativa (prueba de la falta o conducta, Art. 784 fr. III).
  acta_administrativa boolean not null default false,
  registrado_por uuid references public.usuarios(id) on delete set null default private.mi_usuario_id(),
  created_at timestamptz not null default now(),
  constraint chk_incidencia_fechas check (fecha_fin >= fecha_inicio),
  -- Un retardo es de un solo día y debe indicar los minutos.
  constraint chk_incidencia_retardo check (
    tipo <> 'retardo' or (fecha_fin = fecha_inicio and minutos_retardo is not null)),
  -- La suspensión disciplinaria no puede exceder 8 días (Art. 423 fr. X).
  constraint chk_incidencia_suspension check (
    tipo <> 'suspension' or fecha_fin - fecha_inicio <= 7)
);
create index idx_incidencias_empleado_fecha on public.incidencias (empleado_id, fecha_inicio);
create index idx_incidencias_registrado_por on public.incidencias (registrado_por);

-- ---------------------------------------------------------------------------
-- Finiquitos / liquidaciones
-- ---------------------------------------------------------------------------
create table public.finiquitos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  fecha_terminacion date not null,
  causa text not null check (causa in
    ('renuncia', 'mutuo_acuerdo', 'despido_justificado', 'despido_injustificado', 'rescision_patron')),
  salario_diario numeric(10,2) not null check (salario_diario >= 0),
  salario_diario_integrado numeric(10,2) not null check (salario_diario_integrado >= 0),
  -- Desglose: [{clave, concepto, fundamento, dias, base, importe}, ...]
  conceptos jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null check (total >= 0),
  notas text,
  registrado_por uuid references public.usuarios(id) on delete set null default private.mi_usuario_id(),
  created_at timestamptz not null default now()
);
create index idx_finiquitos_empleado on public.finiquitos (empleado_id);
create index idx_finiquitos_registrado_por on public.finiquitos (registrado_por);

-- ---------------------------------------------------------------------------
-- Documentos del expediente
-- ---------------------------------------------------------------------------
create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  tipo text not null check (tipo in ('contrato', 'alta_imss', 'identificacion', 'reglamento_interior',
    'recibo_nomina', 'control_asistencia', 'recibo_vacaciones', 'recibo_aguinaldo', 'recibo_ptu',
    'acta_administrativa', 'justificante', 'aviso_rescision', 'renuncia', 'convenio_terminacion',
    'finiquito_firmado', 'otro')),
  fecha date not null,
  descripcion text,
  -- Ruta del archivo en el bucket `expedientes` (null si solo se registra que existe en papel).
  archivo_path text,
  -- Si el documento está firmado por el trabajador (clave para que tenga valor probatorio).
  firmado boolean not null default false,
  -- Registro al que respalda (opcional).
  incidencia_id uuid references public.incidencias(id) on delete set null,
  vacacion_id uuid references public.vacaciones(id) on delete set null,
  finiquito_id uuid references public.finiquitos(id) on delete set null,
  registrado_por uuid references public.usuarios(id) on delete set null default private.mi_usuario_id(),
  created_at timestamptz not null default now()
);
create index idx_documentos_empleado on public.documentos (empleado_id, tipo);
create index idx_documentos_incidencia on public.documentos (incidencia_id);
create index idx_documentos_vacacion on public.documentos (vacacion_id);
create index idx_documentos_finiquito on public.documentos (finiquito_id);
create index idx_documentos_registrado_por on public.documentos (registrado_por);

-- ---------------------------------------------------------------------------
-- Acceso: solo administrador primario
-- ---------------------------------------------------------------------------
revoke all on public.incidencias, public.finiquitos, public.documentos from anon;

do $$
declare t text;
begin
  foreach t in array array['incidencias','finiquitos','documentos'] loop
    execute format('alter table public.%I enable row level security', t);
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

-- ---------------------------------------------------------------------------
-- Archivos: bucket privado (PDF o imagen, máximo 10 MB) solo para el admin primario
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expedientes', 'expedientes', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy expedientes_lectura on storage.objects for select to authenticated
  using (bucket_id = 'expedientes' and (select private.current_user_role()) = 'admin_primario');
create policy expedientes_alta on storage.objects for insert to authenticated
  with check (bucket_id = 'expedientes' and (select private.current_user_role()) = 'admin_primario');
create policy expedientes_edicion on storage.objects for update to authenticated
  using (bucket_id = 'expedientes' and (select private.current_user_role()) = 'admin_primario')
  with check (bucket_id = 'expedientes' and (select private.current_user_role()) = 'admin_primario');
create policy expedientes_baja on storage.objects for delete to authenticated
  using (bucket_id = 'expedientes' and (select private.current_user_role()) = 'admin_primario');
