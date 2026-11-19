/**
 * SolicitarAutorizacionDialog.tsx — El vendedor pide al administrador primario que
 * autorice una orden que las políticas de venta bloquean (descuento mayor al tope o
 * crédito del cliente). Muestra qué se pide y la justificación es obligatoria.
 */
import { useEffect, useState } from "react";
import { ShieldQuestion } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { formatMonto } from "../../lib/pagos";

interface Props {
  open: boolean;
  onClose: () => void;
  cliente: string;
  total: number;
  /** Descuento que se pide (null = el descuento no está bloqueado). */
  descuento: number | null;
  /** Saldo a crédito que se pide (null = el crédito no está bloqueado). */
  saldo: number | null;
  motivos: string[];
  /** Envía la solicitud; true = enviada (cierra el diálogo). */
  onEnviar: (justificacion: string) => Promise<boolean>;
}

export default function SolicitarAutorizacionDialog({ open, onClose, cliente, total, descuento, saldo, motivos, onEnviar }: Props) {
  const [justificacion, setJustificacion] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (open) setJustificacion("");
  }, [open]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (justificacion.trim().length < 3 || enviando) return;
    setEnviando(true);
    try {
      if (await onEnviar(justificacion.trim())) onClose();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !enviando && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldQuestion className="w-5 h-5" />
            Solicitar autorización
          </DialogTitle>
          <DialogDescription>
            Se envía la orden tal como la capturaste al administrador primario. Cuando la apruebe te llega
            una notificación y la creas desde Autorizaciones.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4">
          <dl className="rounded-lg bg-secondary p-3 text-sm space-y-1">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Cliente</dt>
              <dd className="font-medium text-right">{cliente}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Total</dt>
              <dd>{formatMonto(total)}</dd>
            </div>
            {descuento != null && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Descuento a autorizar</dt>
                <dd className="font-medium">{formatMonto(descuento)}</dd>
              </div>
            )}
            {saldo != null && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Saldo a crédito</dt>
                <dd className="font-medium">{formatMonto(saldo)}</dd>
              </div>
            )}
          </dl>
          {motivos.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
              {motivos.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          <div>
            <label htmlFor="justificacion" className="block text-sm font-medium mb-1">
              ¿Por qué se necesita? *
            </label>
            <textarea
              id="justificacion"
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              rows={3}
              maxLength={1000}
              required
              className="w-full px-3 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
              placeholder="Ej: Cliente de 5 años, pedido de 300 piezas; liquida el saldo anterior el viernes."
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={enviando} className="px-4 py-2 bg-secondary rounded-lg hover:bg-secondary/80 text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando || justificacion.trim().length < 3}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Enviar solicitud"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
