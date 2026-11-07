/**
 * TallerDiseno.tsx — Tablero Kanban del taller de Diseño (ruta /talleres/diseno).
 *
 * Muestra todos los productos de todas las órdenes cuyo flujo incluye "diseno",
 * repartidos por su estado en este taller. Los botones Iniciar/Completar actualizan
 * el avance en Supabase. Además, cada tarjeta ofrece botones "Aprobar"/"Rechazar"
 * del diseño (por ahora solo visuales, sin lógica asociada), que se ocultan para el
 * administrador secundario (solo lectura).
 */
import TallerKanban from "../../components/TallerKanban";
import { useErpData } from "../../context/ErpDataContext";
import { CheckCircle2, XCircle, Lock } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export default function TallerDiseno() {
  const { user } = useAuth();
  const { ordenes, actualizarProgresoTaller } = useErpData();

  // El administrador secundario solo puede consultar.
  const isReadOnly = user?.rol === 'admin_secundario';

  // Convierte órdenes → tarjetas: una tarjeta por cada producto que pasa por Diseño.
  const ordenesTaller = ordenes
    .flatMap((orden) =>
      orden.productos
        .filter((producto) => producto.talleres.includes("diseno"))
        .map((producto) => ({
          // Id compuesto "ordenId::productoId" para identificar la tarjeta de forma única.
          id: `${orden.id}::${producto.id}`,
          numero: `${orden.numero} - ${producto.nombre}`,
          cliente: orden.cliente,
          producto: producto.nombre,
          cantidad: producto.cantidad,
          fechaEntrega: orden.fechaEntrega,
          // Estado del producto en este taller (pendiente si aún no tiene registro).
          estado: producto.progreso.diseno || "pending",
          // Contenido extra de la tarjeta: aprobación del diseño.
          detalles: (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Estado del diseño:</p>
              {isReadOnly ? (
                <div className="flex items-center gap-2 px-2 py-1.5 bg-neutral-100 dark:bg-muted rounded text-xs text-muted-foreground">
                  <Lock className="w-3 h-3" />
                  <span>Solo lectura</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-status-completed-bg text-status-completed-text rounded text-xs hover:bg-status-completed-bg/80 transition-colors">
                    <CheckCircle2 className="w-3 h-3" />
                    Aprobar
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-status-pending-bg text-status-pending-text rounded text-xs hover:bg-status-pending-bg/80 transition-colors">
                    <XCircle className="w-3 h-3" />
                    Rechazar
                  </button>
                </div>
              )}
            </div>
          ),
          ordenId: orden.id,
          productoId: producto.id,
        }))
    );

  // Al pulsar Iniciar/Completar: extrae el id del producto (orden_detalle) del id
  // compuesto y guarda el nuevo estado de Diseño en la base de datos.
  const handleChangeEstado = (itemId: string, nuevoEstado: any) => {
    const [, productoId] = itemId.split("::");
    void actualizarProgresoTaller(productoId, "diseno", nuevoEstado);
  };

  return (
    <TallerKanban
      titulo="Taller de Diseño"
      descripcion="Diseño y aprobación de uniformes antes de producción"
      ordenes={ordenesTaller}
      onChangeEstado={handleChangeEstado}
    />
  );
}