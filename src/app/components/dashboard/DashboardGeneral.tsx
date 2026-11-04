/**
 * DashboardGeneral.tsx — Panel de los administradores (primario y secundario).
 *
 * Resume todas las órdenes: ingresos totales, órdenes activas, anticipos pendientes,
 * stock bajo, órdenes por tipo de venta, top vendedores, órdenes recientes, alertas
 * de stock y estado financiero.
 */
import { Link } from "react-router";
import { AlertTriangle, Clock, DollarSign, Package, TrendingUp, Users } from "lucide-react";
import StatCard from "../StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { useErpData } from "../../context/ErpDataContext";
import {
  EstadoFinanciero,
  GraficaTiposVenta,
  TablaOrdenesRecientes,
  TarjetasTiposVenta,
  resumenFinanciero,
} from "./secciones";

export default function DashboardGeneral() {
  const { ordenes, materiales } = useErpData();

  const ordenesEnProceso = ordenes.filter((o) => o.estado === "in-progress").length;
  const materialesBajoStock = materiales.filter((m) => m.stock < m.stockMinimo);
  const { totalIngresos, totalAnticipos, anticiposPendientes } = resumenFinanciero(ordenes);

  // Los 3 vendedores con mayor importe vendido (agrupando órdenes por vendedor).
  const ventasPorVendedor = ordenes.reduce((acc, orden) => {
    const v = (acc[orden.vendedor] ??= { nombre: orden.vendedor, total: 0, ordenes: 0 });
    v.total += orden.total || 0;
    v.ordenes += 1;
    return acc;
  }, {} as Record<string, { nombre: string; total: number; ordenes: number }>);
  const topVendedores = Object.values(ventasPorVendedor)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  return (
    <>
      {/* KPIs principales; los importes se muestran en miles ("k") */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Ingresos Totales"
          value={`$${(totalIngresos / 1000).toFixed(0)}k`}
          icon={DollarSign}
          color="success"
          footer={`${ordenes.length} órdenes`}
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
          color="success"
          footer={`De $${(totalAnticipos / 1000).toFixed(0)}k pagados`}
        />
        <StatCard
          title="Stock Bajo"
          value={materialesBajoStock.length}
          icon={Package}
          color="danger"
          footer={
            <Link to="/inventario/materiales" className="text-primary hover:underline">
              Ver materiales →
            </Link>
          }
        />
      </div>

      <TarjetasTiposVenta ordenes={ordenes} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GraficaTiposVenta ordenes={ordenes} />

        {/* Ranking de vendedores */}
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
                <div key={vendedor.nombre} className="flex items-center justify-between p-4 bg-secondary rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 bg-primary text-primary-foreground rounded-full font-semibold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{vendedor.nombre}</p>
                      <p className="text-sm text-muted-foreground">{vendedor.ordenes} órdenes</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-primary">${vendedor.total.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <TablaOrdenesRecientes ordenes={ordenes} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Materiales con stock por debajo del mínimo */}
        <Card>
          <CardHeader>
            <CardTitle>Alertas de Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {materialesBajoStock.map((material) => (
                <div key={material.id} className="flex items-center justify-between p-3 bg-status-pending-bg rounded-lg">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-status-pending" />
                    <div>
                      <p className="font-medium text-foreground">{material.nombre}</p>
                      <p className="text-sm text-muted-foreground">
                        Stock: {material.stock} {material.unidad} / Mínimo: {material.stockMinimo}
                      </p>
                    </div>
                  </div>
                  <Link to="/inventario/materiales" className="text-sm text-primary hover:underline font-medium">
                    Revisar
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <EstadoFinanciero ordenes={ordenes} />
      </div>
    </>
  );
}
