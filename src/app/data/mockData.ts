/**
 * mockData.ts — Modelo de datos del ERP (tipos TypeScript).
 *
 * Interfaces y tipos (Material, Producto, Orden, Proveedor...) que usa toda la UI.
 * ErpDataContext convierte las filas de Supabase a estos tipos.
 */

/** Materia prima del inventario (telas, hilos, accesorios). */
export interface Material {
  id: string;
  nombre: string;
  tipo: "tela" | "hilo" | "accesorio";
  /** Existencia actual, expresada en `unidad`. */
  stock: number;
  unidad: "metros" | "piezas" | "kg";
  /** Umbral de alerta: si stock < stockMinimo se considera "stock bajo". */
  stockMinimo: number;
  /** Nombre del proveedor principal. */
  proveedor: string;
  /** Id del proveedor principal (undefined si no tiene). */
  proveedorId?: string;
  /** Precio por unidad. */
  precio: number;
}

/** Combinación concreta de talla + color de un producto, con su propio stock y precio. */
export interface VarianteProducto {
  id: string;
  talla: string;
  color: string;
  stock: number;
  precio: number;
  sku: string | null;
}

/** Producto terminado del catálogo (prenda). */
export interface Producto {
  id: string;
  nombre: string;
  /** "otro": artículos que no son prenda (EPP, servicios, promocionales…), p. ej. los del catálogo de CONTPAQi. */
  tipo: "camisa" | "pantalon" | "overol" | "chaleco" | "otro";
  /** Tallas y colores disponibles (derivados de las variantes). */
  tallas: string[];
  colores: string[];
  /** Stock total = suma del stock de todas las variantes. */
  stock: number;
  /** Precio de referencia (el de la primera variante). */
  precio: number;
  categoria: string;
  imagen?: string;
  /** Variantes reales (talla+color) del catálogo, con su propio stock,
   * precio y SKU. Necesarias para vender/descontar la variante correcta. */
  variantes: VarianteProducto[];
}

/** Estado de un producto dentro de un taller: pendiente, en proceso o completado. */
export type TallerEstado = "pending" | "in-progress" | "completed";
/** Talleres del flujo de producción (el nombre coincide con la tabla `talleres`). */
export type Taller = "diseno" | "sublimacion" | "corte" | "costura" | "bordado";
/**
 * Tipo de venta de una orden:
 *  - directa:          venta rápida de producto en existencia.
 *  - fabricacion:      se fabrica en los talleres propios.
 *  - comercializacion: se compra a un proveedor y se revende.
 *  - mixta:            combina varios de los anteriores.
 */
export type TipoVenta = "directa" | "fabricacion" | "comercializacion" | "mixta";
export type MetodoPago = "efectivo" | "transferencia" | "tarjeta" | "cheque" | "credito";
/** Situación de cobro de la orden ("liquidado" = pagada por completo). */
export type EstadoPago = "pendiente" | "anticipo" | "liquidado" | "cancelado" | "vencido";

/** Personalización de una prenda: dónde bordar, logotipo y colores de hilo. */
export interface PersonalizacionProducto {
  lugarBordado?: "bolsillo" | "espalda" | "frente" | "personalizado";
  logotipo?: string;
  coloresHilo?: string[];
  notas?: string;
}

/** Renglón (producto) dentro de una orden; corresponde a la tabla `orden_detalles`. */
export interface ProductoOrden {
  id: string;
  nombre: string;
  tipoPrenda: string;
  marca?: string;
  talla: string;
  color: string;
  cantidad: number;
  precioUnitario: number;
  /** Cómo se surte este producto (ver TipoVenta). */
  tipoProduccion: "directa" | "fabricacion" | "comercializacion";
  /** Talleres por los que debe pasar, en orden. Vacío si no requiere fabricación. */
  talleres: Taller[];
  /** Estado del producto en cada uno de sus talleres. */
  progreso: Partial<Record<Taller, TallerEstado>>;
  /** Proveedor, cuando el producto es de comercialización. */
  proveedorId?: string;
  proveedorNombre?: string;
  personalizacion?: PersonalizacionProducto;
  notas?: string;
  /** Presentes cuando el renglón corresponde a un producto/variante ya
   * existente en el catálogo (p. ej. Venta Rápida). Si se omiten, se
   * intenta resolver por nombre+talla+color; si no hay coincidencia,
   * el renglón se guarda como fabricación a la medida (sin referencia
   * de inventario todavía). */
  productoId?: string;
  varianteId?: string;
}

/** Pago o abono registrado para una orden. */
export interface Pago {
  fecha: string;
  monto: number;
  metodo: MetodoPago;
  referencia?: string;
}

/** Orden de venta/producción (tabla `ordenes`) con sus productos y pagos. */
export interface Orden {
  id: string;
  /** Folio visible de la orden (p. ej. "ORD-2026-001"). */
  numero: string;
  /** Nombre e id (tabla `usuarios`) del vendedor que la registró. */
  vendedor: string;
  vendedorId: string;
  /** Razón social del cliente. */
  cliente: string;
  /** Teléfono y correo de contacto del cliente (tabla `clientes`). */
  clienteTelefono?: string;
  clienteEmail?: string;
  /** Fechas en formato ISO "AAAA-MM-DD". */
  fechaCreacion: string;
  fechaEntrega: string;
  tipoVenta: TipoVenta;
  productos: ProductoOrden[];
  /** Estado general simplificado (se deriva del estado detallado en la BD). */
  estado: "pending" | "in-progress" | "completed";
  metodoPago: MetodoPago;
  estadoPago: EstadoPago;
  /** Importe total a cobrar (subtotal − descuento + IVA) y monto adelantado por el cliente. */
  total: number;
  anticipo: number;
  /** Suma de las partidas (cantidad × precio) y descuento; total = subtotal − descuento. */
  subtotal?: number;
  descuento?: number;
  /** IVA trasladado (16 %): los precios de las partidas son antes de IVA. */
  iva?: number;
  /** Nombre del estado detallado en la BD (p. ej. "En Corte", "Entregada", "Cancelada"). */
  estadoNombre?: string;
  /** Historial de pagos registrados. */
  pagos: Pago[];
  notas?: string;
}

/** Proveedor de materiales o productos. */
export interface Proveedor {
  id: string;
  nombre: string;
  /** Persona de contacto. */
  contacto: string;
  telefono: string;
  email: string;
  /** Nombres de los materiales que suministra. */
  insumos: string[];
  /** Calificación de 0 a 5. */
  calificacion: number;
}
