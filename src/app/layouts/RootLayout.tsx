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
 *
 * Esqueleto de carga con la estructura de la propia página de destino (Esqueleto.tsx):
 *  - Mientras se descargan por primera vez los datos del ERP tras iniciar sesión.
 *  - Unos instantes al cambiar de sección (cambia la ruta, no los filtros de la URL).
 * Las recargas posteriores (p. ej. después de guardar) NO lo muestran, para no
 * interrumpir al usuario ni tapar los diálogos abiertos.
 */
import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import Esqueleto from "../components/Esqueleto";
import { useErpData } from "../context/ErpDataContext";
import { useTransicionBreve } from "../hooks/useTransicionBreve";

/** Duración del skeleton al cambiar de sección (ms). */
const TRANSICION_SECCION_MS = 350;

export default function RootLayout() {
  const { pathname } = useLocation();
  const { loading } = useErpData();

  // true en cuanto termina la primera carga de datos; a partir de ahí, las
  // recargas se hacen "en segundo plano" sin reemplazar la página.
  const [datosListos, setDatosListos] = useState(!loading);
  useEffect(() => {
    if (!loading) setDatosListos(true);
  }, [loading]);

  const cambiandoSeccion = useTransicionBreve(pathname, TRANSICION_SECCION_MS);
  const mostrarSkeleton = !datosListos || cambiandoSeccion;

  // Al cambiar de sección, la nueva página empieza desde arriba.
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    // Contenedor a pantalla completa; overflow-hidden evita el scroll de la página entera.
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Menú lateral de navegación (filtrado según el rol del usuario) */}
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Barra superior */}
        <Header />
        {/* Zona desplazable donde React Router inserta la página activa */}
        <main ref={mainRef} className="flex-1 overflow-y-auto">
          {/* La página de destino se monta ya, pero se ve como su propio esqueleto */}
          <Esqueleto activo={mostrarSkeleton} className="min-h-full">
            <Outlet />
          </Esqueleto>
        </main>
      </div>
    </div>
  );
}
