/**
 * skeleton.tsx — Bloque gris animado que se muestra como marcador mientras carga el contenido.
 * Componente de la librería shadcn/ui: código copiado al proyecto (no es una dependencia de npm),
 * construido sobre primitivas accesibles y estilizado con Tailwind CSS. Todas las piezas aceptan
 * `className` para añadir clases, que se combinan con las de por defecto mediante cn().
 * El atributo `data-slot` identifica cada parte para poder estilizarla desde fuera.
 */
import { cn } from "./utils";

/** Rectángulo con animación de pulso; su tamaño se define con className. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
