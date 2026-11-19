/**
 * DevolucionesCard.tsx — Devoluciones y cambios de la orden (en OrdenDetalle).
 *
 * Lista las devoluciones registradas (qué regresó, si volvió al inventario, qué se llevó
 * a cambio y el reembolso) y abre DevolucionDialog para registrar una nueva. Solo
 * aparece si la orden ya tiene devoluciones o piezas terminadas que se puedan devolver.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, Undo2 } from "lucide-react";
import type { Orden } from "../../data/mockData";
import { MOTIVO_DEVOLUCION, cargarDevoluciones, partidaDevolvible, type Devolucion } from "../../lib/devoluciones";
import { formatFecha } from "../../lib/fechas";
import { formatMonto } from "../../lib/pagos";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { Button } from "../ui/button";
import DevolucionDialog from "./DevolucionDialog";

export default function DevolucionesCard({ orden, puedeRegistrar }: { orden: Orden; puedeRegistrar: boolean }) {
  const [lista, setLista] = useState<Devolucion[]>([]);
  const [disponible, setDisponible] = useState(true);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLista(await cargarDevoluciones(orden.id));
      setDisponible(true);
    } catch {
      // Sin sql/devoluciones.sql aplicado (o sin permiso): la tarjeta no se muestra.
      setDisponible(false);
    }
  }, [orden.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const hayDevolvibles = orden.estadoNombre !== "Cancelada" && orden.productos.some(partidaDevolvible);
  const mostrarBoton = puedeRegistrar && hayDevolvibles;
  if (!disponible || (lista.length === 0 && !mostrarBoton)) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Undo2 className="w-5 h-5 text-primary" />
          Devoluciones y cambios
        </CardTitle>
        {mostrarBoton && (
          <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
            <ArrowLeftRight className="w-4 h-4" />
            Registrar devolución o cambio
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Si el cliente regresa piezas o pide otra talla, regístralo aquí: el stock regresa al inventario y el total de la
            orden se ajusta.
          </p>
        ) : (
          <ul className="space-y-3">
            {lista.map((d) => (
              <li key={d.id} className="rounded-md border border-border p-3 text-sm space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {d.folio} · {d.tipo === "cambio" ? "Cambio" : "Devolución"} · {MOTIVO_DEVOLUCION[d.motivo]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatFecha(d.fecha)}
                    {d.registradaPor ? ` · ${d.registradaPor}` : ""}
                  </span>
                </div>
                {d.descripcion && <p className="text-muted-foreground">{d.descripcion}</p>}
                <ul className="space-y-1">
                  {d.partidas.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span>
                        {p.sentido === "devuelve" ? "↩ Regresó " : "↪ Se llevó "}
                        {p.descripcion ?? `${p.cantidad} pza(s)`}
                        {p.sentido === "devuelve" && (
                          <span className="text-muted-foreground">
                            {p.varianteId ? " · volvió al inventario" : " · no regresó al inventario"}
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground">{formatMonto(p.precioUnitario)} c/u</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Total {formatMonto(d.totalAnterior)} → {formatMonto(d.totalNuevo)}
                  {d.reembolso > 0 ? ` · reembolso ${formatMonto(d.reembolso)} (${d.metodoReembolso ?? "efectivo"})` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {mostrarBoton && (
        <DevolucionDialog
          orden={orden}
          open={abierto}
          onClose={() => setAbierto(false)}
          onRegistrada={() => {
            setAbierto(false);
            void cargar();
          }}
        />
      )}
    </Card>
  );
}
