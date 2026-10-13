import React from 'react';
import { useAuth } from '../context/AuthContext';
import { roleLabels } from '../utils/permissions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { 
  ShieldCheck, 
  ShieldAlert, 
  ShoppingCart, 
  Palette, 
  Droplet, 
  Scissors, 
  Shirt, 
  Sparkles,
  Info,
  Eye,
  Edit,
  Plus,
  Trash2
} from 'lucide-react';

interface UserGuideProps {
  open: boolean;
  onClose: () => void;
}

export default function UserGuide({ open, onClose }: UserGuideProps) {
  const { user } = useAuth();

  if (!user) return null;

  const roleIcons: Record<string, any> = {
    admin_primario: ShieldCheck,
    admin_secundario: ShieldAlert,
    vendedor: ShoppingCart,
    disenador: Palette,
    sublimador: Droplet,
    cortador: Scissors,
    costurera: Shirt,
    bordador: Sparkles,
  };

  const roleGuides: Record<string, { title: string; description: string; permissions: string[]; tips: string[] }> = {
    admin_primario: {
      title: 'Administrador Primario',
      description: 'Tienes acceso completo al sistema. Puedes crear, editar y eliminar cualquier registro.',
      permissions: [
        'Ver, crear, editar y eliminar usuarios',
        'Gestión completa de inventarios',
        'Control total de órdenes de producción',
        'Acceso a todos los módulos de talleres',
        'Generación de reportes',
        'Gestión de proveedores',
      ],
      tips: [
        'Usa la gestión de usuarios para asignar roles apropiados',
        'Revisa regularmente los reportes de producción',
        'Mantén actualizado el inventario para evitar faltantes',
      ],
    },
    admin_secundario: {
      title: 'Administrador Secundario',
      description: 'Puedes ver toda la información del sistema, pero no puedes modificar registros.',
      permissions: [
        'Ver usuarios (sin editar)',
        'Consultar inventarios',
        'Ver órdenes de producción',
        'Observar estado de talleres',
        'Consultar reportes',
      ],
      tips: [
        'Ideal para supervisión y auditoría',
        'Puedes exportar reportes para análisis',
        'Contacta al admin primario para cambios',
      ],
    },
    vendedor: {
      title: 'Vendedor',
      description: 'Puedes crear órdenes y consultar el estado de producción.',
      permissions: [
        'Crear nuevas órdenes de producción',
        'Ver estado de pedidos',
        'Consultar inventario disponible',
        'Seguimiento de entregas',
      ],
      tips: [
        'Verifica el inventario antes de crear órdenes',
        'Mantén informados a los clientes sobre el estado',
        'Revisa las fechas de entrega regularmente',
      ],
    },
    disenador: {
      title: 'Diseñador',
      description: 'Acceso exclusivo al módulo de diseño para aprobar o rechazar trabajos.',
      permissions: [
        'Ver órdenes pendientes de diseño',
        'Aprobar diseños',
        'Rechazar diseños que requieran cambios',
        'Actualizar estado de diseño',
      ],
      tips: [
        'Revisa las especificaciones del cliente cuidadosamente',
        'Comunica cambios necesarios al vendedor',
        'Aprueba solo cuando el diseño esté completo',
      ],
    },
    sublimador: {
      title: 'Sublimador',
      description: 'Gestiona el proceso de sublimación de telas.',
      permissions: [
        'Ver órdenes listas para sublimar',
        'Actualizar estado del proceso',
        'Marcar sublimación completada',
      ],
      tips: [
        'Verifica la calidad antes de marcar como completado',
        'Reporta cualquier problema con el material',
        'Mantén el orden de prioridad de las órdenes',
      ],
    },
    cortador: {
      title: 'Cortador',
      description: 'Maneja el proceso de corte de materiales.',
      permissions: [
        'Ver materiales asignados',
        'Confirmar cortes realizados',
        'Actualizar cantidad de piezas',
      ],
      tips: [
        'Verifica las medidas antes de cortar',
        'Optimiza el uso de material',
        'Reporta desperdicios significativos',
      ],
    },
    costurera: {
      title: 'Costurera',
      description: 'Controla el proceso de costura de prendas.',
      permissions: [
        'Ver órdenes pendientes',
        'Registrar avances',
        'Marcar piezas terminadas',
      ],
      tips: [
        'Revisa la calidad de las costuras',
        'Mantén organizado tu espacio de trabajo',
        'Reporta problemas de calidad inmediatamente',
      ],
    },
    bordador: {
      title: 'Bordador',
      description: 'Gestiona el bordado final de las prendas.',
      permissions: [
        'Ver órdenes con bordado',
        'Revisar especificaciones',
        'Actualizar estado de bordado',
      ],
      tips: [
        'Verifica el diseño antes de bordar',
        'Mantén los hilos organizados por color',
        'Inspecciona la calidad del bordado terminado',
      ],
    },
  };

  const currentGuide = roleGuides[user.rol];
  const Icon = roleIcons[user.rol];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-[#059669] rounded-lg">
              <Icon className="w-6 h-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-2xl">Bienvenido, {user.nombre}</DialogTitle>
              <Badge className="bg-[#059669] text-white mt-1">
                {roleLabels[user.rol]}
              </Badge>
            </div>
          </div>
          <DialogDescription className="text-base">
            {currentGuide.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-6">
          {/* Permisos */}
          <div>
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#059669]" />
              Tus Permisos
            </h3>
            <div className="space-y-2">
              {currentGuide.permissions.map((permission, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-neutral-50 rounded-lg">
                  {user.rol === 'admin_primario' ? (
                    <Edit className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : user.rol === 'admin_secundario' ? (
                    <Eye className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Plus className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="text-sm text-neutral-700">{permission}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tips */}
          <div>
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <Info className="w-5 h-5 text-[#059669]" />
              Consejos Útiles
            </h3>
            <div className="space-y-2">
              {currentGuide.tips.map((tip, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </div>
                  <span className="text-sm text-blue-900">{tip}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Restricciones (solo para roles restringidos) */}
          {user.rol !== 'admin_primario' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-yellow-900 mb-1">Restricciones</h3>
                  <p className="text-sm text-yellow-700">
                    {user.rol === 'admin_secundario' 
                      ? 'No puedes crear, editar ni eliminar registros. Todos los botones de acción estarán deshabilitados.'
                      : 'Tu acceso está limitado a las secciones relevantes para tu función. Esto reduce distracciones y errores operativos.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
          <Button onClick={onClose} className="bg-[#059669] hover:bg-[#047857]">
            Entendido, comenzar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
