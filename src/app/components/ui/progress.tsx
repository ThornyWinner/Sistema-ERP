/**
 * progress.tsx — Barra de progreso (Radix Progress).
 * Componente de la librería shadcn/ui: código copiado al proyecto (no es una dependencia de npm),
 * construido sobre primitivas accesibles y estilizado con Tailwind CSS. Todas las piezas aceptan
 * `className` para añadir clases, que se combinan con las de por defecto mediante cn().
 * El atributo `data-slot` identifica cada parte para poder estilizarla desde fuera.
 */
"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "./utils";

/** Barra de progreso; `value` (0–100) desplaza el indicador interno con translateX. */
function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
