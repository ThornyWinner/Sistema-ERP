/**
 * SolicitudesFactura.tsx — Facturas que pidieron los vendedores (ruta /facturacion/solicitudes).
 *
 * Pendientes: órdenes cuyo cliente requiere factura, con los datos fiscales que capturó
 * el vendedor. El admin primario:
 *  - "Preparar factura": abre la factura nueva prellenada con la orden y estos datos
 *    (al guardarla, la solicitud pasa a "en preparación"; al timbrarse, a "facturada").
 *  - "Marcar emitida": si se facturó fuera del sistema (p. ej. CONTPAQi), con el folio.
 *  - "Rechazar": con el motivo; se avisa al vendedor para que corrija y la vuelva a pedir.
 * El admin secundario solo consulta.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { CheckCircle2, FileText, ReceiptText, XCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { describirSat, FORMAS_PAGO, REGIMENES_FISCALES, USOS_CFDI } from "../../lib/sat";
import {
  ESTADO_SOLICITUD,
  atenderSolicitud,
  cargarSolicitudes,
  solicitudAbierta,
  type SolicitudFactura,
} from "../../lib/solicitudesFactura";
import { formatMonto } from "../../lib/pagos";

type Vista = "abiertas" | "atendidas";

const fechaHora = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export default function SolicitudesFactura() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const esPrimario = user?.rol === "admin_primario";
  const [lista, setLista] = useState<SolicitudFactura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("abiertas");
  const [accion, setAccion] = useState<{ s: SolicitudFactura; tipo: "emitida" | "rechazada" } | null>(null);

  const cargar = async () => {
    try {
      setLista(await cargarSolicitudes());
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Error desconocido");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  const abiertas = lista.filter(solicitudAbierta).sort((a, b) => a.solicitadaAt.localeCompare(b.solicitadaAt));
  const atendidas = lista.filter((s) => !solicitudAbierta(s));
  const visibles = vista === "abiertas" ? abiertas : atendidas;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1>Solicitudes de factura</h1>
        <p className="text-muted-foreground mt-1">
          Órdenes cuyo cliente requiere factura, con los datos fiscales que capturó el vendedor
        </p>
      </div>

      <div className="flex gap-2" role="tablist" aria-label="Solicitudes">
        {(
          [
            ["abiertas", `Por atender (${abiertas.length})`],
            ["atendidas", `Atendidas (${atendidas.length})`],
          ] as const
        ).map(([k, t]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={vista === k}
            onClick={() => setVista(k)}
            className={`px-4 py-2 rounded-lg text-sm ${vista === k ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/70"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-status-pending p-6 text-sm">
          No se pudieron cargar las solicitudes: {error}. ¿Ya se aplicó sql/solicitudes_factura.sql?
        </div>
      ) : cargando ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : visibles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          {vista === "abiertas" ? "No hay facturas por emitir." : "Todavía no hay solicitudes atendidas."}
        </div>
      ) : (
        <div className="space-y-3">
          {visibles.map((s) => (
            <article key={s.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/ordenes/${s.ordenId}`} className="font-medium hover:text-primary">
                      Orden {s.ordenFolio}
                    </Link>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_SOLICITUD[s.estado].clase}`}>
                      {ESTADO_SOLICITUD[s.estado].texto}
                    </span>
                    {s.ordenTotal != null && <span className="text-sm font-semibold">{formatMonto(s.ordenTotal)}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pedida {fechaHora(s.solicitadaAt)}
                    {s.solicitadaPor ? ` por ${s.solicitadaPor}` : ""}
                    {s.atendidaAt && !solicitudAbierta(s) ? ` · atendida ${fechaHora(s.atendidaAt)}${s.atendidaPor ? ` por ${s.atendidaPor}` : ""}` : ""}
                  </p>
                </div>
                {esPrimario && solicitudAbierta(s) && (
                  <div className="flex flex-wrap gap-2">
                    {s.cfdiId ? (
                      <Button size="sm" onClick={() => navigate(`/facturacion/facturas/${s.cfdiId}`)}>
                        <FileText className="w-4 h-4" />
                        Abrir borrador
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => navigate(`/facturacion/facturas/nueva?orden=${s.ordenId}`)}>
                        <ReceiptText className="w-4 h-4" />
                        Preparar factura
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setAccion({ s, tipo: "emitida" })}>
                      <CheckCircle2 className="w-4 h-4" />
                      Marcar emitida
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAccion({ s, tipo: "rechazada" })}>
                      <XCircle className="w-4 h-4" />
                      Rechazar
                    </Button>
                  </div>
                )}
              </div>
              <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                <Dato titulo="Receptor" valor={s.razonSocial} />
                <Dato titulo="RFC" valor={s.rfc} mono />
                <Dato titulo="Régimen · C.P." valor={`${describirSat(REGIMENES_FISCALES, s.regimen)} · ${s.cp}`} />
                <Dato titulo="Uso del CFDI" valor={describirSat(USOS_CFDI, s.usoCfdi)} />
                <Dato titulo="Método · forma" valor={`${s.metodoPago} · ${describirSat(FORMAS_PAGO, s.formaPago)}`} />
                <Dato titulo="Enviar a" valor={s.email ?? "—"} />
              </dl>
              {s.notas && <p className="text-sm rounded-md bg-secondary p-3 whitespace-pre-line">{s.notas}</p>}
              {s.respuesta && !solicitudAbierta(s) && (
                <p className="text-sm text-muted-foreground">
                  {s.estado === "rechazada" ? "Motivo del rechazo" : "Respuesta"}: {s.respuesta}
                </p>
              )}
              {s.estado === "emitida" && (s.cfdiFolio || s.cfdiUuid) && (
                <p className="text-sm">
                  Factura: <span className="font-medium">{s.cfdiFolio ?? s.cfdiUuid}</span>
                  {s.cfdiId && (
                    <Link to={`/facturacion/facturas/${s.cfdiId}`} className="ml-2 text-primary hover:underline">
                      ver
                    </Link>
                  )}
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      <AtenderDialog
        accion={accion}
        onClose={() => setAccion(null)}
        onHecho={() => {
          setAccion(null);
          void cargar();
        }}
      />
    </div>
  );
}

function Dato({ titulo, valor, mono }: { titulo: string; valor: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{titulo}</dt>
      <dd className={`truncate ${mono ? "font-mono" : ""}`} title={valor}>
        {valor}
      </dd>
    </div>
  );
}

function AtenderDialog({
  accion,
  onClose,
  onHecho,
}: {
  accion: { s: SolicitudFactura; tipo: "emitida" | "rechazada" } | null;
  onClose: () => void;
  onHecho: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setTexto("");
  }, [accion]);

  const emitida = accion?.tipo === "emitida";

  const guardar = async () => {
    if (!accion || !texto.trim()) return;
    setGuardando(true);
    try {
      await atenderSolicitud(accion.s.id, accion.tipo, texto);
      toast.success(emitida ? "Solicitud marcada como emitida" : "Solicitud rechazada", {
        description: "Se avisó al vendedor.",
      });
      onHecho();
    } catch (err: any) {
      toast.error("No se pudo guardar", { description: err?.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={!!accion} onOpenChange={(v) => !v && !guardando && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{emitida ? "Marcar como emitida" : "Rechazar solicitud"}</DialogTitle>
          <DialogDescription>
            Orden {accion?.s.ordenFolio} · {accion?.s.razonSocial}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="atender-texto">{emitida ? "Folio o UUID de la factura *" : "Qué falta o está mal *"}</Label>
          {emitida ? (
            <input
              id="atender-texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={200}
              placeholder="A-1234 (CONTPAQi) o el folio fiscal"
              className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          ) : (
            <textarea
              id="atender-texto"
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={1000}
              placeholder="El RFC no coincide con la constancia; falta el régimen…"
              className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          )}
          {emitida && (
            <p className="text-xs text-muted-foreground">
              Úsalo solo si la factura se hizo fuera del sistema. Las facturas timbradas aquí se marcan solas.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={!texto.trim() || guardando} variant={emitida ? "default" : "destructive"}>
            {guardando ? "Guardando…" : emitida ? "Marcar emitida" : "Rechazar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
