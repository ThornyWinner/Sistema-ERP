/**
 * DetalleCfdiDialog.tsx — Consulta de un CFDI importado de CONTPAQi o de un complemento
 * de pago: receptor, importes, estado y folio fiscal. El CSV de CONTPAQi no trae los
 * conceptos; esos viven en el XML timbrado.
 */
import { Copy } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { FORMAS_PAGO, METODOS_PAGO, describirSat } from "../../lib/sat";
import { ESTADO_CFDI, formatFechaHora, formatMoneda, serieFolio, type Cfdi } from "../../lib/facturacion";

const TIPO: Record<Cfdi["tipo_comprobante"], string> = {
  I: "Factura (Ingreso)",
  E: "Nota de crédito (Egreso)",
  T: "Traslado",
  P: "Complemento de pago (REP)",
};

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children || "—"}</dd>
    </div>
  );
}

export default function DetalleCfdiDialog({ cfdi, onClose }: { cfdi: Cfdi | null; onClose: () => void }) {
  return (
    <Dialog open={!!cfdi} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {cfdi && (
          <>
            <DialogHeader>
              <DialogTitle>
                {TIPO[cfdi.tipo_comprobante]} {serieFolio(cfdi)}
              </DialogTitle>
              <DialogDescription>
                {cfdi.origen === "contpaqi"
                  ? "Importado de CONTPAQi Vende (solo consulta). Los conceptos están en el XML timbrado."
                  : "Emitido desde el ERP."}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Dato label="Receptor">
                <span className="block">{cfdi.receptor_rfc}</span>
                <span className="block text-muted-foreground">{cfdi.receptor_nombre}</span>
              </Dato>
              <Dato label="Estado">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_CFDI[cfdi.estado].clase}`}>
                  {cfdi.estado_detalle ?? ESTADO_CFDI[cfdi.estado].label}
                </span>
              </Dato>
              <Dato label="Fecha de expedición">{formatFechaHora(cfdi.fecha)}</Dato>
              {cfdi.tipo_comprobante === "P" ? (
                <Dato label="Fecha del pago">{formatFechaHora(cfdi.fecha_pago)}</Dato>
              ) : (
                <Dato label="Método de pago">{describirSat(METODOS_PAGO, cfdi.metodo_pago)}</Dato>
              )}
              <Dato label="Forma de pago">{describirSat(FORMAS_PAGO, cfdi.forma_pago)}</Dato>
              <Dato label="Total">{formatMoneda(cfdi.total, cfdi.moneda)}</Dato>
              {cfdi.tipo_comprobante === "I" && (
                <>
                  <Dato label="Saldo pendiente">{formatMoneda(cfdi.saldo, cfdi.moneda)}</Dato>
                  <Dato label="Fecha de vencimiento">
                    {cfdi.fecha_vencimiento
                      ? new Date(`${cfdi.fecha_vencimiento}T12:00:00`).toLocaleDateString("es-MX")
                      : ""}
                  </Dato>
                </>
              )}
              <div className="sm:col-span-2">
                <Dato label="Folio fiscal (UUID)">
                  {cfdi.uuid && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 font-mono text-xs hover:text-primary"
                      onClick={() => {
                        navigator.clipboard?.writeText(cfdi.uuid!.toUpperCase());
                        toast.success("Folio fiscal copiado");
                      }}
                    >
                      {cfdi.uuid.toUpperCase()} <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </Dato>
              </div>
            </dl>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
