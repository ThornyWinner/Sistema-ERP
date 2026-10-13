# Arquitectura del ERP — Uniformes Industriales

**Versión:** 1.0  
**Fecha:** 10 de agosto de 2026

Este documento define la arquitectura conceptual del sistema y sirve como guía para evitar que futuras modificaciones confundan el prototipo frontend con la arquitectura de datos real.

---

## 1. Arquitectura objetivo

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
│ Dashboard · Órdenes · Inventario · Talleres│
│ Usuarios · Proveedores · Reportes           │
└──────────────────────┬──────────────────────┘
                       │
                       │ Integración pendiente/
                       │ por validar en código actual
                       ▼
┌─────────────────────────────────────────────┐
│              SUPABASE / POSTGRESQL          │
│                                             │
│ Datos persistentes · Auth · RLS · Triggers  │
│ Constraints · Índices · Historial           │
└─────────────────────────────────────────────┘
```

El diagrama representa la arquitectura objetivo. El repositorio actual contiene principalmente el frontend/prototipo y la documentación de la capa de datos; no debe interpretarse que toda la integración mostrada ya está implementada.

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

Contiene contextos y mecanismos utilizados por el frontend para mantener sesión, usuario y estado de interfaz.

Ubicación:

`src/app/context/`

### Capa de datos de demostración

Contiene datos mock utilizados por el prototipo:

- `src/app/data/mockData.ts`
- `src/app/data/mockUsers.ts`

Estos archivos deben considerarse temporales respecto de la persistencia real.

### Capa de persistencia

La arquitectura documentada utiliza PostgreSQL/Supabase.

Los archivos de referencia son:

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

La tabla `archivos` permite asociar archivos a una orden.

Esto es relevante para diseños, evidencias u otros documentos de producción.

Las URLs y metadatos de archivos deben gestionarse mediante mecanismos de almacenamiento seguros. No introducir archivos reales sensibles en el repositorio Git.

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

Una acción no autorizada debe ser rechazada también por la capa de datos cuando corresponda.

---

## 7. Orden de implementación recomendado

Cuando se conecte el frontend con la base de datos, utilizar preferentemente este orden:

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

## 8. Matriz de estado inicial

| Dominio | Frontend/prototipo | Base de datos documentada | Integración real a validar |
|---|---|---|---|
| Autenticación | Sí | Usuarios/Auth relacionados | Pendiente de validar |
| Roles | Sí | Sí | Pendiente de validar |
| Clientes | Sí/según pantallas | Sí | Pendiente de validar |
| Proveedores | Sí/según pantallas | Sí | Pendiente de validar |
| Materiales | Sí | Sí | Pendiente de validar |
| Productos | Sí | Sí | Pendiente de validar |
| Órdenes | Sí | Sí | Pendiente de validar |
| Pagos | Sí/según prototipo | Sí | Pendiente de validar |
| Producción | Sí | Sí | Pendiente de validar |
| Historial | Parcial/documentado | Sí | Pendiente de validar |
| Archivos | Según prototipo | Sí | Pendiente de validar |
| Comentarios | Según prototipo | Sí | Pendiente de validar |
| Reportes | Sí/según prototipo | Derivados de datos | Pendiente de validar |
| Facturación CONTPAQi | Conceptualmente requerida | No asumir integración | Pendiente |
| Notificaciones por cambios | Requerimiento de negocio | No asumir implementación | Pendiente |

Esta tabla es una guía inicial, no una afirmación de que todas las pantallas estén completas. Debe actualizarse después de una auditoría detallada del código.

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
9. Preparar migración reversible cuando sea posible.
10. Probar antes de considerar el cambio terminado.

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
