import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router';
import { hasPermission } from '../utils/permissions';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import type { Permission } from '../types/auth';

interface PermissionButtonProps extends React.ComponentPropsWithoutRef<typeof Button> {
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

  if (!user) return null;

  const allowed = hasPermission(user.rol, location.pathname, requiredPermission);

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
