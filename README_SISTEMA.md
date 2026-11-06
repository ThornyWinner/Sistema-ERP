# Sistema de Gestión de Inventarios y Producción — Uniformes Industriales

## 📋 Descripción

ERP web para un negocio de uniformes industriales que centraliza:

- ✅ Inventario de materiales y de productos terminados (con variantes e imagen)
- ✅ Órdenes de producción y ventas de mostrador, atendidas en orden FIFO
- ✅ Flujo variable por talleres (diseño, sublimación, corte, costura, bordado)
- ✅ Seguimiento global y cuellos de botella
- ✅ Proveedores, contacto y solicitudes de reabastecimiento
- ✅ Roles y permisos aplicados en la interfaz y en la base de datos (RLS)
- ✅ Notificaciones entre usuarios y avisos automáticos de producción
- ✅ Control laboral del personal conforme a la LFT (vacaciones, incidencias, expediente, finiquitos)
- 🟡 Reportes (parcial: la mayoría de las gráficas aún usan datos de ejemplo)

Todo se guarda en **Supabase** (Postgres, Auth, Storage y Realtime). Instalación y configuración en [README.md](README.md).

---

## 🛠️ Módulos

### 1. Dashboard (`/`)
Cambia según el rol:
- **General** (administradores): ingresos, órdenes activas, anticipos pendientes, stock bajo, órdenes por tipo de venta, top vendedores, órdenes recientes, alertas de stock y estado financiero.
- **Ventas** (vendedor): lo mismo, pero solo con sus órdenes, más entregas próximas y órdenes con saldo pendiente.
- **Taller** (roles operativos): pendientes, en proceso, terminados, unidades por procesar y cola FIFO que indica qué trabajos ya están listos. Sin importes.

### 2. Inventarios
- **Materiales** (`/inventario/materiales`): telas, hilos y accesorios con stock, mínimo, proveedor y precio; filtros por tipo y nivel de stock; valor del inventario. Alta en `/materiales/nuevo`.
- **Productos** (`/inventario/productos`): catálogo con tallas, colores, stock y precio. Alta y edición en `/productos/nuevo` y `/productos/editar/:id`, con una variante por talla × color e imagen de referencia (bucket `productos`).

### 3. Órdenes de Producción (`/ordenes`)
- Tabla en orden FIFO con turno en la cola, tipo de venta, cliente, productos, total, estado de pago, días a la entrega y % de avance.
- Búsqueda por folio, cliente (nombre, teléfono o correo) o vendedor; filtros por estado y vendedor.
- **Nueva Orden**: varios productos, cada uno con su tipo (venta directa, fabricación, comercialización), sus talleres y su bordado. El tipo de venta de la orden se calcula solo ("mixta" si combina tipos).
- **Venta Rápida**: venta de mostrador con existencias; se crea entregada y liquidada.
- **Detalle** (`/ordenes/:id`): avance por taller de cada producto, personalización, datos del cliente, pagos y notas. Las órdenes entregadas y liquidadas muestran el distintivo "cerrada".
- La base de datos asigna el folio, registra el historial, calcula el estado de pago y descuenta el stock.

### 4. Talleres (`/talleres/*`)
Tablero Kanban por taller (Pendiente → En Proceso → Terminado) con botones **Iniciar** y **Completar**. Al completar, se avisa al siguiente taller del flujo y, cuando la orden termina, al vendedor y a los administradores. Diseño muestra botones Aprobar/Rechazar (todavía sin acción: no guardan nada); Bordado muestra los colores de hilo.

### 5. Seguimiento Global (`/seguimiento`)
Carga por taller, estado de cada producto en cada taller, cuellos de botella y eficiencia por taller.

### 6. Proveedores (`/proveedores`)
Tarjetas con contacto, calificación e insumos que surten. **Contactar** (llamar, WhatsApp, correo y mensaje de reabastecimiento si hay materiales bajo mínimo) e **Historial** (materiales que surte y movimientos de inventario). Alta en `/proveedores/nuevo`.

### 7. Reportes (`/reportes`)
Resumen de inventario con datos reales. Las gráficas de producción, consumo, más vendidos y eficiencia, y el selector de periodo, todavía son de ejemplo.

