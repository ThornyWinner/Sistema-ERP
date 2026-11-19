-- =====================================================================
-- proveedores_cuentas.sql — Cuentas bancarias de los proveedores
-- =====================================================================
-- A dónde se le transfiere a cada proveedor cuando surte insumos: CLABE interbancaria,
-- número de tarjeta o número de cuenta, con banco, titular y cuál es la principal.
--
--  - CLABE: 18 dígitos con dígito verificador válido (pesos 3-7-1, como la valida el
--    banco). Los 3 primeros dígitos son el banco; la pantalla lo sugiere.
--  - Tarjeta: 15 o 16 dígitos con dígito de Luhn válido.
--  - Cuenta: de 8 a 20 dígitos (cada banco usa un largo distinto; no se valida más).
--  - Una sola cuenta principal por proveedor (al marcar otra, la anterior deja de serlo).
--
-- Permisos: el administrador primario da de alta, corrige y borra; el secundario solo
-- consulta. Vendedores y talleres no las ven (son datos para pagar).
-- =====================================================================

-- ------------------------------------------------------------------ 1. validaciones
create or replace function private.clabe_valida(p_clabe text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_suma integer := 0;
  v_pesos constant integer[] := array[3, 7, 1];
begin
  if p_clabe is null or p_clabe !~ '^[0-9]{18}$' then
    return false;
  end if;
  for i in 1..17 loop
    v_suma := v_suma + (substr(p_clabe, i, 1)::integer * v_pesos[((i - 1) % 3) + 1]) % 10;
  end loop;
  return (10 - v_suma % 10) % 10 = substr(p_clabe, 18, 1)::integer;
end;
$$;

create or replace function private.luhn_valido(p_numero text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_suma integer := 0;
  v_d integer;
  v_n integer;
begin
  if p_numero is null or p_numero !~ '^[0-9]+$' then
    return false;
  end if;
  v_n := length(p_numero);
  for i in 0..v_n - 1 loop
    v_d := substr(p_numero, v_n - i, 1)::integer;
    if i % 2 = 1 then
      v_d := v_d * 2;
      if v_d > 9 then v_d := v_d - 9; end if;
    end if;
    v_suma := v_suma + v_d;
  end loop;
  return v_suma % 10 = 0;
end;
$$;

-- Se usan en el CHECK de la tabla: deben poder ejecutarlas quienes escriben en ella.
grant execute on function private.clabe_valida(text) to authenticated;
grant execute on function private.luhn_valido(text) to authenticated;

-- ------------------------------------------------------------------ 2. tabla
create table if not exists public.proveedores_cuentas (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  tipo text not null check (tipo in ('clabe', 'tarjeta', 'cuenta')),
  numero text not null,
  banco text,
  titular text,
  principal boolean not null default false,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null default private.mi_usuario_id(),
  constraint proveedores_cuentas_numero_valido check (
    (tipo = 'clabe' and private.clabe_valida(numero))
    or (tipo = 'tarjeta' and numero ~ '^[0-9]{15,16}$' and private.luhn_valido(numero))
    or (tipo = 'cuenta' and numero ~ '^[0-9]{8,20}$')
  ),
  constraint proveedores_cuentas_textos check (
    coalesce(length(banco), 0) <= 80 and coalesce(length(titular), 0) <= 150 and coalesce(length(notas), 0) <= 500
  ),
  constraint proveedores_cuentas_unica unique (proveedor_id, numero)
);

comment on table public.proveedores_cuentas is
  'Cuentas a las que se transfiere a cada proveedor (CLABE, tarjeta o cuenta). Alta: admin primario; consulta: admins.';

create unique index if not exists proveedores_cuentas_una_principal
  on public.proveedores_cuentas (proveedor_id) where principal;

-- Al marcar una cuenta como principal, la anterior deja de serlo; la primera cuenta
-- del proveedor queda como principal.
create or replace function private.trg_proveedores_cuentas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.numero := regexp_replace(coalesce(new.numero, ''), '[^0-9]', '', 'g');
  new.banco := nullif(trim(new.banco), '');
  new.titular := nullif(trim(new.titular), '');
  new.notas := nullif(trim(new.notas), '');
  new.updated_at := now();
  if tg_op = 'INSERT' and not exists (select 1 from public.proveedores_cuentas c where c.proveedor_id = new.proveedor_id) then
    new.principal := true;
  end if;
  if new.principal then
    update public.proveedores_cuentas set principal = false
    where proveedor_id = new.proveedor_id and principal and id <> new.id;
  end if;
  return new;
end;
$$;
revoke execute on function private.trg_proveedores_cuentas() from public, anon, authenticated;

drop trigger if exists trg_proveedores_cuentas on public.proveedores_cuentas;
create trigger trg_proveedores_cuentas
  before insert or update on public.proveedores_cuentas
  for each row execute function private.trg_proveedores_cuentas();

-- ------------------------------------------------------------------ 3. permisos
alter table public.proveedores_cuentas enable row level security;

drop policy if exists lectura_admins on public.proveedores_cuentas;
create policy lectura_admins on public.proveedores_cuentas for select to authenticated
  using ((select private.current_user_role()) in ('admin_primario', 'admin_secundario'));

drop policy if exists alta_admin on public.proveedores_cuentas;
create policy alta_admin on public.proveedores_cuentas for insert to authenticated
  with check ((select private.current_user_role()) = 'admin_primario');

drop policy if exists edicion_admin on public.proveedores_cuentas;
create policy edicion_admin on public.proveedores_cuentas for update to authenticated
  using ((select private.current_user_role()) = 'admin_primario')
  with check ((select private.current_user_role()) = 'admin_primario');

drop policy if exists baja_admin on public.proveedores_cuentas;
create policy baja_admin on public.proveedores_cuentas for delete to authenticated
  using ((select private.current_user_role()) = 'admin_primario');

revoke all on public.proveedores_cuentas from anon;
grant select, insert, update, delete on public.proveedores_cuentas to authenticated;
