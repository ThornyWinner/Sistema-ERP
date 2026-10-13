import { UserRole, Permission, RoutePermission } from '../types/auth';

export const roleLabels: Record<UserRole, string> = {
  admin_primario: 'Administrador Primario',
  admin_secundario: 'Administrador Secundario',
  vendedor: 'Vendedor',
  disenador: 'Diseñador',
  sublimador: 'Sublimador',
  cortador: 'Cortador',
  costurera: 'Costurera',
  bordador: 'Bordador',
};

// Permisos base
const fullPermission: Permission = { canView: true, canCreate: true, canEdit: true, canDelete: true };
const readOnlyPermission: Permission = { canView: true, canCreate: false, canEdit: false, canDelete: false };
const noPermission: Permission = { canView: false, canCreate: false, canEdit: false, canDelete: false };

// Define rutas y permisos por rol
export const getRoutePermissions = (role: UserRole): RoutePermission[] => {
  const routes: RoutePermission[] = [
    {
      route: '/',
      label: 'Dashboard',
      icon: 'LayoutDashboard',
      permission: noPermission,
    },
    {
      route: '/inventario/materiales',
      label: 'Inventario Materiales',
      icon: 'Package',
      permission: noPermission,
    },
    {
      route: '/inventario/productos',
      label: 'Inventario Productos',
      icon: 'ShoppingBag',
      permission: noPermission,
    },
    {
      route: '/ordenes',
      label: 'Órdenes de Producción',
      icon: 'ClipboardList',
      permission: noPermission,
    },
    {
      route: '/talleres/diseno',
      label: 'Diseño',
      icon: 'Palette',
      permission: noPermission,
    },
    {
      route: '/talleres/sublimacion',
      label: 'Sublimación',
      icon: 'Droplet',
      permission: noPermission,
    },
    {
      route: '/talleres/corte',
      label: 'Corte',
      icon: 'Scissors',
      permission: noPermission,
    },
    {
      route: '/talleres/costura',
      label: 'Costura',
      icon: 'Shirt',
      permission: noPermission,
    },
    {
      route: '/talleres/bordado',
      label: 'Bordado',
      icon: 'Sparkles',
      permission: noPermission,
    },
    {
      route: '/seguimiento',
      label: 'Seguimiento Global',
      icon: 'TrendingUp',
      permission: noPermission,
    },
    {
      route: '/proveedores',
      label: 'Proveedores',
      icon: 'Truck',
      permission: noPermission,
    },
    {
      route: '/reportes',
      label: 'Reportes',
      icon: 'BarChart3',
      permission: noPermission,
    },
    {
      route: '/usuarios',
      label: 'Gestión de Usuarios',
      icon: 'Users',
      permission: noPermission,
    },
  ];

  // Aplicar permisos según rol
  switch (role) {
    case 'admin_primario':
      return routes.map(r => ({ ...r, permission: fullPermission }));
    
    case 'admin_secundario':
      return routes.map(r => ({ ...r, permission: readOnlyPermission }));
    
    case 'vendedor':
      return routes.map(r => {
        if (r.route === '/' || r.route === '/ordenes') {
          return { ...r, permission: fullPermission };
        }
        if (r.route.startsWith('/inventario')) {
          return { ...r, permission: readOnlyPermission };
        }
        return r;
      });
    
    case 'disenador':
      return routes.map(r => {
        if (r.route === '/' || r.route === '/talleres/diseno') {
          return { ...r, permission: fullPermission };
        }
        return r;
      });
    
    case 'sublimador':
      return routes.map(r => {
        if (r.route === '/' || r.route === '/talleres/sublimacion') {
          return { ...r, permission: fullPermission };
        }
        return r;
      });
    
    case 'cortador':
      return routes.map(r => {
        if (r.route === '/' || r.route === '/talleres/corte') {
          return { ...r, permission: fullPermission };
        }
        return r;
      });
    
    case 'costurera':
      return routes.map(r => {
        if (r.route === '/' || r.route === '/talleres/costura') {
          return { ...r, permission: fullPermission };
        }
        return r;
      });
    
    case 'bordador':
      return routes.map(r => {
        if (r.route === '/' || r.route === '/talleres/bordado') {
          return { ...r, permission: fullPermission };
        }
        return r;
      });
    
    default:
      return routes;
  }
};

export const hasPermission = (role: UserRole, route: string, action: keyof Permission): boolean => {
  const permissions = getRoutePermissions(role);
  const routePermission = permissions.find(p => p.route === route);
  
  if (!routePermission) return false;
  
  return routePermission.permission[action];
};

export const getAccessibleRoutes = (role: UserRole): RoutePermission[] => {
  const permissions = getRoutePermissions(role);
  return permissions.filter(p => p.permission.canView);
};
