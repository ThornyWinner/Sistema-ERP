export interface Material {
  id: string;
  nombre: string;
  tipo: "tela" | "hilo" | "accesorio";
  stock: number;
  unidad: "metros" | "piezas" | "kg";
  stockMinimo: number;
  proveedor: string;
  precio: number;
}

export interface VarianteProducto {
  id: string;
  talla: string;
  color: string;
  stock: number;
  precio: number;
  sku: string | null;
}

export interface Producto {
  id: string;
  nombre: string;
  tipo: "camisa" | "pantalon" | "overol" | "chaleco";
  tallas: string[];
  colores: string[];
  stock: number;
  precio: number;
  categoria: string;
  imagen?: string;
  /** Variantes reales (talla+color) del catálogo, con su propio stock,
   * precio y SKU. Necesarias para vender/descontar la variante correcta. */
  variantes: VarianteProducto[];
}

export type TallerEstado = "pending" | "in-progress" | "completed";
export type Taller = "diseno" | "sublimacion" | "corte" | "costura" | "bordado";
export type TipoVenta = "directa" | "fabricacion" | "comercializacion" | "mixta";
export type MetodoPago = "efectivo" | "transferencia" | "tarjeta" | "cheque" | "credito";
export type EstadoPago = "pendiente" | "anticipo" | "liquidado" | "cancelado" | "vencido";

export interface OrdenBordadoDetalle {
  lugarBordar: "bolsillo" | "personalizado" | "espalda";
  logotipo?: string;
  coloresHilo: string[];
  notasAdicionales?: string;
}

export interface PersonalizacionProducto {
  lugarBordado?: "bolsillo" | "espalda" | "frente" | "personalizado";
  logotipo?: string;
  coloresHilo?: string[];
  notas?: string;
}

