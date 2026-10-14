/**
 * RootLayout.tsx — Estructura visual común de todas las páginas protegidas.
 *
 * Distribución:
 *  ┌──────────┬──────────────────────────┐
 *  │          │ Header                   │
 *  │ Sidebar  ├──────────────────────────┤
 *  │          │ <Outlet /> (página hija) │
 *  └──────────┴──────────────────────────┘
 * Solo el área <main> tiene scroll; el sidebar y el header permanecen fijos.
 */
import { Outlet } from "react-router";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

export default function RootLayout() {
  return (
    // Contenedor a pantalla completa; overflow-hidden evita el scroll de la página entera.
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Menú lateral de navegación (filtrado según el rol del usuario) */}
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Barra superior */}
        <Header />
        {/* Zona desplazable donde React Router inserta la página activa */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
