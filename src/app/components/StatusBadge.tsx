/**
 * StatusBadge.tsx — Etiqueta (píldora) de color que indica un estado.
 *
 * Muestra un punto de color y un texto: rojo = Pendiente, ámbar = En Proceso,
 * verde = Terminado. Los colores salen de las variables --status-* de theme.css.
 * Ejemplo: <StatusBadge status="in-progress" size="sm" />
 */
type Status = "pending" | "in-progress" | "completed";

interface StatusBadgeProps {
  status: Status;
  /** Texto a mostrar; si se omite se usa la etiqueta por defecto del estado. */
  label?: string;
  /** Tamaño: "sm" (compacto, para tablas/tarjetas) o "md" (por defecto). */
  size?: "sm" | "md";
}

// Etiqueta y clases de Tailwind (fondo, texto y punto) para cada estado.
const statusConfig = {
  pending: {
    label: "Pendiente",
    bgColor: "bg-status-pending-bg",
    textColor: "text-status-pending-text",
    dotColor: "bg-status-pending",
  },
  "in-progress": {
    label: "En Proceso",
    bgColor: "bg-status-in-progress-bg",
    textColor: "text-status-in-progress-text",
    dotColor: "bg-status-in-progress",
  },
  completed: {
    label: "Terminado",
    bgColor: "bg-status-completed-bg",
    textColor: "text-status-completed-text",
    dotColor: "bg-status-completed",
  },
};

export default function StatusBadge({ status, label, size = "md" }: StatusBadgeProps) {
  const config = statusConfig[status];
  const displayLabel = label || config.label;

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${config.bgColor} ${config.textColor} rounded-full font-medium ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      }`}
    >
      {/* Punto indicador del color del estado */}
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`}></span>
      {displayLabel}
    </span>
  );
}
