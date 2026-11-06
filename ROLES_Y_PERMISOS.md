# Sistema de Roles y Permisos

## Descripción General

El sistema controla el acceso de cada usuario según su rol operativo, en dos capas:

1. **Interfaz** (`src/app/utils/permissions.ts`): qué módulos aparecen en el menú y qué acciones (ver / crear / editar / eliminar) se habilitan.
2. **Base de datos** (políticas RLS de Supabase, `sql/rls_por_rol.sql`): qué filas puede leer y modificar cada usuario. Es la frontera de seguridad real: aunque alguien abra una pantalla o llame a la API directamente, solo obtiene los datos que su rol permite.

La autenticación y los usuarios viven en **Supabase**:

- **Supabase Auth** guarda las credenciales (correo y contraseña).
- La tabla **`usuarios`** guarda el perfil (nombre, username, email, estado, rol) y se vincula con Auth mediante `auth_user_id`.
- La tabla **`roles`** contiene los roles; `usuarios.rol_id` apunta a ella. Los valores de `roles.nombre` deben coincidir con el tipo `UserRole` del frontend.

---

## Roles Disponibles

| Rol | Clave (`roles.nombre`) | Módulos visibles |
|-----|------------------------|------------------|
| Administrador Primario | `admin_primario` | Todos (control total) |
| Administrador Secundario | `admin_secundario` | Todos en solo lectura, excepto Gestión de Usuarios y Permisos Vacacionales |
| Vendedor | `vendedor` | Dashboard, Órdenes, Inventario (lectura) |
| Diseñador | `disenador` | Dashboard, Taller de Diseño |
| Sublimador | `sublimador` | Dashboard, Taller de Sublimación |
| Cortador | `cortador` | Dashboard, Taller de Corte |
| Costurera | `costurera` | Dashboard, Taller de Costura |
| Bordador | `bordador` | Dashboard, Taller de Bordado |

Todos los roles tienen además el **buscador global** (solo busca en los módulos que el rol puede ver) y la **campana de notificaciones**.

### 1. Administrador Primario (`admin_primario`)

**Acceso:** total a los 14 módulos del menú.

- ✅ Crear, editar y eliminar usuarios, y asignarles rol y estado
- ✅ Alta de materiales, alta y edición de productos (con imagen) y alta de proveedores
- ✅ Control total de órdenes, pagos y producción
- ✅ Todos los talleres, Seguimiento Global y Reportes
- ✅ **Permisos Vacacionales** (exclusivo): empleados, vacaciones, incidencias, expediente laboral y finiquitos, incluidos los salarios
- ✅ Recibe el aviso automático cuando una orden termina producción
- ⚠️ No puede eliminarse a sí mismo desde Gestión de Usuarios

### 2. Administrador Secundario (`admin_secundario`)

**Acceso:** solo lectura en todo el negocio.

- 👁️ Consultar Dashboard general, inventarios, órdenes y pagos, talleres, seguimiento, proveedores y reportes
- ❌ No puede crear, editar ni eliminar registros (la base de datos también lo rechaza)
- ❌ **Gestión de Usuarios**: el menú se la muestra como "Solo lectura", pero la página le muestra "Acceso Restringido" (solo el administrador primario la usa)
- ❌ **Permisos Vacacionales**: no aparece en su menú; contiene salarios y datos personales del personal
- ✅ Puede enviar y recibir notificaciones

**Indicadores visuales:**
- Insignia "Solo lectura" en cada módulo del sidebar, con tooltip explicativo
- Badge amarillo de rol en el header
- Aviso de solo lectura en Inventario de Materiales
- Botones de alta deshabilitados con tooltip (materiales, productos, proveedores)
- En el Taller de Diseño, los botones Aprobar/Rechazar se sustituyen por "Solo lectura"

### 3. Vendedor (`vendedor`)

**Acceso:** Dashboard y Órdenes (control total); Inventario de materiales y productos (solo lectura).

