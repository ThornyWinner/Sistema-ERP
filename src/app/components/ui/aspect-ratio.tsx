/**
 * aspect-ratio.tsx — Contenedor que mantiene una proporción fija (p. ej. 16/9) para imágenes o vídeos.
 * Componente de la librería shadcn/ui: código copiado al proyecto (no es una dependencia de npm),
 * construido sobre primitivas accesibles y estilizado con Tailwind CSS. Todas las piezas aceptan
 * `className` para añadir clases, que se combinan con las de por defecto mediante cn().
 * El atributo `data-slot` identifica cada parte para poder estilizarla desde fuera.
 */
"use client";

import * as AspectRatioPrimitive from "@radix-ui/react-aspect-ratio";

/** Envoltorio de Radix AspectRatio; la proporción se indica con la prop `ratio`. */
function AspectRatio({
  ...props
}: React.ComponentProps<typeof AspectRatioPrimitive.Root>) {
  return <AspectRatioPrimitive.Root data-slot="aspect-ratio" {...props} />;
}

export { AspectRatio };
