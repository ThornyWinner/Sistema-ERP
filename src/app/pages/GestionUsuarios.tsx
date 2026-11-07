/**
 * GestionUsuarios.tsx — Administración de usuarios del sistema (ruta /usuarios).
 *
 * Solo accesible para el administrador primario (los demás roles ven "Acceso Restringido").
 * Permite:
 *  - Listar usuarios (nombre, email, username, rol, estado y último acceso).
 *  - Crear usuarios: registra la cuenta en Supabase Auth + el perfil en `usuarios`.
 *  - Editar perfil (nombre, username, email, rol, estado). La contraseña no se edita aquí.
 *  - Eliminar usuarios, con un diálogo de confirmación: borra el perfil y la cuenta de
 *    Supabase Auth (RPC eliminar_usuario). No se permite eliminar al propio usuario.
 * Toda la lógica de datos vive en AuthContext; esta página solo gestiona la interfaz
 * y muestra notificaciones (toast) con el resultado de cada operación.
 */
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { User, UserRole } from '../types/auth';
import { roleLabels } from '../utils/permissions';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { UserPlus, Pencil, Trash2, Shield, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function GestionUsuarios() {
  const { user: currentUser, users, refreshUsers, addUser, updateUser, deleteUser } = useAuth();
  // true mientras se guarda (deshabilita el botón de enviar).
  const [saving, setSaving] = useState(false);
  // Visibilidad del diálogo de alta/edición.
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // Id del usuario en edición; null = modo creación.
  const [editingUser, setEditingUser] = useState<string | null>(null);
  // Usuario cuya eliminación se está confirmando (abre el diálogo de confirmación).
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  // true mientras se elimina (deshabilita los botones del diálogo de confirmación).
  const [deleting, setDeleting] = useState(false);
  // Campos del formulario del diálogo.
  const [formData, setFormData] = useState({
    nombre: '',
    username: '',
    password: '',
    rol: 'vendedor' as UserRole,
    email: '',
    estado: 'activo' as 'activo' | 'inactivo',
  });

  // Carga la lista de usuarios al entrar (solo si el usuario es admin primario).
  useEffect(() => {
    if (currentUser?.rol === 'admin_primario') {
      refreshUsers().catch(() => toast.error('No se pudo cargar la lista de usuarios'));
    }
  }, [currentUser?.rol]);

  // Solo admins primarios pueden acceder
  if (currentUser?.rol !== 'admin_primario') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-neutral-300 dark:text-neutral-600 mx-auto mb-4" />
          <h2 className="text-2xl mb-2">Acceso Restringido</h2>
          <p className="text-muted-foreground">
            Solo los administradores primarios pueden gestionar usuarios
          </p>
        </div>
      </div>
    );
  }

  /**
   * Guarda el formulario: si hay un usuario en edición lo actualiza; si no, crea uno
   * nuevo con la contraseña indicada. Muestra un toast con el resultado y, si todo
   * sale bien, limpia el formulario y cierra el diálogo.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingUser) {
        await updateUser(editingUser, {
          nombre: formData.nombre,
          username: formData.username,
          rol: formData.rol,
          email: formData.email,
          estado: formData.estado,
        });
        toast.success('Usuario actualizado correctamente');
      } else {
        await addUser({
          nombre: formData.nombre,
          username: formData.username,
          rol: formData.rol,
          email: formData.email,
          estado: formData.estado,
          ultimoAcceso: 'Nunca',
        }, formData.password);
        toast.success('Usuario creado correctamente');
      }
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el usuario');
    } finally {
      setSaving(false);
    }
  };

  // Restablece el formulario a sus valores por defecto y cierra el diálogo.
  const resetForm = () => {
    setFormData({
      nombre: '',
      username: '',
      password: '',
      rol: 'vendedor',
      email: '',
      estado: 'activo',
    });
    setEditingUser(null);
    setIsDialogOpen(false);
  };

  // Precarga los datos del usuario elegido en el formulario y abre el diálogo en modo edición.
  const handleEdit = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      setFormData({
        nombre: user.nombre,
        username: user.username,
        password: '',
        rol: user.rol,
        email: user.email || '',
        estado: user.estado,
      });
      setEditingUser(userId);
      setIsDialogOpen(true);
    }
  };

  // Elimina el usuario confirmado (perfil + cuenta de acceso). Si falla, el diálogo
  // sigue abierto para que el administrador vea el error y pueda cancelar.
  const confirmDelete = async () => {
    if (!deletingUser) return;
    setDeleting(true);
    try {
      await deleteUser(deletingUser.id);
      toast.success(`Usuario ${deletingUser.nombre} eliminado correctamente`);
      setDeletingUser(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar el usuario');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl mb-2">Gestión de Usuarios</h1>
          <p className="text-muted-foreground">Administra usuarios y permisos del sistema</p>
        </div>
        
        {/* Diálogo compartido para crear y editar usuarios */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          {/* El botón "Nuevo Usuario" abre el diálogo en modo creación */}
          <DialogTrigger asChild>
            <Button className="bg-[#059669] hover:bg-[#047857]" onClick={() => setEditingUser(null)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Nuevo Usuario
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
              </DialogTitle>
              <DialogDescription>
                {editingUser 
                  ? 'Actualiza la información del usuario'
                  : 'Ingresa los datos del nuevo usuario'
                }
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre completo</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Juan Pérez"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Usuario</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Ej: jperez"
                  required
                />
              </div>

              {/* La contraseña solo se pide al crear (mínimo 6 caracteres, requisito de Supabase) */}
              {!editingUser && (
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    minLength={6}
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="correo@ejemplo.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rol">Rol</Label>
                <Select
                  value={formData.rol}
                  onValueChange={(value) => setFormData({ ...formData, rol: value as UserRole })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Una opción por cada rol definido en roleLabels */}
                    {Object.entries(roleLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="estado">Estado</Label>
                <Select
                  value={formData.estado}
                  onValueChange={(value) => setFormData({ ...formData, estado: value as 'activo' | 'inactivo' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="inactivo">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving} className="bg-[#059669] hover:bg-[#047857]">
                  {saving ? 'Guardando...' : editingUser ? 'Actualizar' : 'Crear Usuario'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabla de usuarios */}
      <div className="bg-card rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Último Acceso</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{user.nombre}</p>
                    {user.email && (
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-neutral-50 dark:bg-muted">
                    {roleLabels[user.rol] ?? 'Sin rol'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant={user.estado === 'activo' ? 'default' : 'secondary'}
                    className={user.estado === 'activo' ? 'bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300' : ''}
                  >
                    {user.estado === 'activo' ? 'Activo' : 'Inactivo'}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {user.ultimoAcceso}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(user.id)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {/* Deshabilitado para el propio usuario: evita que se elimine a sí mismo */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingUser(user)}
                      disabled={user.id === currentUser?.id}
                    >
                      <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Confirmación de eliminación, con el mismo formato que el diálogo de edición */}
      <Dialog open={!!deletingUser} onOpenChange={(open) => { if (!open && !deleting) setDeletingUser(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar Usuario</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer
            </DialogDescription>
          </DialogHeader>

          {deletingUser && (
            <div className="space-y-4">
              {/* Datos del usuario que se va a eliminar */}
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div>
                  <p className="font-medium">{deletingUser.nombre}</p>
                  {deletingUser.email && (
                    <p className="text-sm text-muted-foreground">{deletingUser.email}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>@{deletingUser.username}</span>
                  <Badge variant="outline" className="bg-neutral-50 dark:bg-muted">
                    {roleLabels[deletingUser.rol] ?? 'Sin rol'}
                  </Badge>
                </div>
              </div>

              {/* Consecuencias y alternativa recomendada */}
              <div className="flex gap-3 rounded-lg bg-status-pending-bg p-4 text-sm text-status-pending-text">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div className="space-y-1">
                  <p>Se borrarán su perfil y su cuenta de acceso: ya no podrá iniciar sesión con este correo.</p>
                  <p>Si tiene órdenes, movimientos u otros registros, no se podrá eliminar. En ese caso márcalo como <strong>Inactivo</strong> desde Editar.</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeletingUser(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={deleting}>
              <Trash2 className="w-4 h-4" />
              {deleting ? 'Eliminando...' : 'Eliminar Usuario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
