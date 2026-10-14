/**
 * separator.tsx — Línea divisoria horizontal o vertical (Radix Separator).
 * Componente de la librería shadcn/ui: código copiado al proyecto (no es una dependencia de npm),
 * construido sobre primitivas accesibles y estilizado con Tailwind CSS. Todas las piezas aceptan
 * `className` para añadir clases, que se combinan con las de por defecto mediante cn().
 * El atributo `data-slot` identifica cada parte para poder estilizarla desde fuera.
 */
"use client";

import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";

import { cn } from "./utils";

/** Separador. `decorative` (true por defecto) lo oculta a los lectores de pantalla. */
function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator-root"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
