import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import WorkflowStepper from "../components/WorkflowStepper";
import NuevaOrdenMultiProducto from "../components/NuevaOrdenMultiProducto";
import VentaRapidaDialog from "../components/VentaRapidaDialog";
import { Orden } from "../data/mockData";
import { Search, Plus, Calendar, User, Filter, Zap } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { useErpData } from "../context/ErpDataContext";

export default function Ordenes() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { ordenes, productos, crearOrden } = useErpData();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEstado, setFilterEstado] = useState<string>("all");
  const [filterVendedor, setFilterVendedor] = useState<string>("all");
  const [showNuevaOrden, setShowNuevaOrden] = useState(false);
  const [showVentaRapida, setShowVentaRapida] = useState(false);

  // Filtrar órdenes según el rol del usuario
  const ordenesVisibles = user?.rol === "vendedor"
    ? ordenes.filter((o) => o.vendedorId === user.id)
    : ordenes;

  const vendedoresUnicos = Array.from(
    new Set(ordenesVisibles.map((o) => o.vendedor))
  ).sort();

  const filteredOrdenes = ordenesVisibles.filter((orden) => {
    const matchesSearch =
      orden.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
      orden.cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
      orden.vendedor.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesEstado = filterEstado === "all" || orden.estado === filterEstado;
    const matchesVendedor = filterVendedor === "all" || orden.vendedor === filterVendedor;

    return matchesSearch && matchesEstado && matchesVendedor;
  });

  const getProgresoTotal = (orden: Orden) => {
    if (!orden.productos || orden.productos.length === 0) return 100;

    const todosLosTalleres = orden.productos.flatMap((p) => p.talleres);
    if (todosLosTalleres.length === 0) return 100;

    const talleresCompletados = orden.productos.reduce((acc, producto) => {
      const completados = producto.talleres.filter(
        (t) => producto.progreso[t] === "completed"
      ).length;
      return acc + completados;
    }, 0);

    return Math.round((talleresCompletados / todosLosTalleres.length) * 100);
  };

  const handleNuevaOrden = async (nuevaOrden: Orden) => {
    try {
      const folio = await crearOrden(nuevaOrden);
      toast.success("Orden creada exitosamente", {
        description: `${folio} - ${nuevaOrden.cliente}`,
      });
    } catch (err) {
      toast.error("No se pudo crear la orden", {
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  };

  const getTipoVentaColor = (tipo: string) => {
    switch (tipo) {
      case "directa":
        return "bg-orange-500/10 text-orange-600 border-orange-500/20";
      case "fabricacion":
        return "bg-green-500/10 text-green-600 border-green-500/20";
      case "comercializacion":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "mixta":
        return "bg-purple-500/10 text-purple-600 border-purple-500/20";
      default:
        return "bg-gray-500/10 text-gray-600 border-gray-500/20";
    }
  };

  const getTipoVentaLabel = (tipo: string) => {
    switch (tipo) {
      case "directa":
        return "Venta Directa";
      case "fabricacion":
        return "Fabricación";
      case "comercializacion":
        return "Comercialización";
      case "mixta":
        return "Mixta";
      default:
        return tipo;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Órdenes de Producción</h1>
          <p className="text-muted-foreground mt-1">
            Gestión de órdenes activas y en proceso
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowVentaRapida(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            <Zap className="w-5 h-5" />
            Venta Rápida
          </button>
          <button
            onClick={() => setShowNuevaOrden(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nueva Orden
          </button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar por número, cliente, producto o vendedor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-2 flex-1">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <select
                  value={filterEstado}
                  onChange={(e) => setFilterEstado(e.target.value)}
                  className="flex-1 px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">Todos los estados</option>
                  <option value="pending">Pendiente</option>
                  <option value="in-progress">En Proceso</option>
                  <option value="completed">Completado</option>
                </select>
              </div>
              <div className="flex items-center gap-2 flex-1">
                <User className="w-4 h-4 text-muted-foreground" />
                <select
                  value={filterVendedor}
                  onChange={(e) => setFilterVendedor(e.target.value)}
                  className="flex-1 px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">Todos los vendedores</option>
                  {vendedoresUnicos.map((vendedor) => (
                    <option key={vendedor} value={vendedor}>
                      {vendedor}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Orden
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Tipo Venta
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Vendedor / Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Productos
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Total / Pago
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Entrega
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredOrdenes.map((orden) => {
                  const progreso = getProgresoTotal(orden);
                  const diasRestantes = Math.ceil(
                    (new Date(orden.fechaEntrega).getTime() - new Date().getTime()) /
                      (1000 * 60 * 60 * 24)
                  );
                  const cantidadTotal = orden.productos?.reduce(
                    (acc, p) => acc + p.cantidad,
                    0
                  ) || 0;

                  return (
                    <tr
                      key={orden.id}
                      onClick={() => navigate(`/ordenes/${orden.id}`)}
                      className="hover:bg-secondary/50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <span className="font-medium text-foreground">
                            {orden.numero}
                          </span>
                          {orden.prioridad === "alta" && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-status-pending-bg text-status-pending-text">
                              Alta
                            </span>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(orden.fechaCreacion).toLocaleDateString()}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getTipoVentaColor(
                            orden.tipoVenta
                          )}`}
                        >
                          {getTipoVentaLabel(orden.tipoVenta)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              {orden.vendedor}
                            </span>
                          </div>
                          <p className="font-medium text-foreground mt-1">
                            {orden.cliente}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-foreground">
                            {orden.productos?.length || 0}{" "}
                            {(orden.productos?.length || 0) === 1 ? "producto" : "productos"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {cantidadTotal} unidades
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-foreground">
                            ${(orden.total || 0).toLocaleString()}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                orden.estadoPago === "liquidado"
                                  ? "bg-status-completed text-status-completed-text"
                                  : orden.estadoPago === "anticipo"
                                  ? "bg-status-in-progress text-status-in-progress-text"
                                  : "bg-status-pending-bg text-status-pending-text"
                              }`}
                            >
                              {orden.estadoPago === "liquidado"
                                ? "Pagado"
                                : orden.estadoPago === "anticipo"
                                ? `Anticipo: $${(orden.anticipo || 0).toLocaleString()}`
                                : "Pendiente"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-foreground">
                              {new Date(orden.fechaEntrega).toLocaleDateString()}
                            </p>
                            <p
                              className={`text-xs ${
                                diasRestantes < 3
                                  ? "text-status-pending"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {diasRestantes > 0
                                ? `${diasRestantes} días`
                                : diasRestantes === 0
                                ? "Hoy"
                                : "Vencida"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-2">
                          <StatusBadge status={orden.estado} size="sm" />
                          {orden.tipoVenta !== "directa" && (
                            <span className="text-xs text-muted-foreground">
                              {progreso}%
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredOrdenes.length === 0 && (
            <div className="p-12 text-center">
              <p className="text-muted-foreground">
                No se encontraron órdenes con los filtros seleccionados
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Órdenes por Prioridad</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {["alta", "media", "baja"].map((prioridad) => {
                const count = ordenes.filter((o) => o.prioridad === prioridad).length;
                return (
                  <div
                    key={prioridad}
                    className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                  >
                    <span className="capitalize font-medium">{prioridad}</span>
                    <span className="text-2xl font-semibold">{count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximas Entregas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ordenes
                .slice(0, 3)
                .sort(
                  (a, b) =>
                    new Date(a.fechaEntrega).getTime() -
                    new Date(b.fechaEntrega).getTime()
                )
                .map((orden) => {
                  const diasRestantes = Math.ceil(
                    (new Date(orden.fechaEntrega).getTime() - new Date().getTime()) /
                      (1000 * 60 * 60 * 24)
                  );
                  return (
                    <div
                      key={orden.id}
                      className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{orden.numero}</p>
                        <p className="text-sm text-muted-foreground">{orden.cliente}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">
                          {new Date(orden.fechaEntrega).toLocaleDateString()}
                        </p>
                        <p
                          className={`text-sm ${
                            diasRestantes < 3
                              ? "text-status-pending"
                              : "text-muted-foreground"
                          }`}
                        >
                          {diasRestantes} días
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </div>

      <NuevaOrdenMultiProducto
        isOpen={showNuevaOrden}
        onClose={() => setShowNuevaOrden(false)}
        onSubmit={handleNuevaOrden}
      />

      <VentaRapidaDialog
        isOpen={showVentaRapida}
        onClose={() => setShowVentaRapida(false)}
        onSubmit={handleNuevaOrden}
        productos={productos}
      />
    </div>
  );
}
