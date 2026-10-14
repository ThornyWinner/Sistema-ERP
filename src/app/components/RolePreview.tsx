/**
 * RolePreview.tsx — Tarjeta resumen de lo que puede hacer un rol.
 *
 * Muestra, para los módulos principales (Dashboard, Inventario, Órdenes, Talleres,
 * Reportes, Usuarios), si el rol tiene acceso completo, solo lectura, acceso a un
 * taller específico o ningún acceso. Actualmente no se importa en ninguna página;
 * está disponible como ayuda visual (p. ej. para la gestión de usuarios).
 *
 * Nota: la tabla de permisos de este componente es solo informativa y está escrita a
 * mano; los permisos efectivos de la aplicación están en utils/permissions.ts.
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { roleLabels } from '../utils/permissions';
import type { UserRole } from '../types/auth';
import { Check, X, Eye } from 'lucide-react';

interface RolePreviewProps {
  role: UserRole;
  className?: string;
}

export default function RolePreview({ role, className = '' }: RolePreviewProps) {
  // Resumen por rol: access = puede entrar, edit = puede modificar,
  // specific = texto aclaratorio cuando el acceso es parcial (un solo taller).
  const permissions = {
    admin_primario: {
      dashboard: { access: true, edit: true },
      inventario: { access: true, edit: true },
      ordenes: { access: true, edit: true },
      talleres: { access: true, edit: true },
      reportes: { access: true, edit: true },
      usuarios: { access: true, edit: true },
    },
    admin_secundario: {
      dashboard: { access: true, edit: false },
      inventario: { access: true, edit: false },
      ordenes: { access: true, edit: false },
      talleres: { access: true, edit: false },
      reportes: { access: true, edit: false },
      usuarios: { access: true, edit: false },
    },
    vendedor: {
      dashboard: { access: true, edit: true },
      inventario: { access: true, edit: false },
      ordenes: { access: true, edit: true },
      talleres: { access: false, edit: false },
      reportes: { access: false, edit: false },
      usuarios: { access: false, edit: false },
    },
    disenador: {
      dashboard: { access: true, edit: true },
      inventario: { access: false, edit: false },
      ordenes: { access: false, edit: false },
      talleres: { access: true, edit: true, specific: 'Solo Diseño' },
      reportes: { access: false, edit: false },
      usuarios: { access: false, edit: false },
    },
    sublimador: {
      dashboard: { access: true, edit: true },
      inventario: { access: false, edit: false },
      ordenes: { access: false, edit: false },
      talleres: { access: true, edit: true, specific: 'Solo Sublimación' },
      reportes: { access: false, edit: false },
      usuarios: { access: false, edit: false },
    },
    cortador: {
      dashboard: { access: true, edit: true },
      inventario: { access: false, edit: false },
      ordenes: { access: false, edit: false },
      talleres: { access: true, edit: true, specific: 'Solo Corte' },
      reportes: { access: false, edit: false },
      usuarios: { access: false, edit: false },
    },
    costurera: {
      dashboard: { access: true, edit: true },
      inventario: { access: false, edit: false },
      ordenes: { access: false, edit: false },
      talleres: { access: true, edit: true, specific: 'Solo Costura' },
      reportes: { access: false, edit: false },
      usuarios: { access: false, edit: false },
    },
    bordador: {
      dashboard: { access: true, edit: true },
      inventario: { access: false, edit: false },
      ordenes: { access: false, edit: false },
      talleres: { access: true, edit: true, specific: 'Solo Bordado' },
      reportes: { access: false, edit: false },
      usuarios: { access: false, edit: false },
    },
  };

  const rolePermissions = permissions[role];

  /**
   * Devuelve el indicador visual (icono + texto) de un permiso. Prioridad:
   * sin acceso (✗ rojo) → solo lectura (ojo amarillo) → acceso parcial (✓ azul)
   * → acceso completo (✓ verde).
   */
  const renderPermission = (perm: { access: boolean; edit: boolean; specific?: string }) => {
    if (!perm.access) {
      return (
        <div className="flex items-center gap-2">
          <X className="w-4 h-4 text-red-500" />
          <span className="text-sm text-red-600">Sin acceso</span>
        </div>
      );
    }

    if (!perm.edit) {
      return (
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-yellow-600" />
          <span className="text-sm text-yellow-700">Solo lectura</span>
        </div>
      );
    }

    if (perm.specific) {
      return (
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-blue-500" />
          <span className="text-sm text-blue-700">{perm.specific}</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <Check className="w-4 h-4 text-green-500" />
        <span className="text-sm text-green-700">Acceso completo</span>
      </div>
    );
  };

  return (
    <Card className={className}>
      {/* Cabecera: nombre legible del rol y su identificador interno */}
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{roleLabels[role]}</CardTitle>
          <Badge variant="outline">{role}</Badge>
        </div>
      </CardHeader>
      {/* Una fila por módulo con su nivel de acceso */}
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-neutral-200">
            <span className="text-sm font-medium">Dashboard</span>
            {renderPermission(rolePermissions.dashboard)}
          </div>
          <div className="flex items-center justify-between py-2 border-b border-neutral-200">
            <span className="text-sm font-medium">Inventario</span>
            {renderPermission(rolePermissions.inventario)}
          </div>
          <div className="flex items-center justify-between py-2 border-b border-neutral-200">
            <span className="text-sm font-medium">Órdenes</span>
            {renderPermission(rolePermissions.ordenes)}
          </div>
          <div className="flex items-center justify-between py-2 border-b border-neutral-200">
            <span className="text-sm font-medium">Talleres</span>
            {renderPermission(rolePermissions.talleres)}
          </div>
          <div className="flex items-center justify-between py-2 border-b border-neutral-200">
            <span className="text-sm font-medium">Reportes</span>
            {renderPermission(rolePermissions.reportes)}
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium">Usuarios</span>
            {renderPermission(rolePermissions.usuarios)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
