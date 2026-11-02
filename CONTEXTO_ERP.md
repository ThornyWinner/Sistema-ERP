# Contexto Maestro del ERP — Uniformes Industriales

**Versión:** 1.1  
**Fecha:** 10 de agosto de 2026  
**Propósito:** documento de transferencia de contexto para desarrolladores humanos y asistentes de IA que continúen el proyecto.

---

## 1. Qué es este proyecto

Este repositorio contiene el frontend de un ERP especializado para una empresa dedicada a la fabricación y comercialización de uniformes industriales.

El sistema **no es un inventario genérico**. Su objetivo es centralizar y dar trazabilidad a la operación comercial, inventario, producción, talleres, pagos, seguimiento de órdenes, documentos y auditoría.

La finalidad operativa es reducir la dependencia de comunicación informal —por ejemplo, mensajes dispersos por WhatsApp— y convertir la información de una orden en un flujo estructurado y auditable.

---

## 2. Estado actual del repositorio

El frontend está construido con React + TypeScript + Vite y contiene una implementación/prototipo funcional basada en datos de demostración (`mockData.ts` y `mockUsers.ts`).

La documentación del repositorio también contiene un esquema de PostgreSQL/Supabase, tablas, constraints, índices, triggers y políticas.

**Importante:** el frontend actual y la base de datos documentada **no deben considerarse automáticamente equivalentes**. Antes de implementar una funcionalidad hay que determinar si ya existe en frontend, si existe en la base de datos, si está integrada o si está pendiente.

La integración completa frontend ↔ Supabase debe considerarse pendiente de validación hasta que el código demuestre explícitamente esa conexión.

---

## 3. Regla fundamental para continuar el proyecto

**Este NO es un proyecto nuevo.**

Cualquier desarrollador o IA que trabaje en él debe:

1. Analizar primero el código existente.
2. Analizar la documentación de la base de datos.
3. Identificar qué es funcional, qué es mock y qué está incompleto.
4. Respetar relaciones, constraints, índices, triggers y políticas existentes.
5. Evitar recrear tablas, roles, triggers o funcionalidades que ya existan.
6. No reemplazar la arquitectura actual por otra tecnología sin una decisión explícita del propietario.
7. No eliminar funcionalidades existentes para resolver un problema nuevo.
8. Antes de modificar la base de datos, revisar dependencias, RLS, triggers, constraints e índices.
9. Preferir cambios incrementales y verificables.
10. Si existe una contradicción entre documentación, código y reglas de negocio, señalarla antes de inventar una solución.

---

## 4. Modelo de negocio

La empresa trabaja principalmente con tres tipos de operación.

### 4.1 Comercialización

Compra de productos terminados a proveedores para posteriormente venderlos al cliente.

Flujo conceptual:

`Proveedor → Producto terminado → Inventario → Orden de venta → Cliente`

### 4.2 Fabricación

Producción de prendas desde materiales y/o componentes, pasando por los talleres que correspondan.

Flujo conceptual posible:

`Materiales → Diseño → Sublimación → Corte → Costura → Bordado → Producto terminado`

**No todas las prendas pasan por todos los talleres.** El flujo real depende de las características de cada orden y producto.

### 4.3 Venta directa

Venta de productos que ya se encuentran disponibles en inventario y pueden entregarse inmediatamente.

Estas operaciones no deben confundirse con una orden de fabricación.

---

## 5. Roles operativos

El sistema contempla principalmente:

- **Administrador primario:** control total.
- **Administrador secundario:** consulta/lectura según las reglas establecidas.
- **Vendedor:** clientes, órdenes y funciones comerciales autorizadas.
- **Diseñador:** actividades relacionadas con diseño.
- **Sublimador:** actividades relacionadas con sublimación.
- **Cortador:** actividades relacionadas con corte.
- **Costurera:** actividades relacionadas con costura.
- **Bordador:** actividades relacionadas con bordado.

