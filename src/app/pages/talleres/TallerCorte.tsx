/**
 * TallerCorte.tsx — Tablero Kanban del taller de Corte (ruta /talleres/corte).
 *
 * Muestra los productos cuyo flujo incluye "corte" agrupados por su estado en este
 * taller; Iniciar/Completar guardan el avance en Supabase. Cada tarjeta indica las
 * piezas a cortar e incluye un contador de piezas cortadas y una casilla de
 * "Material verificado" (ambos solo visuales, no se guardan).
 */
import TallerKanban from "../../components/TallerKanban";
import { useErpData } from "../../context/ErpDataContext";
import { Ruler } from "lucide-react";

export default function TallerCorte() {
  const { ordenes, actualizarProgresoTaller } = useErpData();

  // Una tarjeta por cada producto (de cualquier orden) que pasa por Corte.
  const ordenesTaller = ordenes
    .flatMap((orden) =>
      orden.productos
        .filter((producto) => producto.talleres.includes("corte"))
        .map((producto) => ({
          // Id compuesto "ordenId::productoId".
          id: `${orden.id}::${producto.id}`,
          numero: `${orden.numero} - ${producto.nombre}`,
          cliente: orden.cliente,
          producto: producto.nombre,
          cantidad: producto.cantidad,
          fechaEntrega: orden.fechaEntrega,
          estado: producto.progreso.corte || "pending",
          detalles: (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <Ruler className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">Cantidad a cortar:</span>
                <span className="font-medium text-foreground">{producto.cantidad} piezas</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Cortadas:</span>
                <input
                  type="number"
                  min="0"
                  max={producto.cantidad}
                  defaultValue={0}
                  className="w-16 px-2 py-1 bg-input-background border border-border rounded text-center"
                />
              </div>
              <div className="pt-2 border-t border-border">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" className="rounded" />
                  <span className="text-muted-foreground">Material verificado</span>
                </label>
              </div>
            </div>
          ),
          ordenId: orden.id,
          productoId: producto.id,
        }))
    );

  // Extrae el id del producto y guarda el nuevo estado de Corte.
  const handleChangeEstado = (itemId: string, nuevoEstado: any) => {
    const [, productoId] = itemId.split("::");
    void actualizarProgresoTaller(productoId, "corte", nuevoEstado);
  };

  return (
    <TallerKanban
      titulo="Taller de Corte"
      descripcion="Corte de piezas según patrones y especificaciones"
      ordenes={ordenesTaller}
      onChangeEstado={handleChangeEstado}
    />
  );
}
