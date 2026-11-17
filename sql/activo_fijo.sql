-- =====================================================================================
-- activo_fijo.sql — Control de activo fijo (solo administrador primario).
--
--  - activo_categorias: tipo de bien y su tasa anual de depreciación. Las tasas iniciales
--    son las máximas de la Ley del ISR (arts. 34 y 35); se pueden ajustar con el contador.
--  - activos: cada bien con código AF-0001…, datos de compra, ubicación (sede),
--    responsable (empleado), estado y baja (venta, desecho, robo, donación…).
--  - activo_mantenimientos: bitácora de servicios preventivos y correctivos.
--
-- La depreciación (línea recta, mensual, a partir del mes siguiente al inicio de uso) se
-- calcula en la app (src/app/lib/activoFijo.ts) a partir de costo, tasa y fechas.
-- =====================================================================================

create table if not exists public.activo_categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  tasa_depreciacion numeric(5,4) not null check (tasa_depreciacion between 0 and 1),
  fundamento text,
  created_at timestamptz not null default now()
);
comment on table public.activo_categorias is
  'Categorías de activo fijo con su tasa anual de depreciación (LISR arts. 34 y 35).';

insert into public.activo_categorias (nombre, tasa_depreciacion, fundamento) values
  ('Maquinaria textil (corte, costura, bordado)', 0.11, 'LISR art. 35: fabricación de productos textiles y prendas de vestir'),
  ('Mobiliario y equipo de oficina', 0.10, 'LISR art. 34'),
  ('Equipo de cómputo', 0.30, 'LISR art. 34: computadoras, servidores, impresoras y periféricos'),
  ('Equipo de transporte', 0.25, 'LISR art. 34: automóviles, camiones de carga, montacargas'),
  ('Edificios y construcciones', 0.05, 'LISR art. 34'),
  ('Herramental, moldes y plantillas', 0.35, 'LISR art. 34: dados, troqueles, moldes, matrices y herramental'),
  ('Otro equipo', 0.10, 'LISR art. 35: otras actividades no especificadas'),
  ('Terrenos', 0, 'Los terrenos no se deprecian')
on conflict (nombre) do nothing;

create sequence if not exists public.activos_codigo_seq;

create table if not exists public.activos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default ('AF-' || lpad(nextval('public.activos_codigo_seq')::text, 4, '0')),
  nombre text not null,
  descripcion text,
  categoria_id uuid not null references public.activo_categorias(id),
  marca text,
  modelo text,
  numero_serie text,
  sede_id uuid references public.sedes(id) on delete set null,
  ubicacion text,
  responsable_id uuid references public.empleados(id) on delete set null,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  factura_compra text,
  fecha_adquisicion date not null,
  fecha_inicio_uso date,
  costo_adquisicion numeric(14,2) not null check (costo_adquisicion >= 0),
  valor_residual numeric(14,2) not null default 0 check (valor_residual >= 0),
  tasa_depreciacion numeric(5,4) not null check (tasa_depreciacion between 0 and 1),
  estado text not null default 'activo' check (estado in ('activo','mantenimiento','baja')),
  fecha_baja date,
  motivo_baja text check (motivo_baja is null or motivo_baja in ('venta','desecho','robo','donacion','otro')),
  valor_baja numeric(14,2),
  notas text,
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activos_residual_menor check (valor_residual <= costo_adquisicion),
  constraint activos_baja_completa check (
    (estado = 'baja') = (fecha_baja is not null and motivo_baja is not null))
);
comment on table public.activos is
  'Activo fijo de la empresa: compra, ubicación, responsable, tasa de depreciación y baja.';
create index if not exists activos_categoria on public.activos (categoria_id);
create index if not exists activos_sede on public.activos (sede_id);
create index if not exists activos_responsable on public.activos (responsable_id);
create index if not exists activos_proveedor on public.activos (proveedor_id);
create index if not exists activos_created_by on public.activos (created_by);

create table if not exists public.activo_mantenimientos (
  id uuid primary key default gen_random_uuid(),
  activo_id uuid not null references public.activos(id) on delete cascade,
  fecha date not null,
  tipo text not null check (tipo in ('preventivo','correctivo')),
  descripcion text not null,
  costo numeric(14,2) not null default 0 check (costo >= 0),
  realizado_por text,
  proximo date,
  created_at timestamptz not null default now()
);
comment on table public.activo_mantenimientos is
  'Bitácora de mantenimientos (preventivos y correctivos) de cada activo fijo.';
create index if not exists activo_mantenimientos_activo on public.activo_mantenimientos (activo_id, fecha desc);

-- Solo el administrador primario (lectura y escritura).
alter table public.activo_categorias enable row level security;
alter table public.activos enable row level security;
alter table public.activo_mantenimientos enable row level security;

do $$
declare t text;
begin
  foreach t in array array['activo_categorias','activos','activo_mantenimientos'] loop
    execute format('drop policy if exists admin_primario on public.%I', t);
    execute format($p$create policy admin_primario on public.%I for all to authenticated
      using ((select private.current_user_role()) = 'admin_primario')
      with check ((select private.current_user_role()) = 'admin_primario')$p$, t);
  end loop;
end $$;

grant usage on sequence public.activos_codigo_seq to authenticated;
