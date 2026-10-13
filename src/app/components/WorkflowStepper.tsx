import { Taller, TallerEstado } from "../data/mockData";
import { Check, Clock, Circle, Palette, Scissors, Shirt, Sparkles, Layers } from "lucide-react";

interface WorkflowStepperProps {
  talleres: Taller[];
  progreso: Partial<Record<Taller, TallerEstado>>;
  size?: "sm" | "md" | "lg";
  showLabels?: boolean;
}

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

  const getStatusColor = (estado?: TallerEstado) => {
    switch (estado) {
      case "completed":
        return "bg-status-completed text-status-completed-text border-status-completed";
      case "in-progress":
        return "bg-status-in-progress text-status-in-progress-text border-status-in-progress";
      case "pending":
      default:
        return "bg-status-pending-bg text-status-pending-text border-status-pending";
    }
  };

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
        const isLast = index === talleres.length - 1;

        return (
          <div key={taller} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
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
