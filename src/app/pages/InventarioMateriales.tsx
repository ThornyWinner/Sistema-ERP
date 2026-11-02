/**
 * InventarioMateriales.tsx — Inventario de materia prima (ruta /inventario/materiales).
 *
 * Tabla de telas, hilos y accesorios con su stock, stock mínimo, proveedor y precio.
 * Un material está en "Stock Bajo" cuando stock < stockMinimo (se resalta en rojo).
 * Filtros: búsqueda por nombre/proveedor, tipo de material y nivel de stock.
 * Al final muestra: total de materiales, cuántos tienen stock bajo y el valor del
 * inventario (Σ stock × precio).
 *
 * El botón "Agregar Material" usa PermissionButton (deshabilitado si el rol no puede
 * crear) y el administrador secundario ve un aviso de modo solo lectura.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader } from "../components/Card";
import { useErpData } from "../context/ErpDataContext";
import { Search, Filter, Plus, AlertTriangle, Lock } from "lucide-react";
import PermissionButton from "../components/PermissionButton";
import { useAuth } from "../context/AuthContext";

export default function InventarioMateriales() {
  // Materiales reales de Supabase (alias mockMateriales del prototipo).
  const { materiales: mockMateriales } = useErpData();
  const { user } = useAuth();
  // Estado de los filtros: texto, tipo ("all" | tela | hilo | accesorio) y stock ("all" | bajo | normal).
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterStock, setFilterStock] = useState<string>("all");

  // Materiales que cumplen los tres filtros a la vez.
  const filteredMateriales = mockMateriales.filter((material) => {
    const matchesSearch =
      material.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      material.proveedor.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesTipo = filterTipo === "all" || material.tipo === filterTipo;

    const matchesStock =
      filterStock === "all" ||
      (filterStock === "bajo" && material.stock < material.stockMinimo) ||
      (filterStock === "normal" && material.stock >= material.stockMinimo);

    return matchesSearch && matchesTipo && matchesStock;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Aviso de solo lectura para el administrador secundario */}
      {user?.rol === 'admin_secundario' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <Lock className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-900">Modo Solo Lectura</p>
            <p className="text-sm text-yellow-700">
              Como administrador secundario, solo puedes visualizar la información. No puedes crear, editar o eliminar registros.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1>Inventario de Materiales</h1>
          <p className="text-muted-foreground mt-1">
            Gestión de telas, hilos y accesorios
          </p>
        </div>
        {/* Botón con control de permisos (por ahora sin acción de alta asociada) */}
        <PermissionButton
          requiredPermission="canCreate"
          className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-5 h-5" />
          Agregar Material
        </PermissionButton>
      </div>

      {/* Filtros + tabla de materiales */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por nombre o proveedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex gap-3">
              <select
                value={filterTipo}
                onChange={(e) => setFilterTipo(e.target.value)}
                className="px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">Todos los tipos</option>
                <option value="tela">Telas</option>
                <option value="hilo">Hilos</option>
                <option value="accesorio">Accesorios</option>
              </select>
              <select
                value={filterStock}
                onChange={(e) => setFilterStock(e.target.value)}
                className="px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">Todo el stock</option>
                <option value="bajo">Stock bajo</option>
                <option value="normal">Stock normal</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Material
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Stock
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Stock Mínimo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Proveedor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Precio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredMateriales.map((material) => {
                  // Alerta de reabastecimiento: existencia por debajo del mínimo.
                  const stockBajo = material.stock < material.stockMinimo;
                  return (
                    <tr
                      key={material.id}
                      className="hover:bg-secondary/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <span className="font-medium text-foreground">
                          {material.nombre}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-foreground capitalize">
                          {material.tipo}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`font-medium ${
                            stockBajo ? "text-status-pending" : "text-foreground"
                          }`}
                        >
                          {material.stock} {material.unidad}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {material.stockMinimo} {material.unidad}
                      </td>
                      <td className="px-6 py-4 text-foreground">
                        {material.proveedor}
                      </td>
                      <td className="px-6 py-4 text-foreground font-medium">
                        ${material.precio.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        {stockBajo ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-status-pending-bg text-status-pending-text">
                            <AlertTriangle className="w-3 h-3" />
                            Stock Bajo
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-status-completed-bg text-status-completed-text">
                            Normal
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredMateriales.length === 0 && (
            <div className="p-12 text-center">
              <p className="text-muted-foreground">
                No se encontraron materiales con los filtros seleccionados
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Indicadores calculados sobre todos los materiales (sin aplicar filtros) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Materiales</p>
                <p className="text-3xl font-semibold">{mockMateriales.length}</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-lg">
                <Filter className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Stock Bajo</p>
                <p className="text-3xl font-semibold text-status-pending">
                  {mockMateriales.filter((m) => m.stock < m.stockMinimo).length}
                </p>
              </div>
              <div className="p-3 bg-status-pending-bg rounded-lg">
                <AlertTriangle className="w-6 h-6 text-status-pending" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Valor Inventario</p>
                <p className="text-3xl font-semibold">
                  $
                  {mockMateriales
                    .reduce((acc, m) => acc + m.stock * m.precio, 0)
                    .toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-status-completed-bg rounded-lg">
                <Filter className="w-6 h-6 text-status-completed" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
