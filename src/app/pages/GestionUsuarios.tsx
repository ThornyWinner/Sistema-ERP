import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types/auth';
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
import { UserPlus, Pencil, Trash2, Shield } from 'lucide-react';
import { toast } from 'sonner';

export default function GestionUsuarios() {
  const { user: currentUser, users, addUser, updateUser, deleteUser } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    username: '',
    password: '',
    rol: 'vendedor' as UserRole,
    email: '',
    estado: 'activo' as 'activo' | 'inactivo',
  });

  // Solo admins primarios pueden acceder
  if (currentUser?.rol !== 'admin_primario') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
          <h2 className="text-2xl mb-2">Acceso Restringido</h2>
          <p className="text-neutral-500">
            Solo los administradores primarios pueden gestionar usuarios
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingUser) {
      updateUser(editingUser, {
        nombre: formData.nombre,
        username: formData.username,
        rol: formData.rol,
        email: formData.email,
        estado: formData.estado,
      });
      toast.success('Usuario actualizado correctamente');
    } else {
      addUser({
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
  };

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

  const handleDelete = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user && confirm(`¿Estás seguro de eliminar al usuario ${user.nombre}?`)) {
      deleteUser(userId);
      toast.success('Usuario eliminado correctamente');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl mb-2">Gestión de Usuarios</h1>
          <p className="text-neutral-500">Administra usuarios y permisos del sistema</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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

              <div className="space-y-2">
                <Label htmlFor="password">
                  Contraseña {editingUser && '(dejar en blanco para no cambiar)'}
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  required={!editingUser}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="correo@ejemplo.com"
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
                <Button type="submit" className="bg-[#059669] hover:bg-[#047857]">
                  {editingUser ? 'Actualizar' : 'Crear Usuario'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white rounded-lg border border-neutral-200">
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
                      <p className="text-sm text-neutral-500">{user.email}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-neutral-50">
                    {roleLabels[user.rol]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant={user.estado === 'activo' ? 'default' : 'secondary'}
                    className={user.estado === 'activo' ? 'bg-green-100 text-green-800' : ''}
                  >
                    {user.estado === 'activo' ? 'Activo' : 'Inactivo'}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-neutral-500">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(user.id)}
                      disabled={user.id === currentUser?.id}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
