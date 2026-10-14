/**
 * Header.tsx — Barra superior de la aplicación (parte de RootLayout).
 *
 * Contiene:
 *  - Un campo de búsqueda global (por ahora solo visual, sin lógica de búsqueda).
 *  - Un botón de notificaciones con indicador (también decorativo por ahora).
 *  - El menú de usuario: nombre, rol, email y opción de cerrar sesión.
 */
import { Search, Bell, User, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { roleLabels } from "../utils/permissions";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useNavigate } from "react-router";

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // El header solo tiene sentido con un usuario autenticado.
  if (!user) return null;

  // Cierra la sesión en Supabase y lleva al usuario a la pantalla de login.
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Color de la insignia de rol: verde para admin primario, amarillo para
  // admin secundario y gris para el resto de roles.
  const getRoleBadgeColor = (rol: string) => {
    if (rol === 'admin_primario') return 'bg-[#059669] text-white';
    if (rol === 'admin_secundario') return 'bg-yellow-100 text-yellow-800';
    return 'bg-neutral-100 text-neutral-800';
  };

  return (
    <header className="h-16 bg-card border-b border-border px-6 flex items-center justify-between">
      {/* Buscador (icono posicionado dentro del input) */}
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar órdenes, productos, materiales..."
            className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Campana de notificaciones con punto rojo de aviso */}
        <button className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-status-pending rounded-full"></span>
        </button>

        <div className="flex items-center gap-3 pl-4 border-l border-border">
          {/* Menú desplegable del usuario */}
          <DropdownMenu>
            {/* Disparador: nombre, insignia de rol y avatar */}
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 hover:bg-secondary px-3 py-2 rounded-lg transition-colors">
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">{user.nombre}</p>
                  <Badge variant="outline" className={`text-xs ${getRoleBadgeColor(user.rol)}`}>
                    {roleLabels[user.rol]}
                  </Badge>
                </div>
                <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-primary-foreground" />
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            {/* Contenido del menú, alineado al borde derecho del disparador */}
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{user.nombre}</p>
                <p className="text-xs">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
                <LogOut className="w-4 h-4 mr-2" />
                Cerrar Sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}