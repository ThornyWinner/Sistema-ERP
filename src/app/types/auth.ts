/**
 * auth.ts — Tipos TypeScript de autenticación, usuarios y permisos.
 */

/**
 * Roles disponibles en el sistema. Deben coincidir con los valores de la
 * columna `nombre` de la tabla `roles` en Supabase.
 *  - admin_primario:   acceso total, incluida la gestión de usuarios.
 *  - admin_secundario: administración operativa.
 *  - vendedor:         ventas y creación de órdenes.
 *  - disenador, sublimador, cortador, costurera, bordador: personal de cada taller.
 */
export type UserRole =
  | 'admin_primario'
  | 'admin_secundario'
  | 'vendedor'
  | 'disenador'
  | 'sublimador'
  | 'cortador'
  | 'costurera'
  | 'bordador';

/** Perfil de usuario de la aplicación (fila de la tabla `usuarios`, mapeada a camelCase). */
export interface User {
  /** UUID del registro en la tabla `usuarios` (distinto del id de Supabase Auth). */
  id: string;
  nombre: string;
  username: string;
  rol: UserRole;
  /** Un usuario inactivo no puede iniciar sesión. */
  estado: 'activo' | 'inactivo';
  /** Fecha del último acceso ya formateada para mostrar, o 'Nunca'. */
  ultimoAcceso: string;
  email?: string;
}

/** Acciones permitidas (ver/crear/editar/eliminar) sobre un módulo. */
export interface Permission {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/** Asocia una ruta del menú con su etiqueta, icono y permisos. */
export interface RoutePermission {
  route: string;
  label: string;
  /** Nombre del icono que se muestra en el menú. */
  icon: string;
  permission: Permission;
}
