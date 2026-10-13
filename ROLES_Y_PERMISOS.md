# Sistema de Roles y Permisos

## Descripción General

Este sistema de gestión de inventarios y producción para uniformes industriales incluye un robusto sistema de roles y permisos que controla el acceso de usuarios según su función operativa.

## Roles Disponibles

### 1. Administrador Primario (`admin_primario`)

**Acceso:** Total y sin restricciones

**Permisos:**
- ✅ Crear, editar y eliminar usuarios
- ✅ Asignar y modificar roles
- ✅ Gestión completa de inventarios (materiales y productos)
- ✅ Control total de órdenes de producción
- ✅ Acceso a todos los módulos de talleres
- ✅ Gestión de proveedores
- ✅ Generación y consulta de reportes
- ✅ Todas las acciones del sistema

**Credenciales de prueba:**
- Usuario: `admin`
- Contraseña: `admin123`

---

### 2. Administrador Secundario (`admin_secundario`)

**Acceso:** Solo lectura en todas las secciones

**Permisos:**
- 👁️ Ver todos los usuarios (sin poder editarlos)
- 👁️ Consultar inventarios completos
- 👁️ Ver órdenes de producción
- 👁️ Observar estados de talleres
- 👁️ Consultar reportes
- ❌ NO puede crear, editar ni eliminar registros

**Credenciales de prueba:**
- Usuario: `admin2`
- Contraseña: `admin456`

**Indicadores visuales:**
- Botones deshabilitados en todas las pantallas
- Badge "Solo lectura" visible en el sidebar
- Banner amarillo indicando modo de solo lectura
- Tooltips explicativos sobre restricciones

---

### 3. Vendedor (`vendedor`)

**Acceso:** Dashboard, Órdenes, Inventario (lectura)

**Permisos:**
- ✅ Crear nuevas órdenes de producción
- ✅ Ver y editar órdenes existentes
- 👁️ Consultar inventario disponible (solo lectura)
- ✅ Seguimiento del estado de pedidos
- ❌ NO puede acceder a talleres ni gestión de usuarios

**Credenciales de prueba:**
- Usuario: `vendedor1`
- Contraseña: `ventas123`

**Flujo típico:**
1. Login
2. Revisar inventario disponible
3. Crear nueva orden de producción
4. Consultar estado de pedidos
5. Informar a clientes sobre entregas

---

### 4. Diseñador (`disenador`)

**Acceso:** Dashboard, Módulo de Diseño únicamente

**Permisos:**
- ✅ Ver órdenes asignadas a diseño
- ✅ Aprobar diseños
- ✅ Rechazar diseños que requieran cambios
- ✅ Actualizar estado de diseño
- ❌ NO puede acceder a otros talleres ni módulos administrativos

**Credenciales de prueba:**
- Usuario: `diseño1`
- Contraseña: `diseno123`

**Flujo típico:**
1. Login
2. Acceder al módulo de Diseño
3. Revisar especificaciones del cliente
4. Aprobar o rechazar diseños
5. Actualizar estado

---

### 5. Sublimador (`sublimador`)

**Acceso:** Dashboard, Módulo de Sublimación únicamente

**Permisos:**
- ✅ Ver órdenes listas para sublimar
- ✅ Actualizar estado del proceso
- ✅ Marcar sublimación como completada
- ❌ NO puede acceder a otros talleres

**Credenciales de prueba:**
- Usuario: `sublima1`
- Contraseña: `sublima123`

---

### 6. Cortador (`cortador`)

**Acceso:** Dashboard, Módulo de Corte únicamente

**Permisos:**
- ✅ Ver materiales asignados
- ✅ Confirmar cortes realizados
- ✅ Actualizar cantidad de piezas
- ❌ NO puede acceder a otros talleres

**Credenciales de prueba:**
- Usuario: `corte1`
- Contraseña: `corte123`

---

### 7. Costurera (`costurera`)

**Acceso:** Dashboard, Módulo de Costura únicamente

**Permisos:**
- ✅ Ver órdenes pendientes de coser
- ✅ Registrar avances de producción
- ✅ Marcar piezas terminadas
- ✅ Enviar a bordado si aplica
- ❌ NO puede acceder a otros talleres

**Credenciales de prueba:**
- Usuario: `costura1`
- Contraseña: `costura123`

---

### 8. Bordador (`bordador`)

**Acceso:** Dashboard, Módulo de Bordado únicamente

**Permisos:**
- ✅ Ver órdenes con requerimientos de bordado
- ✅ Revisar especificaciones de diseño
- ✅ Actualizar estado de bordado
- ✅ Marcar orden como completada
- ❌ NO puede acceder a otros talleres

**Credenciales de prueba:**
- Usuario: `bordado1`
- Contraseña: `bordado123`

---

## Características del Sistema de Permisos

### 🔐 Autenticación
- Login con usuario y contraseña
- Validación de credenciales
- Sesión persistente en localStorage
- Registro automático de último acceso

