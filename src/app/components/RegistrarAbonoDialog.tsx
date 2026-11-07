/**
 * RegistrarAbonoDialog.tsx — Registro de un pago a plazos (abono) de una orden.
 *
 * Muestra total, monto ya pagado y saldo pendiente; el usuario captura monto,
 * método, fecha y referencia opcional. El monto no puede superar el saldo
 * (la base de datos lo valida también con trg_pagos_validar_total). El botón
 * "Liquidar saldo" llena el monto con el saldo completo.
 *
 * Al guardar llama a registrarPago del ErpDataContext; el trigger de la BD
 * cambia el estado de pago a "Pagado" cuando la suma de pagos alcanza el total.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Banknote } from "lucide-react";
import type { MetodoPago, Orden } from "../data/mockData";
import { useErpData } from "../context/ErpDataContext";
import { hoyISO } from "../lib/fechas";
import {
  METODO_PAGO_LABEL,
  formatMonto,
  redondearCentavos,
  saldoPendiente,
  totalPagado,
} from "../lib/pagos";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

interface RegistrarAbonoDialogProps {
  orden: Orden;
  open: boolean;
  onClose: () => void;
}

// Métodos aceptados para un abono ("crédito" no es un cobro real).
const METODOS_ABONO: MetodoPago[] = ["efectivo", "transferencia", "tarjeta", "cheque"];

export default function RegistrarAbonoDialog({ orden, open, onClose }: RegistrarAbonoDialogProps) {
  const { registrarPago } = useErpData();
  const pagado = totalPagado(orden);
  const saldo = saldoPendiente(orden);

  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [fecha, setFecha] = useState(hoyISO());
  const [referencia, setReferencia] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Cada vez que se abre, el formulario empieza limpio.
  useEffect(() => {
    if (open) {
      setMonto("");
      setMetodo(orden.metodoPago !== "credito" ? orden.metodoPago : "efectivo");
      setFecha(hoyISO());
      setReferencia("");
    }
  }, [open, orden.metodoPago]);

  const montoNum = redondearCentavos(parseFloat(monto) || 0);
  const excede = montoNum > saldo;
  const valido = montoNum > 0 && !excede && !!fecha;
  const saldoDespues = Math.max(redondearCentavos(saldo - montoNum), 0);

  const guardar = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!valido || guardando) return;
    setGuardando(true);
    try {
      await registrarPago(orden.id, {
        fecha,
        monto: montoNum,
        metodo,
        referencia: referencia.trim() || undefined,
      });
      toast.success(
        saldoDespues === 0 ? "Orden liquidada" : "Abono registrado",
        {
          description:
            saldoDespues === 0
              ? `${orden.numero}: se cubrió el total de ${formatMonto(orden.total)}`
              : `${orden.numero}: saldo pendiente ${formatMonto(saldoDespues)}`,
        }
      );
      onClose();
    } catch (err: any) {
      toast.error("No se pudo registrar el abono", { description: err?.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(abierto) => !abierto && !guardando && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar abono</DialogTitle>
          <DialogDescription>{orden.numero} · {orden.cliente}</DialogDescription>
        </DialogHeader>

        <form onSubmit={guardar} className="space-y-4">
          {/* Resumen de cobranza */}
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-secondary p-3 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-semibold">{formatMonto(orden.total)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pagado</p>
              <p className="font-semibold text-status-completed-text">{formatMonto(pagado)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pendiente</p>
              <p className="font-semibold text-status-pending-text">{formatMonto(saldo)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="abono-monto">Monto del abono</Label>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setMonto(String(saldo))}
              >
                Liquidar saldo ({formatMonto(saldo)})
              </button>
            </div>
            <Input
              id="abono-monto"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max={saldo}
              placeholder="0.00"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              aria-invalid={excede}
              aria-describedby="abono-ayuda"
              autoFocus
              required
            />
            <p
              id="abono-ayuda"
              className={`text-xs ${excede ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
            >
              {excede
                ? `El abono no puede ser mayor al saldo pendiente (${formatMonto(saldo)}).`
                : montoNum > 0
                ? saldoDespues === 0
                  ? "Con este pago la orden queda liquidada."
                  : `Saldo después del abono: ${formatMonto(saldoDespues)}`
                : "Puedes abonar cualquier cantidad hasta el saldo pendiente."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="abono-metodo">Método</Label>
              <select
                id="abono-metodo"
                value={metodo}
                onChange={(e) => setMetodo(e.target.value as MetodoPago)}
                className="h-9 w-full rounded-md border border-input bg-input-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              >
                {METODOS_ABONO.map((m) => (
                  <option key={m} value={m}>
                    {METODO_PAGO_LABEL[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="abono-fecha">Fecha</Label>
              <Input
                id="abono-fecha"
                type="date"
                value={fecha}
                max={hoyISO()}
                onChange={(e) => setFecha(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="abono-referencia">Referencia (opcional)</Label>
            <Input
              id="abono-referencia"
              placeholder="Folio de transferencia, núm. de cheque…"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              maxLength={100}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valido || guardando}>
              <Banknote className="w-4 h-4" />
              {guardando
                ? "Guardando…"
                : saldoDespues === 0 && montoNum > 0
                ? "Liquidar orden"
                : "Registrar abono"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
