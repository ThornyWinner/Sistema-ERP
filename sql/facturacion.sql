-- =====================================================================================
-- facturacion.sql — Facturación CFDI 4.0 (reemplazo de CONTPAQi Vende), fase 1.
--
--  1. Datos fiscales de clientes (RFC, régimen, CP, uso de CFDI, crédito).
--  2. Datos fiscales de productos (clave SAT, unidad, objeto de impuesto).
--  3. Emisor (fila única) y series/folios por tipo de documento.
--  4. CFDIs: facturas (I), notas de crédito (E), traslados (T) y complementos de pago (P)
--     en una sola tabla, con sus conceptos, CFDI relacionados y documentos pagados.
--  5. RPCs: guardar/eliminar borradores e importar el historial exportado de CONTPAQi.
--
-- El timbrado (folio definitivo, UUID, sello) llega en la fase 2, con el PAC.
-- Mientras tanto los CFDI del ERP se guardan como BORRADOR, sin folio.
--
-- Acceso: consulta admin primario y secundario; solo el primario crea, edita e importa.
-- Las tablas de CFDI no tienen políticas de escritura: todo pasa por las RPC.
-- =====================================================================================

-- ------------------------------------------------------------------ 1. clientes
alter table public.clientes
  add column if not exists rfc text,
  add column if not exists nombre_comercial text,
  add column if not exists regimen_fiscal text,
  add column if not exists codigo_postal text,
  add column if not exists uso_cfdi text default 'G03',
  add column if not exists metodo_pago_cfdi text,
  add column if not exists forma_pago_cfdi text,
  add column if not exists email_cc text,
  add column if not exists dias_credito integer,
  add column if not exists limite_credito numeric(14,2);

alter table public.clientes
  drop constraint if exists clientes_rfc_formato,
  add constraint clientes_rfc_formato
    check (rfc is null or rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  drop constraint if exists clientes_cp_formato,
  add constraint clientes_cp_formato
    check (codigo_postal is null or codigo_postal ~ '^[0-9]{5}$'),
  drop constraint if exists clientes_metodo_pago_cfdi,
  add constraint clientes_metodo_pago_cfdi
    check (metodo_pago_cfdi is null or metodo_pago_cfdi in ('PUE','PPD'));

-- Un RFC por cliente, salvo los genéricos (público en general y extranjero).
create unique index if not exists clientes_rfc_unico on public.clientes (rfc)
  where rfc is not null and rfc not in ('XAXX010101000','XEXX010101000');

comment on column public.clientes.rfc is 'RFC del receptor (CFDI 4.0). Genérico: XAXX010101000.';
comment on column public.clientes.regimen_fiscal is 'Clave c_RegimenFiscal del SAT (601, 612, 626…).';
comment on column public.clientes.codigo_postal is 'Domicilio fiscal del receptor (CP de su constancia).';
comment on column public.clientes.uso_cfdi is 'Clave c_UsoCFDI predeterminada (G03 gastos en general).';

-- ------------------------------------------------------------------ 2. productos
alter table public.productos
  add column if not exists codigo text,
  add column if not exists clave_prod_serv text,
  add column if not exists clave_unidad text default 'H87',
  add column if not exists unidad_medida text default 'Pieza',
  add column if not exists objeto_imp text default '02';

alter table public.productos
  drop constraint if exists productos_clave_prod_serv_formato,
  add constraint productos_clave_prod_serv_formato
    check (clave_prod_serv is null or clave_prod_serv ~ '^[0-9]{8}$'),
  drop constraint if exists productos_objeto_imp,
  add constraint productos_objeto_imp
    check (objeto_imp is null or objeto_imp in ('01','02','03','04','05'));

comment on column public.productos.clave_prod_serv is 'Clave c_ClaveProdServ del SAT (p. ej. 53102700 uniformes).';
comment on column public.productos.clave_unidad is 'Clave c_ClaveUnidad del SAT (H87 pieza, E48 servicio).';

-- ------------------------------------------------------------------ 3. emisor y series
create table if not exists public.empresa_fiscal (
  id boolean primary key default true check (id),
  rfc text not null check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  razon_social text not null,
  nombre_comercial text,
  regimen_fiscal text not null,
  codigo_postal text not null check (codigo_postal ~ '^[0-9]{5}$'),
  updated_at timestamptz not null default now()
);
comment on table public.empresa_fiscal is
  'Datos fiscales del emisor (una sola fila): RFC, razón social, régimen y lugar de expedición.';

insert into public.empresa_fiscal (rfc, razon_social, nombre_comercial, regimen_fiscal, codigo_postal)
values ('SAMH731021B65', 'HECTOR FERNANDO SALAS MUÑIZ', 'UIS', '612', '25240')
on conflict (id) do nothing;

create table if not exists public.series_folios (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('factura','nota_credito','complemento_pago','traslado')),
  serie text not null check (serie ~ '^[A-Za-z0-9]{1,25}$'),
  ultimo_folio integer not null default 0 check (ultimo_folio >= 0),
  predeterminada boolean not null default false,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tipo, serie)
);
comment on table public.series_folios is
  'Series y último folio usado por tipo de CFDI. El timbrado toma ultimo_folio + 1.';
