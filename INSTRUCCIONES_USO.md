# Instrucciones de Uso - Sistema de Roles y Permisos

## 🚀 Inicio Rápido

### 1. Acceder al Sistema

1. Al cargar la aplicación, serás redirigido automáticamente a la pantalla de **Login**
2. Selecciona un usuario de prueba de los que se muestran en la pantalla
3. Ingresa las credenciales y haz click en "Iniciar Sesión"

### 2. Primera Vez (Guía Automática)

Al iniciar sesión por primera vez con cualquier usuario:
- Se mostrará automáticamente una **guía personalizada** según tu rol
- Esta guía te explica tus permisos y restricciones
- Puedes cerrarla y volver a verla desde el Dashboard haciendo click en "Ver guía de usuario"

### 3. Navegar el Sistema

Después de iniciar sesión:
- **Sidebar izquierdo**: Muestra solo las secciones a las que tienes acceso
- **Header superior**: Muestra tu nombre, rol y opciones de cuenta
- **Dashboard**: Vista general personalizada según tu rol

---

## 👤 Probando Diferentes Roles

### Cómo Cambiar de Usuario

1. Click en tu **nombre** en el header (esquina superior derecha)
2. Selecciona **"Cerrar Sesión"**
3. En la pantalla de login, ingresa las credenciales de otro usuario
4. Observa cómo cambia la interfaz según el nuevo rol

### Usuarios Recomendados para Probar

**Para ver control total:**
```
Usuario: admin
Contraseña: admin123
```

**Para ver restricciones de solo lectura:**
```
Usuario: admin2
Contraseña: admin456
```

**Para ver acceso limitado a talleres:**
```
Usuario: diseño1
Contraseña: diseno123
```

---

## 🔍 Características a Observar

### 1. Sidebar Dinámico

- **Admin Primario**: Ve todas las secciones
- **Admin Secundario**: Ve todas las secciones con badge "Solo lectura"
- **Vendedor**: Solo ve Dashboard, Inventario (lectura), Órdenes
- **Operativos de taller**: Solo ven su módulo específico

### 2. Botones y Acciones

- **Admin Primario**: Todos los botones habilitados
- **Admin Secundario**: Botones deshabilitados con tooltip explicativo
- **Otros roles**: Botones contextuales según permisos

### 3. Indicadores Visuales

- **Badge de rol** en el header con color distintivo
- **Banners informativos** en pantallas con restricciones
- **Tooltips explicativos** al pasar el mouse sobre elementos deshabilitados
- **Iconos de candado** en áreas de solo lectura

### 4. Gestión de Usuarios

Solo disponible para **Admin Primario**:
1. Ir a la sección "Gestión de Usuarios" en el sidebar
2. Click en "Nuevo Usuario" para crear
3. Editar usuarios existentes con el icono de lápiz
4. Eliminar usuarios con el icono de papelera
5. Cambiar roles usando el dropdown de "Rol"

---

## 📋 Flujos de Usuario por Rol

### Administrador Primario

```
Login → Dashboard → Acceso completo a todas las secciones →
Puede crear/editar/eliminar en cualquier módulo →
Gestión de usuarios → Logout
```

### Administrador Secundario

```
Login → Dashboard → Ve todas las secciones →
Solo puede visualizar (botones deshabilitados) →
Banner amarillo de "Modo Solo Lectura" →
Logout
```

### Vendedor

```
Login → Dashboard → Crear nueva orden →
Consultar inventario (solo lectura) →
Ver estado de pedidos → Logout
```

### Operativos de Taller (Diseñador, Sublimador, etc.)

```
Login → Dashboard → Solo ve su módulo de taller →
Actualiza estados de producción →
No puede acceder a otros talleres → Logout
```

---

## 🎯 Casos de Uso para Probar

### Caso 1: Gestión Completa (Admin Primario)

1. Login como `admin / admin123`
2. Ir a "Gestión de Usuarios"
3. Crear un nuevo usuario con rol "Vendedor"
4. Ir a "Inventario de Materiales"
5. Observar botón "Agregar Material" habilitado
6. Ir a cualquier módulo de taller
7. Observar control total

### Caso 2: Solo Lectura (Admin Secundario)

