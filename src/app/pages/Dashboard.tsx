import { useState, useEffect } from "react";
import StatCard from "../components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import {
  Package,
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingUp,
  Shirt,
  Info,
  DollarSign,
  ShoppingCart,
  Users,
} from "lucide-react";
import { useErpData } from "../context/ErpDataContext";
import { Link } from "react-router";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { roleLabels } from "../utils/permissions";
import UserGuide from "../components/UserGuide";
import { Button } from "../components/ui/button";

export default function Dashboard() {
  const { ordenes: mockOrdenes, materiales: mockMateriales } = useErpData();
  const { user } = useAuth();
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    // Mostrar guía solo la primera vez que se accede
    const hasSeenGuide = localStorage.getItem(`guide_seen_${user?.id}`);
    if (!hasSeenGuide && user) {
      setShowGuide(true);
      localStorage.setItem(`guide_seen_${user.id}`, 'true');
    }
  }, [user]);

  // Filtrar órdenes según el rol del usuario
  const ordenesVisibles = user?.rol === "vendedor"
    ? mockOrdenes.filter((o) => o.vendedorId === user.id)
    : mockOrdenes;

  const ordenesEnProceso = ordenesVisibles.filter((o) => o.estado === "in-progress").length;
  const ordenesPendientes = ordenesVisibles.filter((o) => o.estado === "pending").length;
  const ordenesCompletadas = ordenesVisibles.filter((o) => o.estado === "completed").length;
  const materialesBajoStock = mockMateriales.filter((m) => m.stock < m.stockMinimo).length;

  // Nuevas métricas por tipo de venta
  const ventasDirectas = ordenesVisibles.filter((o) => o.tipoVenta === "directa").length;
  const ordenesEnFabricacion = ordenesVisibles.filter((o) => o.tipoVenta === "fabricacion").length;
  const ordenesComercializadas = ordenesVisibles.filter((o) => o.tipoVenta === "comercializacion").length;
  const ordenesMixtas = ordenesVisibles.filter((o) => o.tipoVenta === "mixta").length;

  // Métricas financieras
  const totalIngresos = ordenesVisibles.reduce((acc, o) => acc + (o.total || 0), 0);
  const totalAnticipos = ordenesVisibles.reduce((acc, o) => acc + (o.anticipo || 0), 0);
  const anticiposPendientes = ordenesVisibles
    .filter((o) => o.estadoPago === "anticipo")
    .reduce((acc, o) => acc + ((o.total || 0) - (o.anticipo || 0)), 0);

  // Ventas por vendedor
  const ventasPorVendedor = ordenesVisibles.reduce((acc, orden) => {
    const vendedor = orden.vendedor;
    if (!acc[vendedor]) {
      acc[vendedor] = { nombre: vendedor, total: 0, ordenes: 0 };
    }
    acc[vendedor].total += (orden.total || 0);
    acc[vendedor].ordenes += 1;
    return acc;
  }, {} as Record<string, { nombre: string; total: number; ordenes: number }>);

  const topVendedores = Object.values(ventasPorVendedor)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const tiposVenta = [
    { name: "Venta Directa", value: ventasDirectas, color: "#F97316" },
    { name: "Fabricación", value: ordenesEnFabricacion, color: "#10B981" },
    { name: "Comercialización", value: ordenesComercializadas, color: "#3B82F6" },
    { name: "Mixta", value: ordenesMixtas, color: "#A855F7" },
  ];

  const produccionPorTaller = [
    { taller: "Diseño", ordenes: 8, color: "#059669" },
    { taller: "Sublimación", ordenes: 6, color: "#3B82F6" },
    { taller: "Corte", ordenes: 5, color: "#F59E0B" },
    { taller: "Costura", ordenes: 4, color: "#8B5CF6" },
    { taller: "Bordado", ordenes: 3, color: "#EC4899" },
  ];

  const estadoOrdenes = [
    { name: "Pendiente", value: ordenesPendientes, color: "#EF4444" },
    { name: "En Proceso", value: ordenesEnProceso, color: "#F59E0B" },
    { name: "Completado", value: ordenesCompletadas, color: "#10B981" },
  ];

  return (
    <div className="p-6 space-y-6">
      <UserGuide open={showGuide} onClose={() => setShowGuide(false)} />

      <div className="flex items-center justify-between">
        <div>
          <h1>Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Bienvenido, {user?.nombre} - {roleLabels[user?.rol || 'vendedor']}
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => setShowGuide(true)}
          className="flex items-center gap-2"
        >
          <Info className="w-4 h-4" />
          Ver guía de usuario
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Ingresos Totales"
          value={`$${(totalIngresos / 1000).toFixed(0)}k`}
          icon={DollarSign}
          color="success"
          footer={`${ordenesVisibles.length} órdenes`}
        />
        <StatCard
          title="Órdenes Activas"
          value={ordenesEnProceso}
          icon={Clock}
          color="warning"
          footer="En proceso de producción"
        />
        <StatCard
          title="Anticipos Pendientes"
          value={`$${(anticiposPendientes / 1000).toFixed(0)}k`}
          icon={TrendingUp}
          color="info"
          footer={`De $${(totalAnticipos / 1000).toFixed(0)}k pagados`}
        />
        <StatCard
          title="Stock Bajo"
          value={materialesBajoStock}
          icon={Package}
          color="danger"
          footer={
            <Link to="/inventario/materiales" className="text-primary hover:underline">
              Ver materiales →
            </Link>
          }
        />
      </div>

      {/* Nuevas métricas de ventas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Venta Directa</p>
                <p className="text-3xl font-bold mt-1">{ventasDirectas}</p>
              </div>
              <div className="p-3 bg-orange-500/10 rounded-lg">
                <ShoppingCart className="w-6 h-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Fabricación</p>
                <p className="text-3xl font-bold mt-1">{ordenesEnFabricacion}</p>
              </div>
              <div className="p-3 bg-green-500/10 rounded-lg">
                <Shirt className="w-6 h-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Comercialización</p>
                <p className="text-3xl font-bold mt-1">{ordenesComercializadas}</p>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <Package className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Venta Mixta</p>
                <p className="text-3xl font-bold mt-1">{ordenesMixtas}</p>
              </div>
              <div className="p-3 bg-purple-500/10 rounded-lg">
                <TrendingUp className="w-6 h-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Órdenes por Tipo de Venta</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <ResponsiveContainer width="60%" height={250}>
                <PieChart>
                  <Pie
                    data={tiposVenta}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {tiposVenta.map((entry, index) => (
                      <Cell key={`tipo-venta-${entry.name}-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {tiposVenta.map((item) => (
                  <div key={item.name} className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: item.color }}
                    ></div>
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xl font-semibold">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Top Vendedores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topVendedores.map((vendedor, index) => (
                <div
                  key={vendedor.nombre}
                  className="flex items-center justify-between p-4 bg-secondary rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 bg-primary text-primary-foreground rounded-full font-semibold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{vendedor.nombre}</p>
                      <p className="text-sm text-muted-foreground">
                        {vendedor.ordenes} órdenes
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">
                      ${vendedor.total.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Órdenes Recientes</CardTitle>
          <Link
            to="/ordenes"
            className="text-sm text-primary hover:underline font-medium"
          >
            Ver todas →
          </Link>
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
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Productos
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ordenesVisibles.slice(0, 5).map((orden) => {
                  const cantidadTotal = orden.productos?.reduce(
                    (acc, p) => acc + p.cantidad,
                    0
                  ) || 0;
                  const getTipoColor = (tipo: string) => {
                    switch (tipo) {
                      case "directa":
                        return "bg-orange-500/10 text-orange-600";
                      case "fabricacion":
                        return "bg-green-500/10 text-green-600";
                      case "comercializacion":
                        return "bg-blue-500/10 text-blue-600";
                      case "mixta":
                        return "bg-purple-500/10 text-purple-600";
                      default:
                        return "bg-gray-500/10 text-gray-600";
                    }
                  };
                  return (
                    <tr key={orden.id} className="hover:bg-secondary/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link
                          to={`/ordenes/${orden.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {orden.numero}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getTipoColor(
                            orden.tipoVenta
                          )}`}
                        >
                          {orden.tipoVenta === "directa"
                            ? "Directa"
                            : orden.tipoVenta === "fabricacion"
                            ? "Fabricación"
                            : orden.tipoVenta === "comercializacion"
                            ? "Comercial."
                            : "Mixta"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-foreground">
                        {orden.cliente}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-foreground">
                        {orden.productos?.length || 0} prod. • {cantidadTotal} uds
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-semibold text-foreground">
                        ${(orden.total || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={orden.estado} size="sm" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Alertas de Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {mockMateriales
                .filter((m) => m.stock < m.stockMinimo)
                .map((material) => (
                  <div
                    key={material.id}
                    className="flex items-center justify-between p-3 bg-status-pending-bg rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 text-status-pending" />
                      <div>
                        <p className="font-medium text-foreground">{material.nombre}</p>
                        <p className="text-sm text-muted-foreground">
                          Stock: {material.stock} {material.unidad} / Mínimo:{" "}
                          {material.stockMinimo}
                        </p>
                      </div>
                    </div>
                    <Link
                      to="/inventario/materiales"
                      className="text-sm text-primary hover:underline font-medium"
                    >
                      Revisar
                    </Link>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              Estado Financiero
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500/10 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="font-medium">Ingresos Totales</p>
                    <p className="text-sm text-muted-foreground">
                      {ordenesVisibles.length} órdenes
                    </p>
                  </div>
                </div>
                <p className="text-2xl font-semibold text-green-600">
                  ${totalIngresos.toLocaleString()}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-medium">Anticipos Recibidos</p>
                    <p className="text-sm text-muted-foreground">
                      {ordenesVisibles.filter((o) => o.anticipo > 0).length} órdenes
                    </p>
                  </div>
                </div>
                <p className="text-2xl font-semibold text-blue-600">
                  ${totalAnticipos.toLocaleString()}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-500/10 rounded-lg">
                    <Clock className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="font-medium">Por Cobrar</p>
                    <p className="text-sm text-muted-foreground">
                      {ordenesVisibles.filter((o) => o.estadoPago === "anticipo").length}{" "}
                      pendientes
                    </p>
                  </div>
                </div>
                <p className="text-2xl font-semibold text-orange-600">
                  ${anticiposPendientes.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
