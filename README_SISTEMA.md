# Sistema de Gestión de Inventarios y Producción - Uniformes Industriales

## 📋 Descripción

Sistema completo de gestión de inventarios y producción para un negocio de uniformes industriales que integra:

- ✅ Control de inventario (materiales y productos)
- ✅ Gestión de órdenes de producción
- ✅ Flujo de trabajo por talleres (diseño, sublimación, corte, costura, bordado)
- ✅ **Sistema completo de roles y permisos de usuario**
- ✅ Dashboard con métricas en tiempo real
- ✅ Seguimiento global de producción
- ✅ Gestión de proveedores
- ✅ Reportes y análisis

## 🎯 Características Principales

### 🔐 Sistema de Autenticación y Roles

**8 Roles de Usuario:**
1. **Administrador Primario** - Acceso total
2. **Administrador Secundario** - Solo lectura
3. **Vendedor** - Órdenes e inventario
4. **Diseñador** - Módulo de diseño
5. **Sublimador** - Módulo de sublimación
6. **Cortador** - Módulo de corte
7. **Costurera** - Módulo de costura
8. **Bordador** - Módulo de bordado

### 🎨 Diseño y UX

- **Estilo**: Minimalista, limpio, moderno
- **Color principal**: Verde industrial (#059669)
- **Colores de estado**: Semáforo (rojo, amarillo, verde)
- **Tipografía**: Work Sans
- **Responsive**: Adaptado a desktop y móvil

### 🛠️ Módulos del Sistema

#### 1. Dashboard
- Resumen general de producción
- Métricas clave (órdenes activas, pendientes, completadas)
- Alertas de stock bajo
- Gráficas de producción por taller
- Estado de órdenes (pie chart)

#### 2. Inventarios
- **Materiales**: Telas, hilos, accesorios
- **Productos**: Uniformes terminados
- Alertas de stock mínimo
- Filtros avanzados
- Gestión completa (CRUD)

#### 3. Órdenes de Producción
- Crear nuevas órdenes
- Seguimiento de estado
- Información de cliente
- Fechas de entrega
- Progreso por taller

#### 4. Talleres (Vista Kanban)
- **Diseño**: Aprobación de diseños
- **Sublimación**: Control de estampado
- **Corte**: Gestión de cortes
- **Costura**: Seguimiento de confección
- **Bordado**: Control de bordados
- Drag & drop entre estados
- Actualización en tiempo real

#### 5. Seguimiento Global
- Vista completa del flujo de producción
- Timeline de órdenes
- Cuellos de botella
- Eficiencia por taller

#### 6. Proveedores
- Listado de proveedores
- Información de contacto
- Materiales suministrados
- Historial de pedidos

#### 7. Reportes
- Producción por período
- Eficiencia de talleres
- Inventario valorizado
- Órdenes completadas

#### 8. Gestión de Usuarios (Admin)
- Crear/editar/eliminar usuarios
- Asignar roles
- Control de accesos
- Registro de último acceso

## 🚀 Inicio Rápido

### Acceder al Sistema

1. Al iniciar la aplicación, serás redirigido a `/login`
2. Usa cualquiera de estas credenciales de prueba:

```
Admin Primario:
Usuario: admin
Contraseña: admin123

Admin Secundario:
Usuario: admin2
Contraseña: admin456

Vendedor:
Usuario: vendedor1
Contraseña: ventas123

Diseñador:
Usuario: diseño1
Contraseña: diseno123
```

3. Explora el sistema según tus permisos
4. Accede a `/demo` para ver todas las credenciales

## 📚 Documentación

### Archivos de Documentación

- **`ROLES_Y_PERMISOS.md`**: Documentación completa del sistema de roles
- **`INSTRUCCIONES_USO.md`**: Guía paso a paso de uso del sistema
- **Este archivo**: Resumen general del proyecto

### Estructura del Proyecto

```
src/
├── app/
│   ├── components/
│   │   ├── ui/              # Componentes de UI (shadcn)
│   │   ├── Card.tsx         # Tarjetas personalizadas
│   │   ├── Header.tsx       # Header con rol y logout
│   │   ├── Sidebar.tsx      # Sidebar dinámico
│   │   ├── ProtectedRoute.tsx
│   │   ├── PermissionButton.tsx
│   │   ├── UserGuide.tsx
│   │   └── ...
│   ├── context/
│   │   └── AuthContext.tsx  # Context de autenticación
│   ├── data/
│   │   ├── mockData.ts      # Datos de demostración
│   │   └── mockUsers.ts     # Usuarios de prueba
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Login.tsx
│   │   ├── GestionUsuarios.tsx
│   │   ├── InventarioMateriales.tsx
│   │   ├── talleres/
│   │   │   ├── TallerDiseno.tsx
│   │   │   └── ...
│   │   └── ...
│   ├── types/
│   │   └── auth.ts          # Tipos de roles y permisos
│   ├── utils/
│   │   └── permissions.ts   # Lógica de permisos
│   ├── layouts/
│   │   └── RootLayout.tsx
│   ├── routes.tsx
│   └── App.tsx
└── styles/
    ├── fonts.css
    ├── index.css
    ├── tailwind.css
    └── theme.css
```

## 🔑 Permisos por Rol

| Rol | Dashboard | Inventario | Órdenes | Talleres | Reportes | Usuarios |
|-----|-----------|------------|---------|----------|----------|----------|
| **Admin Primario** | ✅ Total | ✅ Total | ✅ Total | ✅ Todos | ✅ Total | ✅ Total |
| **Admin Secundario** | 👁️ Lectura | 👁️ Lectura | 👁️ Lectura | 👁️ Lectura | 👁️ Lectura | 👁️ Lectura |
| **Vendedor** | ✅ Total | 👁️ Lectura | ✅ Total | ❌ Sin acceso | ❌ Sin acceso | ❌ Sin acceso |
| **Operativos** | ✅ Total | ❌ Sin acceso | ❌ Sin acceso | ✅ Solo su módulo | ❌ Sin acceso | ❌ Sin acceso |

## 🎯 Tecnologías Utilizadas

- **React 18.3.1** - Framework de UI
- **TypeScript** - Tipado estático
- **React Router 7** - Navegación
- **Tailwind CSS v4** - Estilos
- **Recharts** - Gráficas
- **Lucide React** - Iconos
- **Radix UI** - Componentes accesibles
- **Sonner** - Notificaciones toast
- **React DnD** - Drag and drop

## 🎨 Sistema de Diseño

### Paleta de Colores

```css
/* Principal */
--primary: #059669 (Verde industrial)

/* Estados de Producción */
--status-pending: #EF4444 (Rojo)
--status-in-progress: #F59E0B (Amarillo)
--status-completed: #10B981 (Verde)

/* Neutrales */
--neutral-50 a --neutral-900
```

### Componentes UI

Basados en **shadcn/ui** con personalización:
- Buttons
- Cards
- Dialogs
- Dropdowns
- Forms
- Tables
- Badges
- Tooltips
- Y más...

## 📱 Responsive Design

El sistema es completamente responsive:
- **Desktop**: Vista completa con sidebar
- **Tablet**: Sidebar colapsable
- **Mobile**: Navegación adaptada

## 🔒 Seguridad

⚠️ **Importante**: Este sistema es una **demostración frontend** del flujo de usuarios y control de acceso.

### En Producción Requerirías:

1. **Backend seguro** con API REST/GraphQL
2. **Autenticación JWT** con tokens seguros
3. **Hash de contraseñas** con bcrypt
4. **Validación en servidor** de todos los permisos
5. **HTTPS** obligatorio
6. **CORS** configurado correctamente
7. **Rate limiting** para prevenir ataques
8. **SQL injection prevention**
9. **XSS protection**
10. **Logs de auditoría**

## 🧪 Testing Manual

### Casos de Prueba Sugeridos

1. **Login/Logout**
   - Login exitoso con cada rol
   - Login fallido con credenciales incorrectas
   - Logout y redirección correcta

2. **Permisos**
   - Admin secundario no puede editar
   - Vendedor no ve módulos de taller
   - Operativos solo ven su módulo

3. **Navegación**
   - Sidebar muestra solo rutas permitidas
   - Intentar acceder a ruta no permitida
   - Indicadores visuales correctos

4. **Gestión de Usuarios**
   - Solo admin primario puede acceder
   - Crear usuario funciona
   - Editar rol funciona
   - Eliminar usuario funciona

## 🌟 Características Destacadas

### UX Optimizada

1. **Guía de Usuario**: Se muestra automáticamente al primer login
2. **Tooltips Explicativos**: Sobre elementos deshabilitados
3. **Badges Visuales**: Indicando "Solo lectura"
4. **Banners Informativos**: Explicando restricciones
5. **Colores Distintivos**: Por tipo de rol

### Flujos Simplificados

- Cada usuario solo ve lo necesario para su función
- Reduce complejidad y errores operativos
- Mejora eficiencia en tareas repetitivas
- Previene accesos no autorizados

### Datos de Demostración

- 8 usuarios de prueba (uno por rol)
- 10+ órdenes de producción
- 15+ materiales en inventario
- 5+ productos
- Proveedores de ejemplo
- Datos realistas

## 📊 Métricas del Sistema

### Componentes Creados
- **40+ componentes React**
- **8 páginas principales**
- **5 módulos de taller**
- **20+ componentes UI reutilizables**

### Líneas de Código
- **~6,000+ líneas** TypeScript/React
- **~1,000+ líneas** CSS/Tailwind
- **Arquitectura modular** y escalable

## 🚧 Próximas Mejoras Sugeridas

1. **Backend Integration**
   - API REST con Node.js/Express
   - Base de datos PostgreSQL
   - Autenticación JWT real

2. **Funcionalidades**
   - Notificaciones en tiempo real
   - Chat entre usuarios
   - Carga de archivos (diseños)
   - Exportación de reportes PDF/Excel
   - Historial de cambios

3. **UX/UI**
   - Modo oscuro
   - Personalización de tema
   - Accesibilidad mejorada (ARIA)
   - Animaciones más fluidas

4. **DevOps**
   - Tests automatizados (Jest, Cypress)
   - CI/CD pipeline
   - Docker containerization
   - Monitoring y logging

## 📄 Licencia

Este es un proyecto de demostración educativo.

## 👥 Créditos

Desarrollado como demostración de:
- Sistema completo de gestión operativa
- Implementación de roles y permisos
- Diseño de UX centrado en el usuario
- Arquitectura frontend escalable

---

**¿Necesitas ayuda?**
- Ver `INSTRUCCIONES_USO.md` para guía de uso
- Ver `ROLES_Y_PERMISOS.md` para detalles de permisos
- Acceder a `/demo` en la aplicación para ver credenciales

---

**Sistema de Gestión de Uniformes Industriales v1.0**  
Abril 2026
