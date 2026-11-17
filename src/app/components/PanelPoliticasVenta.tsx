/**
 * PanelPoliticasVenta.tsx — Resumen de crédito del cliente y avisos de las políticas
 * de venta (límite de crédito y tope de descuento) dentro de un formulario de orden.
 *
 * Recibe el resultado de usePoliticasVenta. Para vendedores los avisos bloquean el
 * guardado; para el administrador primario son informativos (él autoriza).
 */
import { AlertTriangle, Info, Loader2, ShieldCheck } from "lucide-react";
import type { MetodoPago } from "../data/mockData";
import { formatMonto } from "../lib/pagos";
import type { usePoliticasVenta } from "../lib/politicasVenta";

interface PanelPoliticasVentaProps {
  politicas: ReturnType<typeof usePoliticasVenta>;
  cliente: string;
  metodoPago: MetodoPago;
}

export default function PanelPoliticasVenta({ politicas, cliente, metodoPago }: PanelPoliticasVentaProps) {
  const { credito, consultando, exento, avisoCredito, avisoDescuento } = politicas;
  const avisos = [avisoCredito, avisoDescuento].filter(Boolean) as string[];
  const limite = credito?.limite ?? 0;

  // Sin cliente, o cliente sin crédito pagando de contado sin avisos: nada que mostrar.
  if (!cliente.trim()) return null;
  if (!consultando && limite <= 0 && metodoPago !== "credito" && avisos.length === 0) return null;

  return (
    <div className="space-y-2" aria-live="polite">
      {consultando ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Consultando crédito del cliente…
        </p>
      ) : (
        limite > 0 &&
        credito && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-secondary px-3 py-2 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-4 h-4 text-primary" /> Crédito del cliente
            </span>
            <span>
              Límite <strong>{formatMonto(limite)}</strong>
            </span>
            <span>
              Debe <strong>{formatMonto(credito.saldo)}</strong>
            </span>
            <span>
              Disponible <strong>{formatMonto(Math.max(limite - credito.saldo, 0))}</strong>
            </span>
            {credito.dias != null && <span className="text-muted-foreground">{credito.dias} días de crédito</span>}
          </div>
        )
      )}

      {avisos.map((aviso) => (
        <div
          key={aviso}
          role={exento ? "status" : "alert"}
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            exento
              ? "bg-status-pending-bg text-status-pending-text"
              : "bg-red-500/10 text-red-700 dark:text-red-300"
          }`}
        >
          {exento ? <Info className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <span>
            {exento ? aviso.replace(/ ?Pide (un anticipo mayor o )?autorización al administrador\./, "") : aviso}
            {exento && " Como administrador puedes autorizarlo y guardar."}
          </span>
        </div>
      ))}
    </div>
  );
}
