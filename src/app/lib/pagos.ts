/**
 * pagos.ts — Cálculos de cobranza de una orden (anticipo, abonos y saldo).
 *
 * El monto cobrado se toma de la suma de `orden.pagos` (anticipo inicial + abonos),
 * no del campo `anticipo`, que solo guarda el adelanto inicial. Así una orden
 * pagada a plazos refleja cada abono hasta su liquidación.
 */
import type { MetodoPago, Orden } from "../data/mockData";

/** Redondea a centavos para evitar residuos de punto flotante (0.1 + 0.2). */
export const redondearCentavos = (n: number) => Math.round(n * 100) / 100;

/** Total cobrado: suma de todos los pagos registrados de la orden. */
export function totalPagado(orden: Pick<Orden, "pagos">): number {
  return redondearCentavos((orden.pagos ?? []).reduce((acc, p) => acc + (p.monto || 0), 0));
}

/** Saldo pendiente de pago (nunca negativo). */
export function saldoPendiente(orden: Pick<Orden, "pagos" | "total">): number {
  return Math.max(redondearCentavos((orden.total || 0) - totalPagado(orden)), 0);
}

/** Monto con separador de miles y hasta 2 decimales, p. ej. "$2,300" o "$1,150.50". */
export const formatMonto = (n: number) =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Etiquetas legibles de los métodos de pago. */
export const METODO_PAGO_LABEL: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  cheque: "Cheque",
  credito: "Crédito",
};
