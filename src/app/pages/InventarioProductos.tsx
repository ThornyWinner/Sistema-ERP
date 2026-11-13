/**
 * InventarioProductos.tsx — Inventario de productos terminados (ruta /inventario/productos).
 *
 * Tabla con todos los productos del catálogo: tipo, tallas, colores, stock total,
 * precio y categoría. Permite buscar por nombre/categoría y filtrar por tipo de prenda.
 * Cada fila enlaza al formulario de edición y el botón superior al de alta.
 * Debajo, una tarjeta por tipo de prenda con el número de productos y el stock total.
 */
import { useState } from "react";
import { useBusquedaUrl } from "../hooks/useBusquedaUrl";
import { Card, CardContent, CardHeader } from "../components/Card";
import { useErpData } from "../context/ErpDataContext";
import { Search, Plus, Edit, Image as ImageIcon } from "lucide-react";
import { Link } from "react-router";

export default function InventarioProductos() {
  // Productos reales de Supabase (alias mockProductos del prototipo).
  const { productos: mockProductos } = useErpData();
  // Texto de búsqueda y filtro por tipo de prenda ("all" = todos).
  const [searchTerm, setSearchTerm] = useBusquedaUrl();
  // Estado para el filtro por tipo de prenda, inicializado en "all" (todos los tipos).
  const [filterTipo, setFilterTipo] = useState<string>("all");

  // Productos que cumplen ambos criterios: búsqueda y tipo.
  const filteredProductos = mockProductos.filter((producto) => {
    // Coincidencia con el término de búsqueda (nombre o categoría, insensible a mayúsculas).
    const matchesSearch =
      producto.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      producto.categoria.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Coincidencia con el filtro de tipo de prenda (o todos si filterTipo es "all").
    const matchesTipo = filterTipo === "all" || producto.tipo === filterTipo;

    // Devuelve true si el producto cumple ambos criterios, false si no.
    return matchesSearch && matchesTipo;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado con botón para dar de alta un producto */}
      <div className="flex items-center justify-between">
        {/* Título y subtítulo */}
        <div>
          <h1>Inventario de Productos</h1>
          <p className="text-muted-foreground mt-1">
            Uniformes terminados listos para venta
          </p>
        </div>
        {/* Botón para dar de alta un nuevo producto, enlaza a /productos/nuevo */}
        <Link
          to="/productos/nuevo"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nuevo Producto
        </Link>
      </div>

      {/* Filtros + tabla de productos */}
      <Card>
        {/* Encabezado con barra de búsqueda y filtro por tipo de prenda */}
        <CardHeader>
          {/* Contenedor flexible que se adapta a pantallas pequeñas y grandes */}
          <div className="flex flex-col md:flex-row gap-4">
            {/* Barra de búsqueda con icono de lupa a la izquierda */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar productos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            {/* Filtro por tipo de prenda */}
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
              className="px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {/* Opciones del filtro: todos, camisa, pantalón, overol, chaleco */}
              <option value="all">Todos los tipos</option>
              <option value="camisa">Camisas</option>
              <option value="pantalon">Pantalones</option>
              <option value="overol">Overoles</option>
              <option value="chaleco">Chalecos</option>
              <option value="otro">Otros</option>
            </select>
          </div>
        </CardHeader>
        {/* Contenido de la tarjeta: tabla de productos */}
        <CardContent className="p-0">
          {/* Contenedor con scroll horizontal si la tabla es más ancha que el contenedor */}
          <div className="overflow-x-auto">
            {/* Tabla con encabezados y filas de productos filtrados */}
            <table className="w-full">
              {/* Encabezado de la tabla con fondo secundario */}
              <thead className="bg-secondary">
                {/* Fila de encabezados con columnas: Producto, Tipo, Tallas, Colores, Stock, Precio, Categoría, Acciones */}
                <tr>
                  {/* Cada encabezado tiene padding, alineación a la izquierda, texto en mayúsculas y espaciado entre letras */}
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Producto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Tallas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Colores
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Stock
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Precio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Categoría
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              {/* Cuerpo de la tabla con filas de productos filtrados */}
              <tbody className="divide-y divide-border">
                {/* Mapea cada producto filtrado a una fila de la tabla */}
                {filteredProductos.map((producto) => (
                  // Cada fila tiene un key único (producto.id) y cambia de color al pasar el mouse por encima */}
                  <tr
                    key={producto.id}
                    className="hover:bg-secondary/50 transition-colors"
                  >
                    {/* Columna de nombre del producto */}
                    <td className="px-6 py-4">
                      {/* Miniatura de la imagen de referencia (o icono si no tiene) y nombre */}
                      <div className="flex items-center gap-3">
                        {producto.imagen ? (
                          <img
                            src={producto.imagen}
                            alt=""
                            loading="lazy"
                            className="w-10 h-10 rounded-md object-cover bg-secondary flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                            <ImageIcon className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <span className="font-medium text-foreground">
                          {producto.nombre}
                        </span>
                      </div>
                    </td>
                    {/* Columna de tipo de prenda con fondo primario tenue y texto primario */}
                    <td className="px-6 py-4">
                      {/* Tipo de prenda en un span con estilo de etiqueta */}
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">
                        {producto.tipo}
                      </span>
                    </td>
                    {/* Columna de tallas: muestra hasta 3 tallas y un contador "+N" con las restantes */}
                    <td className="px-6 py-4">
                      {/* Muestra hasta 3 tallas y un contador "+N" con las restantes */}
                      <div className="flex flex-wrap gap-1">
                        {/* Mapea las primeras 3 tallas del producto a spans con estilo de etiqueta */}
                        {producto.tallas.slice(0, 3).map((talla) => (
                          // Cada talla se muestra en un span con fondo secundario, texto de primer plano, tamaño de fuente pequeño y bordes redondeados */}
                          <span
                            key={talla}
                            className="px-2 py-0.5 bg-secondary text-foreground text-xs rounded"
                          >
                            {talla}
                          </span>
                        ))}
                        {/* Si hay más de 3 tallas, muestra un contador "+N" con las tallas restantes */}
                        {producto.tallas.length > 3 && (
                          // Cada talla se muestra en un span con fondo secundario, texto de primer plano, tamaño de fuente pequeño y bordes redondeados */}
                          <span className="px-2 py-0.5 text-muted-foreground text-xs">
                            +{producto.tallas.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Columna de colores: muestra hasta 2 colores y un contador "+N" con los restantes */}
                    <td className="px-6 py-4">
                      {/* Muestra hasta 2 colores y un contador "+N" con los restantes */}
                      <div className="flex flex-wrap gap-1">
                        {/* Mapea los primeros 2 colores del producto a spans con estilo de etiqueta */}
                        {producto.colores.slice(0, 2).map((color) => (
                          // Cada color se muestra en un span con fondo secundario, texto de primer plano, tamaño de fuente pequeño y bordes redondeados */}
                          <span
                            key={color}
                            className="px-2 py-0.5 bg-secondary text-foreground text-xs rounded"
                          >
                            {color}
                          </span>
                        ))}
                        {/* Si hay más de 2 colores, muestra un contador "+N" con los colores restantes */}
                        {producto.colores.length > 2 && (
                          // Cada color se muestra en un span con fondo secundario, texto de primer plano, tamaño de fuente pequeño y bordes redondeados */}
                          <span className="px-2 py-0.5 text-muted-foreground text-xs">
                            +{producto.colores.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Columna de stock: muestra el stock total del producto con "uds" al final */}
                    <td className="px-6 py-4">
                      {/* Muestra el stock total del producto con "uds" al final */}
                      <span className="font-medium text-foreground">
                        {producto.stock} uds
                      </span>
                    </td>
                    {/* Columna de precio: muestra el precio del producto con 2 decimales y símbolo de dólar */}
                    <td className="px-6 py-4">
                      {/* Muestra el precio del producto con 2 decimales y símbolo de dólar */}
                      <span className="font-medium text-foreground">
                        ${producto.precio.toFixed(2)}
                      </span>
                    </td>
                    {/* Columna de categoría: muestra la categoría del producto */}
                    <td className="px-6 py-4 text-foreground">{producto.categoria}</td>
                    {/* Columna de acciones: enlace a la página de edición del producto */}
                    <td className="px-6 py-4">
                      {/* Enlace a la página de edición del producto con icono de lápiz y texto "Editar" */}
                      <Link
                        to={`/productos/editar/${producto.id}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Edit className="w-4 h-4" />
                        Editar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mensaje si no hay productos que cumplan los filtros */}
          {filteredProductos.length === 0 && (
            // Mensaje centrado con padding y texto atenuado */}
            <div className="p-12 text-center">
              {/* Párrafo con texto atenuado indicando que no se encontraron productos */}
              <p className="text-muted-foreground">
                No se encontraron productos con los filtros seleccionados
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumen por tipo de prenda: número de productos y stock acumulado */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-6">
        {/* Mapea cada tipo de prenda a una tarjeta con el número de productos y el stock total */}
        {["camisa", "pantalon", "overol", "chaleco", "otro"].map((tipo) => {
          // Filtra los productos por tipo y calcula el número de productos y el stock total
          const count = mockProductos.filter((p) => p.tipo === tipo).length;
          // Calcula el stock total sumando el stock de cada producto del tipo
          const totalStock = mockProductos
            .filter((p) => p.tipo === tipo)
            .reduce((acc, p) => acc + p.stock, 0);
          return (
            // Cada tarjeta tiene un key único (tipo) y muestra el tipo de prenda, el número de productos y el stock total
            <Card key={tipo}>
              {/* Encabezado de la tarjeta con el tipo de prenda en mayúsculas y color de primer plano */}
              <CardContent className="p-6">
                {/* Tipo de prenda en un párrafo con texto pequeño, color de texto atenuado y capitalizado */}
                <p className="text-sm text-muted-foreground mb-1">
                  {({ camisa: "Camisas", pantalon: "Pantalones", overol: "Overoles", chaleco: "Chalecos", otro: "Otros artículos" } as Record<string, string>)[tipo]}
                </p>
                {/* Número de productos del tipo de prenda en un párrafo con texto grande y negrita */}
                <p className="text-3xl font-semibold">{count}</p>
                {/* Stock total del tipo de prenda en un párrafo con texto pequeño, color de texto atenuado y margen superior */}
                <p className="text-sm text-muted-foreground mt-2">
                  Stock total: {totalStock} uds
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
