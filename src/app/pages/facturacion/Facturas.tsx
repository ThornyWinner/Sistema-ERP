/**
 * Facturas.tsx — Lista de facturas (CFDI de ingreso), ruta /facturacion/facturas.
 * Equivale a CFDIs ▸ Factura de CONTPAQi Vende.
 */
import ListaCfdis from "../../components/facturacion/ListaCfdis";

export default function Facturas() {
  return <ListaCfdis tipo="I" titulo="Facturas" rutaNuevo="/facturacion/facturas/nueva" textoNuevo="Nueva Factura" />;
}
