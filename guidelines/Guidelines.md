# Guidelines del proyecto — ERP Uniformes Industriales

Reglas para quien genere o modifique código en este repositorio (personas o IA). El contexto de negocio completo está en `CONTEXTO_ERP.md` y el estado de cada módulo en `ARQUITECTURA_ERP.md`; léelos antes de un cambio grande.

# Reglas generales

* No es un proyecto nuevo: antes de crear una tabla, ruta, componente o función, busca si ya existe algo equivalente.
* Mantén el stack: React + TypeScript + Vite + Tailwind 4 + shadcn/ui + Supabase. No agregues librerías de UI, estado o datos sin una decisión explícita del propietario.
* Los datos persistentes salen de Supabase. No reintroduzcas datos mock ni guardes datos de negocio en `localStorage`.
* Nunca pongas credenciales, tokens ni la service role key en el código. El navegador solo usa `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
* Si el código, la base de datos y la documentación se contradicen, señálalo en lugar de inventar una regla de negocio.

# Código

* Todo en español: nombres de variables, funciones, componentes, comentarios y textos de la interfaz (`crearOrden`, `actualizarProgresoTaller`, `DashboardTaller`).
* Cada archivo empieza con un comentario `/** Archivo.tsx — qué es. ... */` que explica su propósito, sus secciones y sus reglas. Mantenlo al día cuando cambies el archivo.
* Componentes de la app en `src/app/components/` (agrupados por dominio: `dashboard/`, `notificaciones/`, `proveedores/`, `vacaciones/`); pantallas en `src/app/pages/`; acceso a datos y reglas en `src/app/lib/`. No edites `components/ui/` salvo para corregir un componente base de shadcn.
* Los datos del ERP se leen con `useErpData()` (`ErpDataContext`) y la sesión con `useAuth()`. Los tipos de la UI están en `src/app/data/mockData.ts` (solo tipos, el nombre es histórico).
* Fechas de columnas `date`: usa las utilidades de `src/app/lib/fechas.ts`; `new Date("AAAA-MM-DD")` muestra el día anterior en México.
* Resultados de operaciones y errores: `toast.success` / `toast.error` (sonner), con mensajes claros en español.

# Permisos y seguridad

* Toda funcionalidad nueva lleva sus dos capas de permisos:
  * Interfaz: ruta en `getRoutePermissions` (`src/app/utils/permissions.ts`) y `PermissionButton` / `hasPermission` en las acciones de crear, editar y eliminar.
  * Base de datos: políticas RLS por rol para cada tabla nueva, usando las funciones de `private` (`current_user_role()`, `mi_usuario_id()`, `puede_ver_orden()`…).
* Ocultar un botón no es seguridad. Nunca desactives RLS ni uses políticas `using (true)` para que una pantalla funcione.
* Los datos laborales (empleados, salarios, expedientes) son exclusivos del administrador primario.
* La lógica que debe ser confiable (folios, stock, estado de pago, historial, avisos) va en triggers, constraints o RPC, no solo en el frontend.

# Base de datos

* Cada cambio de esquema es un script nuevo en `sql/`, con un encabezado que explique qué hace y de qué depende. No ejecutes `Esquema Base de Datos.txt`: es solo referencia.
* Antes de modificar una tabla revisa sus llaves foráneas, constraints, índices, triggers y políticas (`Constraints.txt`, `Índices.txt`, `Triggers.txt`, `Políticas.txt`).
* No elimines triggers de auditoría ni tablas "que parecen sin uso" sin comprobar qué cubren.
* Después de aplicar un cambio: prueba los permisos con `sql/verificar_rls.sql` y regenera los `.txt` de la raíz desde la base real.
* No modifiques el stock directamente: las salidas pasan por `trg_inventario_salida` y quedan en `movimientos_producto`.

# Reglas de negocio que no deben romperse

* Una orden no pasa necesariamente por los cinco talleres; el flujo lo define cada producto.
* Las órdenes se atienden por orden de llegada (FIFO); no hay prioridad.
* El anticipo no puede superar el total de la orden.
* Un vendedor solo ve y modifica sus propias órdenes; un rol de taller solo actualiza el avance de su taller.
* Los cálculos laborales (LFT) son orientativos e importes brutos; no los presentes como asesoría legal.

# Diseño

* Usa los tokens de `src/styles/theme.css` en lugar de colores fijos: `bg-primary`, `text-muted-foreground`, `border-border`, `bg-destructive`… Evita valores como `bg-[#059669]` en código nuevo.
* Color de marca: verde esmeralda `#059669` (`--primary`). Tipografía: Work Sans, tamaño base 16 px.
* Estados de producción y tareas, siempre con estos tokens (o con `StatusBadge`):
  * Pendiente: rojo (`--status-pending*`)
  * En proceso: ámbar (`--status-in-progress*`)
  * Terminado: verde (`--status-completed*`)
* Estilo minimalista: tarjetas blancas sobre fondo gris claro (`--background`), bordes suaves y radio `--radius` (0.5rem).
* Las acciones sin permiso se muestran deshabilitadas con tooltip explicativo, no se ocultan (salvo módulos completos, que no aparecen en el menú).
* Los formularios de alta siguen el diseño de `ProductoForm`: datos a la izquierda y, a la derecha, resumen en vivo con los botones de acción.
* Diseños responsive con flexbox y grid; evita el posicionamiento absoluto salvo cuando sea necesario.
* Texto de la interfaz en español, breve y orientado a la acción ("Nueva Orden", "Registrar vacaciones").
