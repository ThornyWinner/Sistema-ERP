import { createBrowserRouter } from "react-router";
import RootLayout from "./layouts/RootLayout";
import Dashboard from "./pages/Dashboard";
import InventarioMateriales from "./pages/InventarioMateriales";
import InventarioProductos from "./pages/InventarioProductos";
import ProductoForm from "./pages/ProductoForm";
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
import ProtectedRoute from "./components/ProtectedRoute";

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/",
    Component: () => (
      <ProtectedRoute>
        <RootLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, Component: Dashboard },
      { path: "inventario/materiales", Component: InventarioMateriales },
      { path: "inventario/productos", Component: InventarioProductos },
      { path: "productos/nuevo", Component: ProductoForm },
      { path: "productos/editar/:id", Component: ProductoForm },
      { path: "ordenes", Component: Ordenes },
      { path: "ordenes/:id", Component: OrdenDetalle },
      { path: "talleres/diseno", Component: TallerDiseno },
      { path: "talleres/sublimacion", Component: TallerSublimacion },
      { path: "talleres/corte", Component: TallerCorte },
      { path: "talleres/costura", Component: TallerCostura },
      { path: "talleres/bordado", Component: TallerBordado },
      { path: "seguimiento", Component: Seguimiento },
      { path: "proveedores", Component: Proveedores },
      { path: "reportes", Component: Reportes },
      { path: "usuarios", Component: GestionUsuarios },
    ],
  },
]);