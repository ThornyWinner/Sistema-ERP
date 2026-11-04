/**
 * DashboardTaller.tsx — Panel personal de un taller (diseño, sublimación, corte,
 * costura o bordado). No muestra importes: solo el trabajo del taller.
 *
 *  - KPIs: trabajos pendientes, en proceso, terminados y unidades por procesar.
 *  - Avance del taller (porcentaje de trabajos terminados).
 *  - Cola de trabajo en orden FIFO (la orden más antigua primero), indicando si cada
 *    trabajo ya está listo (los talleres anteriores de su flujo terminaron) o si
 *    sigue en espera, y su fecha de entrega.
 *
 * Un "trabajo" es un producto de una orden que pasa por este taller.
 */
import { Link } from "react-router";
import { CheckCircle2, Clock, Hourglass, Layers, PlayCircle } from "lucide-react";
import StatCard from "../StatCard";
import StatusBadge from "../StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { useErpData } from "../../context/ErpDataContext";
import type { Taller } from "../../data/mockData";
import { claseDiasRestantes, diasRestantes, formatFecha, textoDiasRestantes } from "../../lib/fechas";

/** Nombre legible de cada taller. */
export const nombreTaller: Record<Taller, string> = {
  diseno: "Diseño",
  sublimacion: "Sublimación",
  corte: "Corte",
  costura: "Costura",
  bordado: "Bordado",
};

export default function DashboardTaller({ taller }: { taller: Taller }) {
  const { ordenes } = useErpData();

  // Trabajos del taller en orden FIFO (las órdenes ya vienen de la más antigua a la
  // más reciente). Un trabajo está listo cuando todos los talleres anteriores de su
  // flujo están terminados.
  const trabajos = ordenes.flatMap((orden) =>
    orden.productos
      .filter((p) => p.talleres.includes(taller))
      .map((p) => {
        const anteriores = p.talleres.slice(0, p.talleres.indexOf(taller));
        const enEspera = anteriores.find((t) => p.progreso[t] !== "completed");
        return {
          id: `${orden.id}::${p.id}`,
          ordenId: orden.id,
          folio: orden.numero,
          cliente: orden.cliente,
          fechaEntrega: orden.fechaEntrega,
          producto: p.nombre,
          cantidad: p.cantidad,
          estado: p.progreso[taller] ?? "pending",
          enEspera,
        };
      })
  );

  const pendientes = trabajos.filter((t) => t.estado === "pending");
  const enProceso = trabajos.filter((t) => t.estado === "in-progress");
  const terminados = trabajos.filter((t) => t.estado === "completed");
  const cola = trabajos.filter((t) => t.estado !== "completed");
  const unidadesPorProcesar = cola.reduce((acc, t) => acc + t.cantidad, 0);
  const listos = cola.filter((t) => !t.enEspera).length;
  const avance = trabajos.length ? Math.round((terminados.length / trabajos.length) * 100) : 0;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Pendientes"
          value={pendientes.length}
          icon={Hourglass}
          color="danger"
          footer={`${listos} listos para iniciar o continuar`}
        />
        <StatCard title="En Proceso" value={enProceso.length} icon={PlayCircle} color="warning" footer="Trabajando ahora" />
        <StatCard title="Terminados" value={terminados.length} icon={CheckCircle2} color="success" footer={`De ${trabajos.length} trabajos`} />
        <StatCard
          title="Unidades por Procesar"
          value={unidadesPorProcesar}
          icon={Layers}
          color="primary"
          footer={
            <Link to={`/talleres/${taller}`} className="text-primary hover:underline">
              Ir al tablero →
            </Link>
          }
        />
      </div>

      {/* Avance del taller */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Avance de {nombreTaller[taller]}</p>
              <p className="text-2xl font-semibold mt-1">{avance}%</p>
            </div>
            <div className="flex-[3] h-3 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${avance}%` }}></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cola de trabajo FIFO */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Cola de Trabajo
          </CardTitle>
          <Link to={`/talleres/${taller}`} className="text-sm text-primary hover:underline font-medium">
            Ver tablero →
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary">
                <tr>
                  {["Turno", "Orden", "Producto", "Cantidad", "Disponibilidad", "Entrega", "Estado"].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cola.map((t, i) => {
                  const dias = diasRestantes(t.fechaEntrega);
                  return (
                    <tr key={t.id} className="hover:bg-secondary/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap font-semibold text-muted-foreground">#{i + 1}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="font-medium text-foreground">{t.folio}</p>
                        <p className="text-sm text-muted-foreground">{t.cliente}</p>
                      </td>
                      <td className="px-6 py-4 text-foreground">{t.producto}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-foreground">{t.cantidad} uds</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {t.enEspera ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-muted-foreground border border-border">
                            Espera a {nombreTaller[t.enEspera]}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-status-completed-bg text-status-completed-text">
                            Listo
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-sm text-foreground">{formatFecha(t.fechaEntrega)}</p>
                        <p className={`text-xs ${claseDiasRestantes(dias)}`}>{textoDiasRestantes(dias)}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={t.estado} size="sm" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {cola.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No hay trabajos pendientes en {nombreTaller[taller]}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
