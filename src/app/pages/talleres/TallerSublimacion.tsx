/**
 * TallerSublimacion.tsx — Tablero Kanban del taller de Sublimación (ruta /talleres/sublimacion).
 *
 * Muestra los productos cuyo flujo incluye "sublimacion" agrupados por su estado en
 * este taller; Iniciar/Completar guardan el avance en Supabase. El campo "Piezas
 * completadas" de cada tarjeta es solo informativo (no se guarda).
 */
import TallerKanban from "../../components/TallerKanban";
import { useErpData } from "../../context/ErpDataContext";

export default function TallerSublimacion() {
  const { ordenes, actualizarProgresoTaller } = useErpData();

  // Una tarjeta por cada producto (de cualquier orden) que pasa por Sublimación.
  const ordenesTaller = ordenes
    .flatMap((orden) =>
      orden.productos
        .filter((producto) => producto.talleres.includes("sublimacion"))
        .map((producto) => ({
          // Id compuesto "ordenId::productoId".
          id: `${orden.id}::${producto.id}`,
          numero: `${orden.numero} - ${producto.nombre}`,
          cliente: orden.cliente,
          producto: producto.nombre,
          cantidad: producto.cantidad,
          fechaEntrega: orden.fechaEntrega,
          estado: producto.progreso.sublimacion || "pending",
          detalles: (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Material requerido:</p>
              <p className="text-xs text-foreground">Tela lista para sublimar</p>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Piezas completadas:</span>
                {/* Campo no controlado (defaultValue): su valor no se guarda */}
                <input
                  type="number"
                  min="0"
                  max={producto.cantidad}
                  defaultValue={0}
                  className="w-16 px-2 py-1 bg-input-background border border-border rounded text-center"
                />
              </div>
            </div>
          ),
          ordenId: orden.id,
          productoId: producto.id,
        }))
    );

  // Extrae el id del producto y guarda el nuevo estado de Sublimación.
  const handleChangeEstado = (itemId: string, nuevoEstado: any) => {
    const [, productoId] = itemId.split("::");
    void actualizarProgresoTaller(productoId, "sublimacion", nuevoEstado);
  };

  return (
    <TallerKanban
      titulo="Taller de Sublimación"
      descripcion="Proceso de sublimación de telas y materiales"
      ordenes={ordenesTaller}
      onChangeEstado={handleChangeEstado}
    />
  );
}