### 8. Gestión de Usuarios (`/usuarios`)
Solo administrador primario: crear (cuenta de Auth + perfil), editar perfil y rol, activar/desactivar y eliminar.

### 9. Permisos Vacacionales (`/vacaciones`)
Solo administrador primario. Empleados con antigüedad y días pendientes; vacaciones por año de servicio (Art. 76) con prima (Art. 80) y alerta de atrasadas (Art. 81); incidencias con aviso de causal de rescisión por faltas (Art. 47 fr. X); expediente documental con riesgos ante demanda (Arts. 784, 804, 805) en un bucket privado; cálculo de finiquito o liquidación y baja. Cálculos orientativos y brutos.

### Transversal
- **Buscador global** (Ctrl+K) limitado a los módulos de tu rol.
- **Notificaciones**: a usuarios o roles completos, con enlace opcional, en tiempo real.
- **Guía de usuario** por rol al primer ingreso.

---

## 🔐 Roles

| Rol | Alcance |
|---|---|
| Administrador primario | Todo |
| Administrador secundario | Lectura de todo el negocio (sin usuarios ni datos laborales) |
| Vendedor | Sus órdenes y clientes; inventario en lectura |
| Diseñador, Sublimador, Cortador, Costurera, Bordador | Su taller: ve las órdenes que pasan por él y actualiza su avance |

Detalle en [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md).

---

## 🎨 Diseño

- **Estilo**: minimalista y limpio; tipografía **Work Sans**.
- **Color principal**: verde industrial `#059669`.
- **Estados de producción**: rojo (pendiente), amarillo (en proceso), verde (terminado).
- Badge de rol en el header: verde (admin primario), amarillo (admin secundario), gris (resto).
- Componentes basados en **shadcn/ui** (Radix) en `src/app/components/ui`.

---

## 🎯 Tecnologías

React 18 · TypeScript · Vite 6 · React Router 7 · Tailwind CSS 4 · Radix/shadcn · Recharts · lucide-react · sonner · Supabase (`@supabase/supabase-js`).

---

## 🔒 Seguridad

- Autenticación con Supabase Auth (correo y contraseña); las contraseñas nunca pasan por tablas del negocio.
- El navegador solo usa la clave pública; los datos los protege **RLS por rol** (`sql/rls_por_rol.sql`), probada con `sql/verificar_rls.sql`.
- Las operaciones sensibles (folio, stock, estado de pago, historial, avisos, envío de notificaciones, validaciones laborales) se ejecutan en la base de datos con triggers, constraints y RPC.
- Datos laborales y expedientes: exclusivos del administrador primario; el bucket `expedientes` es privado y se accede con URLs firmadas.
- Credenciales fuera del repositorio (`.env` y `Credenciales.txt` en `.gitignore`).

Limitaciones conocidas: ver la sección correspondiente de [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md).

---

## 🧪 Pruebas manuales sugeridas

1. **Login/Logout** con cada rol, con credenciales incorrectas y con un usuario inactivo.
2. **Permisos**: menú por rol, insignias "Solo lectura", altas deshabilitadas para el admin secundario.
3. **RLS**: abrir por URL un módulo fuera del menú y comprobar que no trae datos; ejecutar `sql/verificar_rls.sql`.
4. **Órdenes**: crear una orden multiproducto y una venta rápida; comprobar folio, estado de pago y descuento de stock.
5. **Producción**: avanzar un trabajo en un taller y verificar el aviso al siguiente.
6. **Notificaciones**: enviar a un rol completo y ver la lectura en "Enviadas".
7. **Vacaciones**: registrar vacaciones que excedan los días pendientes o se traslapen (deben rechazarse).

---

## 🚧 Próximas mejoras

1. Editar órdenes, cambiar su estado y registrar pagos posteriores, con notificación a los afectados.
2. Mostrar historial, comentarios y archivos de la orden (las tablas ya existen).
3. Edición de materiales y proveedores; entradas y ajustes de inventario con movimientos.
4. Reportes con datos reales y filtro por periodo; exportación PDF/Excel.
5. Pantalla de clientes con datos fiscales y facturación CONTPAQi.
6. Validar el rol también en las rutas.
7. Pruebas automatizadas y CI.

---

**Sistema de Gestión de Uniformes Industriales** — actualizado el 5 de noviembre de 2026
