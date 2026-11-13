/**
 * ComplementosPago.tsx — Lista de complementos de pago (REP, CFDI tipo P), ruta
 * /facturacion/complementos. Equivale a CFDIs ▸ Complemento de Pago de CONTPAQi Vende.
 * La emisión de nuevos complementos llega con el timbrado (fase 2).
 */
import ListaCfdis from "../../components/facturacion/ListaCfdis";

export default function ComplementosPago() {
  return <ListaCfdis tipo="P" titulo="Complementos de Pago" />;
}
