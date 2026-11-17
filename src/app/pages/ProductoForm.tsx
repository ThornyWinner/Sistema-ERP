/**
 * ProductoForm.tsx — Formulario de alta y edición de productos.
 *
 * Se usa en dos rutas:
 *  - /productos/nuevo        → modo creación (formulario vacío).
 *  - /productos/editar/:id   → modo edición (precarga los datos del producto con ese id).
 *
 * Campos: nombre, tipo de prenda, categoría, precio, stock inicial, descripción
 * (composición, qué incluye, notas) y variantes: cortes, mangas, tallas y colores. La columna derecha incluye la imagen de
 * referencia (clic o arrastrar y soltar) y un resumen en vivo.
 *
 * Al guardar (lib/productos.ts → guardarProducto):
 *  - Alta: crea una variante por cada corte × manga × talla × color con el stock inicial.
 *  - Edición: actualiza datos, agrega/quita variantes y, si cambió, el precio.
 *  - La imagen se sube al bucket `productos` de Supabase Storage.
 * Solo el administrador primario puede crear o editar (permisos y RLS).
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import { ArrowLeft, Save, X, Lock } from "lucide-react";
import { useErpData } from "../context/ErpDataContext";
import { useAuth } from "../context/AuthContext";
import { hasPermission } from "../utils/permissions";
import ImagenProductoInput from "../components/ImagenProductoInput";
import { CORTES, MANGAS, TIPOS_PRENDA } from "../data/mockData";
import {
  cargarCategorias,
  cargarFiscalProducto,
  combinacionesDeseadas,
  guardarProducto,
  type DatosFiscalesProducto,
} from "../lib/productos";
import { CLAVES_PROD_SERV, CLAVES_UNIDAD, OBJETOS_IMPUESTO, etiquetaSat } from "../lib/sat";

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
    cortes: productoExistente?.cortes || [],
    mangas: productoExistente?.mangas || [],
    tallas: productoExistente?.tallas || [],
    colores: productoExistente?.colores || [],
    composicion: productoExistente?.composicion || "",
    incluye: productoExistente?.incluye || "",
    notas: productoExistente?.notas || "",
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
      cortes: productoExistente.cortes,
      mangas: productoExistente.mangas,
      tallas: productoExistente.tallas,
      colores: productoExistente.colores,
      composicion: productoExistente.composicion ?? "",
      incluye: productoExistente.incluye ?? "",
      notas: productoExistente.notas ?? "",
    });
    setCargadoId(productoExistente.id);
  }, [productoExistente, cargadoId]);

  // Imagen: archivo nuevo elegido y si se pidió quitar la imagen guardada.
  const [archivoImagen, setArchivoImagen] = useState<File | null>(null);
  const [quitarImagen, setQuitarImagen] = useState(false);
  const urlImagenActual = quitarImagen ? null : productoExistente?.imagen ?? null;

  const [guardando, setGuardando] = useState(false);

  // Datos para facturar (CFDI 4.0). Se leen aparte porque no vienen en la carga general.
  const [fiscal, setFiscal] = useState<DatosFiscalesProducto>({
    codigo: "",
    clave_prod_serv: "",
    clave_unidad: "H87",
    unidad_medida: "Pieza",
    objeto_imp: "02",
  });
  useEffect(() => {
    if (!id) return;
    cargarFiscalProducto(id)
      .then((d) => d && setFiscal({
        codigo: d.codigo ?? "",
        clave_prod_serv: d.clave_prod_serv ?? "",
        clave_unidad: d.clave_unidad ?? "H87",
        unidad_medida: d.unidad_medida ?? "Pieza",
        objeto_imp: d.objeto_imp ?? "02",
      }))
      .catch(() => undefined);
  }, [id]);

  // Categorías existentes, sugeridas al escribir (se puede escribir una nueva).
  const [categorias, setCategorias] = useState<string[]>([]);
  useEffect(() => {
    cargarCategorias().then(setCategorias).catch(() => setCategorias([]));
  }, []);

  // Sugerencias de tallas y colores: las que ya se usan en el catálogo (se puede escribir otra).
  const tallasCatalogo = useMemo(
    () => [...new Set(mockProductos.flatMap((p) => p.tallas))].sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
    [mockProductos]
  );
  const coloresCatalogo = useMemo(
    () => [...new Set(mockProductos.flatMap((p) => p.colores))].sort((a, b) => a.localeCompare(b, "es")),
    [mockProductos]
  );

  // Variantes que quedarían al guardar (para el resumen).
  const totalVariantes = useMemo(
    () => combinacionesDeseadas(formData, productoExistente?.variantes).length,
    [formData, productoExistente]
  );

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
    if (fiscal.clave_prod_serv && !/^[0-9]{8}$/.test(fiscal.clave_prod_serv)) {
      toast.error("La clave SAT de producto o servicio lleva 8 dígitos");
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
          cortes: formData.cortes,
          mangas: formData.mangas,
          tallas: formData.tallas,
          colores: formData.colores,
          composicion: formData.composicion,
          incluye: formData.incluye,
          notas: formData.notas,
          fiscal: {
            codigo: fiscal.codigo?.trim() || null,
            clave_prod_serv: fiscal.clave_prod_serv || null,
            clave_unidad: fiscal.clave_unidad.trim().toUpperCase() || "H87",
            unidad_medida: fiscal.unidad_medida.trim() || "Pieza",
            objeto_imp: fiscal.objeto_imp,
          },
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
          `${resultado.variantesConservadas} variante(s) no se eliminaron porque tienen stock o ya se usaron en órdenes`
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
                      {TIPOS_PRENDA.map((t) => (
                        <option key={t.valor} value={t.valor}>
                          {t.etiqueta}
                        </option>
                      ))}
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

            {/* Datos fiscales para facturar (claves del catálogo del SAT) */}
            <Card>
              <CardHeader>
                <CardTitle>Datos para facturar (CFDI)</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Código del producto</label>
                  <input
                    type="text"
                    value={fiscal.codigo ?? ""}
                    onChange={(e) => setFiscal({ ...fiscal, codigo: e.target.value })}
                    className="w-full px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="Ej: 1012"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Clave SAT producto/servicio</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={8}
                    list="sat-prodserv-producto"
                    value={fiscal.clave_prod_serv ?? ""}
                    onChange={(e) => setFiscal({ ...fiscal, clave_prod_serv: e.target.value.replace(/\D/g, "") })}
                    className="w-full px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="Ej: 53102700"
                  />
                  <datalist id="sat-prodserv-producto">
                    {CLAVES_PROD_SERV.map((c) => (
                      <option key={c.clave} value={c.clave}>
                        {c.descripcion}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Clave unidad SAT</label>
                  <input
                    type="text"
                    list="sat-unidad-producto"
                    value={fiscal.clave_unidad}
                    onChange={(e) => setFiscal({ ...fiscal, clave_unidad: e.target.value.toUpperCase() })}
                    className="w-full px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <datalist id="sat-unidad-producto">
                    {CLAVES_UNIDAD.map((u) => (
                      <option key={u.clave} value={u.clave}>
                        {u.descripcion}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Unidad de medida</label>
                  <input
                    type="text"
                    value={fiscal.unidad_medida}
                    onChange={(e) => setFiscal({ ...fiscal, unidad_medida: e.target.value })}
                    className="w-full px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-2">Objeto de impuesto</label>
                  <select
                    value={fiscal.objeto_imp}
                    onChange={(e) => setFiscal({ ...fiscal, objeto_imp: e.target.value })}
                    className="w-full px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {OBJETOS_IMPUESTO.map((o) => (
                      <option key={o.clave} value={o.clave}>
                        {etiquetaSat(o)}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Ficha técnica del producto */}
            <Card>
              <CardHeader>
                <CardTitle>Descripción</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(
                  [
                    ["composicion", "Composición de la tela", "Ej: 4.20 oz · Oxford · 60% Algodón 40% Poliéster"],
                    ["incluye", "Qué incluye", "Ej: Bordado tamaño bolsillo"],
                    ["notas", "Notas", "Decorado sugerido, características, aclaraciones…"],
                  ] as const
                ).map(([campo, etiqueta, ejemplo]) => (
                  <div key={campo}>
                    <label className="block text-sm font-medium text-foreground mb-2">{etiqueta}</label>
                    <textarea
                      value={formData[campo]}
                      onChange={(e) => setFormData({ ...formData, [campo]: e.target.value })}
                      rows={campo === "notas" ? 3 : 2}
                      className="w-full px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder={ejemplo}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Variantes: corte × manga × talla × color. Una lista vacía = no aplica. */}
            <Card>
              <CardHeader>
                <CardTitle>Variantes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <ListaValores
                  etiqueta="Cortes"
                  valores={formData.cortes}
                  opciones={[...CORTES]}
                  vacio="Sin corte (no aplica)"
                  onChange={(cortes) => setFormData({ ...formData, cortes })}
                />
                <ListaValores
                  etiqueta="Mangas"
                  valores={formData.mangas}
                  opciones={[...MANGAS]}
                  vacio="Sin manga (no aplica: pantalón, chaleco, accesorio…)"
                  onChange={(mangas) => setFormData({ ...formData, mangas })}
                />
                <ListaValores
                  etiqueta="Tallas"
                  valores={formData.tallas}
                  opciones={tallasCatalogo}
                  libre
                  vacio="No hay tallas agregadas"
                  onChange={(tallas) => setFormData({ ...formData, tallas })}
                />
                <ListaValores
                  etiqueta="Colores"
                  valores={formData.colores}
                  opciones={coloresCatalogo}
                  libre
                  vacio="No hay colores agregados"
                  onChange={(colores) => setFormData({ ...formData, colores })}
                />
                <p className="text-xs text-muted-foreground">
                  {isEditing
                    ? "Un valor nuevo se combina con las variantes que ya existen (p. ej. un color nuevo se crea en cada corte, manga y talla actuales). Al quitar un valor se eliminan sus variantes, salvo las que tengan stock o se hayan usado en órdenes."
                    : "Se crea una variante por cada combinación de corte, manga, talla y color."}
                </p>
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
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Cortes:</span>
                  <span className="font-medium text-right">{formData.cortes.join(", ") || "—"}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Mangas:</span>
                  <span className="font-medium text-right">{formData.mangas.join(", ") || "—"}</span>
                </div>
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
                  <span className="text-muted-foreground">Variantes:</span>
                  <span className="font-medium">{totalVariantes}</span>
                </div>
                <div className="flex justify-between">
                  {/* Muestra el precio del producto formateado a dos decimales */}
                  <span className="text-muted-foreground">Precio:</span>
                  <span className="font-medium">${(Number(formData.precio) || 0).toFixed(2)}</span>
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

/** Lista de valores de una dimensión (corte, manga, talla o color) como etiquetas con X. */
function ListaValores({
  etiqueta,
  valores,
  opciones,
  libre = false,
  vacio,
  onChange,
}: {
  etiqueta: string;
  valores: string[];
  opciones: string[];
  /** true: se puede escribir un valor que no esté en las opciones. */
  libre?: boolean;
  vacio: string;
  onChange: (valores: string[]) => void;
}) {
  const [nuevo, setNuevo] = useState("");
  const idLista = `opciones-${etiqueta.toLowerCase()}`;
  const disponibles = opciones.filter((o) => !valores.includes(o));
  const agregar = () => {
    const v = nuevo.trim();
    if (v && !valores.includes(v) && (libre || opciones.includes(v))) onChange([...valores, v]);
    setNuevo("");
  };
  const clase =
    "flex-1 min-w-0 px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-2">{etiqueta}</label>
      <div className="flex gap-2 mb-3">
        {libre ? (
          <>
            <input
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregar();
                }
              }}
              list={idLista}
              className={clase}
              placeholder="Escribir o elegir de la lista"
            />
            <datalist id={idLista}>
              {disponibles.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </>
        ) : (
          <select value={nuevo} onChange={(e) => setNuevo(e.target.value)} className={clase}>
            <option value="">Seleccionar</option>
            {disponibles.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={agregar}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          Agregar
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {valores.map((v) => (
          <span key={v} className="inline-flex items-center gap-2 px-3 py-1 bg-secondary text-foreground rounded-lg">
            {v}
            <button
              type="button"
              onClick={() => onChange(valores.filter((x) => x !== v))}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Quitar ${v}`}
            >
              <X className="w-4 h-4" />
            </button>
          </span>
        ))}
        {valores.length === 0 && <p className="text-sm text-muted-foreground">{vacio}</p>}
      </div>
    </div>
  );
}
