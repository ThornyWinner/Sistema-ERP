/**
 * ThemeToggle.tsx — Botón para alternar entre modo claro y modo oscuro.
 *
 * Usa next-themes (ThemeProvider en App.tsx), que agrega/quita la clase "dark"
 * en <html> y guarda la preferencia en localStorage (clave "theme"), así que el
 * tema elegido se conserva al recargar o al volver a iniciar sesión.
 */
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // El tema solo se conoce en el navegador tras montar; antes se muestra un hueco
  // del mismo tamaño para evitar parpadeos del icono.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const oscuro = resolvedTheme === "dark";
  const etiqueta = oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro";

  return (
    <button
      type="button"
      onClick={() => setTheme(oscuro ? "light" : "dark")}
      aria-label={etiqueta}
      title={etiqueta}
      className={`w-10 h-10 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors ${className}`}
    >
      {montado && (oscuro ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />)}
    </button>
  );
}
