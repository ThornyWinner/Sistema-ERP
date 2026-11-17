/**
 * VentaRapidaDialog.tsx — Ventana modal de "Venta Rápida" (venta de mostrador).
 *
 * Permite vender productos que ya están en existencia sin pasar por los talleres:
 *  1. Se captura el cliente y el método de pago.
 *  2. Se eligen variantes (corte, manga, talla y color) con stock disponible y se agregan al carrito.
 *  3. Se ajustan cantidades (nunca por encima del stock de la variante).
 *  4. Al completar, se genera una orden de tipo "directa", ya entregada ("completed")
 *     y liquidada, con un único pago por el total (a crédito: sin pago, con todo el
 *     total como saldo). La orden se entrega al padre mediante `onSubmit`, que es
 *     quien la guarda.
 *
 * Se aplican el tope de descuento y el límite de crédito del cliente (politicasVenta.ts).
 */
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { describirVariante, type MetodoPago, type Producto } from "../data/mockData";
import { hoyISO } from "../lib/fechas";
import { calcularImportes } from "../lib/impuestos";
import { usePoliticasVenta } from "../lib/politicasVenta";
import { piezasMayoreo, precioSugerido, useListasPrecios } from "../lib/listasPrecios";
import { formatMonto } from "../lib/pagos";
import DesgloseImportes from "./DesgloseImportes";
import PanelPoliticasVenta from "./PanelPoliticasVenta";
import {
  X,
  User,
  CreditCard,
  ShoppingCart,
  Plus,
  Minus,
  Phone,
  Mail,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./Card";

interface VentaRapidaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Recibe la orden construida (sin id ni folio, que asigna la base de datos). */
  onSubmit: (orden: any) => Promise<boolean> | void;
  /** Catálogo de productos con sus variantes y stock. */
  productos: Producto[];
}

/** Renglón del carrito: una variante concreta con la cantidad a vender. */
type ItemCarrito = {
  productoId: string;
  varianteId: string;
  nombre: string;
  tipo: string;
  corte: string;
  manga: string;
  talla: string;
  color: string;
  /** Precio de lista de la variante (antes de mayoreo / precio especial del cliente). */
  precio: number;
  /** Stock de la variante al momento de agregarla; límite máximo de `cantidad`. */
  stockDisponible: number;
  cantidad: number;
};