Los permisos deben respetarse tanto en la interfaz como, cuando se integre la base de datos, mediante controles reales del backend/RLS. Los controles visuales del frontend nunca deben considerarse una frontera de seguridad suficiente.

---

## 6. Flujo conceptual de una orden

Una orden puede contener uno o varios detalles.

Cada detalle puede representar una prenda/producto y una cantidad determinada. Debe poder distinguirse el tipo de operación/producción correspondiente.

Una orden puede tener:

- folio
- cliente
- vendedor
- fechas
- productos/detalles
- cantidades
- precio unitario
- subtotal
- descuento
- total
- anticipo
- estado de pago
- método de pago
- tipo de venta
- notas
- archivos
- comentarios
- historial de cambios

### Cambios posteriores

Los clientes pueden solicitar cambios después de creada una orden. Cuando una orden cambie:

- no debe tratarse como si la orden original nunca hubiera existido
- debe conservarse trazabilidad
- debe identificarse quién realizó el cambio
- debe registrarse qué cambió cuando el modelo lo permita
- los usuarios afectados deben recibir notificación cuando corresponda

---

## 7. Producción y talleres

Los talleres considerados son:

- Diseño
- Sublimación
- Corte
- Costura
- Bordado

El sistema debe soportar flujos variables. **No debe asumir que una orden siempre atraviesa los cinco talleres.**

La tabla `produccion_taller` representa la relación entre un detalle de orden, un taller y el usuario responsable, además del estado y fechas de inicio/fin.

Ejemplos válidos:

```text
Diseño → Corte → Costura
```

```text
Diseño → Sublimación → Corte → Costura → Bordado
```

```text
Corte → Costura → Bordado
```

---

## 8. Inventario

Existen dos dominios principales.

### Materiales

Ejemplos: telas, hilos, accesorios y otros insumos.

Se controlan cantidades, unidad, stock mínimo, precio unitario y proveedor.

### Productos

Son prendas/productos terminados. Pueden tener variantes por talla/color y SKU.

Los movimientos deben dejar trazabilidad del stock anterior, cantidad, stock nuevo, usuario y referencia/motivo cuando aplique.

No modificar directamente stock sin considerar el historial de movimientos y las reglas de concurrencia/transacción.

---

## 9. Base de datos

La documentación se encuentra en:

- `Esquema Base de Datos.txt`
- `Tablas.txt`
- `Constraints.txt`
- `Índices.txt`
- `Triggers.txt`
- `Políticas.txt`

El esquema documentado incluye entidades relacionadas con:

- roles y usuarios
- clientes y proveedores
- categorías, productos y variantes
- materiales y movimientos de materiales
- talleres
- órdenes y detalles de órdenes
- personalizaciones e hilos
- producción por taller
- pagos
- tallas y colores
- estados de órdenes
- métodos de pago
- tipos de venta
- estados de pago
- historial de órdenes
- movimientos de producto
- estados de producción
- archivos
- comentarios de órdenes
- consecutivos de documentos

El archivo de esquema contiene una advertencia de que **no debe ejecutarse directamente como migración** sin validar orden, dependencias y constraints.

---

## 10. Supabase y seguridad

La arquitectura de datos está orientada a PostgreSQL/Supabase.

Cuando el código frontend no contenga integración real, no debe inventarse una conexión ni afirmarse que ya existe.

Las políticas RLS, triggers y funciones existentes deben revisarse antes de modificar tablas relacionadas.

Nunca almacenar en el repositorio:

- contraseñas reales
- tokens
- claves privadas
- service-role keys
- archivos `.env`
- credenciales de producción
- información personal real innecesaria

---

## 11. Datos de demostración

`src/app/data/mockData.ts` y `src/app/data/mockUsers.ts` son datos de demostración.

Las credenciales que aparezcan en la interfaz de demostración son exclusivamente de prueba y no deben reutilizarse en producción.

