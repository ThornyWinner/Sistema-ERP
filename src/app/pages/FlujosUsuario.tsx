import React from 'react';
import { useAuth } from '../context/AuthContext';
import { roleLabels } from '../utils/permissions';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { 
  User, 
  ShieldCheck, 
  ShieldAlert, 
  ShoppingCart, 
  Palette, 
  Droplet, 
  Scissors, 
  Shirt, 
  Sparkles,
  CheckCircle,
  ArrowRight 
} from 'lucide-react';

export default function FlujosUsuario() {
  const { user } = useAuth();

  const flujos = [
    {
      rol: 'admin_primario',
      icon: ShieldCheck,
      color: 'bg-[#059669] text-white',
      flujo: [
        'Login con credenciales de administrador',
        'Acceso total a todas las secciones',
        'Crear/editar usuarios y asignar roles',
        'Gestionar inventarios, productos y proveedores',
        'Crear y modificar órdenes de producción',
        'Acceder a todos los módulos de talleres',
        'Generar reportes completos',
        'Cerrar sesión',
      ],
    },
    {
      rol: 'admin_secundario',
      icon: ShieldAlert,
      color: 'bg-yellow-500 text-white',
      flujo: [
        'Login con credenciales de administrador secundario',
        'Acceso de lectura a todas las secciones',
        'Visualizar usuarios sin poder editarlos',
        'Consultar inventarios y productos (sin modificar)',
        'Ver órdenes de producción (sin crear/editar)',
        'Observar estado de talleres sin cambiar estados',
        'Consultar reportes',
        'Cerrar sesión',
      ],
    },
    {
      rol: 'vendedor',
      icon: ShoppingCart,
      color: 'bg-blue-500 text-white',
      flujo: [
        'Login con credenciales de vendedor',
        'Acceso al dashboard y vista general',
        'Crear nuevas órdenes de producción',
        'Consultar estado de pedidos en proceso',
        'Ver inventario disponible (solo lectura)',
        'Seguimiento de entregas',
        'Cerrar sesión',
      ],
    },
    {
      rol: 'disenador',
      icon: Palette,
      color: 'bg-purple-500 text-white',
      flujo: [
        'Login con credenciales de diseñador',
        'Acceso solo al módulo de Diseño',
        'Ver órdenes pendientes de diseño',
        'Revisar especificaciones del cliente',
        'Aprobar o rechazar diseños',
        'Actualizar estado de diseño',
        'Cerrar sesión',
      ],
    },
    {
      rol: 'sublimador',
      icon: Droplet,
      color: 'bg-cyan-500 text-white',
      flujo: [
        'Login con credenciales de sublimador',
        'Acceso solo al módulo de Sublimación',
        'Ver órdenes listas para sublimar',
        'Procesar sublimación de telas',
        'Marcar proceso como completado',
        'Pasar al siguiente taller',
        'Cerrar sesión',
      ],
    },
    {
      rol: 'cortador',
      icon: Scissors,
      color: 'bg-orange-500 text-white',
      flujo: [
        'Login con credenciales de cortador',
        'Acceso solo al módulo de Corte',
        'Ver materiales asignados',
        'Confirmar cortes realizados',
        'Actualizar cantidad de piezas',
        'Marcar como listo para costura',
        'Cerrar sesión',
      ],
    },
    {
      rol: 'costurera',
      icon: Shirt,
      color: 'bg-pink-500 text-white',
      flujo: [
        'Login con credenciales de costurera',
        'Acceso solo al módulo de Costura',
        'Ver órdenes pendientes de coser',
        'Registrar avances de producción',
        'Marcar piezas terminadas',
        'Enviar a bordado (si aplica)',
        'Cerrar sesión',
      ],
    },
    {
      rol: 'bordador',
      icon: Sparkles,
      color: 'bg-indigo-500 text-white',
      flujo: [
        'Login con credenciales de bordador',
        'Acceso solo al módulo de Bordado',
        'Ver órdenes con requerimientos de bordado',
        'Revisar especificaciones de diseño',
        'Actualizar estado de bordado',
        'Marcar orden como completada',
        'Cerrar sesión',
      ],
    },
  ];

  const currentFlujo = flujos.find(f => f.rol === user?.rol);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl mb-2">Flujos de Usuario</h1>
        <p className="text-neutral-500">
          Mapa de interacciones según rol y permisos en el sistema
        </p>
      </div>

      {/* Flujo actual del usuario */}
      {currentFlujo && (
        <Card className="border-[#059669] border-2">
          <CardHeader className="bg-[#059669]/5">
            <div className="flex items-center gap-3">
              <div className={`p-3 ${currentFlujo.color} rounded-lg`}>
                <currentFlujo.icon className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="mb-1">Tu Flujo de Trabajo Actual</CardTitle>
                <Badge className={currentFlujo.color}>
                  {roleLabels[currentFlujo.rol]}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {currentFlujo.flujo.map((paso, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#059669] text-white flex items-center justify-center text-sm font-medium">
                    {index + 1}
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <p className="text-neutral-700">{paso}</p>
                    {index < currentFlujo.flujo.length - 1 && (
                      <ArrowRight className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Todos los flujos */}
      <div>
        <h2 className="text-xl mb-4">Todos los Flujos del Sistema</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {flujos.map((flujo) => {
            const Icon = flujo.icon;
            const isCurrentRole = flujo.rol === user?.rol;
            
            return (
              <Card key={flujo.rol} className={isCurrentRole ? 'ring-2 ring-[#059669]' : ''}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 ${flujo.color} rounded-lg`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{roleLabels[flujo.rol]}</CardTitle>
                        {isCurrentRole && (
                          <Badge variant="outline" className="bg-[#059669] text-white">
                            Tu rol
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {flujo.flujo.map((paso, index) => (
                      <div key={index} className="flex items-start gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-[#059669] flex-shrink-0 mt-0.5" />
                        <span className="text-neutral-600">{paso}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Resumen de accesos */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen de Accesos por Rol</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="text-left py-3 px-4">Rol</th>
                  <th className="text-center py-3 px-4">Dashboard</th>
                  <th className="text-center py-3 px-4">Inventario</th>
                  <th className="text-center py-3 px-4">Órdenes</th>
                  <th className="text-center py-3 px-4">Talleres</th>
                  <th className="text-center py-3 px-4">Reportes</th>
                  <th className="text-center py-3 px-4">Usuarios</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                <tr>
                  <td className="py-3 px-4 font-medium">Admin Primario</td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-green-500 text-white">Total</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-green-500 text-white">Total</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-green-500 text-white">Total</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-green-500 text-white">Total</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-green-500 text-white">Total</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-green-500 text-white">Total</Badge>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium">Admin Secundario</td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-yellow-500 text-white">Lectura</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-yellow-500 text-white">Lectura</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-yellow-500 text-white">Lectura</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-yellow-500 text-white">Lectura</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-yellow-500 text-white">Lectura</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-yellow-500 text-white">Lectura</Badge>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium">Vendedor</td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-green-500 text-white">Total</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-yellow-500 text-white">Lectura</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-green-500 text-white">Total</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-red-500 text-white">Sin acceso</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-red-500 text-white">Sin acceso</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-red-500 text-white">Sin acceso</Badge>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium">Operativos (Taller)</td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-green-500 text-white">Total</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-red-500 text-white">Sin acceso</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-red-500 text-white">Sin acceso</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-blue-500 text-white">Solo su módulo</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-red-500 text-white">Sin acceso</Badge>
                  </td>
                  <td className="text-center py-3 px-4">
                    <Badge className="bg-red-500 text-white">Sin acceso</Badge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
