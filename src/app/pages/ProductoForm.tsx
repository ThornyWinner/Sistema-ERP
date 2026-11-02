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
  // Obtiene la lista de productos del contexto (mock).
  const { productos: mockProductos } = useErpData();
  // `id` existe solo en la ruta de edición.
  const { id } = useParams();
  // Hook de navegación para redirigir después de guardar.
  const navigate = useNavigate();
  // Determina si estamos en modo edición (id presente) o creación (id ausente).
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

  // Listas de tallas y colores disponibles para seleccionar. Se filtran en el render para no mostrar los ya agregados.
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

  // Elimina la talla del formulario y limpia el desplegable.
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

  // Elimina el color del formulario y limpia el desplegable.
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

  // Renderiza el formulario con encabezado, campos, variantes, imagen y resumen.
  return (
    // Contenedor principal con padding y espacio entre secciones
    <div className="p-6 space-y-6">
      {/* Encabezado con flecha para volver; el título cambia según el modo */}
      <div className="flex items-center gap-4">
        <Link
          to="/inventario/productos"
          className="p-2 hover:bg-secondary rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        {/* Título y subtítulo que cambian según si estamos editando o creando un producto */}
        <div>
          <h1>{isEditing ? "Editar Producto" : "Nuevo Producto"}</h1>
          <p className="text-muted-foreground mt-1">
            {isEditing
              ? "Actualiza la información del producto"
              : "Agrega un nuevo uniforme al inventario"}
          </p>
        </div>
      </div>

      {/* Formulario principal con tres columnas: datos, imagen y resumen */}
      <form onSubmit={handleSubmit}>
        {/* Diseño en 3 columnas: 2 para los datos y 1 para imagen/resumen/acciones */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna izquierda: información general y variantes */}
          <div className="lg:col-span-2 space-y-6">
            {/* Información general: nombre, tipo, categoría, precio y stock */}
            <Card>
              {/* Encabezado de la tarjeta con el título "Información General" */}
              <CardHeader>
                <CardTitle>Información General</CardTitle>
              </CardHeader>
              {/* Contenido de la tarjeta con los campos del formulario */}
              <CardContent className="space-y-4">
                {/* Campo de texto para el nombre del producto, obligatorio */}
                <div>
                  {/* Etiqueta y campo de entrada para el nombre del producto */}
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Nombre del Producto *
                  </label>
                  {/* Input de texto controlado por el estado formData.nombre */}
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
                
                {/* Campos de selección para tipo de producto y categoría, obligatorios */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Campo de selección para el tipo de producto (camisa, pantalón, overol, chaleco) */}
                  <div>
                    {/* Etiqueta y select para el tipo de producto */}
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Tipo de Producto *
                    </label>
                    {/* Select controlado por el estado formData.tipo, con opciones predefinidas */}
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
                      {/* Opciones de tipo de producto: camisa, pantalón, overol, chaleco */}
                      <option value="camisa">Camisa</option>
                      <option value="pantalon">Pantalón</option>
                      <option value="overol">Overol</option>
                      <option value="chaleco">Chaleco</option>
                    </select>
                  </div>
                  
                  {/* Campo de texto para la categoría del producto, obligatorio */}
                  <div>
                    {/* Etiqueta y campo de entrada para la categoría del producto */}
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Categoría *
                    </label>
                    {/* Input de texto controlado por el estado formData.categoria */}
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
                
                {/* Campos de precio y stock inicial, obligatorios */}
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
                  {/* Campo de stock inicial, obligatorio */}
                  <div>
                    {/* Etiqueta y campo de entrada para el stock inicial del producto */}
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Stock Inicial
                    </label>
                    {/* Input de número controlado por el estado formData.stock */}
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
              {/* Encabezado de la tarjeta con el título "Variantes" */}
              <CardHeader>
                <CardTitle>Variantes</CardTitle>
              </CardHeader>
              {/* Contenido de la tarjeta con los campos de tallas y colores */}
              <CardContent className="space-y-6">
                {/* Sección de tallas disponibles con un select y un botón para agregar */}
                <div>
                  {/* Etiqueta para la sección de tallas disponibles */}
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Tallas Disponibles
                  </label>
                  {/* Contenedor flex para el select de tallas y el botón de agregar */}
                  <div className="flex gap-2 mb-3">
                    {/* Select controlado por el estado nuevaTalla, con opciones filtradas para no mostrar las ya agregadas */}
                    <select
                      value={nuevaTalla}
                      onChange={(e) => setNuevaTalla(e.target.value)}
                      className="flex-1 px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {/* Opción por defecto para indicar que se debe seleccionar una talla */}
                      <option value="">Seleccionar talla</option>
                      {/* Mapea las tallas disponibles que aún no están en formData.tallas a opciones del select */}
                      {tallasDisponibles
                        .filter((t) => !formData.tallas.includes(t))
                        .map((talla) => (
                          // Mapea cada talla disponible a una opción del select, usando la talla como key y value */}
                          <option key={talla} value={talla}>
                            {talla}
                          </option>
                        ))}
                    </select>
                    {/* Botón para agregar la talla seleccionada al formulario */}
                    <button
                      type="button"
                      onClick={() => agregarTalla(nuevaTalla)}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      Agregar
                    </button>
                  </div>
                  {/* Contenedor para mostrar las tallas agregadas como etiquetas con botón de eliminar */}
                  <div className="flex flex-wrap gap-2">
                    {/* Mapea las tallas agregadas en formData.tallas a etiquetas con botón de eliminar */}
                    {formData.tallas.map((talla) => (
                      // Etiqueta que muestra la talla y un botón para eliminarla, usando la talla como key */}
                      <span
                        key={talla}
                        className="inline-flex items-center gap-2 px-3 py-1 bg-secondary text-foreground rounded-lg"
                      >
                        {talla}
                        {/* Botón para eliminar la talla del formulario, con icono X */}
                        <button
                          type="button"
                          onClick={() => eliminarTalla(talla)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </span>
                    ))}
                    {/* Mensaje que se muestra si no hay tallas agregadas, con texto atenuado */}
                    {formData.tallas.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No hay tallas agregadas
                      </p>
                    )}
                  </div>
                </div>
                {/* Sección de colores disponibles con un select y un botón para agregar */}
                <div>
                  {/* Etiqueta para la sección de colores disponibles */}
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Colores Disponibles
                  </label>
                  {/* Contenedor flex para el select de colores y el botón de agregar */}
                  <div className="flex gap-2 mb-3">
                    {/* Select controlado por el estado nuevoColor, con opciones filtradas para no mostrar los ya agregados */}
                    <select
                      value={nuevoColor}
                      onChange={(e) => setNuevoColor(e.target.value)}
                      className="flex-1 px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {/* Opción por defecto para indicar que se debe seleccionar un color */}
                      <option value="">Seleccionar color</option>
                      {/* Mapea los colores disponibles que aún no están en formData.colores a opciones del select */}
                      {coloresDisponibles
                        .filter((c) => !formData.colores.includes(c))
                        .map((color) => (
                          <option key={color} value={color}>
                            {color}
                          </option>
                        ))}
                    </select>
                    {/* Botón para agregar el color seleccionado al formulario */}
                    <button
                      type="button"
                      onClick={() => agregarColor(nuevoColor)}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      Agregar
                    </button>
                  </div>
                  {/* Contenedor para mostrar los colores agregados como etiquetas con botón de eliminar */}
                  <div className="flex flex-wrap gap-2">
                    {/* Mapea los colores agregados en formData.colores a etiquetas con botón de eliminar */}
                    {formData.colores.map((color) => (
                      // Etiqueta que muestra el color y un botón para eliminarlo, usando el color como key */}
                      <span
                        key={color}
                        className="inline-flex items-center gap-2 px-3 py-1 bg-secondary text-foreground rounded-lg"
                      >
                        {color}
                        {/* Botón para eliminar el color del formulario, con icono X */}
                        <button
                          type="button"
                          onClick={() => eliminarColor(color)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </span>
                    ))}
                    {/* Mensaje que se muestra si no hay colores agregados, con texto atenuado */}
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
          
          {/* Columna derecha: zona de imagen y resumen del producto */}
          <div className="space-y-6">
            {/* Zona de carga de imagen (solo visual, aún sin funcionalidad) */}
            <Card>
              {/* Encabezado de la tarjeta con el título "Imagen de Referencia" */}
              <CardHeader>
                <CardTitle>Imagen de Referencia</CardTitle>
              </CardHeader>
              {/* Contenido de la tarjeta con un área de carga de imagen simulada */}
              <CardContent>
                {/* Contenedor con borde punteado, centrado y con efecto hover para indicar que se puede subir una imagen */}
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer">
                  {/* Icono de imagen dentro de un círculo, centrado */}
                  <div className="w-16 h-16 bg-secondary rounded-full mx-auto mb-4 flex items-center justify-center">
                    {/* Icono SVG de una imagen, con tamaño y color atenuado */}
                    <svg
                      className="w-8 h-8 text-muted-foreground"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      {/* Dibujo del icono de imagen con líneas redondeadas y un trazo de 2px */}
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  {/* Texto que indica al usuario que haga clic para subir una imagen */}
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
              {/* Encabezado de la tarjeta con el título "Resumen" */}
              <CardHeader>
                <CardTitle>Resumen</CardTitle>
              </CardHeader>
              {/* Contenido de la tarjeta con un resumen en vivo de las tallas, colores, precio y stock */}
              <CardContent className="space-y-3">
                {/* Cada línea del resumen muestra un campo y su valor correspondiente */}
                <div className="flex justify-between">
                  {/* Muestra el número de tallas agregadas al producto */}
                  <span className="text-muted-foreground">Tallas:</span>
                  <span className="font-medium">{formData.tallas.length}</span>
                </div>
                <div className="flex justify-between">
                  {/* Muestra el número de colores agregados al producto */}
                  <span className="text-muted-foreground">Colores:</span>
                  <span className="font-medium">{formData.colores.length}</span>
                </div>
                <div className="flex justify-between">
                  {/* Muestra el precio del producto formateado a dos decimales */}
                  <span className="text-muted-foreground">Precio:</span>
                  <span className="font-medium">${formData.precio.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  {/* Muestra el stock del producto seguido de "uds" */}
                  <span className="text-muted-foreground">Stock:</span>
                  <span className="font-medium">{formData.stock} uds</span>
                </div>
              </CardContent>
            </Card>

            {/* Botones de acción: Guardar y Cancelar */}
            <div className="flex gap-3">
              {/* Botón de envío del formulario con icono de guardar */}
              <button
                type="submit"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Save className="w-5 h-5" />
                Guardar
              </button>
              {/* Enlace para cancelar y volver al inventario de productos */}
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
