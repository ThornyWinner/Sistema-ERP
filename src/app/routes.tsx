/**
 * routes.tsx — Definición de las rutas de la aplicación (React Router v7).
 *
 * Estructura:
 *  - "/login": página pública de inicio de sesión.
 *  - "/checar": reloj checador (QR de cada sede), con sesión pero sin menú lateral.
 *  - "/":      ruta protegida (requiere sesión). Renderiza RootLayout (sidebar +
 *              header) y, dentro de su <Outlet />, la página hija que coincida.
 *
 * Nota: ProtectedRoute solo verifica que exista sesión; los permisos por rol
 * se aplican en el menú y dentro de las páginas (ver utils/permissions.ts).
 */
import type { ComponentType } from "react";
import { createBrowserRouter } from "react-router";
import RootLayout from "./layouts/RootLayout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";

/**
 * Carga diferida de páginas: cada página se descarga en su propio archivo JS
 * solo cuando el usuario entra a esa ruta, en lugar de ir todo en el bundle
 * inicial. Login, Dashboard y el layout se cargan de inmediato porque son lo
 * primero que se ve.
 */
function pagina(cargar: () => Promise<{ default: ComponentType }>) {
  return async () => ({ Component: (await cargar()).default });
}

export const router = createBrowserRouter([
  // Ruta pública: formulario de acceso.
  {
    path: "/login",
    Component: Login,
  },
  // Reloj checador (se abre desde el QR de cada sede, en el celular): requiere sesión,
  // pero va sin menú lateral para verse completo en pantallas pequeñas.
  {
    path: "/checar",
    lazy: async () => {
      const { default: Checar } = await import("./pages/Checar");
      return {
        Component: () => (
          <ProtectedRoute>
            <Checar />
          </ProtectedRoute>
        ),
      };
    },
  },
  // Ruta raíz protegida: si no hay sesión, ProtectedRoute redirige a /login.
  {
    path: "/",
    Component: () => (
      <ProtectedRoute>
        <RootLayout />
      </ProtectedRoute>
    ),
    // Páginas que se muestran dentro del layout principal (en su <Outlet />).
    children: [
      // "/" → panel principal con indicadores.
      { index: true, Component: Dashboard },
      // Inventario de materia prima y de productos terminados.
      { path: "inventario/materiales", lazy: pagina(() => import("./pages/InventarioMateriales")) },
      { path: "inventario/productos", lazy: pagina(() => import("./pages/InventarioProductos")) },
      // Alta de materia prima.
      { path: "materiales/nuevo", lazy: pagina(() => import("./pages/MaterialForm")) },
      // El mismo formulario sirve para crear y para editar (según exista :id).
      { path: "productos/nuevo", lazy: pagina(() => import("./pages/ProductoForm")) },
      { path: "productos/editar/:id", lazy: pagina(() => import("./pages/ProductoForm")) },
      // Órdenes: listado y detalle de una orden concreta.
      { path: "ordenes", lazy: pagina(() => import("./pages/Ordenes")) },
      { path: "ordenes/:id", lazy: pagina(() => import("./pages/OrdenDetalle")) },
      // Tableros de cada taller del flujo de producción.
      { path: "talleres/diseno", lazy: pagina(() => import("./pages/talleres/TallerDiseno")) },
      { path: "talleres/sublimacion", lazy: pagina(() => import("./pages/talleres/TallerSublimacion")) },
      { path: "talleres/corte", lazy: pagina(() => import("./pages/talleres/TallerCorte")) },
      { path: "talleres/costura", lazy: pagina(() => import("./pages/talleres/TallerCostura")) },
      { path: "talleres/bordado", lazy: pagina(() => import("./pages/talleres/TallerBordado")) },
      // Secciones de seguimiento y administración.
      { path: "seguimiento", lazy: pagina(() => import("./pages/Seguimiento")) },
      { path: "proveedores", lazy: pagina(() => import("./pages/Proveedores")) },
      { path: "proveedores/nuevo", lazy: pagina(() => import("./pages/ProveedorForm")) },
      { path: "reportes", lazy: pagina(() => import("./pages/Reportes")) },
      { path: "usuarios", lazy: pagina(() => import("./pages/GestionUsuarios")) },
      // Control de vacaciones del personal (Ley Federal del Trabajo).
      { path: "vacaciones", lazy: pagina(() => import("./pages/Vacaciones")) },
      { path: "asistencia", lazy: pagina(() => import("./pages/Asistencia")) },
      // Facturación CFDI 4.0 (reemplazo de CONTPAQi Vende) y catálogo de clientes.
      { path: "facturacion/facturas", lazy: pagina(() => import("./pages/facturacion/Facturas")) },
      { path: "facturacion/facturas/nueva", lazy: pagina(() => import("./pages/facturacion/FacturaForm")) },
      { path: "facturacion/facturas/:id", lazy: pagina(() => import("./pages/facturacion/FacturaForm")) },
      { path: "facturacion/complementos", lazy: pagina(() => import("./pages/facturacion/ComplementosPago")) },
      { path: "facturacion/configuracion", lazy: pagina(() => import("./pages/facturacion/ConfiguracionFiscal")) },
      { path: "catalogos/clientes", lazy: pagina(() => import("./pages/catalogos/Clientes")) },
      // Activo fijo y su depreciación (solo administrador primario).
      { path: "activo-fijo", lazy: pagina(() => import("./pages/ActivoFijo")) },
    ],
  },
]);