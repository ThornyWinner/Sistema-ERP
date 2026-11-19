/**
 * EntregarOrdenDialog.tsx — Confirmar que la orden se entregó al cliente
 * (sql/avance_produccion.sql: marcar_orden_entregada). Muestra el saldo pendiente para
 * cobrarlo al entregar. Lo usan Avance de pedidos y el detalle de la orden.
 */
import { useState } from "react";
import { toast } from "sonner";
import { PackageCheck } from "lucide-react";
import type { Orden } from "../data/mockData";
import { formatMonto, saldoPendiente } from "../lib/pagos";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

/** Confirmación de entrega (con el saldo pendiente a la vista). */
export default function EntregarOrdenDialog({
  orden: o,
  onClose,
  onConfirmar,
}: {
  orden: Orden | null;
  onClose: () => void;
  onConfirmar: (comentario: string) => Promise<void>;
}) {
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const saldo = o ? saldoPendiente(o) : 0;

  const confirmar = async () => {
    setGuardando(true);
    try {
      await onConfirmar(comentario);
      setComentario("");
    } catch (err: any) {
      toast.error("No se pudo marcar como entregada", { description: err?.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={!!o} onOpenChange={(v) => !v && !guardando && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Entregar orden {o?.numero}</DialogTitle>
          <DialogDescription>{o?.cliente}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {saldo > 0 ? (
            <p className="rounded-md bg-status-pending-bg p-3 text-status-pending-text">
              Queda un saldo de <strong>{formatMonto(saldo)}</strong>. Si el cliente paga al recoger, registra el abono
              desde la orden.
            </p>
          ) : (
            <p className="rounded-md bg-status-completed-bg p-3 text-status-completed-text">La orden está pagada.</p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="entrega-comentario">Comentario (opcional)</Label>
            <textarea
              id="entrega-comentario"
              rows={2}
              maxLength={500}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Quién recibió, paquetería, guía…"
              className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={guardando}>
            <PackageCheck className="w-4 h-4" />
            {guardando ? "Guardando…" : "Marcar entregada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
