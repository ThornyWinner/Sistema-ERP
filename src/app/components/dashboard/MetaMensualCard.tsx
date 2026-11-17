/**
 * MetaMensualCard.tsx — Avance de la meta del mes y comisión ganada (panel del vendedor).
 *
 * Venta y cobro son sin IVA; la comisión se calcula sobre lo cobrado en el mes
 * (sql/metas_comisiones.sql). Si la migración no está aplicada, la tarjeta no se muestra.
 */
import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { formatMonto } from "../../lib/pagos";
import {
  avanceMeta,
  diasRestantesMes,
  inicioMes,
  nombreMes,
  obtenerDesempeno,
  ritmoEsperado,
  type DesempenoVendedor,
} from "../../lib/metas";
import BarraAvance from "../metas/BarraAvance";

export default function MetaMensualCard({ vendedorId }: { vendedorId?: string }) {
  const periodo = inicioMes();
  const [datos, setDatos] = useState<DesempenoVendedor | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vigente = true;
    obtenerDesempeno(periodo)
      .then((filas) => vigente && setDatos(filas.find((f) => f.vendedorId === vendedorId) ?? filas[0] ?? null))
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
    };
  }, [periodo, vendedorId]);

  if (error) return null;

  const avance = datos ? avanceMeta(datos) : null;
  const esperado = datos?.meta ? ritmoEsperado(periodo, datos.meta) : null;
  const faltante = datos?.meta ? Math.max(datos.meta - datos.vendido, 0) : 0;
  const dias = diasRestantesMes();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          Mi meta de {nombreMes(periodo)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!datos ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3">
              {datos.meta ? (
                <>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-3xl font-semibold">{formatMonto(datos.vendido)}</p>
                      <p className="text-sm text-muted-foreground">de {formatMonto(datos.meta)} (sin IVA)</p>
                    </div>
                    <p className="text-2xl font-semibold text-primary">{avance}%</p>
                  </div>
                  <BarraAvance valor={datos.vendido} meta={datos.meta} esperado={esperado} />
                  <p className="text-sm text-muted-foreground">
                    {faltante > 0
                      ? `Te faltan ${formatMonto(faltante)} · ${dias} ${dias === 1 ? "día" : "días"} para cerrar el mes`
                      : "¡Meta cumplida! Todo lo que vendas este mes suma de más."}
                    {esperado != null && faltante > 0 && (
                      <>
                        {" · "}
                        {datos.vendido >= esperado ? (
                          <span className="text-status-completed font-medium">vas al ritmo</span>
                        ) : (
                          <span className="text-status-pending font-medium">
                            a esta fecha deberías llevar {formatMonto(esperado)}
                          </span>
                        )}
                      </>
                    )}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-semibold">{formatMonto(datos.vendido)}</p>
                  <p className="text-sm text-muted-foreground">
                    Vendido este mes (sin IVA). Aún no tienes una meta asignada para este mes.
                  </p>
                </>
              )}
            </div>

            <div className="rounded-lg bg-secondary p-4 space-y-2">
              <p className="text-sm text-muted-foreground">Comisión del mes ({datos.comisionPct}% de lo cobrado)</p>
              <p className="text-2xl font-semibold text-status-completed">{formatMonto(datos.comision)}</p>
              <p className="text-xs text-muted-foreground">
                Cobrado este mes: {formatMonto(datos.cobrado)} sin IVA. Solo cuenta lo que el cliente ya pagó.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
