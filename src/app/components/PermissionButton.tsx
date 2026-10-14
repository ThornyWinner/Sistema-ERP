/**
 * PermissionButton.tsx — Botón que se habilita o deshabilita según los permisos del rol.
 *
 * Comprueba si el usuario actual tiene el permiso indicado (`requiredPermission`) en la
 * ruta en la que se encuentra. Si no lo tiene, el botón se muestra deshabilitado y,
 * al pasar el cursor, un tooltip explica que no hay permisos.
 *
 * Ejemplo: <PermissionButton requiredPermission="canCreate" onClick={...}>Nuevo</PermissionButton>
 */
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router';
import { hasPermission } from '../utils/permissions';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import type { Permission } from '../types/auth';

// Acepta todas las props de <Button> más el permiso requerido.
interface PermissionButtonProps extends React.ComponentPropsWithoutRef<typeof Button> {
  /** Acción necesaria: 'canView' | 'canCreate' | 'canEdit' | 'canDelete'. */
  requiredPermission: keyof Permission;
  children: React.ReactNode;
}

export default function PermissionButton({
  requiredPermission,
  children,
  ...props
}: PermissionButtonProps) {
  const { user } = useAuth();
  const location = useLocation();

  // Sin sesión no se muestra nada.
  if (!user) return null;

  // El permiso se evalúa sobre la ruta actual (p. ej. '/ordenes').
  const allowed = hasPermission(user.rol, location.pathname, requiredPermission);

  // Sin permiso: botón deshabilitado envuelto en un <span>, porque los elementos
  // deshabilitados no disparan eventos de ratón y el tooltip no se mostraría.
  if (!allowed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button {...props} disabled className="pointer-events-none opacity-50">
                {children}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>No tienes permisos para realizar esta acción</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return <Button {...props}>{children}</Button>;
}
