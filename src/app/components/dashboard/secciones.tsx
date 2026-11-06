/**
 * secciones.tsx — Bloques del Dashboard que comparten el panel general (admins) y el
 * panel de ventas (vendedor). Cada bloque recibe la lista de órdenes que debe resumir,
 * así el mismo componente sirve para "todas las órdenes" o "solo las mías".
 */
import { Link } from "react-router";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CheckCircle2, Clock, DollarSign, Package, ShoppingCart, Shirt, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import StatusBadge from "../StatusBadge";
import type { Orden } from "../../data/mockData";

/** Totales de dinero de un conjunto de órdenes. */
export function resumenFinanciero(ordenes: Orden[]) {
  return {
    // Suma de los totales de las órdenes (vendido, no necesariamente cobrado).
    totalIngresos: ordenes.reduce((acc, o) => acc + (o.total || 0), 0),
    // Suma de los anticipos recibidos.
    totalAnticipos: ordenes.reduce((acc, o) => acc + (o.anticipo || 0), 0),
    // Saldo por cobrar (total − anticipo) de las órdenes en estado "anticipo".
    anticiposPendientes: ordenes
      .filter((o) => o.estadoPago === "anticipo")
      .reduce((acc, o) => acc + Math.max((o.total || 0) - (o.anticipo || 0), 0), 0),
  };
}

/** Conteo de órdenes por tipo de venta, con el color de cada tipo. */
const conteoTiposVenta = (ordenes: Orden[]) => [
  { tipo: "directa", name: "Venta Directa", value: 0, color: "#F97316", icon: ShoppingCart, borde: "border-l-orange-500", fondo: "bg-orange-500/10 text-orange-500" },
  { tipo: "fabricacion", name: "Fabricación", value: 0, color: "#10B981", icon: Shirt, borde: "border-l-green-500", fondo: "bg-green-500/10 text-green-500" },
  { tipo: "comercializacion", name: "Comercialización", value: 0, color: "#3B82F6", icon: Package, borde: "border-l-blue-500", fondo: "bg-blue-500/10 text-blue-500" },
  { tipo: "mixta", name: "Venta Mixta", value: 0, color: "#A855F7", icon: TrendingUp, borde: "border-l-purple-500", fondo: "bg-purple-500/10 text-purple-500" },
].map((t) => ({ ...t, value: ordenes.filter((o) => o.tipoVenta === t.tipo).length }));

/** Fila de 4 tarjetas: número de órdenes de cada tipo de venta. */
export function TarjetasTiposVenta({ ordenes }: { ordenes: Orden[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {conteoTiposVenta(ordenes).map(({ tipo, name, value, icon: Icon, borde, fondo }) => (
        <Card key={tipo} className={`border-l-4 ${borde}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{name}</p>
                <p className="text-3xl font-bold mt-1">{value}</p>
              </div>
              <div className={`p-3 rounded-lg ${fondo}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Gráfica de dona con la distribución de órdenes por tipo de venta. */
export function GraficaTiposVenta({ ordenes }: { ordenes: Orden[] }) {
  const datos = conteoTiposVenta(ordenes);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Órdenes por Tipo de Venta</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <ResponsiveContainer width="60%" height={250}>
            <PieChart>
              <Pie data={datos} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                {datos.map((entry) => (
                  <Cell key={entry.tipo} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-3">
            {datos.map((item) => (
              <div key={item.tipo} className="flex items-center gap-3">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }}></div>
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
  );
}

// Colores y texto corto de la etiqueta de tipo de venta en la tabla.
const tipoVentaCorto: Record<string, { texto: string; clase: string }> = {
  directa: { texto: "Directa", clase: "bg-orange-500/10 text-orange-600" },
  fabricacion: { texto: "Fabricación", clase: "bg-green-500/10 text-green-600" },
  comercializacion: { texto: "Comercial.", clase: "bg-blue-500/10 text-blue-600" },
  mixta: { texto: "Mixta", clase: "bg-purple-500/10 text-purple-600" },
};

/**
 * Tabla con las 5 órdenes más recientes. La lista llega en orden FIFO (más antigua
 * primero), así que se invierte para mostrar las más nuevas.
 */
export function TablaOrdenesRecientes({ ordenes, titulo = "Órdenes Recientes" }: { ordenes: Orden[]; titulo?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{titulo}</CardTitle>
        <Link to="/ordenes" className="text-sm text-primary hover:underline font-medium">
          Ver todas →
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary">
              <tr>
                {["Orden", "Tipo", "Cliente", "Productos", "Total", "Estado"].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...ordenes].reverse().slice(0, 5).map((orden) => {
                const cantidadTotal = orden.productos.reduce((acc, p) => acc + p.cantidad, 0);
                const tipo = tipoVentaCorto[orden.tipoVenta] ?? { texto: orden.tipoVenta, clase: "bg-gray-500/10 text-gray-600" };
                return (
                  <tr key={orden.id} className="hover:bg-secondary/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link to={`/ordenes/${orden.id}`} className="font-medium text-primary hover:underline">
                        {orden.numero}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${tipo.clase}`}>
                        {tipo.texto}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-foreground">{orden.cliente}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-foreground">
                      {orden.productos.length} prod. • {cantidadTotal} uds
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
        {ordenes.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">Aún no hay órdenes registradas</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Resumen financiero: vendido, anticipos recibidos y saldo por cobrar. */
export function EstadoFinanciero({ ordenes }: { ordenes: Orden[] }) {
  const { totalIngresos, totalAnticipos, anticiposPendientes } = resumenFinanciero(ordenes);
  const filas = [
    { titulo: "Ingresos Totales", detalle: `${ordenes.length} órdenes`, monto: totalIngresos, icon: CheckCircle2, color: "green" },
    { titulo: "Anticipos Recibidos", detalle: `${ordenes.filter((o) => o.anticipo > 0).length} órdenes`, monto: totalAnticipos, icon: TrendingUp, color: "blue" },
    { titulo: "Por Cobrar", detalle: `${ordenes.filter((o) => o.estadoPago === "anticipo").length} pendientes`, monto: anticiposPendientes, icon: Clock, color: "orange" },
  ] as const;
  // Clases completas por color (Tailwind solo genera las clases escritas literalmente).
  const colores = {
    green: { fondo: "bg-green-500/10", icono: "text-green-500", monto: "text-green-600" },
    blue: { fondo: "bg-blue-500/10", icono: "text-blue-500", monto: "text-blue-600" },
    orange: { fondo: "bg-orange-500/10", icono: "text-orange-500", monto: "text-orange-600" },
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-primary" />
          Estado Financiero
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {filas.map(({ titulo, detalle, monto, icon: Icon, color }) => (
            <div key={titulo} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${colores[color].fondo}`}>
                  <Icon className={`w-5 h-5 ${colores[color].icono}`} />
                </div>
                <div>
                  <p className="font-medium">{titulo}</p>
                  <p className="text-sm text-muted-foreground">{detalle}</p>
                </div>
              </div>
              <p className={`text-2xl font-semibold ${colores[color].monto}`}>${monto.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
