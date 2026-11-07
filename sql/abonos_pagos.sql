-- =============================================================================
-- abonos_pagos.sql — Pagos a plazos (abonos) de una orden.
--
-- Cada abono es una fila nueva en `pagos`. El trigger existente
-- trg_pagos_actualizar_estado (AFTER INSERT) ya recalcula el estado de pago de la
-- orden con la suma de sus pagos: 'Anticipo' mientras falte saldo y 'Pagado' al
-- liquidarse.
--
-- Este trigger (BEFORE INSERT) impide que la suma de pagos supere el total de la
-- orden, para que el saldo pendiente nunca quede negativo. Bloquea la fila de la
-- orden (FOR UPDATE) para que dos abonos simultáneos no puedan rebasar el total.
-- La app valida lo mismo en RegistrarAbonoDialog antes de enviar el abono.
-- =============================================================================

create or replace function private.validar_pago_no_excede_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total numeric;
  v_pagado numeric;
begin
  select total into v_total from public.ordenes where id = new.orden_id for update;
  if v_total is null then
    raise exception 'La orden del pago no existe';
  end if;

  select coalesce(sum(monto), 0) into v_pagado from public.pagos where orden_id = new.orden_id;

  if v_pagado + new.monto > v_total then
    raise exception 'El pago ($%) excede el saldo pendiente de la orden ($%)',
      new.monto, greatest(v_total - v_pagado, 0)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pagos_validar_total on public.pagos;
create trigger trg_pagos_validar_total
  before insert on public.pagos
  for each row execute function private.validar_pago_no_excede_total();
