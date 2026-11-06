# Instrucciones de Uso

Guía práctica para usar el Sistema de Gestión de Inventarios y Producción según tu rol.

---

## 🚀 Inicio Rápido

### 1. Iniciar sesión

1. Abre la aplicación; si no tienes sesión, se muestra la pantalla de **Iniciar Sesión**.
2. Escribe tu **correo electrónico** y tu contraseña y pulsa "Iniciar Sesión".
3. Si el correo o la contraseña son incorrectos verás "Usuario o contraseña incorrectos". Si tu cuenta está inactiva o no tiene perfil, verás el motivo; pide ayuda al administrador primario.

La sesión se mantiene al recargar la página. Para salir: clic en tu nombre (esquina superior derecha) → **Cerrar Sesión**.

> Para pruebas, las cuentas de cada rol están en `Credenciales.txt` (archivo local, no está en el repositorio).

### 2. Guía de bienvenida

La primera vez que entras se abre una **guía personalizada** con tus permisos y tareas. Puedes volver a verla desde el Dashboard con "Ver guía de usuario".

### 3. Partes de la pantalla

- **Menú lateral**: solo muestra los módulos a los que tienes acceso. "Solo lectura" indica que puedes consultar pero no modificar.
- **Barra superior**:
  - **Buscador** (Ctrl+K o ⌘K): busca órdenes, productos, materiales y proveedores. Usa ↑/↓ y Enter para abrir un resultado, Esc para cerrar.
  - **Campana** 🔔: tus notificaciones (el número rojo son las no leídas).
  - **Tu nombre y rol**, con la opción de cerrar sesión.
- **Dashboard**: cambia según tu rol (ver abajo).

---

## 👤 Qué puede hacer cada rol

| Rol | Ve en el menú | Puede modificar |
|---|---|---|
| Administrador primario | Todo | Todo |
| Administrador secundario | Todo excepto Usuarios y Permisos Vacacionales | Nada (solo lectura) |
| Vendedor | Dashboard, Órdenes, Inventario | Sus órdenes y clientes |
| Diseño, Sublimación, Corte, Costura, Bordado | Dashboard y su taller | El avance de su taller |

Detalle completo en [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md).

---

## 📋 Tareas frecuentes

### Vendedor: crear una orden

1. Ve a **Órdenes de Producción** → **Nueva Orden**.
2. Captura el cliente (con teléfono y correo), la fecha de entrega, el método de pago y el anticipo. El anticipo no puede ser mayor que el total.
3. Agrega uno o varios productos. Para cada uno elige el tipo:
   - **Venta directa**: sale del inventario, sin talleres.
   - **Fabricación**: elige los talleres por los que pasa (no tienen que ser todos) y, si lleva bordado, su configuración (lugar, hilos, logotipo).
   - **Comercialización**: indica el proveedor.
4. Agrega notas si hace falta y guarda. El folio (ORD-AAAA-NNNNNN) se asigna solo.

Las órdenes se atienden **por orden de llegada (FIFO)**: la tabla muestra el turno de cada una en la cola. Al hacer clic en una orden se abre su detalle con el avance por taller y los pagos.

### Vendedor: venta rápida de mostrador

1. En **Órdenes** pulsa **Venta Rápida**.
2. Captura el cliente y el método de pago.
3. Agrega productos con existencia (talla y color); la cantidad no puede superar el stock.
4. Completa la venta: se crea una orden ya entregada y liquidada, y el stock se descuenta automáticamente.

### Talleres: avanzar un trabajo

1. Entra a tu taller desde el menú (o revisa tu cola en el Dashboard: indica qué trabajos ya están listos porque terminaron los talleres anteriores).
2. En el tablero, pulsa **Iniciar** para pasar un trabajo de Pendiente a En Proceso.
3. Al terminar pulsa **Completar**. El siguiente taller del flujo recibe un aviso automático; si era la última etapa de la orden, se avisa al vendedor y a los administradores.

### Administrador primario: inventario y proveedores