- ✅ Crear órdenes multiproducto y ventas rápidas de mostrador
- ✅ Dar de alta y actualizar clientes al capturar una orden
- 👁️ Consultar inventario y proveedores (en la base de datos; el módulo de Proveedores no aparece en su menú)
- ℹ️ Solo ve **sus propias órdenes** (Dashboard de ventas, Órdenes, buscador). La base de datos tampoco le deja ver ni asignar órdenes de otro vendedor
- ✅ Recibe el aviso automático cuando una de sus órdenes termina producción
- ❌ Sin acceso a talleres, seguimiento, reportes, usuarios ni vacaciones

**Flujo típico:** login → revisar inventario → crear orden → dar seguimiento al estado → informar al cliente.

### 4–8. Roles de taller

Cada rol operativo ve únicamente su **Dashboard de taller** (cola FIFO, pendientes, en proceso y terminados, sin importes) y el **tablero Kanban de su taller**.

| Rol | Clave | Módulo | Tareas principales |
|-----|-------|--------|--------------------|
| Diseñador | `disenador` | `/talleres/diseno` | Revisar especificaciones y avanzar el diseño (los botones Aprobar/Rechazar aún no guardan nada) |
| Sublimador | `sublimador` | `/talleres/sublimacion` | Procesar órdenes listas para sublimar y marcarlas completadas |
| Cortador | `cortador` | `/talleres/corte` | Confirmar cortes y cantidad de piezas |
| Costurera | `costurera` | `/talleres/costura` | Registrar avances, marcar piezas terminadas |
| Bordador | `bordador` | `/talleres/bordado` | Revisar especificaciones y completar el bordado |

En la base de datos, un rol de taller:
- Solo ve las órdenes que pasan por su taller (y sus productos, variantes y clientes).
- Solo puede **editar el avance de su propio taller** (no crear ni eliminar registros de producción).
- No ve pagos, historial, inventario ni proveedores.

Cuando marca un trabajo como terminado, los usuarios del **siguiente taller** del flujo reciben un aviso automático "listo para <taller>".

---

## Tabla de Permisos por Módulo (interfaz)

| Módulo (ruta) | Admin Primario | Admin Secundario | Vendedor | Rol de taller |
|---------------|:-:|:-:|:-:|:-:|
| Dashboard (`/`) | ✅ general | 👁️ general | ✅ de ventas | ✅ de su taller |
| Inventario Materiales (`/inventario/materiales`) | ✅ | 👁️ | 👁️ | ❌ |
| Inventario Productos (`/inventario/productos`) | ✅ | 👁️ | 👁️ | ❌ |
| Órdenes de Producción (`/ordenes`) | ✅ | 👁️ | ✅ las suyas | ❌ |
| Talleres (`/talleres/*`) | ✅ | 👁️ | ❌ | ✅ solo el suyo |
| Seguimiento Global (`/seguimiento`) | ✅ | 👁️ | ❌ | ❌ |
| Proveedores (`/proveedores`) | ✅ | 👁️ | ❌ | ❌ |
| Reportes (`/reportes`) | ✅ | 👁️ | ❌ | ❌ |
| Gestión de Usuarios (`/usuarios`) | ✅ | ❌ ¹ | ❌ | ❌ |
| Permisos Vacacionales (`/vacaciones`) | ✅ | ❌ | ❌ | ❌ |

**Leyenda:** ✅ ver, crear, editar y eliminar · 👁️ solo lectura · ❌ sin acceso (oculto en el menú)

¹ `permissions.ts` le da lectura (aparece en el menú), pero `GestionUsuarios.tsx` bloquea la página a todo rol distinto de `admin_primario`.

Los formularios de alta (`/materiales/nuevo`, `/productos/nuevo`, `/productos/editar/:id`, `/proveedores/nuevo`) heredan el permiso de su módulo y se bloquean si el rol no puede crear o editar.

---

## Seguridad en la Base de Datos (RLS)

Resumen; el detalle tabla por tabla está en [Políticas.txt](Pol%C3%ADticas.txt) y la definición en `sql/rls_por_rol.sql`.

