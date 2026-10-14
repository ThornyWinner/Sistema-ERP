/**
 * TallerKanban.tsx — Tablero Kanban reutilizable para las páginas de cada taller.
 *
 * Reparte los trabajos en tres columnas: Pendiente → En Proceso → Terminado.
 * Cada tarjeta muestra folio, cliente, producto, cantidad y fecha de entrega, más un
 * bloque opcional de detalles específicos del taller (p. ej. colores de hilo en Bordado).
 *
 * Si se pasa `onChangeEstado`, las tarjetas incluyen botones para avanzar el trabajo:
 * "Iniciar" (pendiente → en proceso) y "Completar" (en proceso → terminado).
 */
import { ReactNode } from "react";
import StatusBadge from "./StatusBadge";
import { Card, CardContent } from "./Card";
import { Clock, User, Package } from "lucide-react";

/** Trabajo que se muestra en el tablero (normalmente un producto de una orden). */
interface OrdenTaller {
  /** Identificador único de la tarjeta (se devuelve en onChangeEstado). */
  id: string;
  /** Folio de la orden. */
  numero: string;
  cliente: string;
  producto: string;
  cantidad: number;
  fechaEntrega: string;
  /** Estado en este taller; determina la columna en la que aparece. */
  estado: "pending" | "in-progress" | "completed";
  /** Contenido adicional propio del taller. */
  detalles?: ReactNode;
}

interface TallerKanbanProps {
  titulo: string;
  descripcion: string;
  ordenes: OrdenTaller[];
  /** Callback al pulsar Iniciar/Completar. Si se omite, el tablero es de solo lectura. */
  onChangeEstado?: (ordenId: string, nuevoEstado: "pending" | "in-progress" | "completed") => void;
}

export default function TallerKanban({
  titulo,
  descripcion,
  ordenes,
  onChangeEstado,
}: TallerKanbanProps) {
  // Agrupa los trabajos por estado para llenar cada columna.
  const ordenesPorEstado = {
    pending: ordenes.filter((o) => o.estado === "pending"),
    "in-progress": ordenes.filter((o) => o.estado === "in-progress"),
    completed: ordenes.filter((o) => o.estado === "completed"),
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1>{titulo}</h1>
        <p className="text-muted-foreground mt-1">{descripcion}</p>
      </div>

      {/* Tres columnas en escritorio, una sola en móvil */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* ===== Columna: Pendiente ===== */}
        <div className="bg-status-pending-bg/30 rounded-lg border-2 border-status-pending-bg">
          <div className="p-4 border-b border-status-pending-bg">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-status-pending-text">Pendiente</h3>
              <span className="px-2 py-1 bg-status-pending-bg text-status-pending-text rounded-full text-sm font-medium">
                {ordenesPorEstado.pending.length}
              </span>
            </div>
          </div>
          <div className="p-4 space-y-3 min-h-[400px]">
            {ordenesPorEstado.pending.map((orden) => (
              <Card key={orden.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{orden.numero}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <User className="w-3 h-3" />
                        {orden.cliente}
                      </p>
                    </div>
                    <StatusBadge status="pending" size="sm" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-foreground flex items-center gap-1">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      {orden.producto}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Cantidad: {orden.cantidad} uds
                    </p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Entrega: {new Date(orden.fechaEntrega).toLocaleDateString()}
                    </p>
                  </div>
                  {orden.detalles && <div className="pt-2 border-t border-border">{orden.detalles}</div>}
                  {/* Pasa el trabajo a "En Proceso" */}
                  {onChangeEstado && (
                    <button
                      onClick={() => onChangeEstado(orden.id, "in-progress")}
                      className="w-full mt-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
                    >
                      Iniciar
                    </button>
                  )}
                </CardContent>
              </Card>
            ))}
            {ordenesPorEstado.pending.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">
                No hay órdenes pendientes
              </p>
            )}
          </div>
        </div>

        {/* ===== Columna: En Proceso ===== */}
        <div className="bg-status-in-progress-bg/30 rounded-lg border-2 border-status-in-progress-bg">
          <div className="p-4 border-b border-status-in-progress-bg">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-status-in-progress-text">En Proceso</h3>
              <span className="px-2 py-1 bg-status-in-progress-bg text-status-in-progress-text rounded-full text-sm font-medium">
                {ordenesPorEstado["in-progress"].length}
              </span>
            </div>
          </div>
          <div className="p-4 space-y-3 min-h-[400px]">
            {ordenesPorEstado["in-progress"].map((orden) => (
              <Card key={orden.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{orden.numero}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <User className="w-3 h-3" />
                        {orden.cliente}
                      </p>
                    </div>
                    <StatusBadge status="in-progress" size="sm" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-foreground flex items-center gap-1">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      {orden.producto}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Cantidad: {orden.cantidad} uds
                    </p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Entrega: {new Date(orden.fechaEntrega).toLocaleDateString()}
                    </p>
                  </div>
                  {orden.detalles && <div className="pt-2 border-t border-border">{orden.detalles}</div>}
                  {/* Marca el trabajo como terminado en este taller */}
                  {onChangeEstado && (
                    <button
                      onClick={() => onChangeEstado(orden.id, "completed")}
                      className="w-full mt-2 px-3 py-2 bg-status-completed text-primary-foreground rounded-lg hover:bg-status-completed/90 transition-colors text-sm"
                    >
                      Completar
                    </button>
                  )}
                </CardContent>
              </Card>
            ))}
            {ordenesPorEstado["in-progress"].length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">
                No hay órdenes en proceso
              </p>
            )}
          </div>
        </div>

        {/* ===== Columna: Terminado (con scroll propio porque se acumulan) ===== */}
        <div className="bg-status-completed-bg/30 rounded-lg border-2 border-status-completed-bg">
          <div className="p-4 border-b border-status-completed-bg">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-status-completed-text">Terminado</h3>
              <span className="px-2 py-1 bg-status-completed-bg text-status-completed-text rounded-full text-sm font-medium">
                {ordenesPorEstado.completed.length}
              </span>
            </div>
          </div>
          <div className="p-4 space-y-3 min-h-[400px] max-h-[600px] overflow-y-auto">
            {ordenesPorEstado.completed.map((orden) => (
              <Card key={orden.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{orden.numero}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <User className="w-3 h-3" />
                        {orden.cliente}
                      </p>
                    </div>
                    <StatusBadge status="completed" size="sm" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-foreground flex items-center gap-1">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      {orden.producto}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Cantidad: {orden.cantidad} uds
                    </p>
                  </div>
                  {orden.detalles && <div className="pt-2 border-t border-border">{orden.detalles}</div>}
                </CardContent>
              </Card>
            ))}
            {ordenesPorEstado.completed.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">
                No hay órdenes terminadas
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