export default function VentaRapidaDialog({
  isOpen,
  onClose,
  onSubmit,
  productos,
}: VentaRapidaDialogProps) {
  // Usuario actual: queda registrado como vendedor de la orden.
  const { user } = useAuth();
  // Datos del formulario (cliente, contacto opcional y forma de pago).
  const [formData, setFormData] = useState<{
    cliente: string;
    clienteTelefono: string;
    clienteEmail: string;
    metodoPago: MetodoPago;
  }>({
    cliente: "",
    clienteTelefono: "",
    clienteEmail: "",
    metodoPago: "efectivo",
  });

  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  /** Descuento en pesos sobre el subtotal (antes de IVA). */
  const [descuento, setDescuento] = useState(0);
  const [guardando, setGuardando] = useState(false);

  // Mayoreo y precios especiales por cliente: el precio de cada renglón se calcula a
  // partir del de lista (las piezas del mismo producto suman para el mayoreo).
  const listas = useListasPrecios(isOpen);
  const precioDe = (item: ItemCarrito) =>
    precioSugerido(listas, {
      cliente: formData.cliente,
      productoId: item.productoId,
      precioBase: item.precio,
      cantidad: piezasMayoreo(item, carrito),
    });

  // Importes del carrito: precios antes de IVA; se cobra subtotal − descuento + IVA 16 %.
  const importesCarrito = calcularImportes(
    carrito.map((item) => ({ cantidad: item.cantidad, precioUnitario: precioDe(item).precio })),
    descuento
  );
  // A crédito no se cobra en el momento: todo el total queda como saldo del cliente.
  const aCredito = formData.metodoPago === "credito";

  // Límite de crédito del cliente y tope de descuento (sql/politicas_venta.sql).
  const politicas = usePoliticasVenta({
    cliente: formData.cliente,
    metodoPago: formData.metodoPago,
    saldoNuevo: aCredito ? importesCarrito.total : 0,
    descuento,
    subtotal: importesCarrito.subtotal,
    activo: isOpen,
  });

  // Cerrado: no se renderiza nada (los hooks ya se declararon arriba, como exige React).
  if (!isOpen) return null;

  /**
   * Agrega una variante al carrito. Si ya estaba, suma 1 a su cantidad siempre que
   * no supere el stock disponible. El precio de la variante tiene prioridad sobre el
   * precio general del producto.
   */
  const agregarVariante = (producto: Producto, varianteId: string) => {
    const variante = producto.variantes.find((v) => v.id === varianteId);
    if (!variante) return;
    setCarrito((prev) => {
      const existe = prev.find((p) => p.varianteId === varianteId);
      if (existe) {
        if (existe.cantidad >= existe.stockDisponible) return prev;
        return prev.map((p) => (p.varianteId === varianteId ? { ...p, cantidad: p.cantidad + 1 } : p));
      }
      return [
        ...prev,
        {
          productoId: producto.id,
          varianteId: variante.id,
          nombre: producto.nombre,
          tipo: producto.tipo,
          corte: variante.corte,
          manga: variante.manga,
          talla: variante.talla,
          color: variante.color,
          precio: variante.precio || producto.precio,
          stockDisponible: variante.stock,
          cantidad: 1,
        },
      ];
    });
  };

  // Quita por completo una variante del carrito.
  const removerVariante = (varianteId: string) => {
    setCarrito((prev) => prev.filter((p) => p.varianteId !== varianteId));
  };

  /**
   * Suma o resta (`delta` = +1 / -1) a la cantidad de una variante.
   * Si llega a 0 se elimina del carrito; si superaría el stock, no cambia.
   */
  const ajustarCantidad = (varianteId: string, delta: number) => {
    setCarrito((prev) =>
      prev
        .map((p) => {
          if (p.varianteId !== varianteId) return p;
          const nuevaCantidad = p.cantidad + delta;
          if (nuevaCantidad <= 0) return null;
          if (nuevaCantidad > p.stockDisponible) return p;
          return { ...p, cantidad: nuevaCantidad };
        })
        .filter((p): p is ItemCarrito => p !== null)
    );
  };

  /**
   * Construye la orden de venta directa a partir del carrito y la envía al padre.
   * Fecha de creación y de entrega = hoy, porque el producto se entrega en el acto.
   * De contado queda liquidada con un pago por el total; a crédito, sin pagos y con
   * todo el total como saldo pendiente.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    // Evita que el formulario recargue la página.
    e.preventDefault();
    if (guardando) return;

    if (carrito.length === 0) {
      alert("Debe agregar al menos un producto");
      return;
    }
    if (politicas.bloqueo) {
      toast.error("No se puede completar la venta", { description: politicas.bloqueo });
      return;
    }

    const total = importesCarrito.total;
    // Fecha actual en formato "AAAA-MM-DD" (hora local).
    const hoy = hoyISO();

    const nuevaOrden = {
      vendedor: user?.nombre || "Usuario",
      vendedorId: user?.id || "",
      cliente: formData.cliente,
      clienteTelefono: formData.clienteTelefono.trim(),
      clienteEmail: formData.clienteEmail.trim(),
      fechaCreacion: hoy,
      fechaEntrega: hoy,
      tipoVenta: "directa" as const,
      estado: "completed" as const,
      metodoPago: formData.metodoPago,
      estadoPago: aCredito ? ("pendiente" as const) : ("liquidado" as const),
      subtotal: importesCarrito.subtotal,
      descuento: importesCarrito.descuento,
      iva: importesCarrito.iva,
      total,
      anticipo: 0,
      // De contado, un solo pago por el total: la venta queda liquidada al momento.
      pagos: aCredito
        ? []
        : [
            {
              monto: total,
              fecha: hoy,
              metodo: formData.metodoPago,
            },
          ],
      // Cada renglón del carrito se convierte en un ProductoOrden sin talleres.
      // productoId/varianteId permiten identificar exactamente la variante vendida.
      productos: carrito.map((item) => ({
        id: item.varianteId,
        nombre: item.nombre,
        tipoPrenda: item.tipo,
        talla: item.talla,
        color: item.color,
        cantidad: item.cantidad,
        precioUnitario: precioDe(item).precio,
        tipoProduccion: "directa" as const,
        talleres: [],
        progreso: {},
        productoId: item.productoId,
        varianteId: item.varianteId,
      })),
    };

    // Entrega la orden; si se guardó, vacía el carrito y cierra el diálogo. Si la BD la
    // rechaza (p. ej. por las políticas de venta), el carrito se conserva.
    setGuardando(true);
    try {
      const ok = await onSubmit(nuevaOrden);
      if (ok === false) return;
      setCarrito([]);
      setDescuento(0);
      onClose();
    } finally {
      setGuardando(false);
    }
  };

  // Lista plana de todas las variantes con stock > 0 (de todos los productos).
  const variantesDisponibles = productos.flatMap((producto) =>
    producto.variantes
      .filter((v) => v.stock > 0)
      .map((variante) => ({ producto, variante }))
  );

  return (
    // Fondo oscuro semitransparente que cubre toda la pantalla (overlay del modal).
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Encabezado fijo (sticky) con título y botón de cerrar */}
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-6 h-6 text-primary" />
            <h2>Venta Rápida</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Sección 1: datos del cliente y método de pago */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Información del Cliente</CardTitle>
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
                    placeholder="Nombre del cliente"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    <Phone className="w-4 h-4 inline mr-2" />
                    Teléfono de Contacto
                  </label>
                  <input
                    type="tel"
                    value={formData.clienteTelefono}
                    onChange={(e) =>
                      setFormData({ ...formData, clienteTelefono: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="Ej: 55 1234 5678"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    <Mail className="w-4 h-4 inline mr-2" />
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    value={formData.clienteEmail}
                    onChange={(e) =>
                      setFormData({ ...formData, clienteEmail: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="contacto@empresa.com"
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
                    <option value="cheque">🧾 Cheque</option>
                    <option value="credito">📄 Crédito</option>
                  </select>
                  {aCredito && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      No se cobra ahora: el total queda como saldo pendiente del cliente.
                    </p>
                  )}
                </div>
              </div>
              <PanelPoliticasVenta
                politicas={politicas}
                cliente={formData.cliente}
                metodoPago={formData.metodoPago}
              />
            </CardContent>
          </Card>

          {/* Sección 2: catálogo de variantes en existencia; el botón + las agrega al carrito */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Productos en Stock ({variantesDisponibles.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto">
                {variantesDisponibles.map(({ producto, variante }) => (
                  <div
                    key={variante.id}
                    className="p-3 border border-border rounded-lg hover:border-primary transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-medium">{producto.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {describirVariante(variante)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Stock: {variante.stock} • ${variante.precio || producto.precio}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => agregarVariante(producto, variante.id)}
                        className="p-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Sección 3: carrito con controles de cantidad y total (solo si hay productos) */}
          {carrito.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Carrito ({carrito.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {carrito.map((item) => {
                  const calc = precioDe(item);
                  return (
                  <div
                    key={item.varianteId}
                    className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{item.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {describirVariante(item)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {calc.regla && <span className="line-through mr-1">{formatMonto(item.precio)}</span>}
                        {formatMonto(calc.precio)} x {item.cantidad} = {formatMonto(calc.precio * item.cantidad)}
                      </p>
                      {calc.regla && <p className="text-xs text-status-completed">✓ {calc.regla}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => ajustarCantidad(item.varianteId, -1)}
                        className="p-1 bg-background rounded hover:bg-secondary transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-medium">{item.cantidad}</span>
                      <button
                        type="button"
                        onClick={() => ajustarCantidad(item.varianteId, 1)}
                        disabled={item.cantidad >= item.stockDisponible}
                        className="p-1 bg-background rounded hover:bg-secondary transition-colors disabled:opacity-40"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removerVariante(item.varianteId)}
                        className="p-1.5 bg-status-pending-bg text-status-pending-text rounded hover:bg-status-pending/20 transition-colors ml-2"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  );
                })}

                <div className="pt-4 border-t border-border space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label htmlFor="vr-descuento" className="text-sm font-medium">
                      Descuento ($, antes de IVA)
                    </label>
                    <input
                      id="vr-descuento"
                      type="number"
                      min="0"
                      step="0.01"
                      value={descuento}
                      aria-invalid={!!politicas.avisoDescuento}
                      onChange={(e) => setDescuento(parseFloat(e.target.value) || 0)}
                      className={`w-32 px-3 py-1.5 bg-secondary rounded-lg border focus:outline-none focus:ring-2 ${
                        politicas.avisoDescuento && !politicas.exento
                          ? "border-red-500 focus:ring-red-500/20"
                          : "border-transparent focus:border-primary focus:ring-primary/20"
                      }`}
                    />
                    <span className="text-xs text-muted-foreground">Máximo {politicas.descuentoMax} % del subtotal</span>
                  </div>
                  <DesgloseImportes importes={importesCarrito} className="text-base" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Acciones: cancelar o completar (deshabilitado con el carrito vacío) */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={carrito.length === 0 || guardando || !!politicas.bloqueo}
              className="px-6 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {guardando ? "Guardando…" : "Completar Venta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