| Datos | Admin Primario | Admin Secundario | Vendedor | Rol de taller |
|-------|:-:|:-:|:-:|:-:|
| Órdenes, detalles, personalizaciones, producción | CRUD | Lectura | CRUD de las suyas | Lectura de las de su taller; editar avance de su taller |
| Pagos e historial de órdenes | CRUD | Lectura | De sus órdenes | — |
| Clientes | CRUD | Lectura | Leer, crear y editar | Los de sus órdenes |
| Productos y variantes | CRUD | Lectura | Lectura | Los de sus órdenes |
| Materiales, movimientos y proveedores | CRUD | Lectura | Lectura | — |
| Usuarios | CRUD | Lectura | Solo su perfil | Solo su perfil |
| Empleados, vacaciones, incidencias, documentos, finiquitos | CRUD | — | — | — |
| Notificaciones | Las propias (recibidas y enviadas) | Igual | Igual | Igual |
| Catálogos (roles, talleres, tallas, colores, estados…) | CRUD | Lectura | Lectura | Lectura |

Reglas generales:
- Un usuario **inactivo o sin perfil** no ve nada; el rol `anon` (sin sesión) no tiene permisos.
- Nadie puede cambiarse su propio rol.
- Las funciones auxiliares (`current_user_role`, `puede_ver_orden`, etc.) viven en el esquema `private`, que la API no expone.
- Los triggers (folio, historial, estado de pago, salida de inventario, avisos de producción) son `SECURITY DEFINER`: funcionan aunque el usuario no tenga permiso directo sobre esas tablas.
- Storage: el bucket `expedientes` es privado y exclusivo del admin primario; en `productos` (imágenes públicas por URL) solo él sube o borra.
- `sql/verificar_rls.sql` simula a cada usuario y comprueba lo que ve y lo que puede modificar.

---

## Características del Sistema

### 🔐 Autenticación
- Login con **correo electrónico** y contraseña contra Supabase Auth
- Tras validar credenciales se carga el perfil de `usuarios`; si no existe o su estado es `inactivo`, se cierra la sesión y se muestra el error
- Sesión persistente: Supabase la guarda en `localStorage` y se restaura al recargar
- Al iniciar sesión se actualiza `ultimo_acceso` mediante la RPC `actualizar_mi_ultimo_acceso`
- Tras el login se regresa a la página que el usuario intentaba abrir

### 🎯 Control de Acceso en la Interfaz
- Sidebar dinámico: solo muestra los módulos con `canView` para el rol
- `ProtectedRoute` exige sesión iniciada; sin sesión redirige a `/login`
- `PermissionButton` y `hasPermission` deshabilitan las altas en materiales, productos y proveedores
- El buscador global solo busca en los módulos visibles para el rol

### 🔔 Notificaciones
- Cualquier usuario activo puede notificar a usuarios concretos o a roles completos, con un enlace opcional a una pantalla
- El envío se hace con la RPC `enviar_notificacion`: el remitente siempre es el usuario de la sesión y nadie se notifica a sí mismo
- Avisos automáticos de producción (remitente "Aviso automático")
- Llegan en tiempo real (Supabase Realtime)

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
3. Guardar: se crea la cuenta en Supabase Auth; el trigger `on_auth_user_created` crea un perfil básico y la app lo completa con el nombre, username, rol y estado. Si algo falla, se deshace el alta (no quedan cuentas a medias)

Antes de crear la cuenta, la app comprueba que el username y el email no estén en uso y, si lo están, lo indica sin crear nada. El trigger da un username provisional único (p. ej. `ventas01_2` si `ventas01` ya existe; `sql/username_unico_alta.sql`), que se reemplaza por el capturado.

### Editar usuario
Permite cambiar nombre, username, email, rol y estado del **perfil**. La contraseña y el correo de la cuenta de Supabase Auth no se modifican desde aquí. Los cambios de rol se reflejan en la siguiente carga del perfil (si se edita al usuario conectado, de inmediato).

### Desactivar vs. eliminar
- **Desactivar** (estado `inactivo`): el usuario ya no puede iniciar sesión ni ve datos. Es la opción recomendada.
- **Eliminar**: borra el perfil de `usuarios`. Si el usuario tiene órdenes, movimientos u otros registros asociados, la base de datos lo impide y se sugiere desactivarlo. Antes de eliminar se muestra un cuadro de confirmación con los datos del usuario.
- Eliminar borra el perfil **y la cuenta de Supabase Auth** en una sola transacción, con la RPC `eliminar_usuario` (`sql/eliminar_usuario.sql`), que solo puede ejecutar el administrador primario. Si no se puede borrar el perfil, tampoco se borra la cuenta.

