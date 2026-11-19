/**
 * PaginaPublica.tsx — Marco de las páginas que abre el cliente sin iniciar sesión
 * (seguimiento de su pedido y captura de tallas): logotipo, contenido centrado y pie.
 * Pensado primero para celular.
 */
import type { ReactNode } from "react";
import ThemeToggle from "./ThemeToggle";

export default function PaginaPublica({ children, empresa }: { children: ReactNode; empresa?: string }) {
  return (
    <div className="relative min-h-screen bg-neutral-50 dark:bg-background">
      <ThemeToggle className="absolute top-3 right-3" />
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
        <header className="text-center mb-6">
          <img
            src="/logo-uis.png"
            alt={empresa || "Uniformes Industriales de Saltillo"}
            className="mx-auto w-full max-w-[200px] h-auto dark:hidden"
          />
          <img
            src="/logo-uis-dark.png"
            alt={empresa || "Uniformes Industriales de Saltillo"}
            className="mx-auto w-full max-w-[200px] h-auto hidden dark:block"
          />
        </header>
        <main className="space-y-4">{children}</main>
        <footer className="mt-10 text-center text-xs text-muted-foreground">
          {empresa || "Uniformes Industriales de Saltillo"}
        </footer>
      </div>
    </div>
  );
}

/** Tarjeta simple para las páginas públicas. */
export function TarjetaPublica({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`bg-card text-card-foreground border border-border rounded-xl p-4 sm:p-6 ${className}`}>{children}</section>;
}
