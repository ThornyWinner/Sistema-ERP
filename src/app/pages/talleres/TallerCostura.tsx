/**
 * TallerCostura.tsx — Tablero Kanban del taller de Costura (ruta /talleres/costura).
 *
 * Muestra los productos cuyo flujo incluye "costura" agrupados por su estado en este
 * taller; Iniciar/Completar guardan el avance en Supabase. La barra de progreso (fija
 * al 65%), el contador de prendas y la casilla de control de calidad son elementos
 * de maqueta: no están conectados a datos reales.
 */
import TallerKanban from "../../components/TallerKanban";
import { useErpData } from "../../context/ErpDataContext";

export default function TallerCostura() {
  const { ordenes, actualizarProgresoTaller } = useErpData();

  // Una tarjeta por cada producto (de cualquier orden) que pasa por Costura.
  const ordenesTaller = ordenes
    .flatMap((orden) =>
      orden.productos
        .filter((producto) => producto.talleres.includes("costura"))
        .map((producto) => ({
          // Id compuesto "ordenId::productoId".
          id: `${orden.id}::${producto.id}`,
          numero: `${orden.numero} - ${producto.nombre}`,
          cliente: orden.cliente,
          producto: producto.nombre,
          cantidad: producto.cantidad,
          fechaEntrega: orden.fechaEntrega,
          estado: producto.progreso.costura || "pending",
          detalles: (
            <div className="space-y-2">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Progreso de ensamblaje:</p>
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: "65%" }}></div>
                </div>
                <p className="text-xs text-right text-muted-foreground">65%</p>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Prendas terminadas:</span>
                <input
                  type="number"
                  min="0"
                  max={producto.cantidad}
                  defaultValue={0}
                  className="w-16 px-2 py-1 bg-input-background border border-border rounded text-center"
                />
              </div>
              <div className="pt-2 border-t border-border space-y-1">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" className="rounded" defaultChecked />
                  <span className="text-muted-foreground">Control de calidad</span>
                </label>
              </div>
            </div>
          ),
          ordenId: orden.id,
          productoId: producto.id,
        }))
    );

  // Extrae el id del producto y guarda el nuevo estado de Costura.
  const handleChangeEstado = (itemId: string, nuevoEstado: any) => {
    const [, productoId] = itemId.split("::");
    void actualizarProgresoTaller(productoId, "costura", nuevoEstado);
  };

  return (
    <TallerKanban
      titulo="Taller de Costura"
      descripcion="Ensamblaje y confección de prendas"
      ordenes={ordenesTaller}
      onChangeEstado={handleChangeEstado}
    />
  );
}
