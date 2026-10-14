/**
 * sonner.tsx — Contenedor de notificaciones emergentes (toasts) basado en la librería "sonner".
 * Se monta una sola vez en App.tsx; después se muestran avisos con toast.success(...) / toast.error(...).
 * Toma el tema (claro/oscuro) de next-themes y los colores de las variables CSS del tema.
 */
"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

/** Contenedor global de toasts con los colores del tema de la aplicación. */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
