/**
 * DesgloseImportes.tsx — Subtotal, descuento, IVA y total de una orden.
 * Se usa en Nueva Orden, Venta Rápida, la edición y el detalle de la orden, para que
 * en todas partes el total se lea igual que en la factura (precios antes de IVA).
 */
import type { Importes } from "../lib/impuestos";
import { formatMonto } from "../lib/pagos";

export default function DesgloseImportes({ importes, className = "" }: { importes: Importes; className?: string }) {
  return (
    <dl className={`space-y-1 text-sm ${className}`}>
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="tabular-nums">{formatMonto(importes.subtotal)}</dd>
      </div>
      {importes.descuento > 0 && (
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Descuento</dt>
          <dd className="tabular-nums">−{formatMonto(importes.descuento)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">IVA 16 %</dt>
        <dd className="tabular-nums">{formatMonto(importes.iva)}</dd>
      </div>
      <div className="flex justify-between gap-4 pt-1 border-t border-border font-semibold">
        <dt>Total</dt>
        <dd className="tabular-nums text-primary">{formatMonto(importes.total)}</dd>
      </div>
    </dl>
  );
}
