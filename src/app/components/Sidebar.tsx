import { Link, useLocation } from "react-router";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  ClipboardList,
  Wrench,
  BarChart3,
  Users,
  ChevronDown,
  Shirt,
  Palette,
  Scissors,
  Sparkles,
  Droplet,
  TrendingUp,
  Truck,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getAccessibleRoutes } from "../utils/permissions";
import { Badge } from "./ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

export default function Sidebar() {
  const location = useLocation();
  const { user } = useAuth();
  const [expandedSections, setExpandedSections] = useState<string[]>(["Inventario", "Talleres"]);

  if (!user) return null;

  const accessibleRoutes = getAccessibleRoutes(user.rol);
  
  // Organizar rutas en estructura de menú
  const menuStructure = {
    dashboard: accessibleRoutes.find(r => r.route === '/'),
    inventario: {
      materiales: accessibleRoutes.find(r => r.route === '/inventario/materiales'),
      productos: accessibleRoutes.find(r => r.route === '/inventario/productos'),
    },
    ordenes: accessibleRoutes.find(r => r.route === '/ordenes'),
    talleres: {
      diseno: accessibleRoutes.find(r => r.route === '/talleres/diseno'),
      sublimacion: accessibleRoutes.find(r => r.route === '/talleres/sublimacion'),
      corte: accessibleRoutes.find(r => r.route === '/talleres/corte'),
      costura: accessibleRoutes.find(r => r.route === '/talleres/costura'),
      bordado: accessibleRoutes.find(r => r.route === '/talleres/bordado'),
    },
    seguimiento: accessibleRoutes.find(r => r.route === '/seguimiento'),
    proveedores: accessibleRoutes.find(r => r.route === '/proveedores'),
    reportes: accessibleRoutes.find(r => r.route === '/reportes'),
    usuarios: accessibleRoutes.find(r => r.route === '/usuarios'),
  };

  const iconMap: Record<string, any> = {
    LayoutDashboard,
    Package,
    ShoppingBag,
    ClipboardList,
    Palette,
    Droplet,
    Scissors,
    Shirt,
    Sparkles,
    TrendingUp,
    Truck,
    BarChart3,
    Users,
  };

  const toggleSection = (label: string) => {
    setExpandedSections((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );
  };

  const isActive = (path: string) => location.pathname === path;

  const renderMenuItem = (route: any) => {
    if (!route) return null;
    
    const Icon = iconMap[route.icon];
    const isReadOnly = !route.permission.canCreate && !route.permission.canEdit && !route.permission.canDelete;

    return (
      <TooltipProvider key={route.route}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={route.route}
              className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive(route.route)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-3">
                {Icon && <Icon className="w-5 h-5" />}
                <span>{route.label}</span>
              </span>
              {isReadOnly && (
                <Badge variant="secondary" className="text-xs">
                  Solo lectura
                </Badge>
              )}
            </Link>
          </TooltipTrigger>
          {isReadOnly && (
            <TooltipContent>
              <p>Solo puedes visualizar, sin editar</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <h1 className="font-semibold text-foreground flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Shirt className="w-5 h-5 text-primary-foreground" />
          </div>
          <span>Sistema Uniformes</span>
        </h1>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {/* Dashboard */}
        {menuStructure.dashboard && renderMenuItem(menuStructure.dashboard)}

        {/* Inventario */}
        {(menuStructure.inventario.materiales || menuStructure.inventario.productos) && (
          <div>
            <button
              onClick={() => toggleSection('Inventario')}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <span className="flex items-center gap-3">
                <Package className="w-5 h-5" />
                <span>Inventario</span>
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  expandedSections.includes('Inventario') ? "rotate-180" : ""
                }`}
              />
            </button>
            {expandedSections.includes('Inventario') && (
              <div className="ml-4 mt-1 space-y-1">
                {menuStructure.inventario.materiales && (
                  <Link
                    to="/inventario/materiales"
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive('/inventario/materiales')
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <span>Materiales</span>
                    {!menuStructure.inventario.materiales.permission.canEdit && (
                      <Badge variant="secondary" className="text-xs ml-auto">
                        Solo lectura
                      </Badge>
                    )}
                  </Link>
                )}
                {menuStructure.inventario.productos && (
                  <Link
                    to="/inventario/productos"
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive('/inventario/productos')
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <span>Productos</span>
                    {!menuStructure.inventario.productos.permission.canEdit && (
                      <Badge variant="secondary" className="text-xs ml-auto">
                        Solo lectura
                      </Badge>
                    )}
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* Órdenes */}
        {menuStructure.ordenes && renderMenuItem(menuStructure.ordenes)}

        {/* Talleres */}
        {(menuStructure.talleres.diseno || menuStructure.talleres.sublimacion || 
          menuStructure.talleres.corte || menuStructure.talleres.costura || 
          menuStructure.talleres.bordado) && (
          <div>
            <button
              onClick={() => toggleSection('Talleres')}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <span className="flex items-center gap-3">
                <Wrench className="w-5 h-5" />
                <span>Talleres</span>
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  expandedSections.includes('Talleres') ? "rotate-180" : ""
                }`}
              />
            </button>
            {expandedSections.includes('Talleres') && (
              <div className="ml-4 mt-1 space-y-1">
                {menuStructure.talleres.diseno && (
                  <Link
                    to="/talleres/diseno"
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive('/talleres/diseno')
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <Palette className="w-4 h-4" />
                    <span>Diseño</span>
                  </Link>
                )}
                {menuStructure.talleres.sublimacion && (
                  <Link
                    to="/talleres/sublimacion"
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive('/talleres/sublimacion')
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <Droplet className="w-4 h-4" />
                    <span>Sublimación</span>
                  </Link>
                )}
                {menuStructure.talleres.corte && (
                  <Link
                    to="/talleres/corte"
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive('/talleres/corte')
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <Scissors className="w-4 h-4" />
                    <span>Corte</span>
                  </Link>
                )}
                {menuStructure.talleres.costura && (
                  <Link
                    to="/talleres/costura"
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive('/talleres/costura')
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <Shirt className="w-4 h-4" />
                    <span>Costura</span>
                  </Link>
                )}
                {menuStructure.talleres.bordado && (
                  <Link
                    to="/talleres/bordado"
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive('/talleres/bordado')
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Bordado</span>
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* Seguimiento */}
        {menuStructure.seguimiento && renderMenuItem(menuStructure.seguimiento)}

        {/* Proveedores */}
        {menuStructure.proveedores && renderMenuItem(menuStructure.proveedores)}

        {/* Reportes */}
        {menuStructure.reportes && renderMenuItem(menuStructure.reportes)}

        {/* Gestión de Usuarios */}
        {menuStructure.usuarios && renderMenuItem(menuStructure.usuarios)}
      </nav>
    </aside>
  );
}