- **Agregar material**: Inventario → Materiales → "Agregar Material" (tipo, unidad, stock inicial, stock mínimo, precio y proveedor). Los materiales por debajo de su mínimo se marcan en rojo.
- **Productos**: Inventario → Productos → "Nuevo Producto", o clic en un producto para editarlo. Se crea una variante por cada talla × color. Puedes subir una imagen de referencia (PNG, JPG o WEBP, máx. 5 MB) con clic o arrastrándola.
- **Proveedores**: "Agregar Proveedor" para darlo de alta. En cada tarjeta, **Contactar** ofrece llamar, WhatsApp o correo y, si alguno de sus materiales tiene stock bajo, arma un mensaje de **reabastecimiento**; **Ver Historial** muestra sus materiales y movimientos.

### Administrador primario: usuarios

En **Gestión de Usuarios**: "Nuevo Usuario" (nombre, username, correo, contraseña, rol y estado), lápiz para editar, papelera para eliminar. Para quitar el acceso a alguien es preferible marcarlo **inactivo**; un usuario con órdenes o movimientos no se puede eliminar.

### Administrador primario: Permisos Vacacionales

1. Con "Nuevo empleado" da de alta a cada empleado (fecha de ingreso, salario diario, prima vacacional mínima de 25 %, RFC, CURP, NSS).
2. Selecciona un empleado para ver su detalle en pestañas:
   - **Vacaciones**: días que le corresponden por año de servicio, tomados y pendientes. "Registrar vacaciones" calcula los días laborables (lunes a sábado, sin descansos obligatorios) y la prima.
   - **Incidencias**: retardos, faltas, incapacidades, permisos y suspensiones (máx. 8 días). Avisa cuando las faltas configuran causal de rescisión.
   - **Expediente**: documentos (PDF o imagen, máx. 10 MB) y los riesgos ante una demanda si falta alguno.
   - **Terminación**: cálculo de finiquito o liquidación según la causa, para imprimir, guardar y registrar la baja.
3. Los indicadores superiores avisan de vacaciones atrasadas y de quién está de vacaciones hoy.

> Los cálculos son orientativos e importes brutos (sin ISR). Los casos reales deben revisarse con un abogado laboral.

### Todos: notificaciones

- Abre la **campana** para ver tus notificaciones; al abrir una se marca como leída y, si trae enlace, **Ir** te lleva a la pantalla.
- **Nueva**: envía un mensaje a personas concretas o a todo un rol (p. ej. todas las costureras). Puedes adjuntar un enlace a la pantalla actual.
- En **Enviadas** ves quién ya leyó cada mensaje.
- Las notificaciones nuevas llegan al instante, sin recargar.

---

## 🎯 Casos de prueba sugeridos

1. **Control total** (admin primario): crea un usuario vendedor, da de alta un material y un producto con imagen.
2. **Solo lectura** (admin secundario): comprueba las insignias "Solo lectura" y que los botones de alta están deshabilitados; Permisos Vacacionales no aparece.
3. **Vendedor**: crea una orden de fabricación con dos talleres; verifica que solo ves tus órdenes.
4. **Taller**: con el primer taller de esa orden pulsa Iniciar y Completar; entra con el usuario del siguiente taller y comprueba que recibió el aviso.
5. **Seguridad**: con un rol de taller escribe `/reportes` en la URL; la página abre, pero sin datos del negocio (la base de datos no se los entrega).

---

## ⚠️ Limitaciones actuales

- Una orden ya creada no se puede editar (productos, estado general o pagos adicionales).
- Los materiales y proveedores solo se dan de alta; todavía no se editan desde la app.
- En **Reportes**, salvo el resumen de inventario, las gráficas e indicadores usan datos de ejemplo y el selector de periodo no filtra.
- En **Proveedores**, el indicador "Órdenes de Compra" es un valor fijo.
- En el Taller de Diseño, los botones Aprobar/Rechazar todavía no guardan nada; usa Iniciar/Completar.

---

## 💡 Para desarrolladores

Ver [README.md](README.md) (instalación), [ROLES_Y_PERMISOS.md](ROLES_Y_PERMISOS.md) (permisos y RLS) y [ARQUITECTURA_ERP.md](ARQUITECTURA_ERP.md) (estado de cada módulo).

---

**Sistema de Gestión de Inventarios y Producción** — actualizado el 5 de noviembre de 2026
