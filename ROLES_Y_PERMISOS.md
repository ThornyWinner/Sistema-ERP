# Sistema de Roles y Permisos

## Descripción General

Este sistema de gestión de inventarios y producción para uniformes industriales controla el acceso de cada usuario según su rol operativo. La autenticación y los usuarios viven en **Supabase**:

- **Supabase Auth** guarda las credenciales (correo y contraseña).
- La tabla **`usuarios`** guarda el perfil (nombre, username, email, estado, rol) y se vincula con Auth mediante `auth_user_id`.
- La tabla **`roles`** contiene los roles; `usuarios.rol_id` apunta a ella. Los valores de `roles.nombre` deben coincidir con el tipo `UserRole` del frontend.

Los permisos por módulo (ver / crear / editar / eliminar) se definen en el frontend, en `src/app/utils/permissions.ts`.

---

## Roles Disponibles

| Rol | Clave (`roles.nombre`) | Módulos visibles |
|-----|------------------------|------------------|
| Administrador Primario | `admin_primario` | Todos (control total) |
| Administrador Secundario | `admin_secundario` | Todos (solo lectura), excepto Gestión de Usuarios |
| Vendedor | `vendedor` | Dashboard, Órdenes, Inventario (lectura) |
| Diseñador | `disenador` | Dashboard, Taller de Diseño |
| Sublimador | `sublimador` | Dashboard, Taller de Sublimación |
| Cortador | `cortador` | Dashboard, Taller de Corte |
| Costurera | `costurera` | Dashboard, Taller de Costura |
| Bordador | `bordador` | Dashboard, Taller de Bordado |

### 1. Administrador Primario (`admin_primario`)

**Acceso:** total a los 13 módulos del menú.

- ✅ Crear, editar y eliminar usuarios, y asignarles rol y estado
- ✅ Gestión completa de inventarios (materiales y productos)
- ✅ Control total de órdenes de producción
- ✅ Acceso a todos los talleres, Seguimiento Global, Proveedores y Reportes
- ⚠️ No puede eliminarse a sí mismo desde Gestión de Usuarios

### 2. Administrador Secundario (`admin_secundario`)

**Acceso:** solo lectura en todos los módulos.

- 👁️ Consultar inventarios, órdenes, talleres, seguimiento, proveedores y reportes
- ❌ No puede crear, editar ni eliminar registros
- ❌ **No puede entrar a Gestión de Usuarios**: aunque el menú se lo muestra como "Solo lectura", la página le muestra "Acceso Restringido" (solo el administrador primario la usa)

**Indicadores visuales:**
- Insignia "Solo lectura" en cada módulo del sidebar, con tooltip explicativo
- Badge amarillo de rol en el header
- Aviso de solo lectura en Inventario de Materiales
- En el Taller de Diseño, los botones Aprobar/Rechazar se sustituyen por "Solo lectura"

### 3. Vendedor (`vendedor`)

**Acceso:** Dashboard y Órdenes (control total); Inventario de materiales y productos (solo lectura).

- ✅ Crear órdenes de producción y ventas rápidas
- ✅ Ver y editar órdenes
- 👁️ Consultar inventario disponible
- ℹ️ En Dashboard y Órdenes solo ve **sus propias órdenes** y métricas
- ❌ Sin acceso a talleres, proveedores, reportes ni usuarios

**Flujo típico:** login → revisar inventario → crear orden → dar seguimiento al estado → informar al cliente.

### 4–8. Roles de taller

Cada rol operativo ve únicamente el **Dashboard** y el **tablero Kanban de su taller**, con control total sobre ese módulo.

| Rol | Clave | Módulo | Tareas principales |
|-----|-------|--------|--------------------|
| Diseñador | `disenador` | `/talleres/diseno` | Revisar especificaciones, aprobar o rechazar diseños |
| Sublimador | `sublimador` | `/talleres/sublimacion` | Procesar órdenes listas para sublimar y marcarlas completadas |
| Cortador | `cortador` | `/talleres/corte` | Confirmar cortes y cantidad de piezas |
| Costurera | `costurera` | `/talleres/costura` | Registrar avances, marcar piezas terminadas, enviar a bordado si aplica |
| Bordador | `bordador` | `/talleres/bordado` | Revisar especificaciones y completar el bordado |

