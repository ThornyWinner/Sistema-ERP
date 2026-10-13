import { useState } from "react";
import { Taller } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import {
  X,
  User,
  Package,
  Calendar,
  Hash,
  Ruler,
  Palette,
  Tag,
  ChevronDown,
  ChevronUp,
  Shirt,
  FileText,
  Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./Card";

interface NuevaOrdenDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (orden: any) => void;
}

const todosLosTalleres: Taller[] = [
  "diseno",
  "sublimacion",
  "corte",
  "costura",
  "bordado",
];

export default function NuevaOrdenDialog({
  isOpen,
  onClose,
  onSubmit,
}: NuevaOrdenDialogProps) {
  const { user } = useAuth();
  const [showFlujosComunes, setShowFlujosComunes] = useState(false);

  const [formData, setFormData] = useState({
    cliente: "",
    producto: "",
    tipoPrenda: "camisa" as const,
    marca: "",
    talla: "",
    color: "",
    cantidad: 0,
    fechaEntrega: "",
    prioridad: "media" as const,
    talleres: ["corte", "costura"] as Taller[],
    requiereBordado: false,
    lugarBordar: "bolsillo" as const,
    coloresHilo: [""],
    notasAdicionales: "",
  });

  if (!isOpen) return null;

  const toggleTaller = (taller: Taller) => {
    setFormData((prev) => ({
      ...prev,
      talleres: prev.talleres.includes(taller)
        ? prev.talleres.filter((t) => t !== taller)
        : [...prev.talleres, taller].sort(
            (a, b) => todosLosTalleres.indexOf(a) - todosLosTalleres.indexOf(b)
          ),
    }));
  };

  const aplicarFlujoComun = (flujo: Taller[]) => {
    setFormData((prev) => ({ ...prev, talleres: flujo }));
    setShowFlujosComunes(false);
  };

  const flujosComunes = [
    {
      nombre: "Flujo Completo",
      talleres: ["diseno", "sublimacion", "corte", "costura", "bordado"] as Taller[],
    },
    {
      nombre: "Sin Diseño",
      talleres: ["sublimacion", "corte", "costura", "bordado"] as Taller[],
    },
    {
      nombre: "Sin Sublimación",
      talleres: ["diseno", "corte", "costura", "bordado"] as Taller[],
    },
    {
      nombre: "Sin Bordado",
      talleres: ["diseno", "sublimacion", "corte", "costura"] as Taller[],
    },
    {
      nombre: "Confección Básica",
      talleres: ["corte", "costura"] as Taller[],
    },
    {
      nombre: "Con Bordado Final",
      talleres: ["corte", "costura", "bordado"] as Taller[],
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const nuevaOrden = {
      ...formData,
      vendedor: user?.nombre || "Usuario",
      vendedorId: user?.id || "0",
      numero: `ORD-2026-${String(Date.now()).slice(-3)}`,
      fechaCreacion: new Date().toISOString().split("T")[0],
      estado: "pending" as const,
      progreso: Object.fromEntries(
        formData.talleres.map((t) => [t, "pending"])
      ),
      bordadoDetalle: formData.requiereBordado
        ? {
            lugarBordar: formData.lugarBordar,
            coloresHilo: formData.coloresHilo.filter((c) => c.trim() !== ""),
            notasAdicionales: formData.notasAdicionales,
          }
        : undefined,
    };

    onSubmit(nuevaOrden);
    onClose();
  };

  const tallerLabels: Record<Taller, string> = {
    diseno: "Diseño",
    sublimacion: "Sublimación",
    corte: "Corte",
    costura: "Costura",
    bordado: "Bordado",
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
          <h2>Nueva Orden de Producción</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Información del Cliente */}
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
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    <Package className="w-4 h-4 inline mr-2" />
                    Nombre del Producto *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.producto}
                    onChange={(e) =>
                      setFormData({ ...formData, producto: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Especificaciones del Producto */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Especificaciones del Producto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    <Shirt className="w-4 h-4 inline mr-2" />
                    Tipo de Prenda *
                  </label>
                  <select
                    required
                    value={formData.tipoPrenda}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        tipoPrenda: e.target.value as any,
                      })
                    }
                    className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="camisa">Camisa</option>
                    <option value="pantalon">Pantalón</option>
                    <option value="overol">Overol</option>
                    <option value="chaleco">Chaleco</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    <Tag className="w-4 h-4 inline mr-2" />
                    Marca
                  </label>
                  <input
                    type="text"
                    value={formData.marca}
                    onChange={(e) =>
                      setFormData({ ...formData, marca: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    <Ruler className="w-4 h-4 inline mr-2" />
                    Talla *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.talla}
                    onChange={(e) =>
                      setFormData({ ...formData, talla: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="S, M, L, XL, 32, Unitalla..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    <Palette className="w-4 h-4 inline mr-2" />
                    Color *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.color}
                    onChange={(e) =>
                      setFormData({ ...formData, color: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    <Hash className="w-4 h-4 inline mr-2" />
                    Cantidad *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.cantidad || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        cantidad: parseInt(e.target.value),
                      })
                    }
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
                    value={formData.fechaEntrega}
                    onChange={(e) =>
                      setFormData({ ...formData, fechaEntrega: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Prioridad</label>
                <div className="flex gap-3">
                  {(["baja", "media", "alta"] as const).map((p) => (
                    <label key={p} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="prioridad"
                        value={p}
                        checked={formData.prioridad === p}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            prioridad: e.target.value as any,
                          })
                        }
                        className="w-4 h-4"
                      />
                      <span className="capitalize">{p}</span>
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Configuración del Flujo */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  Configuración del Flujo de Producción
                </CardTitle>
                <button
                  type="button"
                  onClick={() => setShowFlujosComunes(!showFlujosComunes)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-lg text-sm transition-colors"
                >
                  Flujos Comunes
                  {showFlujosComunes ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {showFlujosComunes && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pb-4 border-b border-border">
                  {flujosComunes.map((flujo) => (
                    <button
                      key={flujo.nombre}
                      type="button"
                      onClick={() => aplicarFlujoComun(flujo.talleres)}
                      className="px-3 py-2 bg-secondary hover:bg-primary hover:text-primary-foreground rounded-lg text-sm transition-colors text-left"
                    >
                      {flujo.nombre}
                    </button>
                  ))}
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground mb-3">
                  Selecciona los talleres que participarán en esta orden:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {todosLosTalleres.map((taller) => (
                    <label
                      key={taller}
                      className={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        formData.talleres.includes(taller)
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.talleres.includes(taller)}
                        onChange={() => toggleTaller(taller)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-medium">
                        {tallerLabels[taller]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detalles de Bordado */}
          {formData.talleres.includes("bordado") && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="requiereBordado"
                    checked={formData.requiereBordado}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        requiereBordado: e.target.checked,
                      })
                    }
                    className="w-4 h-4"
                  />
                  <label htmlFor="requiereBordado" className="cursor-pointer">
                    <CardTitle className="text-lg">Detalles de Bordado</CardTitle>
                  </label>
                </div>
              </CardHeader>
              {formData.requiereBordado && (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Lugar a Bordar
                      </label>
                      <select
                        value={formData.lugarBordar}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            lugarBordar: e.target.value as any,
                          })
                        }
                        className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="bolsillo">Bolsillo</option>
                        <option value="espalda">Espalda</option>
                        <option value="personalizado">Personalizado</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Colores de Hilo
                      </label>
                      <input
                        type="text"
                        value={formData.coloresHilo[0]}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            coloresHilo: [e.target.value],
                          })
                        }
                        placeholder="Ej: Azul, Rojo, Blanco"
                        className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      <FileText className="w-4 h-4 inline mr-2" />
                      Notas Adicionales
                    </label>
                    <textarea
                      value={formData.notasAdicionales}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          notasAdicionales: e.target.value,
                        })
                      }
                      rows={3}
                      className="w-full px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="Instrucciones especiales para el bordado..."
                    />
                  </div>
                </CardContent>
              )}
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
              className="px-6 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors"
            >
              Crear Orden
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
