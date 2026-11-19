/**
 * SolicitarFacturaDialog.tsx — El vendedor marca "el cliente requiere factura" con los
 * datos fiscales del receptor (tal como vienen en su constancia de situación fiscal),
 * el uso del CFDI, el método y la forma de pago. Se prellena con lo guardado en el
 * cliente y con cómo se pagó la orden; el admin primario la emite (sql/solicitudes_factura.sql).
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ReceiptText } from "lucide-react";
import type { Orden } from "../../data/mockData";
import { CP_REGEX, FORMAS_PAGO, METODOS_PAGO, REGIMENES_FISCALES, RFC_REGEX, USOS_CFDI, etiquetaSat } from "../../lib/sat";
import { datosFiscalesCliente, pagoSugerido, solicitarFactura, type DatosSolicitud } from "../../lib/solicitudesFactura";
import { formatMonto } from "../../lib/pagos";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

const CLASE_CAMPO =
  "w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const VACIO: DatosSolicitud = {
  rfc: "",
  razonSocial: "",
  regimen: "",
  cp: "",
  email: "",
  usoCfdi: "G03",
  metodoPago: "PUE",
  formaPago: "03",
  notas: "",
};

export default function SolicitarFacturaDialog({
  orden,
  open,
  onClose,
  onSolicitada,
}: {
  orden: Orden;
  open: boolean;
  onClose: () => void;
  onSolicitada: () => void;
}) {
  const [d, setD] = useState<DatosSolicitud>(VACIO);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open) return;
    const sugerido = pagoSugerido(orden);
    setD({ ...VACIO, razonSocial: orden.cliente.toUpperCase(), email: orden.clienteEmail ?? "", ...sugerido });
    if (!orden.clienteId) return;
    void datosFiscalesCliente(orden.clienteId).then((c) =>
      setD((prev) => ({
        ...prev,
        rfc: c.rfc || prev.rfc,
        razonSocial: (c.razonSocial || prev.razonSocial).toUpperCase(),
        regimen: c.regimen || prev.regimen,
        cp: c.cp || prev.cp,
        email: c.email || prev.email,
        usoCfdi: c.usoCfdi || prev.usoCfdi,
        // El método y la forma dependen de cómo se pagó ESTA orden.
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orden.id]);

  const set = (cambios: Partial<DatosSolicitud>) => setD((prev) => ({ ...prev, ...cambios }));

  const rfc = d.rfc.trim().toUpperCase();
  const errores = {
    rfc: rfc && !RFC_REGEX.test(rfc) ? "RFC inválido (12 caracteres persona moral, 13 física)" : null,
    cp: d.cp && !CP_REGEX.test(d.cp.trim()) ? "Deben ser 5 dígitos" : null,
    forma: d.metodoPago === "PPD" && d.formaPago !== "99" ? "Con PPD la forma de pago es 99 - Por definir" : null,
  };
  const completo = RFC_REGEX.test(rfc) && d.razonSocial.trim() && d.regimen && CP_REGEX.test(d.cp.trim()) && d.usoCfdi && d.formaPago;
  const valido = completo && !errores.forma;

  const enviar = async () => {
    if (!valido) return;
    setGuardando(true);
    try {
      await solicitarFactura(orden.id, { ...d, rfc, cp: d.cp.trim() });
      toast.success("Factura solicitada", { description: "Se avisó al administrador; te avisaremos cuando quede emitida." });
      onSolicitada();
    } catch (err: any) {
      toast.error("No se pudo solicitar la factura", { description: err?.message, duration: 10000 });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !guardando && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Solicitar factura · {orden.numero}</DialogTitle>
          <DialogDescription>
            {orden.cliente} · {formatMonto(orden.total)} con IVA. Copia los datos de la constancia de situación fiscal del cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="sf-rfc">RFC *</Label>
            <input
              id="sf-rfc"
              className={`${CLASE_CAMPO} uppercase`}
              maxLength={13}
              value={d.rfc}
              onChange={(e) => set({ rfc: e.target.value.toUpperCase().replace(/\s/g, "") })}
              aria-invalid={!!errores.rfc}
            />
            {errores.rfc && <p className="text-xs text-status-pending-text">{errores.rfc}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sf-cp">Código postal fiscal *</Label>
            <input
              id="sf-cp"
              inputMode="numeric"
              maxLength={5}
              className={CLASE_CAMPO}
              value={d.cp}
              onChange={(e) => set({ cp: e.target.value.replace(/\D/g, "") })}
              aria-invalid={!!errores.cp}
            />
            {errores.cp && <p className="text-xs text-status-pending-text">{errores.cp}</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sf-nombre">Razón social / nombre (sin “S.A. de C.V.”) *</Label>
            <input
              id="sf-nombre"
              className={`${CLASE_CAMPO} uppercase`}
              maxLength={300}
              value={d.razonSocial}
              onChange={(e) => set({ razonSocial: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sf-regimen">Régimen fiscal *</Label>
            <select id="sf-regimen" className={CLASE_CAMPO} value={d.regimen} onChange={(e) => set({ regimen: e.target.value })}>
              <option value="">Elige…</option>
              {REGIMENES_FISCALES.map((o) => (
                <option key={o.clave} value={o.clave}>
                  {etiquetaSat(o)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sf-uso">Uso del CFDI *</Label>
            <select id="sf-uso" className={CLASE_CAMPO} value={d.usoCfdi} onChange={(e) => set({ usoCfdi: e.target.value })}>
              {USOS_CFDI.map((o) => (
                <option key={o.clave} value={o.clave}>
                  {etiquetaSat(o)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sf-metodo">Método de pago *</Label>
            <select
              id="sf-metodo"
              className={CLASE_CAMPO}
              value={d.metodoPago}
              onChange={(e) => {
                const m = e.target.value as "PUE" | "PPD";
                set({ metodoPago: m, formaPago: m === "PPD" ? "99" : d.formaPago === "99" ? "03" : d.formaPago });
              }}
            >
              {METODOS_PAGO.map((o) => (
                <option key={o.clave} value={o.clave}>
                  {etiquetaSat(o)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              PUE si ya pagó todo; PPD si queda saldo (cada abono lleva complemento de pago).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sf-forma">Forma de pago *</Label>
            <select id="sf-forma" className={CLASE_CAMPO} value={d.formaPago} onChange={(e) => set({ formaPago: e.target.value })}>
              {FORMAS_PAGO.map((o) => (
                <option key={o.clave} value={o.clave}>
                  {etiquetaSat(o)}
                </option>
              ))}
            </select>
            {errores.forma && <p className="text-xs text-status-pending-text">{errores.forma}</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sf-email">Correo para enviar la factura</Label>
            <input id="sf-email" type="email" className={CLASE_CAMPO} value={d.email} onChange={(e) => set({ email: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sf-notas">Notas para el administrador</Label>
            <textarea
              id="sf-notas"
              rows={2}
              maxLength={1000}
              className={CLASE_CAMPO}
              value={d.notas}
              onChange={(e) => set({ notas: e.target.value })}
              placeholder="Orden de compra del cliente, que la descripción diga…, urgencia"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={!valido || guardando}>
            <ReceiptText className="w-4 h-4" />
            {guardando ? "Enviando…" : "Solicitar factura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
