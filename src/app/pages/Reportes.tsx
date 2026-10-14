/**
 * Reportes.tsx — Reportes y análisis de producción (ruta /reportes).
 *
 * Contenido:
 *  - Selector de periodo (semana / mes / trimestre / año).
 *  - 4 indicadores: producción total, órdenes completadas, entregas a tiempo e ingresos.
 *  - Gráficas (recharts): producción por día (líneas), consumo de materiales (barras),
 *    productos más vendidos (pastel) y eficiencia por taller (barras de progreso).
 *  - Resumen de inventario calculado con datos reales: materiales, productos y valor total.
 *
 * Importante: salvo el "Resumen de Inventario", los indicadores y gráficas usan datos
 * de ejemplo fijos y el selector de periodo todavía no filtra nada.
 */
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import { useErpData } from "../context/ErpDataContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { TrendingUp, Package, Shirt, DollarSign, Calendar } from "lucide-react";
import { useState } from "react";

export default function Reportes() {
  // Datos reales de Supabase (con los alias mock* del prototipo).
  const { ordenes: mockOrdenes, materiales: mockMateriales, productos: mockProductos } = useErpData();
  // Periodo seleccionado (aún no se aplica a los cálculos).
  const [periodo, setPeriodo] = useState("mes");

  // --- Datos de ejemplo para las gráficas ---

  // Prendas producidas por día de la semana (gráfica de líneas).
  const produccionPorDia = [
    { dia: "Lun", prendas: 85 },
    { dia: "Mar", prendas: 92 },
    { dia: "Mié", prendas: 78 },
    { dia: "Jue", prendas: 105 },
    { dia: "Vie", prendas: 98 },
    { dia: "Sáb", prendas: 45 },
  ];

  // Consumo por material (gráfica de barras horizontales).
  const consumoMateriales = [
    { material: "Tela Gabardina", consumo: 250 },
    { material: "Tela Drill", consumo: 180 },
    { material: "Hilo", consumo: 450 },
    { material: "Cierres", consumo: 320 },
    { material: "Botones", consumo: 500 },
  ];

  // Unidades vendidas por producto con su color en el pastel y la leyenda.
  const productosMasVendidos = [
    { nombre: "Camisa Industrial", cantidad: 156, color: "#059669" },
    { nombre: "Pantalón Cargo", cantidad: 132, color: "#3B82F6" },
    { nombre: "Overol", cantidad: 98, color: "#F59E0B" },
    { nombre: "Chaleco", cantidad: 245, color: "#8B5CF6" },
  ];

  // Eficiencia (%) de cada taller.
  const rendimientoTalleres = [
    { taller: "Diseño", eficiencia: 95 },
    { taller: "Sublimación", eficiencia: 88 },
    { taller: "Corte", eficiencia: 92 },
    { taller: "Costura", eficiencia: 85 },
    { taller: "Bordado", eficiencia: 90 },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado con selector de periodo */}
      <div className="flex items-center justify-between">
        <div>
          <h1>Reportes y Análisis</h1>
          <p className="text-muted-foreground mt-1">
            Métricas y estadísticas de producción
          </p>
        </div>
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="px-4 py-2 bg-card border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="semana">Esta Semana</option>
          <option value="mes">Este Mes</option>
          <option value="trimestre">Este Trimestre</option>
          <option value="año">Este Año</option>
        </select>
      </div>

      {/* Indicadores principales (valores de ejemplo) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Shirt className="w-6 h-6 text-primary" />
              </div>
              <TrendingUp className="w-5 h-5 text-status-completed" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">Producción Total</p>
            <p className="text-3xl font-semibold">503</p>
            <p className="text-sm text-status-completed mt-2">+12% vs. anterior</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-status-completed-bg rounded-lg">
                <Package className="w-6 h-6 text-status-completed" />
              </div>
              <TrendingUp className="w-5 h-5 text-status-completed" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">Órdenes Completadas</p>
            <p className="text-3xl font-semibold">12</p>
            <p className="text-sm text-status-completed mt-2">+8% vs. anterior</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-status-in-progress-bg rounded-lg">
                <Calendar className="w-6 h-6 text-status-in-progress" />
              </div>
              <span className="text-sm text-muted-foreground">95%</span>
            </div>
            <p className="text-sm text-muted-foreground mb-1">Entregas a Tiempo</p>
            <p className="text-3xl font-semibold">11/12</p>
            <p className="text-sm text-muted-foreground mt-2">órdenes</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
              <TrendingUp className="w-5 h-5 text-status-completed" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">Ingresos Estimados</p>
            <p className="text-3xl font-semibold">$185K</p>
            <p className="text-sm text-status-completed mt-2">+15% vs. anterior</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Producción por Día</CardTitle>
          </CardHeader>
          <CardContent>
            {/* ResponsiveContainer ajusta la gráfica al ancho de la tarjeta */}
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={produccionPorDia}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="prendas"
                  stroke="#059669"
                  strokeWidth={2}
                  dot={{ fill: "#059669", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Consumo de Materiales</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              {/* layout="vertical": barras horizontales con los materiales en el eje Y */}
              <BarChart data={consumoMateriales} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="material" type="category" tick={{ fontSize: 11 }} width={100} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="consumo" fill="#059669" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Productos Más Vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <ResponsiveContainer width="50%" height={250}>
                <PieChart>
                  <Pie
                    data={productosMasVendidos}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="cantidad"
                    label={(entry) => entry.cantidad}
                  >
                    {/* Un <Cell> por porción para asignarle su color */}
                    {productosMasVendidos.map((entry, index) => (
                      <Cell key={`producto-vendido-${entry.nombre}-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              {/* Leyenda del pastel */}
              <div className="space-y-3">
                {productosMasVendidos.map((producto) => (
                  <div key={producto.nombre} className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: producto.color }}
                    ></div>
                    <div>
                      <p className="text-sm font-medium">{producto.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {producto.cantidad} unidades
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Eficiencia por Taller</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {rendimientoTalleres.map((taller) => (
                <div key={taller.taller}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{taller.taller}</span>
                    <span className="text-sm font-semibold text-foreground">
                      {taller.eficiencia}%
                    </span>
                  </div>
                  {/* Color de la barra: verde ≥ 90%, ámbar ≥ 80%, rojo < 80% */}
                  <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        taller.eficiencia >= 90
                          ? "bg-status-completed"
                          : taller.eficiencia >= 80
                          ? "bg-status-in-progress"
                          : "bg-status-pending"
                      }`}
                      style={{ width: `${taller.eficiencia}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resumen de inventario con datos reales.
          Valor total = Σ(stock × precio) de materiales + Σ(stock × precio) de productos */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen de Inventario</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-secondary rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Materiales</p>
              <p className="text-2xl font-semibold mb-1">{mockMateriales.length}</p>
              <p className="text-sm text-status-pending">
                {mockMateriales.filter((m) => m.stock < m.stockMinimo).length} con stock
                bajo
              </p>
            </div>
            <div className="p-4 bg-secondary rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Productos</p>
              <p className="text-2xl font-semibold mb-1">{mockProductos.length}</p>
              <p className="text-sm text-muted-foreground">
                {mockProductos.reduce((acc, p) => acc + p.stock, 0)} unidades totales
              </p>
            </div>
            <div className="p-4 bg-secondary rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Valor Total</p>
              <p className="text-2xl font-semibold mb-1">
                $
                {(
                  mockMateriales.reduce((acc, m) => acc + m.stock * m.precio, 0) +
                  mockProductos.reduce((acc, p) => acc + p.stock * p.precio, 0)
                ).toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">Inventario completo</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
