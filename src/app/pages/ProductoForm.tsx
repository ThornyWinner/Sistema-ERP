/**
 * ProductoForm.tsx — Formulario de alta y edición de productos.
 *
 * Se usa en dos rutas:
 *  - /productos/nuevo        → modo creación (formulario vacío).
 *  - /productos/editar/:id   → modo edición (precarga los datos del producto con ese id).
 *
 * Campos: nombre, tipo de prenda, categoría, precio, stock inicial, tallas y colores
 * (seleccionados de listas predefinidas). La columna derecha incluye una zona de
 * imagen de referencia (solo visual) y un resumen en vivo.
 *
 * Nota: el guardado todavía no está conectado a Supabase; al enviar solo se imprime
 * el formulario en la consola y se vuelve al inventario de productos.
 */
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import { ArrowLeft, Save, X } from "lucide-react";
import { useErpData } from "../context/ErpDataContext";

export default function ProductoForm() {
  const { productos: mockProductos } = useErpData();
  // `id` existe solo en la ruta de edición.
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;

  // Producto a editar (null en modo creación).
  const productoExistente = isEditing
    ? mockProductos.find((p) => p.id === id)
    : null;

  // Valores iniciales: los del producto existente o vacíos.
  // Nota: useState solo usa este valor en el primer render; si los productos aún no
  // habían cargado, el formulario quedará vacío.
  const [formData, setFormData] = useState({
    nombre: productoExistente?.nombre || "",
    tipo: productoExistente?.tipo || "camisa",
    categoria: productoExistente?.categoria || "",
    precio: productoExistente?.precio || 0,
    stock: productoExistente?.stock || 0,
    tallas: productoExistente?.tallas || [],
    colores: productoExistente?.colores || [],
  });

  // Valor seleccionado en los desplegables de talla/color antes de pulsar "Agregar".
  const [nuevaTalla, setNuevaTalla] = useState("");
  const [nuevoColor, setNuevoColor] = useState("");

  // Catálogos de opciones para tallas (letras y números de cintura) y colores.
  const tallasDisponibles = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "28", "30", "32", "34", "36", "38", "40"];
  const coloresDisponibles = [
    "Azul Marino",
    "Negro",
    "Gris",
    "Blanco",
    "Khaki",
    "Verde",
    "Naranja",
    "Amarillo",
    "Rojo",
  ];

  // Añade la talla si no está vacía ni repetida y limpia el desplegable.
  const agregarTalla = (talla: string) => {
    if (talla && !formData.tallas.includes(talla)) {
      setFormData({ ...formData, tallas: [...formData.tallas, talla] });
    }
    setNuevaTalla("");
  };

  const eliminarTalla = (talla: string) => {
    setFormData({
      ...formData,
      tallas: formData.tallas.filter((t) => t !== talla),
    });
  };

  // Añade el color si no está vacío ni repetido y limpia el desplegable.
  const agregarColor = (color: string) => {
    if (color && !formData.colores.includes(color)) {
      setFormData({ ...formData, colores: [...formData.colores, color] });
    }
    setNuevoColor("");
  };

  const eliminarColor = (color: string) => {
    setFormData({
      ...formData,
      colores: formData.colores.filter((c) => c !== color),
    });
  };

  // Guardado pendiente de implementar: por ahora solo registra en consola y regresa.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Guardando producto:", formData);
    navigate("/inventario/productos");
  };

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado con flecha para volver; el título cambia según el modo */}
      <div className="flex items-center gap-4">
        <Link
          to="/inventario/productos"
          className="p-2 hover:bg-secondary rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1>{isEditing ? "Editar Producto" : "Nuevo Producto"}</h1>
          <p className="text-muted-foreground mt-1">
            {isEditing
              ? "Actualiza la información del producto"
              : "Agrega un nuevo uniforme al inventario"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Diseño en 3 columnas: 2 para los datos y 1 para imagen/resumen/acciones */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Información General</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Nombre del Producto *
                  </label>
                  <input
                    type="text"
                    value={formData.nombre}
                    onChange={(e) =>
                      setFormData({ ...formData, nombre: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="Ej: Camisa Industrial Manga Larga"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Tipo de Producto *
                    </label>
                    <select
                      value={formData.tipo}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          tipo: e.target.value as any,
                        })
                      }
                      className="w-full px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      required
                    >
                      <option value="camisa">Camisa</option>
                      <option value="pantalon">Pantalón</option>
                      <option value="overol">Overol</option>
                      <option value="chaleco">Chaleco</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Categoría *
                    </label>
                    <input
                      type="text"
                      value={formData.categoria}
                      onChange={(e) =>
                        setFormData({ ...formData, categoria: e.target.value })
                      }
                      className="w-full px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="Ej: Industrial, Corporativo"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Precio (MXN) *
                    </label>
                    <input
                      type="number"
                      value={formData.precio}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          precio: parseFloat(e.target.value),
                        })
                      }
                      className="w-full px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Stock Inicial
                    </label>
                    <input
                      type="number"
                      value={formData.stock}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          stock: parseInt(e.target.value),
                        })
                      }
                      className="w-full px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="0"
                      min="0"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Variantes: tallas y colores como etiquetas que se pueden quitar con la X.
                Los desplegables ocultan las opciones ya agregadas. */}
            <Card>
              <CardHeader>
                <CardTitle>Variantes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Tallas Disponibles
                  </label>
                  <div className="flex gap-2 mb-3">
                    <select
                      value={nuevaTalla}
                      onChange={(e) => setNuevaTalla(e.target.value)}
                      className="flex-1 px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">Seleccionar talla</option>
                      {tallasDisponibles
                        .filter((t) => !formData.tallas.includes(t))
                        .map((talla) => (
                          <option key={talla} value={talla}>
                            {talla}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => agregarTalla(nuevaTalla)}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      Agregar
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.tallas.map((talla) => (
                      <span
                        key={talla}
                        className="inline-flex items-center gap-2 px-3 py-1 bg-secondary text-foreground rounded-lg"
                      >
                        {talla}
                        <button
                          type="button"
                          onClick={() => eliminarTalla(talla)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </span>
                    ))}
                    {formData.tallas.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No hay tallas agregadas
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Colores Disponibles
                  </label>
                  <div className="flex gap-2 mb-3">
                    <select
                      value={nuevoColor}
                      onChange={(e) => setNuevoColor(e.target.value)}
                      className="flex-1 px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">Seleccionar color</option>
                      {coloresDisponibles
                        .filter((c) => !formData.colores.includes(c))
                        .map((color) => (
                          <option key={color} value={color}>
                            {color}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => agregarColor(nuevoColor)}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      Agregar
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.colores.map((color) => (
                      <span
                        key={color}
                        className="inline-flex items-center gap-2 px-3 py-1 bg-secondary text-foreground rounded-lg"
                      >
                        {color}
                        <button
                          type="button"
                          onClick={() => eliminarColor(color)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </span>
                    ))}
                    {formData.colores.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No hay colores agregados
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {/* Zona de carga de imagen (solo visual, aún sin funcionalidad) */}
            <Card>
              <CardHeader>
                <CardTitle>Imagen de Referencia</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer">
                  <div className="w-16 h-16 bg-secondary rounded-full mx-auto mb-4 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-muted-foreground"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Haz clic para subir una imagen
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PNG, JPG hasta 5MB
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Resumen que se actualiza mientras se llena el formulario */}
            <Card>
              <CardHeader>
                <CardTitle>Resumen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tallas:</span>
                  <span className="font-medium">{formData.tallas.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Colores:</span>
                  <span className="font-medium">{formData.colores.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Precio:</span>
                  <span className="font-medium">${formData.precio.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stock:</span>
                  <span className="font-medium">{formData.stock} uds</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Save className="w-5 h-5" />
                Guardar
              </button>
              <Link
                to="/inventario/productos"
                className="px-4 py-3 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
              >
                Cancelar
              </Link>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