No deben utilizarse como fuente de verdad para diseñar nuevas relaciones de base de datos.

---

## 12. Facturación y CONTPAQi

La operación contempla una futura/pendiente integración del flujo de facturación con CONTPAQi.

Los vendedores han solicitado que una orden pueda recopilar, cuando corresponda:

- RFC
- razón social
- código postal
- método de pago
- uso de CFDI
- correo electrónico

No debe asumirse que una integración directa con CONTPAQi ya está implementada si no existe código/documentación específica que lo demuestre.

---

## 13. Auditoría y trazabilidad

La trazabilidad es una característica central del ERP.

El sistema debe poder responder preguntas como:

- ¿quién creó la orden?
- ¿quién la modificó?
- ¿qué estado tenía antes?
- ¿qué estado tiene ahora?
- ¿cuándo ocurrió el cambio?
- ¿quién registró el pago?
- ¿quién movió inventario?
- ¿qué usuario trabajó una etapa de producción?

Las tablas y triggers documentados forman parte de esta arquitectura.

No eliminar un trigger de auditoría por parecer duplicado sin comprobar previamente qué eventos cubre.

---

## 14. Archivos y evidencias

Las órdenes pueden tener archivos asociados, por ejemplo diseños, documentos o evidencias.

Los archivos reales no deben almacenarse dentro del repositorio Git.

La aplicación debe utilizar almacenamiento apropiado, con permisos y URLs seguras.

---

## 15. Principios de desarrollo

### No romper lo existente

Antes de cambiar un componente, ruta, tabla o función, localizar sus referencias y dependencias.

### No duplicar conceptos

Antes de crear una tabla, estado, rol o trigger, buscar si ya existe una entidad equivalente.

### Base de datos primero para datos persistentes

Una vez integrada la base real, los datos persistentes deben provenir de ella. El frontend no debe convertirse en una segunda base de datos mediante mocks permanentes.

### Auditoría

Las operaciones críticas deben conservar trazabilidad: quién hizo el cambio, qué cambió y cuándo.

### Cambios pequeños

Implementar por fases. Después de cada cambio importante comprobar compilación, navegación, permisos y comportamiento afectado.

---

## 16. Qué NO debe hacer una IA sin autorización

- Cambiar React/Vite por otro framework.
- Cambiar Supabase/PostgreSQL por otra base de datos.
- Eliminar tablas existentes para simplificar.
- Renombrar entidades globalmente sin revisar dependencias.
- Desactivar RLS para solucionar errores.
- Colocar credenciales directamente en el código.
- Convertir datos mock en datos productivos.
- Inventar relaciones de negocio no documentadas.
- Ejecutar el esquema documentado completo como si fuera una migración segura.
- Eliminar triggers porque parezcan duplicados sin comprobar su propósito.
- Modificar permisos para que una pantalla funcione sin analizar la seguridad real.
- Realizar cambios destructivos en producción sin confirmación.

---

## 17. Primera tarea recomendada para cualquier nuevo agente de desarrollo

Antes de escribir código nuevo, generar un diagnóstico que clasifique cada módulo como:

- `IMPLEMENTADO_FRONTEND`
- `IMPLEMENTADO_BASE_DATOS`
- `INTEGRADO`
- `MOCK`
- `PARCIAL`
- `PENDIENTE`
- `REQUIERE_DECISION`

El objetivo es construir una matriz de correspondencia entre frontend, base de datos y reglas de negocio.

Solo después de esa matriz debe comenzar la implementación de nuevas funcionalidades.

---

## 18. Fuente de verdad

Cuando existan diferencias, utilizar esta prioridad:

1. Reglas de negocio confirmadas por el propietario.
2. Base de datos real y seguridad real.
3. Documentación del ERP.
4. Código existente.
5. Datos mock.

Si una fuente contradice otra, **no inventar una resolución**. Informar la contradicción y pedir una decisión cuando afecte arquitectura o negocio.