### Empleados y usuarios
Un empleado de Permisos Vacacionales puede vincularse (opcionalmente) a un usuario del sistema. Son registros distintos: dar de baja a un empleado no desactiva su usuario, y viceversa.

---

## Credenciales de Prueba

Las cuentas de prueba (una por rol) están en **`Credenciales.txt`** en la raíz del proyecto. Ese archivo está en `.gitignore` y **no debe subirse al repositorio**.

---

## Implementación Técnica

### Archivos clave

```
sql/
├── rls_por_rol.sql             # Políticas RLS por rol y funciones del esquema private
└── verificar_rls.sql           # Prueba de lo que ve/modifica cada usuario
src/app/
├── types/
│   └── auth.ts                 # UserRole, User, Permission, RoutePermission
├── context/
│   └── AuthContext.tsx         # Sesión, login/logout y CRUD de usuarios (Supabase)
├── lib/
│   ├── supabase.ts             # Cliente de Supabase y cliente aislado para altas
│   └── notificaciones.ts       # Envío y lectura de notificaciones
├── utils/
│   └── permissions.ts          # roleLabels, getRoutePermissions, hasPermission, getAccessibleRoutes
├── routes.tsx                  # Definición de rutas
├── components/
│   ├── ProtectedRoute.tsx      # Exige sesión iniciada
│   ├── PermissionButton.tsx    # Botón habilitado/deshabilitado según permiso
│   ├── Sidebar.tsx             # Menú filtrado por rol
│   ├── Header.tsx              # Badge de rol, buscador y notificaciones
│   ├── BuscadorGlobal.tsx      # Búsqueda limitada a los módulos del rol
│   └── UserGuide.tsx           # Guía por rol
└── pages/
    ├── Login.tsx               # Inicio de sesión
    ├── Dashboard.tsx           # Elige el panel según el rol
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

Útil en páginas cuya ruta no coincide con la del módulo (p. ej. un formulario de alta):

```tsx
import { hasPermission } from '../utils/permissions';
import { useAuth } from '../context/AuthContext';

const { user } = useAuth();
const puedeCrear = !!user && hasPermission(user.rol, '/inventario/materiales', 'canCreate');
```

La ruta debe coincidir exactamente con una de las definidas en `getRoutePermissions`.

---

## Limitaciones Conocidas

- **Rutas sin validación de rol:** `ProtectedRoute` solo comprueba la sesión. Un usuario puede abrir una ruta que no está en su menú escribiendo la URL (p. ej. un cortador en `/reportes`); la pantalla carga, pero RLS solo le entrega los datos de su rol, así que la verá vacía o incompleta.
- **Botones no restringidos en todas las pantallas:** fuera de las altas de materiales, productos y proveedores, del Taller de Diseño y de Gestión de Usuarios, la interfaz no deshabilita las acciones por rol (p. ej. "Iniciar"/"Completar" en el Kanban para el admin secundario). RLS impide el cambio: en el Kanban el UPDATE no afecta ninguna fila, así que la tarjeta no se mueve y no aparece ningún mensaje de error.

---

## Agregar o Modificar Roles

1. Insertar el rol en la tabla `roles` de Supabase (`nombre` = clave del rol).
2. `src/app/types/auth.ts`: agregar la clave al tipo `UserRole`.
3. `src/app/utils/permissions.ts`: agregar su etiqueta en `roleLabels` y su `case` en `getRoutePermissions`.
4. `src/app/components/UserGuide.tsx`: agregar su guía e icono.
5. `src/app/pages/Dashboard.tsx`: decidir qué panel ve.
6. Políticas RLS: revisar `sql/rls_por_rol.sql` (y `private.mi_taller_id()` si es un rol de taller), aplicar el cambio y comprobarlo con `sql/verificar_rls.sql`.

---

**Última actualización:** 5 de noviembre de 2026
