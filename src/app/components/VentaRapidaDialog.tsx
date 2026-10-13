import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { MetodoPago, Producto } from "../data/mockData";
import {
  X,
  User,
  CreditCard,
  ShoppingCart,
  Plus,
  Minus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./Card";

interface VentaRapidaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (orden: any) => void;
  productos: Producto[];
}

type ItemCarrito = {
  productoId: string;
  varianteId: string;
  nombre: string;
  tipo: string;
  talla: string;
  color: string;
  precio: number;
  stockDisponible: number;
  cantidad: number;
};

export default function VentaRapidaDialog({
  isOpen,
  onClose,
  onSubmit,
  productos,
}: VentaRapidaDialogProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState<{ cliente: string; metodoPago: MetodoPago }>({
    cliente: "",
    metodoPago: "efectivo",
  });

  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  if (!isOpen) return null;

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
          talla: variante.talla,
          color: variante.color,
          precio: variante.precio || producto.precio,
          stockDisponible: variante.stock,
          cantidad: 1,
        },
      ];
    });
  };

  const removerVariante = (varianteId: string) => {
    setCarrito((prev) => prev.filter((p) => p.varianteId !== varianteId));
  };

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

  const calcularTotal = () => carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (carrito.length === 0) {
      alert("Debe agregar al menos un producto");
      return;
    }

    const total = calcularTotal();
    const hoy = new Date().toISOString().split("T")[0];

    const nuevaOrden = {
      vendedor: user?.nombre || "Usuario",
      vendedorId: user?.id || "",
      cliente: formData.cliente,
      fechaCreacion: hoy,
      fechaEntrega: hoy,
      tipoVenta: "directa" as const,
      estado: "completed" as const,
      prioridad: "media" as const,
      metodoPago: formData.metodoPago,
      estadoPago: "liquidado" as const,
      total,
      anticipo: 0,
      pagos: [
        {
          monto: total,
          fecha: hoy,
          metodo: formData.metodoPago,
        },
      ],
      productos: carrito.map((item) => ({
        id: item.varianteId,
        nombre: item.nombre,
        tipoPrenda: item.tipo,
        talla: item.talla,
        color: item.color,
        cantidad: item.cantidad,
        precioUnitario: item.precio,
        tipoProduccion: "directa" as const,
        talleres: [],
        progreso: {},
        productoId: item.productoId,
        varianteId: item.varianteId,
      })),
    };

    onSubmit(nuevaOrden);
    setCarrito([]);
    onClose();
  };

  const variantesDisponibles = productos.flatMap((producto) =>
    producto.variantes
      .filter((v) => v.stock > 0)
      .map((variante) => ({ producto, variante }))
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
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
                </div>
              </div>
            </CardContent>
          </Card>

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
                          {variante.talla} • {variante.color}
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

          {carrito.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Carrito ({carrito.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {carrito.map((item) => (
                  <div
                    key={item.varianteId}
                    className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{item.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.talla} • {item.color}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        ${item.precio} x {item.cantidad} = $
                        {(item.precio * item.cantidad).toLocaleString()}
                      </p>
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
                ))}

                <div className="pt-4 border-t border-border">
                  <div className="flex items-center justify-between text-lg font-semibold">
                    <span>Total:</span>
                    <span className="text-2xl text-primary">
                      ${calcularTotal().toLocaleString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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
              disabled={carrito.length === 0}
              className="px-6 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Completar Venta
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
