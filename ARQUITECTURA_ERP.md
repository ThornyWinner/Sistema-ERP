# Arquitectura del ERP — Uniformes Industriales

**Versión:** 1.1  
**Fecha:** 5 de noviembre de 2026

Este documento describe la arquitectura del sistema, sus dominios y el estado de integración de cada uno, para que las modificaciones futuras partan de lo que realmente existe.

---

## 1. Arquitectura actual

```text
┌─────────────────────────────────────────────┐
│                 USUARIOS                    │
│ Admin · Ventas · Diseño · Talleres          │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│              FRONTEND REACT                 │
│ Vite · TypeScript · Router · UI Components  │
│                                             │
│ Dashboard · Órdenes · Inventario · Talleres │
│ Proveedores · Reportes · Usuarios           │
│ Permisos Vacacionales · Notificaciones      │
└──────────────────────┬──────────────────────┘
                       │ supabase-js (clave publishable
                       │ + sesión del usuario)
                       ▼
┌─────────────────────────────────────────────┐
│              SUPABASE / POSTGRESQL          │
│                                             │
│ Auth · Postgres · RLS por rol · Triggers    │
│ RPC · Storage · Realtime                    │
└─────────────────────────────────────────────┘
```

No hay un backend propio: el navegador habla directamente con Supabase y las políticas RLS deciden qué puede leer o escribir cada usuario. La lógica que debe ser confiable (folios, historial, stock, estado de pago, avisos, validaciones laborales, envío de notificaciones) vive en triggers, constraints y funciones RPC de la base de datos.

---

## 2. Capas del sistema

### Capa de presentación

Responsable de:

- navegación
- formularios
- tablas
- dashboards
- Kanban
- filtros
- indicadores
- interacción con el usuario
- visualización condicionada por permisos

Ubicación principal:

`src/app/`

### Capa de estado/contexto

- `src/app/context/AuthContext.tsx`: sesión, perfil del usuario y CRUD de usuarios.
- `src/app/context/ErpDataContext.tsx`: carga materiales, productos, proveedores y órdenes (con detalles, producción, personalizaciones y pagos), y expone `crearOrden` y `actualizarProgresoTaller`. Convierte las filas de Supabase a los tipos de la UI.

### Capa de acceso a datos y reglas

`src/app/lib/`:

- `supabase.ts`: cliente principal y cliente aislado para altas de usuarios.
- `productos.ts`: guardado de productos, variantes e imagen.
- `notificaciones.ts`: lectura y envío de notificaciones (RPC).
- `vacaciones.ts` y `laboral.ts`: reglas de la LFT (vacaciones, incidencias, finiquitos, riesgos).
- `fechas.ts`: formato de fechas `date` sin desfase de zona horaria.

El módulo laboral consulta sus tablas directamente desde sus componentes (`components/vacaciones/`), no desde `ErpDataContext`.

### Tipos del modelo de UI

`src/app/data/mockData.ts` ya no contiene datos: solo las interfaces (`Orden`, `Producto`, `Material`, `Proveedor`…) que usa la interfaz. El nombre se conserva por historia.

### Capa de persistencia

PostgreSQL en Supabase. Los cambios posteriores al esquema original están en los scripts de `sql/`.

Los archivos de referencia (generados desde la base real) son:

- `Esquema Base de Datos.txt`
- `Tablas.txt`
- `Constraints.txt`
- `Índices.txt`
- `Triggers.txt`
- `Políticas.txt`

---

## 3. Dominios funcionales

### 3.1 Identidad y acceso

Entidades principales:

`roles → usuarios`

La tabla `usuarios` relaciona el usuario operativo con el rol y puede asociarse a `auth_user_id`.

La autenticación real debe distinguir entre:

- identidad/autenticación
- perfil de usuario
- rol
- autorización

No almacenar contraseñas en tablas de negocio si la autenticación se gestiona mediante Supabase Auth.

---

### 3.2 Catálogo

```text
categorias_producto
       │
       ▼
   productos
       │
       ▼
variantes_producto
```

Las variantes pueden representar combinaciones como talla, color y SKU.

También existen catálogos para:

- tallas
- colores
- estados
- métodos de pago
- tipos de venta
- estados de producción
- talleres

---

### 3.3 Inventario de materiales

```text
proveedores
     │
     ▼
materiales
     │
     ▼
movimientos_material
```

Los movimientos deben conservar trazabilidad del stock anterior y nuevo.

---

### 3.4 Inventario de productos

```text
productos
   │
   ▼
variantes_producto
   │
   ▼
movimientos_producto
```

Los movimientos deben permitir determinar cómo y por qué cambió el inventario de una variante.

---

### 3.5 Clientes y ventas

