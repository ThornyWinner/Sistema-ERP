/**
 * OrdenCerradaBadge.tsx — Distintivo de orden cerrada: ya se entregó y está liquidada.
 *
 * Solo se muestra cuando se cumplen las dos condiciones (estado "completed" y estado de
 * pago "liquidado"); en cualquier otro caso no renderiza nada.
 * Ejemplo: <OrdenCerradaBadge orden={orden} size="sm" />
 */
import { CircleCheckBig } from "lucide-react";
import type { Orden } from "../data/mockData";

interface OrdenCerradaBadgeProps {
  orden: Pick<Orden, "estado" | "estadoPago">;
  /** Tamaño: "sm" (compacto, para tablas) o "md" (por defecto). */
  size?: "sm" | "md";
}

/** true si la orden ya fue entregada y pagada por completo. */
export const esOrdenCerrada = (orden: Pick<Orden, "estado" | "estadoPago">) =>
  orden.estado === "completed" && orden.estadoPago === "liquidado";

export default function OrdenCerradaBadge({ orden, size = "md" }: OrdenCerradaBadgeProps) {
  if (!esOrdenCerrada(orden)) return null;
  // Renderiza el distintivo de orden cerrada
  return (
    <span
      className={`inline-flex items-center gap-1.5 bg-status-completed text-white dark:bg-status-completed-bg dark:text-status-completed-text dark:ring-1 dark:ring-status-completed/40 rounded-full font-semibold whitespace-nowrap ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      }`}
      title="Orden entregada y pagada en su totalidad"
    >
      <CircleCheckBig className={size === "sm" ? "w-3 h-3" : "w-4 h-4"} />
      Orden Entregada
    </span>
  );
}