create unique index if not exists series_folios_una_predeterminada
  on public.series_folios (tipo) where predeterminada;

-- Últimos folios usados en CONTPAQi Vende (Configuración ▸ Series y folios).
insert into public.series_folios (tipo, serie, ultimo_folio, predeterminada) values
  ('factura', 'A', 2116, true),
  ('nota_credito', 'E', 0, true),
  ('complemento_pago', 'P', 123, true),
  ('traslado', 'T', 0, true)
on conflict (tipo, serie) do nothing;

-- ------------------------------------------------------------------ 4. CFDIs
create table if not exists public.cfdis (
  id uuid primary key default gen_random_uuid(),
  tipo_comprobante char(1) not null default 'I' check (tipo_comprobante in ('I','E','T','P')),
  serie text,
  folio integer,
  fecha timestamptz not null default now(),
  estado text not null default 'borrador'
    check (estado in ('borrador','vigente','cancelado','en_proceso')),
  estado_detalle text,
  uuid uuid unique,
  fecha_timbrado timestamptz,
  -- Receptor (copia al momento de facturar: el CFDI no cambia si cambia el cliente).
  cliente_id uuid references public.clientes(id) on delete set null,
  receptor_rfc text,
  receptor_nombre text,
  receptor_nombre_comercial text,
  receptor_regimen text,
  receptor_cp text,
  receptor_email text,
  uso_cfdi text,
  -- Comprobante
  metodo_pago text check (metodo_pago is null or metodo_pago in ('PUE','PPD')),
  forma_pago text,
  moneda text not null default 'MXN',
  tipo_cambio numeric(12,6) not null default 1,
  condiciones_pago text,
  fecha_vencimiento date,
  exportacion text not null default '01',
  regimen_emisor text not null default '612',
  lugar_expedicion text,
  -- Factura global (público en general)
  es_global boolean not null default false,
  global_periodicidad text,
  global_meses text,
  global_anio integer,
  -- Importes
  subtotal numeric(14,2) not null default 0,
  descuento numeric(14,2) not null default 0,
  iva numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  saldo numeric(14,2) not null default 0,
  -- Complemento de pago (tipo P)
  fecha_pago timestamptz,
  -- Vínculos y control
  orden_id uuid references public.ordenes(id) on delete set null,
  comentarios text,
  origen text not null default 'erp' check (origen in ('erp','contpaqi')),
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.cfdis is
  'CFDI emitidos: facturas (I), notas de crédito (E), traslados (T) y complementos de pago (P). '
  'origen=contpaqi: historial importado de CONTPAQi Vende, solo consulta.';

-- El folio solo se repite en el historial importado; los del ERP son únicos por serie.
create unique index if not exists cfdis_folio_unico
  on public.cfdis (tipo_comprobante, serie, folio) where origen = 'erp' and folio is not null;
create index if not exists cfdis_tipo_fecha on public.cfdis (tipo_comprobante, fecha desc);
create index if not exists cfdis_cliente on public.cfdis (cliente_id);
create index if not exists cfdis_orden on public.cfdis (orden_id);
create index if not exists cfdis_created_by on public.cfdis (created_by);
create index if not exists cfdis_receptor_rfc on public.cfdis (receptor_rfc);

create table if not exists public.cfdi_conceptos (
  id uuid primary key default gen_random_uuid(),
  cfdi_id uuid not null references public.cfdis(id) on delete cascade,
  numero integer not null,
  producto_id uuid references public.productos(id) on delete set null,
  orden_detalle_id uuid references public.orden_detalles(id) on delete set null,
  sku text,
  descripcion text not null,
  clave_prod_serv text not null,
  clave_unidad text not null,
  unidad text,
  cantidad numeric(14,2) not null check (cantidad > 0),
  valor_unitario numeric(14,2) not null check (valor_unitario >= 0),
  descuento numeric(14,2) not null default 0 check (descuento >= 0),
  importe numeric(14,2) not null default 0,
  objeto_imp text not null default '02',
  tasa_iva numeric(5,4) not null default 0.16,
  iva numeric(14,2) not null default 0
);
comment on table public.cfdi_conceptos is
  'Conceptos (partidas) de cada CFDI. importe = cantidad × valor unitario; '
  'IVA = (importe − descuento) × tasa cuando objeto_imp = 02.';
create index if not exists cfdi_conceptos_cfdi on public.cfdi_conceptos (cfdi_id, numero);
create index if not exists cfdi_conceptos_producto on public.cfdi_conceptos (producto_id);
create index if not exists cfdi_conceptos_orden_detalle on public.cfdi_conceptos (orden_detalle_id);

create table if not exists public.cfdi_relacionados (
  id uuid primary key default gen_random_uuid(),
  cfdi_id uuid not null references public.cfdis(id) on delete cascade,
  tipo_relacion text not null,
  uuid_relacionado uuid not null
);
comment on table public.cfdi_relacionados is
  'CFDI relacionados (c_TipoRelacion: 01 nota de crédito, 04 sustitución, 07 anticipo…).';
create index if not exists cfdi_relacionados_cfdi on public.cfdi_relacionados (cfdi_id);

create table if not exists public.cfdi_pago_documentos (
  id uuid primary key default gen_random_uuid(),
  cfdi_id uuid not null references public.cfdis(id) on delete cascade,
  factura_id uuid references public.cfdis(id) on delete set null,
  factura_uuid uuid,
  parcialidad integer not null default 1,
  saldo_anterior numeric(14,2) not null,
  importe_pagado numeric(14,2) not null check (importe_pagado > 0),
  saldo_insoluto numeric(14,2) not null
);
comment on table public.cfdi_pago_documentos is
  'Facturas PPD que liquida cada complemento de pago (DoctoRelacionado del REP).';
create index if not exists cfdi_pago_documentos_cfdi on public.cfdi_pago_documentos (cfdi_id);
create index if not exists cfdi_pago_documentos_factura on public.cfdi_pago_documentos (factura_id);

-- ------------------------------------------------------------------ RLS
alter table public.empresa_fiscal enable row level security;
alter table public.series_folios enable row level security;
alter table public.cfdis enable row level security;
alter table public.cfdi_conceptos enable row level security;
alter table public.cfdi_relacionados enable row level security;
alter table public.cfdi_pago_documentos enable row level security;

do $$
declare t text;
begin
  foreach t in array array['empresa_fiscal','series_folios','cfdis','cfdi_conceptos',
                           'cfdi_relacionados','cfdi_pago_documentos'] loop
    execute format('drop policy if exists lectura_admins on public.%I', t);
    execute format($p$create policy lectura_admins on public.%I for select to authenticated
      using ((select private.current_user_role()) in ('admin_primario','admin_secundario'))$p$, t);
  end loop;
end $$;

-- Emisor y series: los edita el admin primario desde Configuración.
drop policy if exists edicion_admin on public.empresa_fiscal;
create policy edicion_admin on public.empresa_fiscal for update to authenticated
  using ((select private.current_user_role()) = 'admin_primario')
  with check ((select private.current_user_role()) = 'admin_primario');
drop policy if exists alta_admin on public.series_folios;
create policy alta_admin on public.series_folios for insert to authenticated
  with check ((select private.current_user_role()) = 'admin_primario');
drop policy if exists edicion_admin on public.series_folios;
create policy edicion_admin on public.series_folios for update to authenticated
  using ((select private.current_user_role()) = 'admin_primario')
  with check ((select private.current_user_role()) = 'admin_primario');

-- ------------------------------------------------------------------ 5. funciones
-- Recalcula importes de un CFDI a partir de sus conceptos (igual que lib/facturacion.ts).
create or replace function private.recalcular_totales_cfdi(p_cfdi uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub numeric(14,2);
  v_desc numeric(14,2);
  v_iva numeric(14,2);
begin
  update public.cfdi_conceptos c
     set importe = round(c.cantidad * c.valor_unitario, 2),
         iva = case when c.objeto_imp = '02'
                    then round((round(c.cantidad * c.valor_unitario, 2) - c.descuento) * c.tasa_iva, 2)
                    else 0 end
   where c.cfdi_id = p_cfdi;

  select coalesce(sum(importe), 0), coalesce(sum(descuento), 0), coalesce(sum(iva), 0)
    into v_sub, v_desc, v_iva
    from public.cfdi_conceptos where cfdi_id = p_cfdi;

  update public.cfdis
     set subtotal = v_sub,
         descuento = v_desc,
         iva = v_iva,
         total = v_sub - v_desc + v_iva,
         saldo = case when tipo_comprobante = 'I' then v_sub - v_desc + v_iva else 0 end,
         updated_at = now()
   where id = p_cfdi;
end;
$$;

-- Crea o actualiza un borrador con sus conceptos y CFDI relacionados.
create or replace function public.guardar_cfdi(p_id uuid, p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_estado text;
  v_emisor public.empresa_fiscal%rowtype;
  c jsonb;
  r jsonb;
  n integer := 0;
begin
  if (select private.current_user_role()) is distinct from 'admin_primario' then
    raise exception 'Solo el administrador principal puede facturar' using errcode = '42501';
  end if;

  select * into v_emisor from public.empresa_fiscal limit 1;

  if v_id is null then
    insert into public.cfdis (tipo_comprobante, created_by, regimen_emisor, lugar_expedicion)
    values (coalesce(nullif(p_datos->>'tipo_comprobante',''), 'I'),
            private.mi_usuario_id(), v_emisor.regimen_fiscal, v_emisor.codigo_postal)
    returning id into v_id;
  else
    select estado into v_estado from public.cfdis where id = v_id for update;
    if v_estado is null then
      raise exception 'El CFDI no existe';
    elsif v_estado <> 'borrador' then
      raise exception 'Solo se pueden modificar borradores: este CFDI ya está %', v_estado;
    end if;
  end if;

  if jsonb_typeof(p_datos->'conceptos') = 'array'
     and jsonb_array_length(p_datos->'conceptos') = 0 then
    raise exception 'Agrega al menos una partida';
  end if;

  update public.cfdis set
    serie = nullif(p_datos->>'serie',''),
    fecha = coalesce((p_datos->>'fecha')::timestamptz, fecha),
    cliente_id = nullif(p_datos->>'cliente_id','')::uuid,
    receptor_rfc = upper(nullif(trim(p_datos->>'receptor_rfc'),'')),
    receptor_nombre = nullif(trim(p_datos->>'receptor_nombre'),''),
    receptor_nombre_comercial = nullif(trim(p_datos->>'receptor_nombre_comercial'),''),
    receptor_regimen = nullif(p_datos->>'receptor_regimen',''),
    receptor_cp = nullif(p_datos->>'receptor_cp',''),
    receptor_email = nullif(trim(p_datos->>'receptor_email'),''),
    uso_cfdi = nullif(p_datos->>'uso_cfdi',''),
    metodo_pago = nullif(p_datos->>'metodo_pago',''),
    forma_pago = nullif(p_datos->>'forma_pago',''),
    moneda = coalesce(nullif(p_datos->>'moneda',''), 'MXN'),
    condiciones_pago = nullif(trim(p_datos->>'condiciones_pago'),''),
    fecha_vencimiento = nullif(p_datos->>'fecha_vencimiento','')::date,
    exportacion = coalesce(nullif(p_datos->>'exportacion',''), '01'),
    es_global = coalesce((p_datos->>'es_global')::boolean, false),
    global_periodicidad = nullif(p_datos->>'global_periodicidad',''),
    global_meses = nullif(p_datos->>'global_meses',''),
    global_anio = nullif(p_datos->>'global_anio','')::integer,
    orden_id = nullif(p_datos->>'orden_id','')::uuid,
    comentarios = nullif(trim(p_datos->>'comentarios'),''),
    updated_at = now()
  where id = v_id;

  if jsonb_typeof(p_datos->'conceptos') = 'array' then
    delete from public.cfdi_conceptos where cfdi_id = v_id;
    for c in select * from jsonb_array_elements(p_datos->'conceptos') loop
      n := n + 1;
      insert into public.cfdi_conceptos (
        cfdi_id, numero, producto_id, orden_detalle_id, sku, descripcion, clave_prod_serv,
        clave_unidad, unidad, cantidad, valor_unitario, descuento, objeto_imp, tasa_iva)
      values (
        v_id, n,
        nullif(c->>'producto_id','')::uuid,
        nullif(c->>'orden_detalle_id','')::uuid,
        nullif(trim(c->>'sku'),''),
        trim(c->>'descripcion'),
        c->>'clave_prod_serv',
        c->>'clave_unidad',
        nullif(trim(c->>'unidad'),''),
        (c->>'cantidad')::numeric,
        (c->>'valor_unitario')::numeric,
        coalesce(nullif(c->>'descuento','')::numeric, 0),
        coalesce(nullif(c->>'objeto_imp',''), '02'),
        coalesce(nullif(c->>'tasa_iva','')::numeric, 0.16));
    end loop;
  end if;

  if jsonb_typeof(p_datos->'relacionados') = 'array' then
    delete from public.cfdi_relacionados where cfdi_id = v_id;
    for r in select * from jsonb_array_elements(p_datos->'relacionados') loop
      insert into public.cfdi_relacionados (cfdi_id, tipo_relacion, uuid_relacionado)
      values (v_id, r->>'tipo_relacion', (r->>'uuid')::uuid);
    end loop;
  end if;

  perform private.recalcular_totales_cfdi(v_id);
  return v_id;
end;
$$;

create or replace function public.eliminar_borrador_cfdi(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_role()) is distinct from 'admin_primario' then
    raise exception 'Solo el administrador principal puede eliminar borradores' using errcode = '42501';
  end if;
  delete from public.cfdis where id = p_id and estado = 'borrador';
  if not found then
    raise exception 'Solo se pueden eliminar borradores';
  end if;
end;
$$;

-- Importa (o actualiza por UUID) el historial exportado de CONTPAQi Vende.
-- p_tipo: 'I' (Facturas.csv) o 'P' (Complementos de Pago.csv). Cada fila ya viene
-- normalizada por el navegador: serie, folio, fecha, rfc, nombre, total, saldo, moneda,
-- metodo_pago, forma_pago, estado (texto de CONTPAQi), fecha_vencimiento, uuid, fecha_pago.
create or replace function public.importar_cfdis_contpaqi(p_tipo text, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  v_estado text;
  v_ins integer := 0;
  v_act integer := 0;
  v_omit integer := 0;
  v_nuevo boolean;
begin
  if (select private.current_user_role()) is distinct from 'admin_primario' then
    raise exception 'Solo el administrador principal puede importar' using errcode = '42501';
  end if;
  if p_tipo not in ('I','E','T','P') then
    raise exception 'Tipo de comprobante no válido: %', p_tipo;
  end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    if coalesce(f->>'uuid','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_omit := v_omit + 1;  -- sin timbrar en CONTPAQi: no es un CFDI válido
      continue;
    end if;

    v_estado := case
      when f->>'estado' ilike 'cancelad%' then 'cancelado'
      when f->>'estado' ilike 'en proceso%' then 'en_proceso'
      else 'vigente' end;

    v_nuevo := null;  -- queda null si el UUID ya es de un CFDI del ERP (no se actualiza)
    insert into public.cfdis as x (
      tipo_comprobante, serie, folio, fecha, estado, estado_detalle, uuid, fecha_timbrado,
      cliente_id, receptor_rfc, receptor_nombre, metodo_pago, forma_pago, moneda,
      fecha_vencimiento, subtotal, total, saldo, fecha_pago, origen, created_by)
    values (
      p_tipo,
      nullif(f->>'serie',''),
      nullif(f->>'folio','')::integer,
      (f->>'fecha')::timestamptz,
      v_estado,
      nullif(f->>'estado',''),
      (f->>'uuid')::uuid,
      (f->>'fecha')::timestamptz,
      (select id from public.clientes where rfc = upper(f->>'rfc') limit 1),
      upper(nullif(f->>'rfc','')),
      nullif(f->>'nombre',''),
      nullif(f->>'metodo_pago',''),
      nullif(f->>'forma_pago',''),
      coalesce(nullif(f->>'moneda',''), 'MXN'),
      nullif(f->>'fecha_vencimiento','')::date,
      coalesce(nullif(f->>'total','')::numeric, 0),
      coalesce(nullif(f->>'total','')::numeric, 0),
      coalesce(nullif(f->>'saldo','')::numeric, 0),
      nullif(f->>'fecha_pago','')::timestamptz,
      'contpaqi',
      private.mi_usuario_id())
    on conflict (uuid) do update set
      estado = excluded.estado,
      estado_detalle = excluded.estado_detalle,
      saldo = excluded.saldo,
      cliente_id = coalesce(x.cliente_id, excluded.cliente_id),
      updated_at = now()
    where x.origen = 'contpaqi'
    returning (xmax = 0) into v_nuevo;

    if v_nuevo then v_ins := v_ins + 1;
    elsif v_nuevo is not null then v_act := v_act + 1;
    else v_omit := v_omit + 1;  -- UUID ya existe como CFDI del ERP: no se toca
    end if;
  end loop;

  return jsonb_build_object('insertados', v_ins, 'actualizados', v_act, 'omitidos', v_omit);
end;
$$;

revoke execute on function private.recalcular_totales_cfdi(uuid) from public, anon, authenticated;
revoke execute on function public.guardar_cfdi(uuid, jsonb) from public, anon;
revoke execute on function public.eliminar_borrador_cfdi(uuid) from public, anon;
revoke execute on function public.importar_cfdis_contpaqi(text, jsonb) from public, anon;
grant execute on function public.guardar_cfdi(uuid, jsonb) to authenticated;
grant execute on function public.eliminar_borrador_cfdi(uuid) to authenticated;
grant execute on function public.importar_cfdis_contpaqi(text, jsonb) to authenticated;