---

## Tabla de Permisos por Módulo

| Módulo (ruta) | Admin Primario | Admin Secundario | Vendedor | Rol de taller |
|---------------|:-:|:-:|:-:|:-:|
| Dashboard (`/`) | ✅ | 👁️ | ✅ | ✅ |
| Inventario Materiales (`/inventario/materiales`) | ✅ | 👁️ | 👁️ | ❌ |
| Inventario Productos (`/inventario/productos`) | ✅ | 👁️ | 👁️ | ❌ |
| Órdenes de Producción (`/ordenes`) | ✅ | 👁️ | ✅ | ❌ |
| Talleres (`/talleres/*`) | ✅ | 👁️ | ❌ | ✅ solo el suyo |
| Seguimiento Global (`/seguimiento`) | ✅ | 👁️ | ❌ | ❌ |
| Proveedores (`/proveedores`) | ✅ | 👁️ | ❌ | ❌ |
| Reportes (`/reportes`) | ✅ | 👁️ | ❌ | ❌ |
| Gestión de Usuarios (`/usuarios`) | ✅ | ❌ ¹ | ❌ | ❌ |

**Leyenda:** ✅ ver, crear, editar y eliminar · 👁️ solo lectura · ❌ sin acceso (oculto en el menú)

¹ `permissions.ts` le da lectura, pero `GestionUsuarios.tsx` bloquea la página a todo rol distinto de `admin_primario`.

---

## Características del Sistema

### 🔐 Autenticación
- Login con **correo electrónico** y contraseña contra Supabase Auth
- Tras validar credenciales se carga el perfil de `usuarios`; si no existe o su estado es `inactivo`, se cierra la sesión y se muestra el error
- Sesión persistente: Supabase la guarda en `localStorage` y se restaura al recargar
- Al iniciar sesión se actualiza `ultimo_acceso` mediante la función RPC `actualizar_mi_ultimo_acceso`
- Tras el login se regresa a la página que el usuario intentaba abrir

### 🎯 Control de Acceso
- Sidebar dinámico: solo muestra los módulos con `canView` para el rol
- `ProtectedRoute` exige sesión iniciada; sin sesión redirige a `/login`
- `PermissionButton` deshabilita acciones según el permiso del rol en la ruta actual

### 👁️ Indicadores Visuales
- Badge de rol en el header (verde para admin primario, amarillo para admin secundario)
- Insignia "Solo lectura" en el sidebar
- Botones deshabilitados con tooltip "No tienes permisos para realizar esta acción"

### 📱 Guía de Usuario
- Se abre automáticamente la primera vez que cada usuario entra al Dashboard (se recuerda por navegador en `localStorage`, clave `guide_seen_<id>`)
- Disponible en cualquier momento con el botón "Ver guía de usuario" del Dashboard

---

## Gestión de Usuarios (Admin Primario)

Ruta: **Gestión de Usuarios** (`/usuarios`).

### Crear usuario
1. Click en "Nuevo Usuario"
2. Capturar nombre, username, **email (obligatorio)**, contraseña, rol y estado
3. Guardar: se crea la cuenta en Supabase Auth y el perfil en `usuarios`

Errores comunes: correo ya registrado en Auth, o username/email duplicado en `usuarios`.

### Editar usuario
Permite cambiar nombre, username, email, rol y estado del **perfil**. La contraseña y el correo de la cuenta de Supabase Auth no se modifican desde aquí. Los cambios de rol se reflejan en la siguiente carga del perfil (si se edita al usuario conectado, de inmediato).

### Desactivar vs. eliminar
- **Desactivar** (estado `inactivo`): el usuario ya no puede iniciar sesión. Es la opción recomendada.
- **Eliminar**: borra el perfil de `usuarios`. Si el usuario tiene órdenes, movimientos u otros registros asociados, la base de datos lo impide y se sugiere desactivarlo. La cuenta de Supabase Auth no se elimina.

---

## Credenciales de Prueba

Las cuentas de prueba (una por rol) están en **`Credenciales.txt`** en la raíz del proyecto. Ese archivo está en `.gitignore` y **no debe subirse al repositorio**.

