/**
 * FacturaOrdenCard.tsx — Factura de la orden, del lado del vendedor (en OrdenDetalle).
 *
 * Muestra si el cliente pidió factura y en qué va (solicitada, en preparación,
 * facturada con su folio, o rechazada con el motivo). Quien puede editar la orden la
 * solicita (SolicitarFacturaDialog) o cancela la solicitud pendiente; el admin primario
 * tiene además el botón "Facturar" en el encabezado de la orden.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ReceiptText, X } from "lucide-react";
import type { Orden } from "../../data/mockData";
import { describirSat, FORMAS_PAGO, USOS_CFDI } from "../../lib/sat";
import {
  ESTADO_SOLICITUD,
  cancelarSolicitud,
  cargarSolicitudes,
  solicitudAbierta,
  type SolicitudFactura,
} from "../../lib/solicitudesFactura";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { Button } from "../ui/button";
import SolicitarFacturaDialog from "./SolicitarFacturaDialog";

const fechaHora = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

export default function FacturaOrdenCard({ orden, puedeSolicitar }: { orden: Orden; puedeSolicitar: boolean }) {
  const [lista, setLista] = useState<SolicitudFactura[]>([]);
  const [disponible, setDisponible] = useState(true);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLista(await cargarSolicitudes(orden.id));
      setDisponible(true);
    } catch {
      // Sin sql/solicitudes_factura.sql aplicado: la tarjeta no se muestra.
      setDisponible(false);
    }
  }, [orden.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (!disponible) return null;

  const actual = lista[0];
  const emitida = lista.find((s) => s.estado === "emitida");
  const abierta = lista.find(solicitudAbierta);
  const puedePedir = puedeSolicitar && orden.estadoNombre !== "Cancelada" && !abierta && !emitida && !!orden.clienteId;
  if (!actual && !puedePedir) return null;

  const cancelar = async (s: SolicitudFactura) => {
    if (!window.confirm("¿Cancelar la solicitud de factura?")) return;
    try {
      await cancelarSolicitud(s.id);
      toast.success("Solicitud cancelada");
      await cargar();
    } catch (err: any) {
      toast.error("No se pudo cancelar", { description: err?.message });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <ReceiptText className="w-5 h-5 text-primary" />
          Factura
        </CardTitle>
        {puedePedir && (
          <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>
            <ReceiptText className="w-4 h-4" />
            {actual?.estado === "rechazada" ? "Volver a solicitar" : "El cliente requiere factura"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!actual && (
          <p className="text-muted-foreground">
            Si el cliente necesita factura, solicítala aquí con sus datos fiscales; el administrador la emite.
          </p>
        )}
        {actual && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${ESTADO_SOLICITUD[actual.estado].clase}`}>
                {ESTADO_SOLICITUD[actual.estado].texto}
              </span>
              {actual.estado === "emitida" && (actual.cfdiFolio || actual.cfdiUuid) && (
                <span className="font-medium">{actual.cfdiFolio ?? actual.cfdiUuid}</span>
              )}
              <span className="text-xs text-muted-foreground">
                Pedida {fechaHora(actual.solicitadaAt)}
                {actual.solicitadaPor ? ` por ${actual.solicitadaPor}` : ""}
              </span>
            </div>
            <p>
              {actual.razonSocial} · <span className="font-mono">{actual.rfc}</span>
            </p>
            <p className="text-muted-foreground">
              {describirSat(USOS_CFDI, actual.usoCfdi)} · {actual.metodoPago} · {describirSat(FORMAS_PAGO, actual.formaPago)}
            </p>
            {actual.estado === "rechazada" && actual.respuesta && (
              <p className="rounded-md bg-status-pending-bg p-3 text-status-pending-text whitespace-pre-line">
                Motivo: {actual.respuesta}
              </p>
            )}
            {actual.estado === "emitida" && actual.respuesta && !actual.cfdiId && (
              <p className="text-muted-foreground">Emitida fuera del sistema: {actual.respuesta}</p>
            )}
            {actual.estado === "pendiente" && puedeSolicitar && (
              <Button size="sm" variant="ghost" onClick={() => cancelar(actual)}>
                <X className="w-4 h-4" />
                Cancelar solicitud
              </Button>
            )}
          </div>
        )}
        {!orden.clienteId && puedeSolicitar && (
          <p className="text-muted-foreground">La orden no tiene cliente del catálogo: no se puede facturar.</p>
        )}
      </CardContent>
      <SolicitarFacturaDialog
        orden={orden}
        open={abierto}
        onClose={() => setAbierto(false)}
        onSolicitada={() => {
          setAbierto(false);
          void cargar();
        }}
      />
    </Card>
  );
}
