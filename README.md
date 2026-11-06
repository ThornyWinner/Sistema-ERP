# Sistema de Gestión de Inventarios — ERP Uniformes Industriales

Aplicación web para gestionar inventario, órdenes de producción, el flujo de trabajo por talleres y el control laboral del personal de un negocio de uniformes industriales. El frontend está hecho en React + Vite; los datos, la autenticación, los archivos y la seguridad por rol (RLS) están en **Supabase**.

El diseño original está en [Figma](https://www.figma.com/design/9W6JSc1CNpVPERiXN6GBeh/Sistema-de-gesti%C3%B3n-de-inventarios).

## Módulos

| Ruta | Módulo |
| --- | --- |
| `/` | Dashboard según el rol: general (admins), de ventas (vendedor) o de taller |
| `/inventario/materiales`, `/materiales/nuevo` | Inventario de materia prima (telas, hilos, accesorios) y alta de materiales |
| `/inventario/productos`, `/productos/nuevo`, `/productos/editar/:id` | Catálogo de productos, variantes talla × color e imagen de referencia |
| `/ordenes`, `/ordenes/:id` | Órdenes en cola FIFO, venta rápida, nueva orden multiproducto y detalle |
| `/talleres/{diseno,sublimacion,corte,costura,bordado}` | Tablero Kanban de cada taller |
| `/seguimiento` | Seguimiento global de la producción y cuellos de botella |
| `/proveedores`, `/proveedores/nuevo` | Directorio de proveedores, contacto, reabastecimiento e historial |
| `/reportes` | Reportes (en su mayoría con datos de ejemplo; ver abajo) |
| `/usuarios` | Gestión de usuarios y roles |
| `/vacaciones` | Permisos Vacacionales: vacaciones, incidencias, expediente y finiquitos (LFT) |

En la barra superior hay además un **buscador global** (Ctrl+K) y una **campana de notificaciones** entre usuarios, que también recibe avisos automáticos cuando un taller termina su etapa.

El acceso a cada módulo depende del rol del usuario (`admin_primario`, `admin_secundario`, `vendedor`, `disenador`, `sublimador`, `cortador`, `costurera`, `bordador`) y se aplica tanto en la interfaz como en la base de datos (RLS). Ver [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md).

## Stack

- **React 18** + **TypeScript**, **Vite 6**, **React Router 7**
- **Tailwind CSS 4** y componentes Radix/shadcn (`src/app/components/ui`)
- **Recharts** (gráficas), **lucide-react** (iconos), **sonner** (avisos toast)
- **Supabase** (`@supabase/supabase-js`): Postgres, Auth, RLS, Storage y Realtime

## Requisitos

- Node.js 18 o superior
- npm
- Un proyecto de Supabase con el esquema y los scripts de `sql/` aplicados

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

3. Inicia el servidor de desarrollo (por defecto en `http://localhost:5173`):

   ```bash
   npm run dev
   ```

4. Para generar la build de producción en `dist/`:

   ```bash
   npm run build
   ```

Las cuentas de prueba (una por rol) están en `Credenciales.txt`, que tampoco se sube al repositorio.

## Base de datos

### Referencia del esquema

Archivos de texto en la raíz, generados desde la base real (última actualización: 5 de noviembre de 2026):

| Archivo | Contenido |
| --- | --- |
| [Esquema Base de Datos.txt](Esquema%20Base%20de%20Datos.txt) | `CREATE TABLE` de las 35 tablas (solo referencia, no ejecutable) |
| [Tablas.txt](Tablas.txt) | Columnas, tipos, NULL y valores por defecto |
| [Constraints.txt](Constraints.txt) | Llaves primarias, únicas, foráneas, CHECK y EXCLUDE |
| [Índices.txt](%C3%8Dndices.txt) | Índices |
| [Triggers.txt](Triggers.txt) | Triggers y funciones (incluidas las RPC) |
| [Políticas.txt](Pol%C3%ADticas.txt) | Resumen de las políticas RLS y de Storage por rol |

### Scripts SQL (`sql/`)

Cambios aplicados sobre el esquema original, en el orden en que se crearon:

| Script | Qué hace |
| --- | --- |
| `rls_por_rol.sql` | Políticas RLS por rol y funciones auxiliares en el esquema `private` |
| `verificar_rls.sql` | Prueba lo que ve y modifica cada usuario (se deshace con ROLLBACK) |
| `vacaciones.sql` | Tablas `empleados` y `vacaciones` con validaciones de la LFT |
| `expediente_laboral.sql` | `incidencias`, `finiquitos`, `documentos` y bucket privado `expedientes` |
| `notificaciones.sql` | Tabla `notificaciones` y RPC `enviar_notificacion` / `directorio_usuarios` |
| `avisos_produccion.sql` | Trigger que avisa al siguiente taller y al vendedor al terminar una etapa |
| `storage_productos.sql` | Límites y políticas del bucket `productos` (imágenes) |
| `chk_anticipo_total.sql` | Restricción: el anticipo no puede superar el total de la orden |
| `eliminar_usuario.sql` | RPC que elimina el perfil y la cuenta de Auth de un usuario (solo admin primario) |
| `username_unico_alta.sql` | El trigger de alta asigna un username provisional único (evita que falle el registro) |
| `seed_notificaciones.sql` | Datos de prueba para la campana de notificaciones (opcional) |

Tablas principales: `usuarios`, `roles`, `clientes`, `proveedores`, `materiales`, `productos`, `variantes_producto`, `ordenes`, `orden_detalles`, `personalizaciones`, `produccion_taller`, `talleres`, `pagos`, `notificaciones` y, para el módulo laboral, `empleados`, `vacaciones`, `incidencias`, `documentos` y `finiquitos`.

### Usuarios

El inicio de sesión usa Supabase Auth (correo y contraseña). Cada cuenta de Auth necesita una fila en `usuarios` con `auth_user_id` apuntando a ella, un rol asignado y `estado = 'activo'`. Sin perfil o con estado inactivo no puede entrar; sin rol entra, pero no ve ningún módulo ni dato.

Al crear una cuenta en Auth, el trigger `on_auth_user_created` inserta automáticamente un perfil básico (sin rol) en `usuarios`, que Gestión de Usuarios completa después; ver [Triggers.txt](Triggers.txt). Al eliminar un usuario se borran su perfil y su cuenta de Auth (`sql/eliminar_usuario.sql`).

## Estructura del proyecto

```text
sql/                         # Scripts aplicados a Supabase (RLS, módulo laboral, notificaciones…)
src/
├── main.tsx                 # Punto de entrada
├── styles/                  # Tailwind, tema y fuentes
└── app/
    ├── App.tsx
    ├── routes.tsx           # Definición de rutas
    ├── context/
    │   ├── AuthContext.tsx  # Sesión, perfil y usuarios
    │   └── ErpDataContext.tsx # Carga y escritura de datos del ERP
    ├── lib/                 # Supabase, fechas, productos, notificaciones, vacaciones y reglas laborales
    ├── hooks/               # useBusquedaUrl (filtro ?q= del buscador global)
    ├── utils/permissions.ts # Permisos por rol en la interfaz
    ├── types/               # Tipos de autenticación
    ├── data/mockData.ts     # Tipos del modelo de datos de la UI (ya no contiene datos)
    ├── layouts/             # Layout principal (sidebar + header)
    ├── pages/               # Pantallas (incluye pages/talleres/)
    └── components/          # Componentes de la app, por dominio (dashboard/, notificaciones/,
                             # proveedores/, vacaciones/) y ui/ (shadcn)
```

## Documentación adicional

- [CONTEXTO_ERP.md](CONTEXTO_ERP.md): contexto del negocio y reglas para continuar el proyecto
- [ARQUITECTURA_ERP.md](ARQUITECTURA_ERP.md): arquitectura, dominios y estado de cada módulo
- [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md): detalle de roles, permisos y RLS
- [INSTRUCCIONES_USO.md](INSTRUCCIONES_USO.md): guía de uso para usuarios finales
- [README_SISTEMA.md](README_SISTEMA.md): descripción funcional de cada módulo
- [ATTRIBUTIONS.md](ATTRIBUTIONS.md): licencias de terceros