```text
clientes
    │
    ▼
ordenes
    │
    ├── orden_detalles
    ├── pagos
    ├── comentarios_orden
    ├── archivos
    └── historial_ordenes
```

Una orden también se relaciona con:

- vendedor
- estado
- método de pago
- tipo de venta
- estado de pago

---

### 3.6 Producción

```text
ordenes
   │
   ▼
orden_detalles
   │
   ├── personalizaciones
   │       └── personalizacion_hilos
   │
   └── produccion_taller
              │
              ├── taller
              ├── usuario
              └── estado_produccion
```

Una orden no necesariamente atraviesa todos los talleres.

El sistema debe permitir flujos variables según el tipo de producto y los requisitos de la orden.

Al terminar un taller, el trigger `trg_produccion_taller_avisos` crea notificaciones para el siguiente taller y, si la orden terminó, para el vendedor y los administradores primarios.

---

### 3.7 Notificaciones

```text
usuarios ──► enviar_notificacion() (RPC) ──► notificaciones (una fila por destinatario)
                                                  ▲
produccion_taller ──► trg_produccion_taller_avisos┘
```

Un envío a varias personas comparte `envio_id`. La app recibe las nuevas en tiempo real con Supabase Realtime.

---

### 3.8 Personal y relaciones laborales

```text
usuarios (opcional)
     │
     ▼
empleados
     │
     ├── vacaciones      (trigger validar_vacaciones, EXCLUDE sin traslapes)
     ├── incidencias
     ├── finiquitos
     └── documentos ───► Storage: expedientes (privado)
                          (pueden ligarse a una incidencia, vacación o finiquito)
```

Exclusivo del administrador primario. Reglas de la LFT en `lib/vacaciones.ts` y `lib/laboral.ts`, repetidas en la base de datos donde es posible.

---

## 4. Historial y auditoría

`historial_ordenes` debe considerarse una pieza importante del ERP.

El objetivo es conservar:

- orden afectada
- usuario que realizó la acción
- estado anterior
- estado nuevo
- comentario
- fecha/hora

Además existen triggers documentados que participan en la automatización del historial.

**Regla:** nunca eliminar o duplicar triggers relacionados con auditoría sin analizar primero qué eventos cubren.

---

## 5. Archivos y evidencias

La tabla `archivos` permite asociar archivos a una orden (diseños, evidencias u otros documentos de producción). Existe con RLS, pero la app todavía no la usa.

Supabase Storage en uso:

| Bucket | Acceso | Uso |
|---|---|---|
| `productos` | Público por URL; escribe solo admin primario | Imagen de referencia de productos (PNG/JPG/WEBP, 5 MB) |
| `expedientes` | Privado; solo admin primario (URLs firmadas de 60 s) | Expediente laboral (PDF/imagen, 10 MB) |
| `logos`, `documentos` | Públicos, sin políticas de escritura | Sin uso por ahora |

No introducir archivos reales sensibles en el repositorio Git.

---

## 6. RLS y autorización

La seguridad de datos debe implementarse en capas:

```text
UI permissions
      ↓
Route/component restrictions
      ↓
Supabase Auth
      ↓
PostgreSQL RLS
      ↓
Constraints / database rules
```

Ocultar un botón no equivale a seguridad.

Una acción no autorizada debe ser rechazada también por la capa de datos.

Estado: las cinco capas están implementadas. Las políticas RLS por rol están en `sql/rls_por_rol.sql` y se basan en funciones `SECURITY DEFINER` del esquema `private` (`current_user_role`, `puede_ver_orden`, `puede_editar_orden`…), que no expone la API. La capa de rutas solo valida la sesión, no el rol; ver "Limitaciones conocidas" en `ROLES_Y_PERMISOS.md`.

---

## 7. Orden de implementación recomendado

Orden seguido para conectar el frontend con la base de datos (los pasos 1–10 y 13 ya están, total o parcialmente; ver la matriz siguiente):

1. Configuración segura de Supabase.
2. Autenticación.
3. Perfil de usuario y roles.
4. Clientes y proveedores.
5. Catálogo de productos.
6. Materiales e inventario.
7. Órdenes y detalles.
8. Pagos y estados de pago.
9. Producción por taller.
10. Historial y auditoría.
11. Archivos/comentarios.
12. Reportes y métricas.
13. Notificaciones.
14. Facturación/CONTPAQi.

Este orden es orientativo; cualquier dependencia existente en la base de datos tiene prioridad.

---

## 8. Matriz de estado (5 de noviembre de 2026)