1. Login como `admin2 / admin456`
2. Observar banner amarillo en páginas
3. Intentar crear/editar algo
4. Ver tooltips explicando restricciones
5. Notar badges "Solo lectura" en sidebar

### Caso 3: Vendedor (Acceso Parcial)

1. Login como `vendedor1 / ventas123`
2. Observar sidebar reducido
3. Ver que puede acceder a Órdenes
4. Ir a Inventario y ver que es solo lectura
5. Intentar acceder a talleres (no aparecen en sidebar)

### Caso 4: Operativo de Taller

1. Login como `diseño1 / diseno123`
2. Ver sidebar minimalista (solo Dashboard y su taller)
3. Ir al módulo de Diseño
4. Observar opciones de aprobar/rechazar
5. Intentar acceder a otros talleres escribiendo la URL directamente
6. Ver mensaje de acceso denegado (si se implementa)

---

## 📊 Recursos Adicionales

### Página de Demostración

Accede a `/demo` o click en el enlace del login para ver:
- Todas las credenciales disponibles
- Resumen visual de permisos por rol
- Instrucciones de cómo probar el sistema
- Botones para copiar credenciales

### Documentación Completa

Ver archivo `ROLES_Y_PERMISOS.md` para:
- Descripción detallada de cada rol
- Tabla de permisos completa
- Detalles técnicos de implementación

---

## 🛠️ Funcionalidades Implementadas

✅ **Autenticación**
- Login con usuario/contraseña
- Validación de credenciales
- Sesión persistente
- Logout

✅ **Control de Acceso**
- Sidebar dinámico
- Rutas protegidas
- Permisos granulares
- Validación por rol

✅ **Gestión de Usuarios**
- Crear usuarios
- Editar usuarios
- Eliminar usuarios
- Asignar roles
- Solo admin primario

✅ **Indicadores UX**
- Badges de rol
- Tooltips explicativos
- Banners informativos
- Botones contextuales
- Guía de usuario

✅ **Experiencia Personalizada**
- Dashboard adaptado
- Módulos filtrados
- Acciones según permisos
- Mensajes contextuales

---

## ⚠️ Limitaciones

1. **Simulación Frontend**: La autenticación es simulada en el frontend. En producción se requiere backend seguro.

2. **Datos Temporales**: Los cambios se almacenan en localStorage y se pierden al limpiar caché.

3. **Sin Backend**: No hay persistencia real de datos ni API endpoints.

4. **Propósito Educativo**: Este sistema es una demostración de flujos de usuario, no un sistema de producción.

---

## 🎨 Diseño y UX

### Colores por Rol

- **Admin Primario**: Verde (#059669)
- **Admin Secundario**: Amarillo
- **Vendedor**: Azul
- **Diseñador**: Púrpura
- **Sublimador**: Cian
- **Cortador**: Naranja
- **Costurera**: Rosa
- **Bordador**: Índigo

### Principios de Diseño

1. **Claridad**: Indicadores visuales claros de permisos
2. **Consistencia**: Mismos patrones en toda la app
3. **Feedback**: Tooltips y mensajes explicativos
4. **Prevención de errores**: Botones deshabilitados vs. ocultos
5. **Eficiencia**: Flujos simplificados por rol

---

## 💡 Tips para Desarrolladores

### Agregar Nuevo Rol

1. Editar `/src/types/auth.ts` - Agregar tipo
2. Editar `/src/utils/permissions.ts` - Definir permisos
3. Editar `/src/data/mockUsers.ts` - Agregar usuario de prueba
4. Actualizar guías en componentes si es necesario

### Proteger Nueva Ruta

```typescript
import PermissionButton from '../components/PermissionButton';

<PermissionButton requiredPermission="canCreate">
  Crear Nuevo
</PermissionButton>
```

### Verificar Permisos

```typescript
import { hasPermission } from '../utils/permissions';

if (hasPermission(user.rol, '/ruta', 'canEdit')) {
  // Mostrar formulario de edición
}
```

---

## 📞 Soporte

Para preguntas o problemas:
1. Revisar documentación en `ROLES_Y_PERMISOS.md`
2. Ver página de demo en `/demo`
3. Consultar código fuente en `/src/app/`

---

**Sistema de Gestión de Inventarios y Producción**  
**Versión con Roles y Permisos - Abril 2026**
