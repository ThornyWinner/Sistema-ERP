export type UserRole = 
  | 'admin_primario' 
  | 'admin_secundario' 
  | 'vendedor' 
  | 'disenador' 
  | 'sublimador' 
  | 'cortador' 
  | 'costurera' 
  | 'bordador';

export interface User {
  id: string;
  nombre: string;
  username: string;
  rol: UserRole;
  estado: 'activo' | 'inactivo';
  ultimoAcceso: string;
  email?: string;
}

export interface Permission {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface RoutePermission {
  route: string;
  label: string;
  icon: string;
  permission: Permission;
}