| Dominio | Estado | Qué hay | Qué falta |
|---|---|---|---|
| Autenticación | INTEGRADO | Supabase Auth, perfil en `usuarios`, sesión persistente | — |
| Roles y permisos | INTEGRADO | Menú por rol + RLS por rol | Validar el rol en las rutas |
| Usuarios | INTEGRADO | Alta, edición, desactivación y eliminación (perfil + cuenta de Auth con la RPC `eliminar_usuario`) | Cambiar la contraseña o el correo de Auth desde la app |
| Clientes | PARCIAL | Se crean/actualizan al capturar una orden | Pantalla propia de clientes; datos fiscales |
| Proveedores | PARCIAL | Directorio, alta, contacto, reabastecimiento e historial | Edición; "Órdenes de Compra" es un valor fijo |
| Materiales | PARCIAL | Inventario, alta, alertas de stock bajo | Edición, entradas y ajustes de stock con movimiento |
| Productos | INTEGRADO | Catálogo, alta/edición, variantes talla × color, imagen | Ajustes de stock fuera de una venta |
| Órdenes | PARCIAL | Cola FIFO, orden multiproducto, venta rápida, detalle | Editar orden, cambiar su estado, cancelar |
| Pagos | PARCIAL | Anticipo o pago al crear; estado de pago por trigger | Registrar pagos posteriores |
| Producción | INTEGRADO | Kanban por taller, seguimiento global, avisos al siguiente taller | — |
| Historial | IMPLEMENTADO_BASE_DATOS | Triggers en `historial_ordenes` | Mostrarlo en la interfaz |
| Archivos de orden | IMPLEMENTADO_BASE_DATOS | Tabla `archivos` con RLS | Interfaz y bucket |
| Comentarios | IMPLEMENTADO_BASE_DATOS | Tabla `comentarios_orden` con RLS | Interfaz |
| Notificaciones | INTEGRADO | Entre usuarios y roles, tiempo real, avisos de producción | Avisos por cambios de orden (cuando exista la edición) |
| Personal / LFT | INTEGRADO | Empleados, vacaciones, incidencias, expediente, finiquitos | Revisión legal de los cálculos |
| Dashboard | INTEGRADO | Panel general, de ventas y de taller con datos reales | — |
| Reportes | PARCIAL | Resumen de inventario con datos reales | Gráficas e indicadores con datos reales; filtro por periodo |
| Facturación CONTPAQi | PENDIENTE | — | Datos fiscales del cliente e integración |

Actualizar esta tabla cada vez que cambie el estado de un dominio.

---

## 9. Reglas para cambios de esquema

Antes de modificar PostgreSQL:

1. Buscar todas las referencias a la tabla/columna.
2. Revisar foreign keys.
3. Revisar constraints.
4. Revisar índices.
5. Revisar triggers.
6. Revisar funciones que la utilicen.
7. Revisar RLS/policies.
8. Revisar frontend y tipos TypeScript.
9. Preparar la migración como script nuevo en `sql/` (reversible cuando sea posible).
10. Probar antes de considerar el cambio terminado (para RLS, con `sql/verificar_rls.sql`).
11. Regenerar los `.txt` de la raíz desde la base real.

Nunca utilizar el archivo `Esquema Base de Datos.txt` como un script de migración directo sin validar dependencias y estado real de la base.

---

## 10. Convención para nuevos desarrollos

Cada nueva funcionalidad debería poder describirse así:

```text
REQUERIMIENTO
    ↓
REGLA DE NEGOCIO
    ↓
MODELO DE DATOS
    ↓
PERMISOS / RLS
    ↓
API / CONSULTA
    ↓
TIPOS TYPESCRIPT
    ↓
COMPONENTES / PÁGINAS
    ↓
VALIDACIÓN
    ↓
AUDITORÍA
```

Esto evita desarrollar primero una pantalla y descubrir después que la base de datos no puede representar correctamente el comportamiento requerido.

---

## 11. Prioridad del negocio sobre el prototipo

Cuando exista una contradicción entre un mock, una pantalla o un dato de demostración y una regla de negocio documentada, el agente debe detenerse y señalar la contradicción.

No debe resolverla inventando una regla.

La prioridad recomendada es:

1. Reglas de negocio confirmadas por el propietario.
2. Arquitectura y restricciones de la base de datos.
3. Políticas de seguridad.
4. Documentación del ERP.
5. Código existente.
6. Datos mock.

---

## 12. Objetivo final

El objetivo no es únicamente tener un dashboard bonito.

El ERP debe proporcionar una fuente centralizada y trazable para:

- ventas
- clientes
- inventario
- productos
- materiales
- proveedores
- producción
- talleres
- pagos
- órdenes
- auditoría
- documentos
- reportes
- facturación

La interfaz debe ser consecuencia de este modelo operativo, no sustituirlo.