### 🎯 Control de Acceso
- Sidebar dinámico (solo muestra módulos permitidos)
- Rutas protegidas con `ProtectedRoute`
- Validación de permisos en cada acción
- Redirección automática a login si no autenticado

### 👁️ Indicadores Visuales
- Badge de rol en el header
- Indicador "Solo lectura" en sidebar
- Botones deshabilitados con tooltips explicativos
- Banners informativos según nivel de acceso
- Colores distintivos por tipo de rol

### 📱 UX Optimizada
- Guía de usuario al primer login
- Tooltips con explicaciones de restricciones
- Mensajes claros de acceso denegado
- Flujos simplificados por rol

### 🛡️ Seguridad
- Control granular de permisos por ruta
- Validación en frontend (simulado)
- Separación clara de responsabilidades
- Prevención de acciones no autorizadas

---

## Tabla de Permisos Resumida

| Rol | Dashboard | Inventario | Órdenes | Talleres | Reportes | Usuarios |
|-----|-----------|------------|---------|----------|----------|----------|
| **Admin Primario** | ✅ Total | ✅ Total | ✅ Total | ✅ Total | ✅ Total | ✅ Total |
| **Admin Secundario** | 👁️ Lectura | 👁️ Lectura | 👁️ Lectura | 👁️ Lectura | 👁️ Lectura | 👁️ Lectura |
| **Vendedor** | ✅ Total | 👁️ Lectura | ✅ Total | ❌ Sin acceso | ❌ Sin acceso | ❌ Sin acceso |
| **Operativos Taller** | ✅ Total | ❌ Sin acceso | ❌ Sin acceso | ✅ Solo su módulo | ❌ Sin acceso | ❌ Sin acceso |

**Leyenda:**
- ✅ Total: Puede ver, crear, editar y eliminar
- 👁️ Lectura: Solo puede visualizar
- ❌ Sin acceso: No puede acceder a la sección

---

## Gestión de Usuarios (Admin Primario)

### Crear Usuario
1. Ir a "Gestión de Usuarios"
2. Click en "Nuevo Usuario"
3. Ingresar: nombre, usuario, contraseña, email, rol
4. Guardar

### Editar Usuario
1. Ir a "Gestión de Usuarios"
2. Click en icono de editar
3. Modificar datos necesarios
4. Guardar cambios

### Eliminar Usuario
1. Ir a "Gestión de Usuarios"
2. Click en icono de eliminar
3. Confirmar eliminación

### Cambiar Rol
1. Editar usuario
2. Seleccionar nuevo rol del dropdown
3. Guardar cambios
4. El usuario verá los cambios en su próximo login

---

## Implementación Técnica

### Archivos Clave

```
src/
├── types/
│   └── auth.ts                 # Tipos de roles y permisos
├── context/
│   └── AuthContext.tsx         # Context de autenticación
├── utils/
│   └── permissions.ts          # Lógica de permisos
├── data/
│   └── mockUsers.ts            # Usuarios de prueba
├── components/
│   ├── ProtectedRoute.tsx      # Rutas protegidas
│   ├── PermissionButton.tsx    # Botones con control de permisos
│   ├── UserGuide.tsx           # Guía de usuario
│   └── AccessDenied.tsx        # Pantalla de acceso denegado
└── pages/
    ├── Login.tsx               # Pantalla de login
    └── GestionUsuarios.tsx     # Gestión de usuarios
```

### Uso del PermissionButton

```tsx
import PermissionButton from '../components/PermissionButton';

<PermissionButton 
  requiredPermission="canCreate"
  className="bg-primary text-white"
>
  <Plus className="w-4 h-4 mr-2" />
  Crear Nuevo
</PermissionButton>
```

### Verificar Permisos Manualmente

```tsx
import { hasPermission } from '../utils/permissions';
import { useAuth } from '../context/AuthContext';

const { user } = useAuth();
const canEdit = hasPermission(user?.rol, '/inventario/materiales', 'canEdit');

if (canEdit) {
  // Mostrar botón de editar
}
```

---

## Flujos de Usuario Documentados

Todos los flujos están documentados visualmente en el sistema. Para verlos:

1. Login con cualquier usuario
2. Se mostrará automáticamente una guía personalizada
3. También disponible desde el Dashboard haciendo click en "Ver guía de usuario"

---

## Notas Importantes

⚠️ **Simulación Frontend**: Este sistema simula autenticación en el frontend. En producción, la autenticación debe implementarse en el backend con JWT, bcrypt para passwords, y validación de permisos en cada endpoint.

⚠️ **No usar para PII**: Este sistema no debe usarse para almacenar información personal identificable (PII) o datos sensibles sin implementar primero un backend seguro.

✅ **Propósito**: Demostración de flujos de usuario y control de acceso en una aplicación de gestión operativa.

---

## Soporte

Para agregar nuevos roles o modificar permisos, editar:
- `/src/types/auth.ts` - Agregar nuevo tipo de rol
- `/src/utils/permissions.ts` - Definir permisos del nuevo rol
- `/src/data/mockUsers.ts` - Agregar usuario de prueba

---

**Última actualización:** Abril 2026
