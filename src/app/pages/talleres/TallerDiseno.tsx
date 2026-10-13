import TallerKanban from "../../components/TallerKanban";
import { useErpData } from "../../context/ErpDataContext";
import { CheckCircle2, XCircle, Lock } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export default function TallerDiseno() {
  const { user } = useAuth();
  const { ordenes, actualizarProgresoTaller } = useErpData();

  const isReadOnly = user?.rol === 'admin_secundario';

  const ordenesTaller = ordenes
    .flatMap((orden) =>
      orden.productos
        .filter((producto) => producto.talleres.includes("diseno"))
        .map((producto) => ({
          id: `${orden.id}::${producto.id}`,
          numero: `${orden.numero} - ${producto.nombre}`,
          cliente: orden.cliente,
          producto: producto.nombre,
          cantidad: producto.cantidad,
          fechaEntrega: orden.fechaEntrega,
          estado: producto.progreso.diseno || "pending",
          detalles: (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Estado del diseño:</p>
              {isReadOnly ? (
                <div className="flex items-center gap-2 px-2 py-1.5 bg-neutral-100 rounded text-xs text-neutral-600">
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