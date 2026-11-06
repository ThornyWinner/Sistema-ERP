/**
 * HistorialProveedorDialog.tsx — Historial de un proveedor.
 *
 * Dos secciones:
 *  1. Materiales que surte: stock actual vs. mínimo, precio y valor en inventario,
 *     con indicadores resumen (materiales, valor total, cuántos con stock bajo).
 *  2. Movimientos de inventario: últimas entradas/salidas/ajustes registrados en la
 *     tabla `movimientos_material` para esos materiales (se consultan al abrir).
 */
import { useEffect, useState } from "react";
import { AlertTriangle, History, Package } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Material, Proveedor } from "../../data/mockData";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

interface HistorialProveedorDialogProps {
  proveedor: Proveedor | null;
  /** Materiales cuyo proveedor principal es este proveedor. */
  materiales: Material[];
  onClose: () => void;
}

type Movimiento = {
  id: string;
  materialId: string;
  tipo: string;
  cantidad: number;
  stockAnterior: number | null;
  stockNuevo: number | null;
  motivo: string | null;
  fecha: string;
  usuario: string | null;
};

// Cuántos movimientos recientes se muestran.
const LIMITE_MOVIMIENTOS = 50;

const formatoMoneda = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const formatoFecha = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

// Color del tipo de movimiento: entradas en verde, salidas en rojo, el resto neutro.
function claseTipo(tipo: string) {
  const t = tipo.toLowerCase();
  if (t.includes("entrada") || t.includes("compra")) return "bg-status-completed-bg text-status-completed-text";
  if (t.includes("salida") || t.includes("consumo")) return "bg-status-pending-bg text-status-pending-text";
  return "bg-secondary text-foreground";
}

export default function HistorialProveedorDialog({
  proveedor,
  materiales,
  onClose,
}: HistorialProveedorDialogProps) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ids como texto para que el efecto solo se repita si cambia el conjunto de materiales.
  const idsMateriales = materiales.map((m) => m.id).join(",");

  useEffect(() => {
    if (!proveedor) return;
    const ids = idsMateriales ? idsMateriales.split(",") : [];
    if (ids.length === 0) {
      setMovimientos([]);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);
    supabase
      .from("movimientos_material")
      .select("id,material_id,tipo_movimiento,cantidad,stock_anterior,stock_nuevo,motivo,created_at,usuarios(nombre)")
      .in("material_id", ids)
      .order("created_at", { ascending: false })
      .limit(LIMITE_MOVIMIENTOS)
      .then(({ data, error }) => {
        if (cancelado) return;
        setCargando(false);
        if (error) {
          setError(error.message);
          return;
        }
        setMovimientos(
          (data ?? []).map((m: any) => ({
            id: m.id,
            materialId: m.material_id,
            tipo: m.tipo_movimiento ?? "",
            cantidad: Number(m.cantidad ?? 0),
            stockAnterior: m.stock_anterior == null ? null : Number(m.stock_anterior),
            stockNuevo: m.stock_nuevo == null ? null : Number(m.stock_nuevo),
            motivo: m.motivo,
            fecha: m.created_at,
            usuario: m.usuarios?.nombre ?? null,
          }))
        );
      });
    return () => {
      cancelado = true;
    };
  }, [proveedor, idsMateriales]);

  const materialPorId = new Map(materiales.map((m) => [m.id, m]));
  const valorTotal = materiales.reduce((acc, m) => acc + m.stock * m.precio, 0);
  const conStockBajo = materiales.filter((m) => m.stock < m.stockMinimo).length;

  return (
    <Dialog open={!!proveedor} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial del proveedor</DialogTitle>
          <DialogDescription>{proveedor?.nombre}</DialogDescription>
        </DialogHeader>

        {/* Indicadores resumen */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-secondary p-3">
            <p className="text-xs text-muted-foreground">Materiales</p>
            <p className="text-xl font-semibold">{materiales.length}</p>
          </div>
          <div className="rounded-lg bg-secondary p-3">
            <p className="text-xs text-muted-foreground">Valor en inventario</p>
            <p className="text-xl font-semibold">{formatoMoneda(valorTotal)}</p>
          </div>
          <div className="rounded-lg bg-secondary p-3">
            <p className="text-xs text-muted-foreground">Con stock bajo</p>
            <p className={`text-xl font-semibold ${conStockBajo ? "text-status-pending" : ""}`}>
              {conStockBajo}
            </p>
          </div>
        </div>

        {/* Materiales que surte */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Package className="w-4 h-4 text-muted-foreground" />
            Materiales que surte
          </h3>
          {materiales.length === 0 ? (
            <p className="text-sm text-muted-foreground bg-secondary rounded-lg p-3">
              Ningún material del inventario tiene asignado a este proveedor.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Material</th>
                    <th className="px-3 py-2 text-left">Stock / Mínimo</th>
                    <th className="px-3 py-2 text-right">Precio</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {materiales.map((m) => {
                    const bajo = m.stock < m.stockMinimo;
                    return (
                      <tr key={m.id}>
                        <td className="px-3 py-2">
                          <span className="font-medium">{m.nombre}</span>
                          <span className="ml-2 text-xs text-muted-foreground capitalize">{m.tipo}</span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={bajo ? "text-status-pending font-medium" : ""}>
                            {m.stock}
                          </span>{" "}
                          / {m.stockMinimo} {m.unidad}
                          {bajo && <AlertTriangle className="inline w-3 h-3 ml-1 text-status-pending" />}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{formatoMoneda(m.precio)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {formatoMoneda(m.stock * m.precio)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Movimientos de inventario */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <History className="w-4 h-4 text-muted-foreground" />
            Movimientos recientes
          </h3>
          {cargando ? (
            <p className="text-sm text-muted-foreground p-3">Cargando movimientos...</p>
          ) : error ? (
            <p className="text-sm text-status-pending-text bg-status-pending-bg rounded-lg p-3">
              No se pudieron cargar los movimientos: {error}
            </p>
          ) : movimientos.length === 0 ? (
            <p className="text-sm text-muted-foreground bg-secondary rounded-lg p-3">
              Aún no hay movimientos de inventario registrados para los materiales de este proveedor.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Material</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-right">Cantidad</th>
                    <th className="px-3 py-2 text-left">Stock</th>
                    <th className="px-3 py-2 text-left">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {movimientos.map((mv) => {
                    const material = materialPorId.get(mv.materialId);
                    return (
                      <tr key={mv.id}>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                          {formatoFecha(mv.fecha)}
                        </td>
                        <td className="px-3 py-2">{material?.nombre ?? "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${claseTipo(mv.tipo)}`}>
                            {mv.tipo || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {mv.cantidad} {material?.unidad ?? ""}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                          {mv.stockAnterior != null && mv.stockNuevo != null
                            ? `${mv.stockAnterior} → ${mv.stockNuevo}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {mv.motivo || "—"}
                          {mv.usuario && <span className="block text-xs">por {mv.usuario}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
