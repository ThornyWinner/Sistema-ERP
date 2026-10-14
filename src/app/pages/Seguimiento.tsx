/**
 * Seguimiento.tsx — Vista global del avance de producción (ruta /seguimiento).
 *
 * Secciones:
 *  1. Carga por taller: cuántos productos están "en proceso" en cada taller; el más
 *     cargado (con más de 2) se marca como "Alta carga".
 *  2. Flujo de órdenes: tabla con cada producto de cada orden, el estado en cada
 *     taller (✓ completado, reloj en proceso, círculo pendiente, "-" no aplica) y el
 *     porcentaje de avance (talleres completados / talleres asignados).
 *  3. Cuellos de botella: los 3 talleres con más trabajos en proceso.
 *  4. Eficiencia por taller: % de productos completados sobre los asignados a cada taller.
 */
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import { useErpData } from "../context/ErpDataContext";
import StatusBadge from "../components/StatusBadge";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";

// Talleres en orden del flujo, con la clave interna y su nombre visible.
const talleres = [
  { key: "diseno", label: "Diseño" },
  { key: "sublimacion", label: "Sublimación" },
  { key: "corte", label: "Corte" },
  { key: "costura", label: "Costura" },
  { key: "bordado", label: "Bordado" },
];

export default function Seguimiento() {
  // Órdenes reales de Supabase (alias mockOrdenes del prototipo).
  const { ordenes: mockOrdenes } = useErpData();
  // Icono de estado para las celdas de la tabla de flujo.
  const getEstadoIcon = (estado: string) => {
    switch (estado) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-status-completed" />;
      case "in-progress":
        return <Clock className="w-4 h-4 text-status-in-progress" />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-muted-foreground" />;
    }
  };

  /**
   * Cuenta, para cada taller, cuántos productos están actualmente "en proceso".
   * Devuelve un objeto { diseno: n, sublimacion: n, ... }.
   */
  const getCuellosDeBotella = () => {
    const talleresCarga: any = {};
    talleres.forEach((taller) => {
      let count = 0;
      mockOrdenes.forEach((orden) => {
        orden.productos.forEach((producto) => {
          if (
            producto.talleres.includes(taller.key as any) &&
            producto.progreso[taller.key as keyof typeof producto.progreso] === "in-progress"
          ) {
            count++;
          }
        });
      });
      talleresCarga[taller.key] = count;
    });
    return talleresCarga;
  };

  const cuellosDeBotella = getCuellosDeBotella();
  // Par [clave, cantidad] del taller con más trabajos en proceso (orden descendente).
  const tallerMasCargado = Object.entries(cuellosDeBotella).sort(
    ([, a], [, b]) => (b as number) - (a as number)
  )[0];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1>Seguimiento de Producción</h1>
        <p className="text-muted-foreground mt-1">
          Vista global del flujo de órdenes por talleres
        </p>
      </div>

      {/* 1. Tarjetas de carga actual por taller */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {talleres.map((taller) => {
          const enProceso = cuellosDeBotella[taller.key];
          // Se considera cuello de botella si es el más cargado y tiene más de 2 trabajos.
          const esCuello = tallerMasCargado[0] === taller.key && enProceso > 2;
          return (
            <Card key={taller.key} className={esCuello ? "border-status-in-progress" : ""}>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-1">{taller.label}</p>
                <p className="text-2xl font-semibold">{enProceso}</p>
                <p className="text-xs text-muted-foreground mt-1">en proceso</p>
                {esCuello && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-status-in-progress">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Alta carga</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 2. Tabla de flujo: una fila por producto de cada orden */}
      <Card>
        <CardHeader>
          <CardTitle>Flujo de Órdenes</CardTitle>
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
                    Cliente
                  </th>
                  {talleres.map((taller) => (
                    <th
                      key={taller.key}
                      className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      {taller.label}
                    </th>
                  ))}
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Progreso
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mockOrdenes.flatMap((orden) =>
                  orden.productos.map((producto) => {
                    // Avance = talleres completados / talleres con registro de progreso.
                    // Un producto sin talleres (p. ej. venta directa) cuenta como 100%.
                    const talleresList = Object.values(producto.progreso);
                    const completados = talleresList.filter((t) => t === "completed").length;
                    const progreso =
                      talleresList.length > 0
                        ? Math.round((completados / talleresList.length) * 100)
                        : 100;

                    return (
                      <tr
                        key={`${orden.id}-${producto.id}`}
                        className="hover:bg-secondary/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <p className="font-medium text-foreground">{orden.numero}</p>
                          <p className="text-xs text-muted-foreground">{producto.nombre}</p>
                        </td>
                        <td className="px-6 py-4 text-foreground">{orden.cliente}</td>
                        {talleres.map((taller) => {
                          const estado = producto.progreso[
                            taller.key as keyof typeof producto.progreso
                          ];
                          // Si el producto no pasa por este taller se muestra un guion.
                          const tallerActivo = producto.talleres.includes(taller.key as any);
                          return (
                            <td key={taller.key} className="px-6 py-4">
                              <div className="flex justify-center">
                                {tallerActivo ? (
                                  getEstadoIcon(estado || "pending")
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all"
                                style={{ width: `${progreso}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-medium text-foreground w-12 text-right">
                              {progreso}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 3. Top 3 de talleres con más trabajos en proceso */}
        <Card>
          <CardHeader>
            <CardTitle>Cuellos de Botella</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(cuellosDeBotella)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .slice(0, 3)
                .map(([key, count]) => {
                  const taller = talleres.find((t) => t.key === key);
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                    >
                      <span className="font-medium">{taller?.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-semibold">{count as number}</span>
                        <span className="text-sm text-muted-foreground">órdenes</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        {/* 4. Eficiencia: productos completados / productos asignados en cada taller */}
        <Card>
          <CardHeader>
            <CardTitle>Eficiencia por Taller</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {talleres.map((taller) => {
                let total = 0;
                let completados = 0;
                mockOrdenes.forEach((orden) => {
                  orden.productos.forEach((producto) => {
                    if (producto.talleres.includes(taller.key as any)) {
                      total++;
                      if (
                        producto.progreso[taller.key as keyof typeof producto.progreso] ===
                        "completed"
                      ) {
                        completados++;
                      }
                    }
                  });
                });
                const porcentaje = total > 0 ? Math.round((completados / total) * 100) : 0;

                return (
                  <div key={taller.key}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{taller.label}</span>
                      <span className="text-sm text-muted-foreground">
                        {porcentaje}% ({completados}/{total})
                      </span>
                    </div>
                    <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${porcentaje}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
