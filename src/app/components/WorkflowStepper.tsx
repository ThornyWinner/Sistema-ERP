/**
 * WorkflowStepper.tsx — Indicador visual del avance de un producto por los talleres.
 *
 * Dibuja una fila de círculos conectados por líneas, uno por taller (Diseño →
 * Sublimación → Corte → Costura → Bordado), coloreados según su estado:
 *  - rojo claro: pendiente      (muestra el icono del taller)
 *  - ámbar:      en proceso     (muestra el icono del taller)
 *  - verde:      completado     (muestra una palomita ✓)
 * La línea que sale de un taller completado también se pinta de verde.
 */
import { Taller, TallerEstado } from "../data/mockData";
import { Check, Clock, Circle, Palette, Scissors, Shirt, Sparkles, Layers } from "lucide-react";

interface WorkflowStepperProps {
  /** Talleres a mostrar, en el orden del flujo. */
  talleres: Taller[];
  /** Estado de cada taller; los que falten se consideran pendientes. */
  progreso: Partial<Record<Taller, TallerEstado>>;
  size?: "sm" | "md" | "lg";
  /** Mostrar el nombre del taller debajo de cada círculo. */
  showLabels?: boolean;
}

// Nombre, icono y color de cada taller.
const tallerConfig: Record<
  Taller,
  {
    label: string;
    icon: typeof Palette;
    color: string;
  }
> = {
  diseno: {
    label: "Diseño",
    icon: Palette,
    color: "text-purple-500",
  },
  sublimacion: {
    label: "Sublimación",
    icon: Sparkles,
    color: "text-pink-500",
  },
  corte: {
    label: "Corte",
    icon: Scissors,
    color: "text-blue-500",
  },
  costura: {
    label: "Costura",
    icon: Layers,
    color: "text-green-500",
  },
  bordado: {
    label: "Bordado",
    icon: Shirt,
    color: "text-orange-500",
  },
};

export default function WorkflowStepper({
  talleres,
  progreso,
  size = "md",
  showLabels = true,
}: WorkflowStepperProps) {
  // Tamaño del círculo y de su icono según la prop `size`.
  const sizeClasses = {
    sm: "w-6 h-6 text-xs",
    md: "w-8 h-8 text-sm",
    lg: "w-10 h-10 text-base",
  };

  const iconSizeClasses = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  // Clases de color (fondo, texto y borde) del círculo según el estado.
  const getStatusColor = (estado?: TallerEstado) => {
    switch (estado) {
      case "completed":
        return "bg-status-completed text-status-completed-text border-status-completed dark:bg-status-completed-bg";
      case "in-progress":
        return "bg-status-in-progress text-status-in-progress-text border-status-in-progress dark:bg-status-in-progress-bg";
      case "pending":
      default:
        return "bg-status-pending-bg text-status-pending-text border-status-pending";
    }
  };

  // Icono asociado al estado (en la práctica solo se usa el de "completado").
  const getStatusIcon = (estado?: TallerEstado) => {
    switch (estado) {
      case "completed":
        return Check;
      case "in-progress":
        return Clock;
      case "pending":
      default:
        return Circle;
    }
  };

  return (
    <div className="flex items-center gap-2">
      {talleres.map((taller, index) => {
        const config = tallerConfig[taller];
        const estado = progreso[taller];
        const StatusIcon = getStatusIcon(estado);
        const TallerIcon = config.icon;
        // El último taller no lleva línea conectora a su derecha.
        const isLast = index === talleres.length - 1;

        return (
          <div key={taller} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              {/* Círculo del taller; el atributo title muestra el estado al pasar el cursor */}
              <div
                className={`relative ${sizeClasses[size]} rounded-full border-2 flex items-center justify-center transition-all ${getStatusColor(
                  estado
                )}`}
                title={`${config.label}: ${estado === "completed" ? "Completado" : estado === "in-progress" ? "En Proceso" : "Pendiente"}`}
              >
                {estado === "completed" ? (
                  <StatusIcon className={iconSizeClasses[size]} />
                ) : (
                  <TallerIcon className={iconSizeClasses[size]} />
                )}
              </div>
              {showLabels && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {config.label}
                </span>
              )}
            </div>
            {/* Línea conectora hacia el siguiente taller */}
            {!isLast && (
              <div
                className={`h-0.5 w-6 ${
                  estado === "completed"
                    ? "bg-status-completed"
                    : "bg-border"
                }`}
              ></div>
            )}
          </div>
        );
      })}
    </div>
  );
}
