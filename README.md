# Sistema de Gestión de Inventarios — ERP Uniformes Industriales

Aplicación web para gestionar inventario, órdenes de producción y el flujo de trabajo por talleres de un negocio de uniformes industriales. El frontend está hecho en React + Vite y los datos y la autenticación están en **Supabase**.

El diseño original está en [Figma](https://www.figma.com/design/9W6JSc1CNpVPERiXN6GBeh/Sistema-de-gesti%C3%B3n-de-inventarios).

## Módulos

| Ruta | Módulo |
| --- | --- |
| `/` | Dashboard con métricas, alertas de stock y gráficas |
| `/inventario/materiales` | Inventario de materiales (telas, hilos, accesorios) |
| `/inventario/productos`, `/productos/nuevo` | Catálogo de productos y variantes |
| `/ordenes`, `/ordenes/:id` | Órdenes de producción, pagos y detalle |
| `/talleres/{diseno,sublimacion,corte,costura,bordado}` | Tableros Kanban por taller |
| `/seguimiento` | Seguimiento global de la producción |
| `/proveedores` | Proveedores |
| `/reportes` | Reportes |
| `/usuarios` | Gestión de usuarios y roles |

El acceso a cada módulo depende del rol del usuario (`admin_primario`, `admin_secundario`, `vendedor`, `disenador`, `sublimador`, `cortador`, `costurera`, `bordador`). Ver [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md).

## Stack

- **React 18** + **TypeScript**, **Vite 6**, **React Router 7**
- **Tailwind CSS 4**, componentes Radix/shadcn (`src/app/components/ui`) y MUI
- **Recharts** para gráficas, **react-dnd** para el Kanban
- **Supabase** (`@supabase/supabase-js`): Postgres, Auth y RLS

## Requisitos

- Node.js 18 o superior
- npm o pnpm
- Un proyecto de Supabase con el esquema de la base de datos aplicado

## Puesta en marcha

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Crea un archivo `.env` en la raíz con las credenciales de tu proyecto de Supabase (Project Settings → API):

   ```env
   VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<tu-publishable-key>
   ```

   La app no arranca si falta alguna de las dos variables. `.env` está en `.gitignore`; no lo subas al repositorio.

3. Inicia el servidor de desarrollo:

   ```bash
   npm run dev
   ```

4. Para generar la build de producción en `dist/`:

   ```bash
   npm run build
   ```

## Base de datos

La definición de la base de datos está en archivos de texto en la raíz del repositorio:

| Archivo | Contenido |
| --- | --- |
| [Esquema Base de Datos.txt](Esquema%20Base%20de%20Datos.txt) | `CREATE TABLE` de todas las tablas |
| [Tablas.txt](Tablas.txt) | Columnas, tipos y valores por defecto |
| [Constraints.txt](Constraints.txt) | Llaves primarias, foráneas y restricciones |
| [Índices.txt](%C3%8Dndices.txt) | Índices |
| [Triggers.txt](Triggers.txt) | Triggers y funciones |
| [Políticas.txt](Pol%C3%ADticas.txt) | Políticas RLS |

Tablas principales: `usuarios`, `roles`, `clientes`, `proveedores`, `materiales`, `productos`, `variantes_producto`, `ordenes`, `orden_detalles`, `personalizaciones`, `produccion_taller`, `talleres` y `pagos`.

### Usuarios

El inicio de sesión usa Supabase Auth (correo y contraseña). Cada cuenta de Auth debe tener una fila en `usuarios` con `auth_user_id` apuntando a ella, un rol asignado y `estado = 'activo'`. Si no existe el perfil o el usuario está inactivo, no podrá entrar.

## Estructura del proyecto

```text
src/
├── main.tsx                 # Punto de entrada
├── styles/                  # Tailwind, tema y fuentes
└── app/
    ├── App.tsx
    ├── routes.tsx           # Definición de rutas
    ├── lib/supabase.ts      # Cliente de Supabase
    ├── context/
    │   ├── AuthContext.tsx  # Sesión, perfil y usuarios
    │   └── ErpDataContext.tsx # Carga y escritura de datos del ERP
    ├── utils/permissions.ts # Permisos por rol
    ├── types/               # Tipos compartidos
    ├── layouts/             # Layout principal (sidebar + header)
    ├── pages/               # Pantallas (incluye pages/talleres/)
    ├── components/          # Componentes de la app y ui/ (shadcn)
    └── data/                # Datos mock heredados del prototipo
```

## Documentación adicional

- [ARQUITECTURA_ERP.md](ARQUITECTURA_ERP.md): arquitectura del sistema y separación entre prototipo y datos reales
- [CONTEXTO_ERP.md](CONTEXTO_ERP.md): contexto del negocio y del flujo de producción
- [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md): detalle de roles y permisos
- [INSTRUCCIONES_USO.md](INSTRUCCIONES_USO.md): guía de uso para usuarios finales
- [README_SISTEMA.md](README_SISTEMA.md): descripción funcional extendida
- [ATTRIBUTIONS.md](ATTRIBUTIONS.md): licencias de terceros
