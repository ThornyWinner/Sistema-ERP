/**
 * permissions.ts — Control de acceso por rol (RBAC) en el frontend.
 *
 * Define qué secciones (rutas) puede ver cada rol y qué acciones puede realizar
 * en ellas (ver / crear / editar / eliminar). Lo usan el Sidebar (para mostrar solo
 * los módulos accesibles) y las páginas/botones (para habilitar u ocultar acciones).
 *
 * Importante: esto solo controla la interfaz. La seguridad real de los datos la
 * aplican las políticas RLS de Supabase en la base de datos.
 */
import { UserRole, Permission, RoutePermission } from '../types/auth';

/** Nombre legible de cada rol para mostrar en la interfaz. */
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
// fullPermission: control total; readOnlyPermission: solo consulta; noPermission: sin acceso (oculto en el menú).
const fullPermission: Permission = { canView: true, canCreate: true, canEdit: true, canDelete: true };
const readOnlyPermission: Permission = { canView: true, canCreate: false, canEdit: false, canDelete: false };
const noPermission: Permission = { canView: false, canCreate: false, canEdit: false, canDelete: false };
// Órdenes del admin secundario: consulta todas, crea las suyas y edita/abona solo las
// que registró él (la BD lo limita con private.puede_editar_orden); no elimina.
const ordenesPropiasPermission: Permission = { canView: true, canCreate: true, canEdit: true, canDelete: false };

// Define rutas y permisos por rol
/**
 * Devuelve la lista completa de módulos del sistema con los permisos que tiene el rol
 * indicado en cada uno. El orden de la lista es el orden en que aparecen en el menú.
 */
const getRoutePermissions = (role: UserRole): RoutePermission[] => {
  // Catálogo de módulos; todos empiezan sin permisos y luego se habilitan según el rol.
  // `icon` es el nombre de un icono de lucide-react (lo traduce el Sidebar).
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
    {
      route: '/vacaciones',
      label: 'Permisos Vacacionales',
      icon: 'CalendarDays',
      permission: noPermission,
    },
    {
      // Control de asistencia (checadas, retardos, faltas, horarios y sedes): admin primario.
      route: '/asistencia',
      label: 'Asistencia',
      icon: 'Clock',
      permission: noPermission,
    },
    {
      // Reloj checador: todo el personal checa su entrada y salida (ver al final).
      route: '/checar',
      label: 'Checar asistencia',
      icon: 'ScanLine',
      permission: noPermission,
    },
  ];

  return permisosPorRol(role, routes).map(r =>
    r.route === '/checar' ? { ...r, permission: fullPermission } : r
  );
};

/** Aplica los permisos de cada rol sobre el catálogo de módulos. */
const permisosPorRol = (role: UserRole, routes: RoutePermission[]): RoutePermission[] => {

  // Aplicar permisos según rol
  switch (role) {
    // Administrador primario: acceso total a todos los módulos.
    case 'admin_primario':
      return routes.map(r => ({ ...r, permission: fullPermission }));

    // Administrador secundario: ve todos los módulos en solo lectura, excepto:
    //  - Órdenes: crea órdenes y edita/abona solo las que registró él.
    //  - Permisos Vacacionales y Asistencia (datos del personal): sin acceso, exclusivos
    //    del primario.
    case 'admin_secundario':
      return routes.map(r => {
        if (r.route === '/vacaciones' || r.route === '/asistencia') return r;
        if (r.route === '/ordenes') return { ...r, permission: ordenesPropiasPermission };
        return { ...r, permission: readOnlyPermission };
      });

    // Vendedor: control total del Dashboard y Órdenes; inventarios en solo lectura.
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
    
    // Roles de taller: solo el Dashboard y el tablero de su propio taller.
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
    
    // Rol desconocido: sin acceso a ningún módulo.
    default:
      return routes;
  }
};

/**
 * Indica si un rol puede realizar una acción concreta en una ruta.
 * Ejemplo: hasPermission('vendedor', '/ordenes', 'canCreate') → true.
 * La ruta debe coincidir exactamente con la definida en getRoutePermissions.
 */
export const hasPermission = (role: UserRole, route: string, action: keyof Permission): boolean => {
  const permissions = getRoutePermissions(role);
  const routePermission = permissions.find(p => p.route === route);
  
  if (!routePermission) return false;
  
  return routePermission.permission[action];
};

/** Devuelve solo los módulos que el rol puede ver (usado para construir el menú lateral). */
export const getAccessibleRoutes = (role: UserRole): RoutePermission[] => {
  const permissions = getRoutePermissions(role);
  return permissions.filter(p => p.permission.canView);
};
