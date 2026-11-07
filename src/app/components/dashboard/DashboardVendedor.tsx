/**
 * DashboardVendedor.tsx — Panel personal de ventas (rol vendedor).
 *
 * Solo resume las órdenes del vendedor que inició sesión: lo vendido, órdenes activas,
 * saldo por cobrar, entregas próximas, tipos de venta, órdenes con saldo pendiente,
 * órdenes recientes y estado financiero.
 */
import { Link, useNavigate } from "react-router";
import { AlertTriangle, CalendarClock, Clock, DollarSign, Wallet } from "lucide-react";
import StatCard from "../StatCard";
import StatusBadge from "../StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { useErpData } from "../../context/ErpDataContext";
import { useAuth } from "../../context/AuthContext";
import type { Orden } from "../../data/mockData";
import {
  claseDiasRestantes,
  diasRestantes,
  formatFecha,
  parseFecha,
  textoDiasRestantes,
} from "../../lib/fechas";
import { saldoPendiente } from "../../lib/pagos";
import {
  EstadoFinanciero,
  GraficaTiposVenta,
  TablaOrdenesRecientes,
  TarjetasTiposVenta,
} from "./secciones";

/** Lo que falta por cobrar de una orden: total − pagos registrados. */
const saldoDe = (o: Orden) => saldoPendiente(o);

export default function DashboardVendedor() {
  const { ordenes } = useErpData();
  const { user } = useAuth();
  const navigate = useNavigate();

  const misOrdenes = ordenes.filter((o) => o.vendedorId === user?.id);
  const activas = misOrdenes.filter((o) => o.estado !== "completed");
  const totalVendido = misOrdenes.reduce((acc, o) => acc + (o.total || 0), 0);

  // Órdenes con saldo pendiente, de la entrega más próxima a la más lejana.
  const conSaldo = misOrdenes
    .filter((o) => o.estadoPago !== "cancelado" && saldoDe(o) > 0)
    .sort((a, b) => (parseFecha(a.fechaEntrega)?.getTime() ?? Infinity) - (parseFecha(b.fechaEntrega)?.getTime() ?? Infinity));
  const porCobrar = conSaldo.reduce((acc, o) => acc + saldoDe(o), 0);

  // Órdenes sin terminar con fecha de entrega, de la más próxima a la más lejana.
  const proximasEntregas = activas
    .filter((o) => parseFecha(o.fechaEntrega))
    .sort((a, b) => parseFecha(a.fechaEntrega)!.getTime() - parseFecha(b.fechaEntrega)!.getTime());
  const urgentes = proximasEntregas.filter((o) => (diasRestantes(o.fechaEntrega) ?? Infinity) <= 5);
  const vencidas = urgentes.filter((o) => (diasRestantes(o.fechaEntrega) ?? 0) < 0).length;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Mis Ventas"
          value={`$${(totalVendido / 1000).toFixed(0)}k`}
          icon={DollarSign}
          color="success"
          footer={`${misOrdenes.length} órdenes`}
        />
        <StatCard
          title="Órdenes Activas"
          value={activas.length}
          icon={Clock}
          color="warning"
          footer={`${activas.filter((o) => o.estado === "in-progress").length} en producción`}
        />
        <StatCard
          title="Por Cobrar"
          value={`$${(porCobrar / 1000).toFixed(1)}k`}
          icon={Wallet}
          color="primary"
          footer={`${conSaldo.length} órdenes con saldo`}
        />
        <StatCard
          title="Entregas Urgentes"
          value={urgentes.length}
          icon={CalendarClock}
          color="danger"
          footer={vencidas > 0 ? `${vencidas} vencidas` : "En los próximos 5 días"}
        />
      </div>

      <TarjetasTiposVenta ordenes={misOrdenes} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GraficaTiposVenta ordenes={misOrdenes} />

        {/* Las 5 entregas más próximas de mis órdenes sin terminar */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-primary" />
              Próximas Entregas
            </CardTitle>
            <Link to="/ordenes" className="text-sm text-primary hover:underline font-medium">
              Ver órdenes →
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {proximasEntregas.length === 0 && (
                <p className="text-sm text-muted-foreground">No tienes entregas pendientes</p>
              )}
              {proximasEntregas.slice(0, 5).map((orden) => {
                const dias = diasRestantes(orden.fechaEntrega);
                return (
                  <div
                    key={orden.id}
                    onClick={() => navigate(`/ordenes/${orden.id}`)}
                    className="flex items-center justify-between gap-3 p-3 bg-secondary rounded-lg cursor-pointer hover:bg-secondary/70 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{orden.numero}</p>
                      <p className="text-sm text-muted-foreground truncate">{orden.cliente}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <StatusBadge status={orden.estado} size="sm" />
                      <p className="text-sm">
                        {formatFecha(orden.fechaEntrega)} ·{" "}
                        <span className={claseDiasRestantes(dias)}>{textoDiasRestantes(dias)}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Órdenes con saldo: a quién hay que cobrarle y cuánto */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              Pendientes de Cobro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {conSaldo.length === 0 && (
                <p className="text-sm text-muted-foreground">Todas tus órdenes están liquidadas</p>
              )}
              {conSaldo.map((orden) => {
                const sinPagos = orden.pagos.length === 0;
                return (
                  <div
                    key={orden.id}
                    onClick={() => navigate(`/ordenes/${orden.id}`)}
                    className="flex items-center justify-between gap-3 p-3 bg-secondary rounded-lg cursor-pointer hover:bg-secondary/70 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{orden.numero}</p>
                      <p className="text-sm text-muted-foreground truncate">{orden.cliente}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-orange-600 dark:text-orange-400">${saldoDe(orden).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                        {sinPagos && <AlertTriangle className="w-3 h-3 text-status-pending" />}
                        {sinPagos ? "Sin anticipo" : `de $${(orden.total || 0).toLocaleString()}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <EstadoFinanciero ordenes={misOrdenes} />
      </div>

      <TablaOrdenesRecientes ordenes={misOrdenes} titulo="Mis Órdenes Recientes" />
    </>
  );
}
