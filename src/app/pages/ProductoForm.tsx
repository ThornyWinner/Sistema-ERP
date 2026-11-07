/**
 * ProductoForm.tsx — Formulario de alta y edición de productos.
 *
 * Se usa en dos rutas:
 *  - /productos/nuevo        → modo creación (formulario vacío).
 *  - /productos/editar/:id   → modo edición (precarga los datos del producto con ese id).
 *
 * Campos: nombre, tipo de prenda, categoría, precio, stock inicial, tallas y colores
 * (seleccionados de listas predefinidas). La columna derecha incluye la imagen de
 * referencia (clic o arrastrar y soltar) y un resumen en vivo.
 *
 * Al guardar (lib/productos.ts → guardarProducto):
 *  - Alta: crea el producto y una variante por cada talla × color con el stock inicial.
 *  - Edición: actualiza datos, agrega/quita variantes y, si cambió, el precio.
 *  - La imagen se sube al bucket `productos` de Supabase Storage.
 * Solo el administrador primario puede crear o editar (permisos y RLS).
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import { ArrowLeft, Save, X, Lock } from "lucide-react";
import { useErpData } from "../context/ErpDataContext";
import { useAuth } from "../context/AuthContext";
import { hasPermission } from "../utils/permissions";
import ImagenProductoInput from "../components/ImagenProductoInput";
import { cargarCategorias, guardarProducto } from "../lib/productos";

export default function ProductoForm() {
  // Productos reales de Supabase (alias mockProductos del prototipo).
  const { productos: mockProductos, refresh } = useErpData();
  const { user } = useAuth();
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

  // Permiso de alta o edición sobre el inventario de productos.
  const puedeGuardar =
    !!user && hasPermission(user.rol, "/inventario/productos", isEditing ? "canEdit" : "canCreate");

  // Valores iniciales: los del producto existente o vacíos.
  const [formData, setFormData] = useState({
    nombre: productoExistente?.nombre || "",
    tipo: productoExistente?.tipo || "camisa",
    categoria: productoExistente?.categoria || "",
    precio: productoExistente?.precio || 0,
    stock: productoExistente?.stock || 0,
    tallas: productoExistente?.tallas || [],
    colores: productoExistente?.colores || [],
  });

  // Si se entra directo a /productos/editar/:id, los productos llegan después del
  // primer render: se rellena el formulario una sola vez cuando el producto aparece.
  const [cargadoId, setCargadoId] = useState<string | null>(productoExistente?.id ?? null);
  useEffect(() => {
    if (!productoExistente || cargadoId === productoExistente.id) return;
    setFormData({
      nombre: productoExistente.nombre,
      tipo: productoExistente.tipo,
      categoria: productoExistente.categoria === "Sin categoría" ? "" : productoExistente.categoria,
      precio: productoExistente.precio,
      stock: productoExistente.stock,
      tallas: productoExistente.tallas,
      colores: productoExistente.colores,
    });
    setCargadoId(productoExistente.id);
  }, [productoExistente, cargadoId]);

  // Imagen: archivo nuevo elegido y si se pidió quitar la imagen guardada.
  const [archivoImagen, setArchivoImagen] = useState<File | null>(null);
  const [quitarImagen, setQuitarImagen] = useState(false);
  const urlImagenActual = quitarImagen ? null : productoExistente?.imagen ?? null;

  const [guardando, setGuardando] = useState(false);

  // Categorías existentes, sugeridas al escribir (se puede escribir una nueva).
  const [categorias, setCategorias] = useState<string[]>([]);
  useEffect(() => {
    cargarCategorias().then(setCategorias).catch(() => setCategorias([]));
  }, []);

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

  // Guarda en Supabase (producto, variantes e imagen) y vuelve al inventario.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeGuardar || guardando) return;
    if (isEditing && !productoExistente) {
      toast.error("No se encontró el producto a editar");
      return;
    }
    if (!formData.nombre.trim()) {
      toast.error("El nombre del producto es obligatorio");
      return;
    }
    const precio = Number(formData.precio) || 0;
    const stockInicial = Math.max(Math.floor(Number(formData.stock) || 0), 0);
    if (precio < 0) {
      toast.error("El precio no puede ser negativo");
      return;
    }

    setGuardando(true);
    try {
      const resultado = await guardarProducto(
        {
          nombre: formData.nombre,
          tipo: formData.tipo,
          categoria: formData.categoria,
          precio,
          stockInicial,
          tallas: formData.tallas,
          colores: formData.colores,
        },
        archivoImagen
          ? { tipo: "nueva", archivo: archivoImagen }
          : quitarImagen
            ? { tipo: "quitar" }
            : { tipo: "sin_cambio" },
        productoExistente ?? undefined
      );

      toast.success(isEditing ? "Producto actualizado" : `Producto "${formData.nombre.trim()}" creado`);
      if (resultado.variantesConservadas > 0) {
        toast.warning(
          `${resultado.variantesConservadas} combinación(es) de talla/color no se eliminaron porque tienen stock o ya se usaron en órdenes`
        );
      }
      if (resultado.errorImagen) {
        toast.error(`El producto se guardó, pero la imagen no: ${resultado.errorImagen}`);
      }
      await refresh();
      navigate("/inventario/productos");
    } catch (err: any) {
      toast.error(`No se pudo guardar el producto: ${err.message}`);
    } finally {
      setGuardando(false);
    }
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

      {/* Aviso cuando el rol no puede crear/editar productos */}
      {!puedeGuardar && (
        <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-lg p-4 flex items-start gap-3">
          <Lock className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">Modo solo lectura</p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              Tu rol no puede {isEditing ? "editar" : "crear"} productos.
            </p>
          </div>
        </div>
      )}

      {/* Formulario principal con tres columnas: datos, imagen y resumen */}
      <form onSubmit={handleSubmit}>
        <fieldset disabled={!puedeGuardar || guardando}>
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
                      list="categorias-producto"
                      required
                    />
                    {/* Sugerencias de categorías existentes; si se escribe una nueva, se crea al guardar */}
                    <datalist id="categorias-producto">
                      {categorias.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
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
                      {isEditing ? "Stock Total" : "Stock Inicial por Variante"}
                    </label>
                    {/* En edición el stock es de solo lectura: cada variante lleva el suyo */}
                    <input
                      type="number"
                      value={Number.isNaN(formData.stock) ? "" : formData.stock}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          stock: parseInt(e.target.value),
                        })
                      }
                      readOnly={isEditing}
                      className={`w-full px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                        isEditing ? "opacity-60 cursor-not-allowed" : ""
                      }`}
                      placeholder="0"
                      min="0"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {isEditing
                        ? "Suma de todas las variantes. Las tallas/colores nuevos inician en 0."
                        : "Se asigna a cada combinación de talla y color."}
                    </p>
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
            {/* Imagen de referencia: clic o arrastrar; se sube a Supabase al guardar */}
            <Card>
              <CardHeader>
                <CardTitle>Imagen de Referencia</CardTitle>
              </CardHeader>
              <CardContent>
                <ImagenProductoInput
                  urlActual={urlImagenActual}
                  archivo={archivoImagen}
                  deshabilitado={!puedeGuardar || guardando}
                  onElegir={(archivo) => {
                    setArchivoImagen(archivo);
                    setQuitarImagen(false);
                  }}
                  onQuitar={() => {
                    // Si había un archivo nuevo sin guardar, solo se descarta ese;
                    // si no, se marca la imagen guardada para borrarse al guardar.
                    if (archivoImagen) setArchivoImagen(null);
                    else setQuitarImagen(true);
                  }}
                />
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
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Save className="w-5 h-5" />
                {guardando ? "Guardando..." : "Guardar"}
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
        </fieldset>
      </form>
    </div>
  );
}
