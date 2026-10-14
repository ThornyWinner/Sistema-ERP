/**
 * TallerBordado.tsx — Tablero Kanban del taller de Bordado (ruta /talleres/bordado).
 *
 * Muestra los productos cuyo flujo incluye "bordado" agrupados por su estado en este
 * taller; Iniciar/Completar guardan el avance en Supabase. Cada tarjeta muestra los
 * datos de personalización capturados en la orden (logotipo y colores de hilo), más
 * un contador de bordados y una casilla de revisión final (solo visuales).
 */
import TallerKanban from "../../components/TallerKanban";
import { useErpData } from "../../context/ErpDataContext";
import { Sparkles } from "lucide-react";

export default function TallerBordado() {
  const { ordenes, actualizarProgresoTaller } = useErpData();

  // Una tarjeta por cada producto (de cualquier orden) que pasa por Bordado.
  const ordenesTaller = ordenes
    .flatMap((orden) =>
      orden.productos
        .filter((producto) => producto.talleres.includes("bordado"))
        .map((producto) => ({
          // Id compuesto "ordenId::productoId".
          id: `${orden.id}::${producto.id}`,
          numero: `${orden.numero} - ${producto.nombre}`,
          cliente: orden.cliente,
          producto: producto.nombre,
          cantidad: producto.cantidad,
          fechaEntrega: orden.fechaEntrega,
          estado: producto.progreso.bordado || "pending",
          detalles: (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <Sparkles className="w-3 h-3 text-primary" />
                <span className="text-muted-foreground">Diseño de bordado:</span>
              </div>
              {/* Logotipo de la personalización o texto genérico si no se especificó */}
              <div className="p-2 bg-secondary rounded text-xs text-center text-foreground">
                {producto.personalizacion?.logotipo || "Logo corporativo"}
              </div>
              {/* Etiquetas con los colores de hilo a utilizar */}
              {producto.personalizacion?.coloresHilo && (
                <div className="flex flex-wrap gap-1 text-xs">
                  {producto.personalizacion.coloresHilo.map((color, i) => (
                    <span key={i} className="px-2 py-0.5 bg-secondary rounded text-xs">
                      {color}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Bordados completados:</span>
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
                  <span className="text-muted-foreground">Revisión final</span>
                </label>
              </div>
            </div>
          ),
          ordenId: orden.id,
          productoId: producto.id,
        }))
    );

  // Extrae el id del producto y guarda el nuevo estado de Bordado.
  const handleChangeEstado = (itemId: string, nuevoEstado: any) => {
    const [, productoId] = itemId.split("::");
    void actualizarProgresoTaller(productoId, "bordado", nuevoEstado);
  };

  return (
    <TallerKanban
      titulo="Taller de Bordado"
      descripcion="Bordado de logos y detalles personalizados"
      ordenes={ordenesTaller}
      onChangeEstado={handleChangeEstado}
    />
  );
}
