/**
 * Card.tsx — Tarjeta contenedora sencilla propia del proyecto.
 *
 * Versión ligera (sin dependencias) de la tarjeta de ui/card.tsx. Se compone de:
 *  <Card>
 *    <CardHeader><CardTitle>Título</CardTitle></CardHeader>
 *    <CardContent>...contenido...</CardContent>
 *  </Card>
 * Todas las piezas aceptan `className` para añadir clases de Tailwind.
 */
import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

/** Contenedor con fondo de tarjeta, bordes redondeados y borde gris. */
export function Card({ children, className = "" }: CardProps) {
  return (
    <div className={`bg-card rounded-lg border border-border ${className}`}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

/** Cabecera de la tarjeta con línea divisoria inferior. */
export function CardHeader({ children, className = "" }: CardHeaderProps) {
  return <div className={`px-6 py-4 border-b border-border ${className}`}>{children}</div>;
}

interface CardTitleProps {
  children: ReactNode;
  className?: string;
}

/** Título de la tarjeta (<h3> en negritas). */
export function CardTitle({ children, className = "" }: CardTitleProps) {
  return <h3 className={`font-semibold text-foreground ${className}`}>{children}</h3>;
}

interface CardContentProps {
  children: ReactNode;
  className?: string;
}

/** Cuerpo de la tarjeta con relleno interno. */
export function CardContent({ children, className = "" }: CardContentProps) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}
