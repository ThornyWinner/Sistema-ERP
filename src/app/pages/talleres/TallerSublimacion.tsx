import TallerKanban from "../../components/TallerKanban";
import { useErpData } from "../../context/ErpDataContext";

export default function TallerSublimacion() {
  const { ordenes, actualizarProgresoTaller } = useErpData();

  const ordenesTaller = ordenes
    .flatMap((orden) =>
      orden.productos
        .filter((producto) => producto.talleres.includes("sublimacion"))
        .map((producto) => ({
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
