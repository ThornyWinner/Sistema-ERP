/**
 * StatCard.tsx — Tarjeta de indicador (KPI) para el Dashboard y reportes.
 *
 * Muestra un título, un valor destacado, un icono de color y, opcionalmente, una
 * tendencia porcentual (↑ verde / ↓ roja) y un pie de tarjeta con contenido libre.
 */
import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface StatCardProps {
  title: string;
  /** Valor principal (número o texto ya formateado, p. ej. "$12,500"). */
  value: string | number;
  /** Componente de icono de lucide-react (se pasa el componente, no un elemento). */
  icon: LucideIcon;
  /** Variación porcentual respecto a un periodo anterior. */
  trend?: {
    value: number;
    isPositive: boolean;
  };
  /** Esquema de color del icono. */
  color?: "primary" | "warning" | "danger" | "success";
  /** Contenido adicional bajo el valor (texto, enlaces...). */
  footer?: ReactNode;
}

// Clases de fondo y color del icono para cada esquema.
const colorConfig = {
  primary: "bg-primary/10 text-primary",
  warning: "bg-status-in-progress-bg text-status-in-progress",
  danger: "bg-status-pending-bg text-status-pending",
  success: "bg-status-completed-bg text-status-completed"
};

export default function StatCard({
  title,
  value,
  // Se renombra a mayúscula para poder usarlo como componente JSX: <Icon />.
  icon: Icon,
  trend,
  color = "primary",
  footer,
}: StatCardProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <p className="text-3xl font-semibold text-foreground mb-2">{value}</p>
          {/* Tendencia opcional: flecha y porcentaje en valor absoluto */}
          {trend && (
            <p
              className={`text-sm font-medium ${
                trend.isPositive ? "text-status-completed" : "text-status-pending"
              }`}
            >
              {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
            </p>
          )}
          {footer && <div className="mt-3 text-sm text-muted-foreground">{footer}</div>}
        </div>
        {/* Icono a la derecha con el color elegido */}
        <div className={`p-3 rounded-lg ${colorConfig[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