> Las credenciales de `src/app/data/mockUsers.ts` (`admin`/`admin123`, etc.) pertenecen al prototipo inicial con login local. Ya no funcionan: ese archivo no se importa en ninguna parte y solo se conserva como referencia.

---

## Implementación Técnica

### Archivos clave

```
src/app/
├── types/
│   └── auth.ts                 # UserRole, User, Permission, RoutePermission
├── context/
│   └── AuthContext.tsx         # Sesión, login/logout y CRUD de usuarios (Supabase)
├── lib/
│   └── supabase.ts             # Cliente de Supabase y cliente aislado para altas
├── utils/
│   └── permissions.ts          # roleLabels, getRoutePermissions, hasPermission, getAccessibleRoutes
├── routes.tsx                  # Definición de rutas
├── components/
│   ├── ProtectedRoute.tsx      # Exige sesión iniciada
│   ├── PermissionButton.tsx    # Botón habilitado/deshabilitado según permiso
│   ├── Sidebar.tsx             # Menú filtrado por rol
│   ├── Header.tsx              # Badge de rol
│   ├── UserGuide.tsx           # Guía por rol
│   └── AccessDenied.tsx        # Pantalla de acceso denegado (disponible, sin uso actual)
├── data/
│   └── mockUsers.ts            # Usuarios del prototipo (sin uso)
└── pages/
    ├── Login.tsx               # Inicio de sesión
    └── GestionUsuarios.tsx     # Administración de usuarios
```

### Uso de `PermissionButton`

El permiso se evalúa sobre la ruta actual (`location.pathname`):

```tsx
import PermissionButton from '../components/PermissionButton';

<PermissionButton requiredPermission="canCreate" className="bg-primary text-white">
  <Plus className="w-4 h-4 mr-2" />
  Crear Nuevo
</PermissionButton>
```

### Verificar permisos manualmente

```tsx
import { hasPermission } from '../utils/permissions';
import { useAuth } from '../context/AuthContext';

const { user } = useAuth();
const canEdit = user ? hasPermission(user.rol, '/inventario/materiales', 'canEdit') : false;
```

La ruta debe coincidir exactamente con una de las definidas en `getRoutePermissions`.

---

## Limitaciones Conocidas de Seguridad

⚠️ **Los permisos por rol solo se aplican en la interfaz.**

- `ProtectedRoute` únicamente verifica que haya sesión; **no valida el rol**. Un usuario autenticado puede abrir cualquier ruta escribiendo la URL (p. ej. un cortador en `/reportes`). El menú la oculta, pero la página se carga.
- `PermissionButton` hoy solo se usa en Inventario de Materiales; en las demás páginas los botones de acción no se deshabilitan por rol (salvo los casos específicos de Diseño y Gestión de Usuarios descritos arriba).
- Las **políticas RLS** actuales de Supabase (`authenticated_full_access`) dan a cualquier usuario autenticado lectura y escritura total sobre todas las tablas, incluidas `usuarios` y `roles`. Por tanto, la base de datos **no** respalda las restricciones del frontend.

**Recomendaciones antes de producción:**
1. Reescribir las políticas RLS por tabla y por rol (p. ej. con una función `mi_rol()` que lea `usuarios.rol_id` del `auth.uid()` actual).
2. Validar el rol en `ProtectedRoute` (o en un guard por ruta) y mostrar `AccessDenied` cuando no haya `canView`.
3. Usar `PermissionButton` / `hasPermission` en todas las acciones de crear, editar y eliminar.
4. Mover el alta y la baja de usuarios a una Edge Function con la service role key, para poder eliminar también la cuenta de Auth.

---

## Agregar o Modificar Roles

1. Insertar el rol en la tabla `roles` de Supabase (`nombre` = clave del rol).
2. `src/app/types/auth.ts`: agregar la clave al tipo `UserRole`.
3. `src/app/utils/permissions.ts`: agregar su etiqueta en `roleLabels` y su `case` en `getRoutePermissions`.
4. `src/app/components/UserGuide.tsx`: agregar su guía e icono.
5. Si corresponde, actualizar las políticas RLS para el nuevo rol.

---

**Última actualización:** Octubre 2026