export interface ProductoOrden {
  id: string;
  nombre: string;
  tipoPrenda: string;
  marca?: string;
  talla: string;
  color: string;
  cantidad: number;
  precioUnitario: number;
  tipoProduccion: "directa" | "fabricacion" | "comercializacion";
  talleres: Taller[];
  progreso: Partial<Record<Taller, TallerEstado>>;
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

export interface Pago {
  fecha: string;
  monto: number;
  metodo: MetodoPago;
  referencia?: string;
}

export interface Orden {
  id: string;
  numero: string;
  vendedor: string;
  vendedorId: string;
  cliente: string;
  fechaCreacion: string;
  fechaEntrega: string;
  tipoVenta: TipoVenta;
  productos: ProductoOrden[];
  estado: "pending" | "in-progress" | "completed";
  prioridad: "alta" | "media" | "baja";
  metodoPago: MetodoPago;
  estadoPago: EstadoPago;
  total: number;
  anticipo: number;
  pagos: Pago[];
  notas?: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  contacto: string;
  telefono: string;
  email: string;
  insumos: string[];
  calificacion: number;
}

export const mockMateriales: Material[] = [
  {
    id: "1",
    nombre: "Tela Gabardina Azul Marino",
    tipo: "tela",
    stock: 150,
    unidad: "metros",
    stockMinimo: 50,
    proveedor: "Textiles del Norte",
    precio: 85,
  },
  {
    id: "2",
    nombre: "Tela Drill Gris",
    tipo: "tela",
    stock: 25,
    unidad: "metros",
    stockMinimo: 40,
    proveedor: "Telas Industriales SA",
    precio: 75,
  },
  {
    id: "3",
    nombre: "Hilo Poliéster Negro",
    tipo: "hilo",
    stock: 500,
    unidad: "piezas",
    stockMinimo: 100,
    proveedor: "Mercería Central",
    precio: 12,
  },
  {
    id: "4",
    nombre: "Hilo Poliéster Blanco",
    tipo: "hilo",
    stock: 450,
    unidad: "piezas",
    stockMinimo: 100,
    proveedor: "Mercería Central",
    precio: 12,
  },
  {
    id: "5",
    nombre: "Cierre Metálico 20cm",
    tipo: "accesorio",
    stock: 1200,
    unidad: "piezas",
    stockMinimo: 300,
    proveedor: "Accesorios Industriales",
    precio: 3.5,
  },
  {
    id: "6",
    nombre: "Botones Metálicos Grande",
    tipo: "accesorio",
    stock: 180,
    unidad: "piezas",
    stockMinimo: 500,
    proveedor: "Accesorios Industriales",
    precio: 0.8,
  },
  {
    id: "7",
    nombre: "Tela Oxford Verde",
    tipo: "tela",
    stock: 200,
    unidad: "metros",
    stockMinimo: 60,
    proveedor: "Textiles del Norte",
    precio: 95,
  },
  {
    id: "8",
    nombre: "Elástico 3cm",
    tipo: "accesorio",
    stock: 80,
    unidad: "metros",
    stockMinimo: 50,
    proveedor: "Mercería Central",
    precio: 8,
  },
];

export const mockProductos: Producto[] = [
  {
    id: "1",
    nombre: "Camisa Industrial Manga Larga",
    tipo: "camisa",
    tallas: ["S", "M", "L", "XL", "XXL"],
    colores: ["Azul Marino", "Gris", "Negro"],
    stock: 45,
    precio: 380,
    categoria: "Industrial",
    variantes: [],
  },
  {
    id: "2",
    nombre: "Pantalón Cargo Reforzado",
    tipo: "pantalon",
    tallas: ["28", "30", "32", "34", "36", "38"],
    colores: ["Azul Marino", "Khaki", "Negro"],
    stock: 32,
    precio: 420,
    categoria: "Industrial",
    variantes: [],
  },
  {
    id: "3",
    nombre: "Overol Completo",
    tipo: "overol",
    tallas: ["S", "M", "L", "XL", "XXL"],
    colores: ["Azul Rey", "Verde", "Gris"],
    stock: 18,
    precio: 650,
    categoria: "Seguridad",
    variantes: [],
  },
  {
    id: "4",
    nombre: "Chaleco Reflectivo",
    tipo: "chaleco",
    tallas: ["Único"],
    colores: ["Naranja", "Amarillo"],
    stock: 75,
    precio: 180,
    categoria: "Seguridad",
    variantes: [],
  },
  {
    id: "5",
    nombre: "Camisa Ejecutiva",
    tipo: "camisa",
    tallas: ["S", "M", "L", "XL"],
    colores: ["Blanco", "Celeste"],
    stock: 28,
    precio: 320,
    categoria: "Corporativo",
    variantes: [],
  },
];

export const mockOrdenes: Orden[] = [
  {
    id: "1",
    numero: "ORD-2026-001",
    vendedor: "Karla Flores",
    vendedorId: "3",
    cliente: "Constructora ABC",
    fechaCreacion: "2026-04-10",
    fechaEntrega: "2026-04-20",
    tipoVenta: "fabricacion",
    productos: [
      {
        id: "p1",
        nombre: "Overol Completo",
        tipoPrenda: "overol",
        marca: "Dickies",
        talla: "L",
        color: "Azul Rey",
        cantidad: 50,
        precioUnitario: 650,
        tipoProduccion: "fabricacion",
        talleres: ["diseno", "sublimacion", "corte", "costura", "bordado"],
        progreso: {
          diseno: "completed",
          sublimacion: "completed",
          corte: "in-progress",
          costura: "pending",
          bordado: "pending",
        },
        personalizacion: {
          lugarBordado: "bolsillo",
          logotipo: "logo-constructora.png",
          coloresHilo: ["Azul Marino", "Blanco"],
          notas: "Logo en pecho izquierdo y nombre en espalda",
        },
      },
    ],
    estado: "in-progress",
    prioridad: "alta",
    metodoPago: "transferencia",
    estadoPago: "anticipo",
    total: 32500,
    anticipo: 16000,
    pagos: [
      {
        fecha: "2026-04-10",
        monto: 16000,
        metodo: "transferencia",
        referencia: "TRF-001234",
      },
    ],
  },
  {
    id: "2",
    numero: "ORD-2026-002",
    vendedor: "Fernanda Vanegas",
    vendedorId: "3",
    cliente: "Minera XYZ",
    fechaCreacion: "2026-04-11",
    fechaEntrega: "2026-04-25",
    tipoVenta: "mixta",
    productos: [
      {
        id: "p2a",
        nombre: "Camisa Industrial",
        tipoPrenda: "camisa",
        marca: "RedKap",
        talla: "M",
        color: "Gris Oxford",
        cantidad: 100,
        precioUnitario: 380,
        tipoProduccion: "fabricacion",
        talleres: ["diseno", "sublimacion", "corte", "costura"],
        progreso: {
          diseno: "completed",
          sublimacion: "in-progress",
          corte: "pending",
          costura: "pending",
        },
      },
      {
        id: "p2b",
        nombre: "Pantalón Cargo",
        tipoPrenda: "pantalon",
        marca: "RedKap",
        talla: "32",
        color: "Gris Oxford",
        cantidad: 100,
        precioUnitario: 420,
        tipoProduccion: "fabricacion",
        talleres: ["corte", "costura"],
        progreso: {
          corte: "pending",
          costura: "pending",
        },
      },
    ],
    estado: "in-progress",
    prioridad: "alta",
    metodoPago: "transferencia",
    estadoPago: "anticipo",
    total: 80000,
    anticipo: 40000,
    pagos: [
      {
        fecha: "2026-04-11",
        monto: 40000,
        metodo: "transferencia",
        referencia: "TRF-001235",
      },
    ],
  },
  {
    id: "3",
    numero: "ORD-2026-003",
    vendedor: "Miguel Salas",
    vendedorId: "3",
    cliente: "Empresa Logística DEF",
    fechaCreacion: "2026-04-12",
    fechaEntrega: "2026-04-18",
    tipoVenta: "directa",
    productos: [
      {
        id: "p3",
        nombre: "Chaleco Reflectivo",
        tipoPrenda: "chaleco",
        talla: "Unitalla",
        color: "Amarillo Neón",
        cantidad: 200,
        precioUnitario: 180,
        tipoProduccion: "directa",
        talleres: [],
        progreso: {},
      },
    ],
    estado: "completed",
    prioridad: "alta",
    metodoPago: "efectivo",
    estadoPago: "liquidado",
    total: 36000,
    anticipo: 36000,
    pagos: [
      {
        fecha: "2026-04-12",
        monto: 36000,
        metodo: "efectivo",
      },
    ],
  },
  {
    id: "4",
    numero: "ORD-2026-004",
    vendedor: "Miguel Salas",
    vendedorId: "3",
    cliente: "Hotel Grand Plaza",
    fechaCreacion: "2026-04-13",
    fechaEntrega: "2026-04-28",
    tipoVenta: "fabricacion",
    productos: [
      {
        id: "p4",
        nombre: "Camisa Ejecutiva",
        tipoPrenda: "camisa",
        marca: "Van Heusen",
        talla: "XL",
        color: "Blanco",
        cantidad: 30,
        precioUnitario: 320,
        tipoProduccion: "fabricacion",
        talleres: ["diseno", "corte", "costura", "bordado"],
        progreso: {
          diseno: "in-progress",
          corte: "pending",
          costura: "pending",
          bordado: "pending",
        },
        personalizacion: {
          lugarBordado: "bolsillo",
          logotipo: "logo-hotel.png",
          coloresHilo: ["Dorado", "Negro"],
          notas: "Nombre del hotel en cursiva",
        },
      },
    ],
    estado: "pending",
    prioridad: "media",
    metodoPago: "transferencia",
    estadoPago: "pendiente",
    total: 9600,
    anticipo: 0,
    pagos: [],
  },
  {
    id: "5",
    numero: "ORD-2026-005",
    vendedor: "Miguel Salas",
    vendedorId: "3",
    cliente: "Fábrica GHI",
    fechaCreacion: "2026-04-09",
    fechaEntrega: "2026-04-22",
    tipoVenta: "fabricacion",
    productos: [
      {
        id: "p5",
        nombre: "Pantalón Cargo",
        tipoPrenda: "pantalon",
        marca: "Carhartt",
        talla: "32",
        color: "Khaki",
        cantidad: 75,
        precioUnitario: 420,
        tipoProduccion: "fabricacion",
        talleres: ["corte", "costura", "bordado"],
        progreso: {
          corte: "completed",
          costura: "completed",
          bordado: "in-progress",
        },
        personalizacion: {
          lugarBordado: "personalizado",
          logotipo: "logo-fabrica.png",
          coloresHilo: ["Verde", "Negro"],
          notas: "Bordado lateral derecho",
        },
      },
    ],
    estado: "in-progress",
    prioridad: "media",
    metodoPago: "tarjeta",
    estadoPago: "anticipo",
    total: 31500,
    anticipo: 15000,
    pagos: [
      {
        fecha: "2026-04-09",
        monto: 15000,
        metodo: "tarjeta",
        referencia: "CARD-8765",
      },
    ],
  },
];

export const mockProveedores: Proveedor[] = [
  {
    id: "1",
    nombre: "Textiles del Norte",
    contacto: "Juan Pérez",
    telefono: "+52 81 1234 5678",
    email: "ventas@texnorte.com",
    insumos: ["Tela Gabardina", "Tela Oxford", "Tela Drill"],
    calificacion: 4.5,
  },
  {
    id: "2",
    nombre: "Telas Industriales SA",
    contacto: "María González",
    telefono: "+52 33 8765 4321",
    email: "contacto@telasindustriales.com",
    insumos: ["Tela Drill", "Tela Canvas", "Tela Mezclilla"],
    calificacion: 4.2,
  },
  {
    id: "3",
    nombre: "Mercería Central",
    contacto: "Carlos Ramírez",
    telefono: "+52 55 9876 5432",
    email: "pedidos@merceriacentral.com",
    insumos: ["Hilos", "Elásticos", "Botones"],
    calificacion: 4.8,
  },
  {
    id: "4",
    nombre: "Accesorios Industriales",
    contacto: "Ana López",
    telefono: "+52 81 5555 1234",
    email: "info@accind.com",
    insumos: ["Cierres", "Botones Metálicos", "Hebillas", "Remaches"],
    calificacion: 4.6,
  },
];
