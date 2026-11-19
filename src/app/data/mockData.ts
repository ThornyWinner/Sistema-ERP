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
/** Cortes y mangas posibles de una variante (checks chk_variante_corte / chk_variante_manga). */
export const CORTES = ["Caballero", "Dama", "Unisex", "Juvenil", "Niño", "Bebé"] as const;
export const MANGAS = ["Corta", "Larga", "3/4", "Sin mangas"] as const;

/** Variante = corte × manga × talla × color. Corte y manga vacíos ("") = no aplica. */
export interface VarianteProducto {
  id: string;
  corte: string;
  manga: string;
  talla: string;
  color: string;
  stock: number;
  precio: number;
  sku: string | null;
  /** Clave del modelo en el catálogo del proveedor (HELI_DCP, C0300…). */
  modelo?: string;
}

/** «Dama · Manga larga · M · Blanco»: descripción corta de una variante. */
export function describirVariante(v: { corte?: string | null; manga?: string | null; talla?: string | null; color?: string | null }): string {
  const manga = v.manga ? (v.manga === "Sin mangas" ? "Sin mangas" : `Manga ${v.manga.toLowerCase()}`) : "";
  return [v.corte, manga, v.talla && `Talla ${v.talla}`, v.color].filter(Boolean).join(" · ") || "Única";
}

/**
 * Tipos de prenda (productos.tipo_prenda). "otro": artículos que no son prenda (EPP,
 * servicios, promocionales…), p. ej. los del catálogo de CONTPAQi.
 */
export const TIPOS_PRENDA = [
  { valor: "camisa", etiqueta: "Camisa / blusa", plural: "Camisas y blusas" },
  { valor: "playera", etiqueta: "Playera / polo", plural: "Playeras y polos" },
  { valor: "pantalon", etiqueta: "Pantalón / falda", plural: "Pantalones y faldas" },
  { valor: "overol", etiqueta: "Overol", plural: "Overoles" },
  { valor: "chaleco", etiqueta: "Chaleco", plural: "Chalecos" },
  { valor: "sudadera", etiqueta: "Sudadera", plural: "Sudaderas" },
  { valor: "chamarra", etiqueta: "Chamarra / softshell", plural: "Chamarras y softshell" },
  { valor: "uniforme", etiqueta: "Uniforme / conjunto", plural: "Uniformes y conjuntos" },
  { valor: "bata", etiqueta: "Bata", plural: "Batas" },
  { valor: "accesorio", etiqueta: "Accesorio", plural: "Accesorios" },
  { valor: "otro", etiqueta: "Otro (no prenda)", plural: "Otros artículos" },
] as const;
export type TipoPrenda = (typeof TIPOS_PRENDA)[number]["valor"];
export const etiquetaTipoPrenda = (tipo: string) => TIPOS_PRENDA.find((t) => t.valor === tipo)?.etiqueta ?? tipo;

/** Producto terminado del catálogo (prenda). */
export interface Producto {
  id: string;
  nombre: string;
  tipo: TipoPrenda;
  /** Cortes, mangas, tallas y colores disponibles (derivados de las variantes). */
  cortes: string[];
  mangas: string[];
  tallas: string[];
  colores: string[];
  /** Ficha técnica: composición de la tela, qué incluye y notas. */
  composicion?: string;
  incluye?: string;
  notas?: string;
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
  /** Corte y manga de la variante (solo lectura; vienen del catálogo). */
  corte?: string;
  manga?: string;
  talla: string;
  color: string;
  /** Piezas vigentes (las pedidas menos las devueltas; sql/devoluciones.sql). */
  cantidad: number;
  /** Solo si hubo devoluciones: piezas pedidas originalmente y cuántas regresaron. */
  cantidadPedida?: number;
  cantidadDevuelta?: number;
  precioUnitario: number;
  /** Cómo se surte este producto (ver TipoVenta). */
  tipoProduccion: "directa" | "fabricacion" | "comercializacion";
  /** Talleres por los que debe pasar, en orden. Vacío si no requiere fabricación. */
  talleres: Taller[];
  /** Estado del producto en cada uno de sus talleres. */
  progreso: Partial<Record<Taller, TallerEstado>>;
  /** Cuándo empezó y terminó cada taller (ISO), para saber desde cuándo va en él. */
  fechasTaller?: Partial<Record<Taller, { inicio?: string; fin?: string }>>;
  /** Proveedor, cuando el producto es de comercialización. */
  proveedorId?: string;
  proveedorNombre?: string;
  personalizacion?: PersonalizacionProducto;
  notas?: string;
  /** Presentes cuando el renglón corresponde a un producto/variante ya
   * existente en el catálogo. Solo la venta directa lleva variante (y
   * descuenta stock); en fabricación / comercialización el producto se
   * liga por nombre, sin variante. */
  productoId?: string;
  varianteId?: string;
}

/** Pago o abono registrado para una orden. */
export interface Pago {
  fecha: string;
  monto: number;
  metodo: MetodoPago;
  referencia?: string;
  /** Reembolso por una devolución: el monto viene en negativo. */
  reembolso?: boolean;
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
  /** Id del cliente en el catálogo (tabla `clientes`). */
  clienteId?: string;
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
