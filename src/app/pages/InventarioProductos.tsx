/**
 * InventarioProductos.tsx — Inventario de productos terminados (ruta /inventario/productos).
 *
 * Tabla con todos los productos del catálogo: tipo, tallas, colores, stock total,
 * precio y categoría. Permite buscar por nombre/categoría y filtrar por tipo de prenda.
 * Cada fila enlaza al formulario de edición y el botón superior al de alta.
 * Debajo, una tarjeta por tipo de prenda con el número de productos y el stock total.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader } from "../components/Card";
import { useErpData } from "../context/ErpDataContext";
import { Search, Plus, Edit } from "lucide-react";
import { Link } from "react-router";

export default function InventarioProductos() {
  // Productos reales de Supabase (alias mockProductos del prototipo).
  const { productos: mockProductos } = useErpData();
  // Texto de búsqueda y filtro por tipo de prenda ("all" = todos).
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("all");

  // Productos que cumplen ambos criterios: búsqueda y tipo.
  const filteredProductos = mockProductos.filter((producto) => {
    const matchesSearch =
      producto.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      producto.categoria.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesTipo = filterTipo === "all" || producto.tipo === filterTipo;

    return matchesSearch && matchesTipo;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado con botón para dar de alta un producto */}
      <div className="flex items-center justify-between">
        <div>
          <h1>Inventario de Productos</h1>
          <p className="text-muted-foreground mt-1">
            Uniformes terminados listos para venta
          </p>
        </div>
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
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4">
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
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
              className="px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">Todos los tipos</option>
              <option value="camisa">Camisas</option>
              <option value="pantalon">Pantalones</option>
              <option value="overol">Overoles</option>
              <option value="chaleco">Chalecos</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary">
                <tr>
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
              <tbody className="divide-y divide-border">
                {filteredProductos.map((producto) => (
                  <tr
                    key={producto.id}
                    className="hover:bg-secondary/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="font-medium text-foreground">
                        {producto.nombre}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">
                        {producto.tipo}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {/* Muestra hasta 3 tallas y un contador "+N" con las restantes */}
                      <div className="flex flex-wrap gap-1">
                        {producto.tallas.slice(0, 3).map((talla) => (
                          <span
                            key={talla}
                            className="px-2 py-0.5 bg-secondary text-foreground text-xs rounded"
                          >
                            {talla}
                          </span>
                        ))}
                        {producto.tallas.length > 3 && (
                          <span className="px-2 py-0.5 text-muted-foreground text-xs">
                            +{producto.tallas.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {/* Muestra hasta 2 colores y un contador "+N" con los restantes */}
                      <div className="flex flex-wrap gap-1">
                        {producto.colores.slice(0, 2).map((color) => (
                          <span
                            key={color}
                            className="px-2 py-0.5 bg-secondary text-foreground text-xs rounded"
                          >
                            {color}
                          </span>
                        ))}
                        {producto.colores.length > 2 && (
                          <span className="px-2 py-0.5 text-muted-foreground text-xs">
                            +{producto.colores.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-foreground">
                        {producto.stock} uds
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-foreground">
                        ${producto.precio.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-foreground">{producto.categoria}</td>
                    <td className="px-6 py-4">
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
          {filteredProductos.length === 0 && (
            <div className="p-12 text-center">
              <p className="text-muted-foreground">
                No se encontraron productos con los filtros seleccionados
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumen por tipo de prenda: número de productos y stock acumulado */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {["camisa", "pantalon", "overol", "chaleco"].map((tipo) => {
          const count = mockProductos.filter((p) => p.tipo === tipo).length;
          const totalStock = mockProductos
            .filter((p) => p.tipo === tipo)
            .reduce((acc, p) => acc + p.stock, 0);
          return (
            <Card key={tipo}>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground mb-1 capitalize">{tipo}s</p>
                <p className="text-3xl font-semibold">{count}</p>
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
