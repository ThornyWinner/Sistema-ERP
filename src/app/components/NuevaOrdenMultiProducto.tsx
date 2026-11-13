/**
 * NuevaOrdenMultiProducto.tsx — Formulario modal para crear una orden de producción
 * con uno o varios productos (lo usa la página Órdenes).
 *
 * Secciones:
 *  1. Información general: cliente, teléfono y correo de contacto, fecha de entrega, método de pago y anticipo.
 *     (Las órdenes se atienden por orden de llegada — FIFO —, por lo que no se captura prioridad.)
 *  2. Productos: lista de tarjetas plegables; cada producto tiene su tipo de producción
 *     (venta directa / fabricación / comercialización), prenda, talla, color, marca,
 *     cantidad, precio, proveedor (si es comercialización), talleres del flujo (si no es
 *     venta directa) y configuración de bordado (si el flujo incluye bordado).
 *  3. Notas generales de la orden.
 *
 * El tipo de venta de la orden se calcula solo a partir de los tipos de producción de
 * sus productos (si hay mezcla de tipos → "mixta"). Al enviar, el formulario arma el
 * objeto orden y lo entrega al padre con `onSubmit`, que es quien lo guarda.
 */
import { useState } from "react";
import { toast } from "sonner";
import type { Taller, TipoVenta, MetodoPago, Producto, VarianteProducto } from "../data/mockData";
import { useErpData } from "../context/ErpDataContext";
import { useAuth } from "../context/AuthContext";
import { hoyISO } from "../lib/fechas";
import { calcularImportes } from "../lib/impuestos";
import DesgloseImportes from "./DesgloseImportes";
import {
  X,
  User,
  Package,
  Calendar,
  DollarSign,
  CreditCard,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Building2,
  Shirt,
  FileText,
  Phone,
  Mail,
  Search,
  Boxes,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./Card";

interface NuevaOrdenMultiProductoProps {
  isOpen: boolean;
  onClose: () => void;
  /** Recibe la orden construida (el folio definitivo lo asigna la base de datos). */
  onSubmit: (orden: any) => void;
}

// Talleres en el orden real del flujo de producción.
const todosLosTalleres: Taller[] = [
  "diseno",
  "sublimacion",
  "corte",
  "costura",
  "bordado",
];

// Nombres legibles de cada taller.
const tallerLabels: Record<Taller, string> = {
  diseno: "Diseño",
  sublimacion: "Sublimación",
  corte: "Corte",
  costura: "Costura",
  bordado: "Bordado",
};

/**
 * Producto tal como se captura en el formulario. Los campos bordado* se guardan planos
 * y al enviar se convierten en el objeto `personalizacion`. En venta directa,
 * productoId/varianteId apuntan a la variante de inventario elegida: con ella la BD
 * descuenta el stock (trigger trg_inventario_salida).
 */
type ProductoCaptura = {
  nombre: string;
  tipoPrenda: string;
  marca: string;
  talla: string;
  color: string;
  cantidad: number;
  precioUnitario: number;
  tipoProduccion: "directa" | "fabricacion" | "comercializacion";
  talleres: Taller[];
  proveedorId?: string;
  productoId?: string;
  varianteId?: string;
  requiereBordado: boolean;
  bordadoUbicacion: "frente" | "espalda" | "bolsillo" | "personalizado";
  bordadoColores: string;
  bordadoNotas: string;
};

const productoVacio = (): ProductoCaptura => ({
  nombre: "",
  tipoPrenda: "camisa",
  marca: "",
  talla: "",
  color: "",
  cantidad: 1,
  precioUnitario: 0,
  tipoProduccion: "fabricacion",
  talleres: ["corte", "costura"],
  requiereBordado: false,
  bordadoUbicacion: "bolsillo",
  bordadoColores: "",
  bordadoNotas: "",
});

export default function NuevaOrdenMultiProducto({
  isOpen,
  onClose,
  onSubmit,
}: NuevaOrdenMultiProductoProps) {
  // Proveedores reales de Supabase (se conserva el alias mockProveedores del prototipo).
  // `catalogo`: productos del inventario con sus variantes y stock (para venta directa).
  const { proveedores: mockProveedores, productos: catalogo } = useErpData();
  const { user } = useAuth();
  // Datos generales de la orden.
  const [formData, setFormData] = useState({
    cliente: "",
    clienteTelefono: "",
    clienteEmail: "",
    fechaEntrega: "",
    tipoVenta: "fabricacion" as TipoVenta,
    metodoPago: "transferencia" as MetodoPago,
    anticipo: 0,
    notas: "",
  });

  // Lista de productos capturados; empieza con un producto vacío.
  const [productos, setProductos] = useState<ProductoCaptura[]>(() => [productoVacio()]);

  // Índices de los productos cuya tarjeta está desplegada (el primero empieza abierto).
  const [productosExpandidos, setProductosExpandidos] = useState<Set<number>>(
    new Set([0])
  );

  if (!isOpen) return null;

  // Añade un producto vacío al final y lo deja desplegado para capturarlo.
  const agregarProducto = () => {
    setProductos([...productos, productoVacio()]);
    setProductosExpandidos(new Set([...productosExpandidos, productos.length]));
  };

  /**
   * Elimina un producto (siempre debe quedar al menos uno).
   * Nota: los índices desplegados posteriores no se recalculan tras borrar.
   */
  const eliminarProducto = (index: number) => {
    if (productos.length === 1) {
      alert("Debe haber al menos un producto");
      return;
    }
    setProductos(productos.filter((_, i) => i !== index));
    const nuevosExpandidos = new Set(productosExpandidos);
    nuevosExpandidos.delete(index);
    setProductosExpandidos(nuevosExpandidos);
  };

  /**
   * Actualiza un campo de un producto y recalcula el tipo de venta de la orden:
   *  - varios tipos de producción distintos → "mixta"
   *  - un único tipo → ese mismo tipo.
   */
  const actualizarProducto = (index: number, campo: string, valor: any) =>
    actualizarCampos(index, { [campo]: valor });

  /** Igual que actualizarProducto, pero cambia varios campos de una vez (sin mutar el estado). */
  const actualizarCampos = (index: number, cambios: Partial<ProductoCaptura>) => {
    const nuevosProductos = productos.map((p, i) => (i === index ? { ...p, ...cambios } : p));

    // Auto-detectar tipo de venta basado en tipoProduccion
    const tipos = nuevosProductos.map((p) => p.tipoProduccion);
    const tiposUnicos = new Set(tipos);

    let nuevoTipoVenta: TipoVenta = "fabricacion";
    if (tiposUnicos.size > 1) {
      nuevoTipoVenta = "mixta";
    } else if (tiposUnicos.has("directa")) {
      nuevoTipoVenta = "directa";
    } else if (tiposUnicos.has("comercializacion")) {
      nuevoTipoVenta = "comercializacion";
    } else if (tiposUnicos.has("fabricacion")) {
      nuevoTipoVenta = "fabricacion";
    }

    setFormData({ ...formData, tipoVenta: nuevoTipoVenta });
    setProductos(nuevosProductos);
  };

  /**
   * Cambia el tipo de producción. Al salir de venta directa se suelta la variante de
   * inventario elegida (los demás tipos se capturan a mano y no descuentan stock).
   */
  const cambiarTipoProduccion = (index: number, tipo: ProductoCaptura["tipoProduccion"]) => {
    const cambios: Partial<ProductoCaptura> = { tipoProduccion: tipo };
    if (tipo !== "directa") Object.assign(cambios, { productoId: undefined, varianteId: undefined });
    actualizarCampos(index, cambios);
  };

  /**
   * Piezas de una variante que aún quedan para el producto `index`: su stock menos lo
   * que ya apartaron otros productos de esta misma orden con la misma variante.
   */
  const disponibleVariante = (varianteId: string, index: number) => {
    const variante = catalogo.flatMap((p) => p.variantes).find((v) => v.id === varianteId);
    if (!variante) return 0;
    const apartado = productos.reduce(
      (s, p, i) => (i !== index && p.varianteId === varianteId ? s + (p.cantidad || 0) : s),
      0
    );
    return Math.max(variante.stock - apartado, 0);
  };

  // Llena el producto con los datos de la variante de inventario elegida.
  const elegirVariante = (index: number, producto: Producto, variante: VarianteProducto) => {
    const disponible = disponibleVariante(variante.id, index);
    actualizarCampos(index, {
      productoId: producto.id,
      varianteId: variante.id,
      nombre: producto.nombre,
      tipoPrenda: producto.tipo,
      talla: variante.talla,
      color: variante.color,
      precioUnitario: variante.precio || producto.precio,
      cantidad: Math.min(Math.max(productos[index].cantidad || 1, 1), disponible),
    });
  };

  // Activa/desactiva un taller en un producto, manteniendo el orden oficial del flujo.
  const toggleTaller = (indexProducto: number, taller: Taller) => {
    const producto = productos[indexProducto];
    const talleres = producto.talleres.includes(taller)
      ? producto.talleres.filter((t) => t !== taller)
      : [...producto.talleres, taller].sort(
          (a, b) => todosLosTalleres.indexOf(a) - todosLosTalleres.indexOf(b)
        );
    actualizarProducto(indexProducto, "talleres", talleres);
  };

  // Despliega o pliega la tarjeta de un producto.
  const toggleExpandido = (index: number) => {
    const nuevosExpandidos = new Set(productosExpandidos);
    if (nuevosExpandidos.has(index)) {
      nuevosExpandidos.delete(index);
    } else {
      nuevosExpandidos.add(index);
    }
    setProductosExpandidos(nuevosExpandidos);
  };

  // Importes de la orden: los precios son antes de IVA, así que el total a cobrar es
  // subtotal + IVA 16 % (mismo cálculo que la BD y que la factura).
  const calcularImportesOrden = () =>
    calcularImportes(productos.map((p) => ({ cantidad: p.cantidad, precioUnitario: p.precioUnitario })));
  const calcularTotal = () => calcularImportesOrden().total;
  const totalOrden = calcularTotal();
  // Un anticipo mayor al total dejaría el saldo pendiente en negativo.
  const anticipoExcedido = formData.anticipo > totalOrden;

  /**
   * Construye el objeto orden y lo envía al padre. Reglas:
   *  - Venta directa nace como "completed"; el resto como "pending".
   *  - Estado de pago según el anticipo: ≥ total → liquidado; > 0 → anticipo; 0 → pendiente.
   *  - Si hay anticipo se registra como primer pago (con concepto y porcentaje).
   *  - Cada producto arranca con progreso "pending" en todos sus talleres.
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const total = calcularTotal();
    const anticipo = formData.anticipo;

    // El anticipo no puede superar el total: si el cliente entrega más dinero, solo se
    // registra el total y el excedente se le devuelve como cambio.
    if (anticipo > total) {
      toast.error(
        `El anticipo ($${anticipo.toLocaleString()}) no puede ser mayor al total de la orden ($${total.toLocaleString()})`
      );
      return;
    }

    // Venta directa: cada producto debe salir del inventario y no exceder lo disponible.
    for (const [i, p] of productos.entries()) {
      if (p.tipoProduccion !== "directa") continue;
      if (!p.varianteId) {
        toast.error(`Producto ${i + 1}: selecciona del inventario el producto en stock a vender`);
        setProductosExpandidos(new Set([...productosExpandidos, i]));
        return;
      }
      const disponible = disponibleVariante(p.varianteId, i);
      if (p.cantidad > disponible) {
        toast.error(`Producto ${i + 1} (${p.nombre}): solo hay ${disponible} pieza(s) disponibles`);
        setProductosExpandidos(new Set([...productosExpandidos, i]));
        return;
      }
    }

    const nuevaOrden = {
      vendedor: user?.nombre || "Usuario",
      vendedorId: user?.id || "0",
      cliente: formData.cliente,
      clienteTelefono: formData.clienteTelefono.trim(),
      clienteEmail: formData.clienteEmail.trim(),
      // Folio provisional; ErpDataContext.crearOrden no lo usa (la BD genera el real).
      numero: `ORD-2026-${String(Date.now()).slice(-3)}`,
      fechaCreacion: hoyISO(),
      fechaEntrega: formData.fechaEntrega,
      tipoVenta: formData.tipoVenta,
      estado: formData.tipoVenta === "directa" ? "completed" : "pending",
      metodoPago: formData.metodoPago,
      estadoPago:
        anticipo >= total
          ? "liquidado"
          : anticipo > 0
          ? "anticipo"
          : "pendiente",
      total,
      anticipo,
      pagos:
        anticipo > 0
          ? [
              {
                monto: anticipo,
                fecha: hoyISO(),
                metodo: formData.metodoPago,
                concepto:
                  anticipo >= total
                    ? "Pago total"
                    : `Anticipo ${Math.round((anticipo / total) * 100)}%`,
              },
            ]
          : [],
      productos: productos.map((p, i) => {
        // La venta directa es producto terminado: no pasa por talleres (aunque el estado
        // conserve los talleres por defecto, que solo se ocultan en pantalla).
        const directa = p.tipoProduccion === "directa";
        const talleres = directa ? [] : p.talleres;
        return {
        id: `p${i}`,
        nombre: p.nombre,
        tipoPrenda: p.tipoPrenda as any,
        marca: p.marca || undefined,
        talla: p.talla,
        color: p.color,
        cantidad: p.cantidad,
        precioUnitario: p.precioUnitario,
        tipoProduccion: p.tipoProduccion,
        talleres,
        progreso: Object.fromEntries(talleres.map((t) => [t, "pending"])),
        productoId: directa ? p.productoId : undefined,
        varianteId: directa ? p.varianteId : undefined,
        proveedorId: p.proveedorId || undefined,
        proveedorNombre: p.proveedorId
          ? mockProveedores.find((pr) => pr.id === p.proveedorId)?.nombre
          : undefined,
        // Los colores de hilo se escriben separados por comas: "Azul, Blanco" → ["Azul", "Blanco"].
        personalizacion: p.requiereBordado
          ? {
              lugarBordado: p.bordadoUbicacion,
              coloresHilo: p.bordadoColores
                .split(",")
                .map((c) => c.trim())
                .filter((c) => c),
              notas: p.bordadoNotas || undefined,
            }
          : undefined,
        };
      }),
      notas: formData.notas || undefined,
    };

    onSubmit(nuevaOrden);
    onClose();
  };

  // Colores de la etiqueta del tipo de venta mostrada en el encabezado.
  const getTipoVentaColor = (tipo: TipoVenta) => {
    switch (tipo) {
      case "directa":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500";
      case "fabricacion":
        return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500";
      case "comercializacion":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500";
      case "mixta":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500";
    }
  };

  return (
    // Overlay oscuro a pantalla completa con la ventana modal centrada.
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Encabezado fijo: título, etiqueta del tipo de venta calculado y botón cerrar */}
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <h2>Nueva Orden de Producción</h2>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border-2 ${getTipoVentaColor(
                formData.tipoVenta
              )}`}
            >
              {formData.tipoVenta === "directa"
                ? "Venta Directa"
                : formData.tipoVenta === "fabricacion"
                ? "Fabricación"
                : formData.tipoVenta === "comercializacion"
                ? "Comercialización"
                : "Venta Mixta"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Información General */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Información General</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    <User className="w-4 h-4 inline mr-2" />
                    Cliente *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.cliente}
                    onChange={(e) =>
                      setFormData({ ...formData, cliente: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    <Phone className="w-4 h-4 inline mr-2" />
                    Teléfono de Contacto *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.clienteTelefono}
                    onChange={(e) =>
                      setFormData({ ...formData, clienteTelefono: e.target.value })
                    }
                    placeholder="Ej: 55 1234 5678"
                    className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    <Mail className="w-4 h-4 inline mr-2" />
                    Correo Electrónico *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.clienteEmail}
                    onChange={(e) =>
                      setFormData({ ...formData, clienteEmail: e.target.value })
                    }
                    placeholder="contacto@empresa.com"
                    className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    <Calendar className="w-4 h-4 inline mr-2" />
                    Fecha de Entrega *
                  </label>
                  <input
                    type="date"
                    required
                    min={hoyISO()}
                    value={formData.fechaEntrega}
                    onChange={(e) =>
                      setFormData({ ...formData, fechaEntrega: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    <CreditCard className="w-4 h-4 inline mr-2" />
                    Método de Pago *
                  </label>
                  <select
                    required
                    value={formData.metodoPago}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        metodoPago: e.target.value as MetodoPago,
                      })
                    }
                    className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="efectivo">💵 Efectivo</option>
                    <option value="transferencia">🏦 Transferencia</option>
                    <option value="tarjeta">💳 Tarjeta</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    <DollarSign className="w-4 h-4 inline mr-2" />
                    Anticipo
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.anticipo}
                    aria-invalid={anticipoExcedido}
                    aria-describedby={anticipoExcedido ? "anticipo-error" : undefined}
                    // Si el campo queda vacío (NaN) se toma como 0.
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        anticipo: parseFloat(e.target.value) || 0,
                      })
                    }
                    className={`w-full px-4 py-2 bg-secondary rounded-lg border focus:outline-none focus:ring-2 ${
                      anticipoExcedido
                        ? "border-red-500 focus:ring-red-500/20"
                        : "border-transparent focus:border-primary focus:ring-primary/20"
                    }`}
                  />
                  {anticipoExcedido && (
                    <p id="anticipo-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
                      No puede ser mayor al total (${totalOrden.toLocaleString()}).{" "}
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, anticipo: totalOrden })}
                        className="underline font-medium"
                      >
                        Cobrar el total
                      </button>
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Productos: lista de tarjetas plegables + total y saldo */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  Productos ({productos.length})
                </CardTitle>
                <button
                  type="button"
                  onClick={agregarProducto}
                  className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Agregar Producto
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {productos.map((producto, index) => {
                const expandido = productosExpandidos.has(index);
                const directa = producto.tipoProduccion === "directa";
                // Piezas que se pueden vender de la variante elegida (solo venta directa).
                const disponible =
                  directa && producto.varianteId
                    ? disponibleVariante(producto.varianteId, index)
                    : undefined;
                return (
                  <div
                    key={index}
                    className="border border-border rounded-lg overflow-hidden"
                  >
                    {/* Cabecera clicable del producto: resumen (nombre, unidades, importe) */}
                    <div
                      className="flex items-center justify-between p-4 bg-secondary cursor-pointer"
                      onClick={() => toggleExpandido(index)}
                    >
                      <div className="flex items-center gap-3">
                        <Package className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-medium">
                            Producto {index + 1}
                            {producto.nombre && `: ${producto.nombre}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {producto.cantidad || 0} uds •{" $"}
                            {(
                              producto.cantidad * producto.precioUnitario
                            ).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {productos.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              // Evita que el clic también pliegue/despliegue la tarjeta.
                              e.stopPropagation();
                              eliminarProducto(index);
                            }}
                            className="p-2 text-status-pending hover:bg-status-pending-bg rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {expandido ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </div>
                    </div>

                    {/* Campos del producto (solo si la tarjeta está desplegada) */}
                    {expandido && (
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {directa ? (
                            // Venta directa: el producto sale del inventario, no se captura.
                            <div className="md:col-span-2">
                              <p className="block text-sm font-medium mb-2">
                                Producto en Inventario *
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {producto.varianteId
                                  ? "Se descontará del stock al crear la orden."
                                  : "Elige abajo la prenda en existencia que se va a vender."}
                              </p>
                            </div>
                          ) : (
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-2">
                              Nombre del Producto *
                            </label>
                            <input
                              type="text"
                              required
                              value={producto.nombre}
                              onChange={(e) =>
                                actualizarProducto(index, "nombre", e.target.value)
                              }
                              className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          )}
                          <div>
                            <label className="block text-sm font-medium mb-2">
                              Tipo de Producción *
                            </label>
                            <select
                              required
                              value={producto.tipoProduccion}
                              onChange={(e) =>
                                cambiarTipoProduccion(
                                  index,
                                  e.target.value as ProductoCaptura["tipoProduccion"]
                                )
                              }
                              className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                              <option value="directa">Venta Directa</option>
                              <option value="fabricacion">Fabricación</option>
                              <option value="comercializacion">
                                Comercialización
                              </option>
                            </select>
                          </div>
                        </div>

                        {directa ? (
                          <SelectorStock
                            catalogo={catalogo}
                            seleccion={producto}
                            disponibleVariante={(varianteId) => disponibleVariante(varianteId, index)}
                            onElegir={(p, v) => elegirVariante(index, p, v)}
                            onCambiar={() =>
                              actualizarCampos(index, { productoId: undefined, varianteId: undefined })
                            }
                          />
                        ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-sm font-medium mb-2">
                              Tipo de Prenda *
                            </label>
                            <select
                              required
                              value={producto.tipoPrenda}
                              onChange={(e) =>
                                actualizarProducto(index, "tipoPrenda", e.target.value)
                              }
                              className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                              <option value="camisa">Camisa</option>
                              <option value="pantalon">Pantalón</option>
                              <option value="overol">Overol</option>
                              <option value="chaleco">Chaleco</option>
                              <option value="playera">Playera</option>
                              <option value="otro">Otro</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">
                              Talla *
                            </label>
                            <input
                              type="text"
                              required
                              value={producto.talla}
                              onChange={(e) =>
                                actualizarProducto(index, "talla", e.target.value)
                              }
                              className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">
                              Color *
                            </label>
                            <input
                              type="text"
                              required
                              value={producto.color}
                              onChange={(e) =>
                                actualizarProducto(index, "color", e.target.value)
                              }
                              className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">
                              Marca
                            </label>
                            <input
                              type="text"
                              value={producto.marca}
                              onChange={(e) =>
                                actualizarProducto(index, "marca", e.target.value)
                              }
                              className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                        </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium mb-2">
                              Cantidad *
                              {disponible !== undefined && (
                                <span className="ml-2 font-normal text-muted-foreground">
                                  (disponibles: {disponible})
                                </span>
                              )}
                            </label>
                            <input
                              type="number"
                              required
                              min="1"
                              // Venta directa: no se puede vender más de lo que hay en stock.
                              max={disponible}
                              value={producto.cantidad}
                              onChange={(e) =>
                                actualizarProducto(
                                  index,
                                  "cantidad",
                                  parseInt(e.target.value)
                                )
                              }
                              className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">
                              Precio Unitario *
                            </label>
                            <input
                              type="number"
                              required
                              min="0"
                              step="0.01"
                              value={producto.precioUnitario}
                              onChange={(e) =>
                                actualizarProducto(
                                  index,
                                  "precioUnitario",
                                  parseFloat(e.target.value)
                                )
                              }
                              className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                        </div>

                        {/* Proveedor: solo para productos de comercialización (se compran a terceros) */}
                        {producto.tipoProduccion === "comercializacion" && (
                          <div>
                            <label className="block text-sm font-medium mb-2">
                              <Building2 className="w-4 h-4 inline mr-2" />
                              Proveedor
                            </label>
                            <select
                              value={producto.proveedorId || ""}
                              onChange={(e) =>
                                actualizarProducto(
                                  index,
                                  "proveedorId",
                                  e.target.value
                                )
                              }
                              className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                              <option value="">Seleccionar proveedor</option>
                              {mockProveedores.map((prov) => (
                                <option key={prov.id} value={prov.id}>
                                  {prov.nombre}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Talleres: no aplican a la venta directa (producto ya terminado) */}
                        {producto.tipoProduccion !== "directa" && (
                          <div>
                            <label className="block text-sm font-medium mb-2">
                              Talleres del Flujo de Producción
                            </label>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                              {todosLosTalleres.map((taller) => (
                                <label
                                  key={taller}
                                  className={`flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer transition-all text-sm ${
                                    producto.talleres.includes(taller)
                                      ? "border-primary bg-primary/10"
                                      : "border-border hover:border-primary/50"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={producto.talleres.includes(taller)}
                                    onChange={() => toggleTaller(index, taller)}
                                    className="w-4 h-4"
                                  />
                                  <span>{tallerLabels[taller]}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Bordado: solo si el flujo incluye el taller de bordado */}
                        {producto.talleres.includes("bordado") && (
                          <div className="p-4 border border-border rounded-lg space-y-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`bordado-${index}`}
                                checked={producto.requiereBordado}
                                onChange={(e) =>
                                  actualizarProducto(
                                    index,
                                    "requiereBordado",
                                    e.target.checked
                                  )
                                }
                                className="w-4 h-4"
                              />
                              <label
                                htmlFor={`bordado-${index}`}
                                className="font-medium cursor-pointer flex items-center gap-2"
                              >
                                <Shirt className="w-4 h-4 text-primary" />
                                Configurar Bordado
                              </label>
                            </div>

                            {producto.requiereBordado && (
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                                <div>
                                  <label className="block text-sm mb-1">
                                    Ubicación
                                  </label>
                                  <select
                                    value={producto.bordadoUbicacion}
                                    onChange={(e) =>
                                      actualizarProducto(
                                        index,
                                        "bordadoUbicacion",
                                        e.target.value
                                      )
                                    }
                                    className="w-full px-3 py-2 bg-secondary rounded-lg text-sm"
                                  >
                                    <option value="frente">Frente</option>
                                    <option value="espalda">Espalda</option>
                                    <option value="bolsillo">Bolsillo</option>
                                    <option value="personalizado">
                                      Personalizado
                                    </option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-sm mb-1">
                                    Colores de Hilo
                                  </label>
                                  <input
                                    type="text"
                                    value={producto.bordadoColores}
                                    onChange={(e) =>
                                      actualizarProducto(
                                        index,
                                        "bordadoColores",
                                        e.target.value
                                      )
                                    }
                                    placeholder="Ej: Azul, Blanco"
                                    className="w-full px-3 py-2 bg-secondary rounded-lg text-sm"
                                  />
                                </div>
                                <div className="md:col-span-1">
                                  <label className="block text-sm mb-1">Notas</label>
                                  <input
                                    type="text"
                                    value={producto.bordadoNotas}
                                    onChange={(e) =>
                                      actualizarProducto(
                                        index,
                                        "bordadoNotas",
                                        e.target.value
                                      )
                                    }
                                    placeholder="Instrucciones..."
                                    className="w-full px-3 py-2 bg-secondary rounded-lg text-sm"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Subtotal del producto */}
                        <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                          <span className="font-medium">Subtotal:</span>
                          <span className="text-xl font-bold text-primary">
                            $
                            {(
                              producto.cantidad * producto.precioUnitario
                            ).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Total general de la orden: subtotal + IVA (precios antes de IVA) */}
              <div className="p-4 bg-secondary rounded-lg border-2 border-primary">
                <p className="text-lg font-semibold mb-2">Total de la Orden</p>
                <DesgloseImportes importes={calcularImportesOrden()} className="text-base" />
              </div>

              {/* Desglose de anticipo y saldo pendiente (solo si hay anticipo) */}
              {formData.anticipo > 0 && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-blue-500/5 rounded-lg border border-blue-500/20">
                  <div>
                    <p className="text-sm text-muted-foreground">Anticipo</p>
                    <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      ${formData.anticipo.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Saldo Pendiente</p>
                    <p className="text-lg font-semibold text-orange-600 dark:text-orange-400">
                      ${Math.max(totalOrden - formData.anticipo, 0).toLocaleString()}
                    </p>
                    {anticipoExcedido && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">El anticipo supera el total</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                <FileText className="w-5 h-5 inline mr-2" />
                Notas de la Orden
              </CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={formData.notas}
                onChange={(e) =>
                  setFormData({ ...formData, notas: e.target.value })
                }
                rows={3}
                className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Instrucciones especiales, comentarios adicionales..."
              />
            </CardContent>
          </Card>

          {/* Botones de acción fijos en la parte inferior del modal */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border sticky bottom-0 bg-background pb-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={anticipoExcedido}
              className="px-6 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Crear Orden
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Selector de prendas en existencia para un producto de venta directa.
 * Sin selección: buscador + lista de variantes con piezas disponibles (descontando lo
 * que ya apartaron otros productos de la orden). Con selección: resumen y "Cambiar".
 */
function SelectorStock({
  catalogo,
  seleccion,
  disponibleVariante,
  onElegir,
  onCambiar,
}: {
  catalogo: Producto[];
  seleccion: ProductoCaptura;
  disponibleVariante: (varianteId: string) => number;
  onElegir: (producto: Producto, variante: VarianteProducto) => void;
  onCambiar: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");

  if (seleccion.varianteId) {
    const disponible = disponibleVariante(seleccion.varianteId);
    return (
      <div className="flex items-center justify-between gap-4 p-4 rounded-lg border-2 border-primary bg-primary/5">
        <div className="flex items-center gap-3 min-w-0">
          <Boxes className="w-5 h-5 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="font-medium truncate">{seleccion.nombre}</p>
            <p className="text-sm text-muted-foreground">
              Talla {seleccion.talla} • {seleccion.color} • {disponible} disponible(s)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCambiar}
          className="px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 rounded-lg transition-colors shrink-0"
        >
          Cambiar
        </button>
      </div>
    );
  }

  const texto = busqueda.trim().toLowerCase();
  const opciones = catalogo
    .flatMap((producto) =>
      producto.variantes.map((variante) => ({
        producto,
        variante,
        disponible: disponibleVariante(variante.id),
      }))
    )
    .filter(({ disponible }) => disponible > 0)
    .filter(
      ({ producto, variante }) =>
        !texto ||
        [producto.nombre, variante.talla, variante.color, variante.sku ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(texto)
    );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar en stock por nombre, talla, color o SKU…"
          className="w-full pl-9 pr-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>
      {opciones.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          {texto ? "Ninguna prenda en stock coincide con la búsqueda." : "No hay prendas con existencia en el inventario."}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
          {opciones.map(({ producto, variante, disponible }) => (
            <button
              key={variante.id}
              type="button"
              onClick={() => onElegir(producto, variante)}
              className="flex items-center justify-between gap-3 p-3 text-left border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{producto.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  Talla {variante.talla} • {variante.color}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium">${(variante.precio || producto.precio).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Stock: {disponible}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
