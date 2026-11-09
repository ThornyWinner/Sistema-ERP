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
import { createBrowserRouter } from "react-router";
import RootLayout from "./layouts/RootLayout";
import Dashboard from "./pages/Dashboard";
import InventarioMateriales from "./pages/InventarioMateriales";
import InventarioProductos from "./pages/InventarioProductos";
import ProductoForm from "./pages/ProductoForm";
import MaterialForm from "./pages/MaterialForm";
import ProveedorForm from "./pages/ProveedorForm";
import Ordenes from "./pages/Ordenes";
import OrdenDetalle from "./pages/OrdenDetalle";
import TallerDiseno from "./pages/talleres/TallerDiseno";
import TallerSublimacion from "./pages/talleres/TallerSublimacion";
import TallerCorte from "./pages/talleres/TallerCorte";
import TallerCostura from "./pages/talleres/TallerCostura";
import TallerBordado from "./pages/talleres/TallerBordado";
import Seguimiento from "./pages/Seguimiento";
import Proveedores from "./pages/Proveedores";
import Reportes from "./pages/Reportes";
import Login from "./pages/Login";
import GestionUsuarios from "./pages/GestionUsuarios";
import Vacaciones from "./pages/Vacaciones";
import Asistencia from "./pages/Asistencia";
import Checar from "./pages/Checar";
import ProtectedRoute from "./components/ProtectedRoute";

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
    Component: () => (
      <ProtectedRoute>
        <Checar />
      </ProtectedRoute>
    ),
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
      { path: "inventario/materiales", Component: InventarioMateriales },
      { path: "inventario/productos", Component: InventarioProductos },
      // Alta de materia prima.
      { path: "materiales/nuevo", Component: MaterialForm },
      // El mismo formulario sirve para crear y para editar (según exista :id).
      { path: "productos/nuevo", Component: ProductoForm },
      { path: "productos/editar/:id", Component: ProductoForm },
      // Órdenes: listado y detalle de una orden concreta.
      { path: "ordenes", Component: Ordenes },
      { path: "ordenes/:id", Component: OrdenDetalle },
      // Tableros de cada taller del flujo de producción.
      { path: "talleres/diseno", Component: TallerDiseno },
      { path: "talleres/sublimacion", Component: TallerSublimacion },
      { path: "talleres/corte", Component: TallerCorte },
      { path: "talleres/costura", Component: TallerCostura },
      { path: "talleres/bordado", Component: TallerBordado },
      // Secciones de seguimiento y administración.
      { path: "seguimiento", Component: Seguimiento },
      { path: "proveedores", Component: Proveedores },
      { path: "proveedores/nuevo", Component: ProveedorForm },
      { path: "reportes", Component: Reportes },
      { path: "usuarios", Component: GestionUsuarios },
      // Control de vacaciones del personal (Ley Federal del Trabajo).
      { path: "vacaciones", Component: Vacaciones },
      { path: "asistencia", Component: Asistencia },
    ],
  },
]);