/**
 * App.tsx — Componente raíz de la aplicación.
 *
 * Define el árbol de proveedores (providers) que envuelve a todas las páginas:
 *  - AuthProvider:     sesión del usuario (Supabase Auth) y gestión de usuarios.
 *  - ErpDataProvider:  datos de negocio del ERP (órdenes, inventario, proveedores...).
 *  - RouterProvider:   enrutador de React Router con todas las rutas de la app.
 *  - Toaster:          contenedor global de notificaciones emergentes (sonner).
 *
 * El orden importa: ErpDataProvider está dentro de AuthProvider para poder
 * acceder al usuario autenticado cuando carga o modifica datos.
 */
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AuthProvider } from "./context/AuthContext";
import { ErpDataProvider } from "./context/ErpDataContext";
import { Toaster } from "./components/ui/sonner";
import { ThemeProvider } from "next-themes";

export default function App() {
  return (
    // Tema claro/oscuro: pone la clase "dark" en <html> (ver theme.css) y
    // recuerda la elección del usuario. Por defecto, modo claro.
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <AuthProvider>
        {/* Datos del ERP disponibles para todas las rutas */}
        <ErpDataProvider><RouterProvider router={router} /></ErpDataProvider>
        {/* Notificaciones tipo "toast" (toast.success / toast.error) */}
        <Toaster />
      </AuthProvider>
    </ThemeProvider>
  );
}
