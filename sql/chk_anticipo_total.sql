-- =============================================================================
-- chk_anticipo_total.sql — El anticipo de una orden no puede superar su total.
--
-- Evita saldos pendientes negativos (total − anticipo < 0). Si el cliente entrega
-- más dinero, se registra solo el total y el excedente se devuelve como cambio.
-- Complementa chk_anticipo (anticipo >= 0). La app valida lo mismo en
-- NuevaOrdenMultiProducto antes de enviar la orden.
-- =============================================================================

alter table public.ordenes
  add constraint chk_anticipo_no_mayor_total check (anticipo <= total);
