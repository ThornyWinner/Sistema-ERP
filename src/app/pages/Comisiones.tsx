/**
 * Comisiones.tsx — Metas y comisiones de vendedores (ruta /comisiones).
 *
 *  - Selector de mes; indicadores del equipo: meta, vendido, cobrado y comisiones.
 *  - Tabla comparativa por vendedor (ordenada por venta): meta, avance, cobrado, % y
 *    comisión; gráfica de venta contra meta.
 *  - El admin primario fija la meta y el % propio de cada vendedor, copia las metas del
 *    mes anterior y cambia el % global. El admin secundario solo consulta.
 *  - Exporta el mes a CSV (para nómina).
 *
 * Venta y cobro son sin IVA; la comisión es sobre lo cobrado en el mes
 * (sql/metas_comisiones.sql, public.desempeno_vendedores).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronLeft,
  ChevronRight,
  Coins,
  CopyPlus,
  Download,
  Pencil,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { roleLabels } from "../utils/permissions";
import type { UserRole } from "../types/auth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import StatCard from "../components/StatCard";
import BarraAvance from "../components/metas/BarraAvance";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { formatMonto } from "../lib/pagos";
import {
  avanceMeta,
  copiarMetasMesAnterior,
  guardarComisionGlobal,
  guardarMeta,
  inicioMes,
  moverMes,
  nombreMes,
  obtenerComisionGlobal,
  obtenerDesempeno,
  ritmoEsperado,
  type DesempenoVendedor,
} from "../lib/metas";

const montoCorto = (n: number) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(1)}k` : formatMonto(n));

/** Descarga el mes como CSV (separado por comas, con BOM para que Excel lea los acentos). */
function exportarCsv(periodo: string, filas: DesempenoVendedor[]) {
  const celda = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lineas = [
    ["Vendedor", "Órdenes", "Meta", "Vendido sin IVA", "Avance %", "Cobrado sin IVA", "% comisión", "Comisión"],
    ...filas.map((f) => [
      f.nombre,
      f.ordenes,
      f.meta ?? "",
      f.vendido.toFixed(2),
      avanceMeta(f) ?? "",
      f.cobrado.toFixed(2),
      f.comisionPct,
      f.comision.toFixed(2),
    ]),
  ].map((l) => l.map(celda).join(","));
  const blob = new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `comisiones-${periodo.slice(0, 7)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Comisiones() {
  const { user } = useAuth();
  const puedeEditar = user?.rol === "admin_primario";
  const [periodo, setPeriodo] = useState(inicioMes());
  const [filas, setFilas] = useState<DesempenoVendedor[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [editando, setEditando] = useState<DesempenoVendedor | null>(null);
  const [copiando, setCopiando] = useState(false);

  const esMesActual = periodo === inicioMes();

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setFilas(await obtenerDesempeno(periodo));
    } catch (err: any) {
      setFilas([]);
      setErrorCarga(err?.message ?? "Error desconocido");
    } finally {
      setCargando(false);
    }
  }, [periodo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const totales = useMemo(() => {
    const f = filas ?? [];
    return {
      meta: f.reduce((a, x) => a + (x.meta ?? 0), 0),
      vendido: f.reduce((a, x) => a + x.vendido, 0),
      // Avance del equipo solo con quienes tienen meta (si no, la venta de los demás lo infla).
      vendidoConMeta: f.reduce((a, x) => a + (x.meta ? x.vendido : 0), 0),
      cobrado: f.reduce((a, x) => a + x.cobrado, 0),
      comision: f.reduce((a, x) => a + x.comision, 0),
      cumplieron: f.filter((x) => x.meta && x.vendido >= x.meta).length,
      conMeta: f.filter((x) => x.meta).length,
    };
  }, [filas]);

  const datosGrafica = (filas ?? []).map((f) => ({
    nombre: f.nombre.split(" ")[0],
    Vendido: Math.round(f.vendido),
    Meta: Math.round(f.meta ?? 0),
  }));

  const copiar = async () => {
    setCopiando(true);
    try {
      const n = await copiarMetasMesAnterior(periodo);
      if (n === 0) toast.info(`No hay metas de ${nombreMes(moverMes(periodo, -1))} por copiar`);
      else toast.success(`Se copiaron ${n} meta(s) de ${nombreMes(moverMes(periodo, -1))}`);
      await cargar();
    } catch (err: any) {
      toast.error("No se pudieron copiar las metas", { description: err?.message });
    } finally {
      setCopiando(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>Metas y Comisiones</h1>
          <p className="text-muted-foreground mt-1">
            Venta del mes contra meta y comisión sobre lo cobrado (montos sin IVA).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            <Button variant="ghost" size="icon" aria-label="Mes anterior" onClick={() => setPeriodo(moverMes(periodo, -1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="min-w-[150px] text-center font-medium capitalize">{nombreMes(periodo)}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mes siguiente"
              onClick={() => setPeriodo(moverMes(periodo, 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          {!esMesActual && (
            <Button variant="outline" onClick={() => setPeriodo(inicioMes())}>
              Mes actual
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => filas && exportarCsv(periodo, filas)}
            disabled={!filas || filas.length === 0}
            className="gap-2"
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </Button>
        </div>
      </div>

      {errorCarga && (
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="font-medium text-status-pending">No se pudo cargar el desempeño.</p>
            <p className="text-muted-foreground mt-1">
              Verifica que sql/metas_comisiones.sql esté aplicado en la base de datos. Detalle: {errorCarga}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Meta del equipo"
          value={montoCorto(totales.meta)}
          icon={Target}
          color="primary"
          footer={
            totales.conMeta > 0
              ? `${totales.cumplieron} de ${totales.conMeta} vendedores la cumplieron`
              : "Sin metas asignadas este mes"
          }
        />
        <StatCard
          title="Vendido"
          value={montoCorto(totales.vendido)}
          icon={TrendingUp}
          color="success"
          footer={
            totales.meta > 0
              ? `${Math.round((totales.vendidoConMeta / totales.meta) * 100)}% de la meta`
              : "Órdenes del mes, sin canceladas"
          }
        />
        <StatCard
          title="Cobrado"
          value={montoCorto(totales.cobrado)}
          icon={Wallet}
          color="warning"
          footer="Pagos recibidos en el mes"
        />
        <StatCard
          title="Comisiones"
          value={montoCorto(totales.comision)}
          icon={Coins}
          color="danger"
          footer="Sobre lo cobrado"
        />
      </div>

      <ComisionGlobalCard puedeEditar={puedeEditar} usuarioId={user?.id} onCambio={cargar} />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Desempeño por vendedor
          </CardTitle>
          {puedeEditar && (
            <Button variant="outline" size="sm" onClick={copiar} disabled={copiando} className="gap-2">
              <CopyPlus className="w-4 h-4" />
              {copiando ? "Copiando…" : `Copiar metas de ${nombreMes(moverMes(periodo, -1))}`}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Órdenes</TableHead>
                  <TableHead className="text-right">Meta</TableHead>
                  <TableHead className="text-right">Vendido</TableHead>
                  <TableHead className="min-w-[160px]">Avance</TableHead>
                  <TableHead className="text-right">Cobrado</TableHead>
                  <TableHead className="text-right">% Com.</TableHead>
                  <TableHead className="text-right">Comisión</TableHead>
                  {puedeEditar && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargando && !filas ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                      Cargando…
                    </TableCell>
                  </TableRow>
                ) : (filas ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                      No hay vendedores ni ventas en este mes
                    </TableCell>
                  </TableRow>
                ) : (
                  (filas ?? []).map((f, i) => {
                    const avance = avanceMeta(f);
                    return (
                      <TableRow key={f.vendedorId}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <p className="font-medium">{f.nombre}</p>
                          {f.rol !== "vendedor" && (
                            <p className="text-xs text-muted-foreground">
                              {roleLabels[f.rol as UserRole] ?? f.rol}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{f.ordenes}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {f.meta ? formatMonto(f.meta) : <span className="text-muted-foreground">Sin meta</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap">{formatMonto(f.vendido)}</TableCell>
                        <TableCell>
                          {f.meta ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <BarraAvance
                                  valor={f.vendido}
                                  meta={f.meta}
                                  esperado={ritmoEsperado(periodo, f.meta)}
                                  compacta
                                />
                              </div>
                              <span className="w-12 text-right text-sm tabular-nums">{avance}%</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatMonto(f.cobrado)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {f.comisionPct}%
                          {f.comisionPropia && (
                            <span className="ml-1 text-xs text-primary" title="% propio de este vendedor en el mes">
                              ●
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold whitespace-nowrap text-status-completed">
                          {formatMonto(f.comision)}
                        </TableCell>
                        {puedeEditar && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Editar meta de ${f.nombre}`}
                              onClick={() => setEditando(f)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            La línea vertical en la barra marca lo que se debería llevar a hoy para cumplir la meta.{" "}
            <span className="text-primary">●</span> = % de comisión propio del vendedor (si no, se usa el global).
          </p>
        </CardContent>
      </Card>

      {datosGrafica.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Venta contra meta</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={datosGrafica}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="nombre" stroke="var(--muted-foreground)" />
                <YAxis stroke="var(--muted-foreground)" tickFormatter={(v) => montoCorto(Number(v))} />
                <Tooltip
                  formatter={(v: any) => formatMonto(Number(v))}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                />
                <Legend />
                <Bar dataKey="Meta" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Vendido" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <EditarMetaDialog
        fila={editando}
        periodo={periodo}
        onClose={() => setEditando(null)}
        onGuardado={() => {
          setEditando(null);
          cargar();
        }}
      />
    </div>
  );
}

/** % de comisión global: editable por el admin primario. */
function ComisionGlobalCard({
  puedeEditar,
  usuarioId,
  onCambio,
}: {
  puedeEditar: boolean;
  usuarioId?: string;
  onCambio: () => void;
}) {
  const [actual, setActual] = useState<number | null>(null);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    obtenerComisionGlobal().then((pct) => {
      setActual(pct);
      setValor(String(pct));
    });
  }, []);

  const numero = Number(valor);
  const valido = valor.trim() !== "" && numero >= 0 && numero <= 100;
  const cambio = valido && numero !== actual;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cambio) return;
    setGuardando(true);
    try {
      await guardarComisionGlobal(numero, usuarioId);
      setActual(numero);
      toast.success(`Comisión general: ${numero} % de lo cobrado`);
      onCambio();
    } catch (err: any) {
      toast.error("No se pudo guardar", { description: err?.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={guardar} className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[240px]">
            <p className="font-medium flex items-center gap-2">
              <Coins className="w-4 h-4 text-primary" /> Comisión general
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Se paga sobre lo cobrado en el mes (sin IVA), no sobre lo vendido: una venta que el cliente aún no paga
              no genera comisión. Puedes dar un % distinto a un vendedor al editar su meta.
            </p>
          </div>
          {puedeEditar ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="com-global">% de lo cobrado</Label>
                <Input
                  id="com-global"
                  type="number"
                  min="0"
                  max="100"
                  step="0.25"
                  className="w-32"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  aria-invalid={!valido}
                  disabled={actual === null}
                />
              </div>
              <Button type="submit" disabled={!cambio || guardando}>
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </>
          ) : (
            <p className="text-2xl font-semibold">{actual === null ? "…" : `${actual}%`}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

/** Meta y % propio de un vendedor en el mes. */
function EditarMetaDialog({
  fila,
  periodo,
  onClose,
  onGuardado,
}: {
  fila: DesempenoVendedor | null;
  periodo: string;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [meta, setMeta] = useState("");
  const [pct, setPct] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!fila) return;
    setMeta(fila.meta != null ? String(fila.meta) : "");
    setPct(fila.comisionPropia ? String(fila.comisionPct) : "");
  }, [fila]);

  const metaNum = meta.trim() === "" ? null : Number(meta);
  const pctNum = pct.trim() === "" ? null : Number(pct);
  const metaValida = metaNum === null || (Number.isFinite(metaNum) && metaNum >= 0);
  const pctValido = pctNum === null || (Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= 100);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fila || !metaValida || !pctValido) return;
    setGuardando(true);
    try {
      await guardarMeta(fila.vendedorId, periodo, metaNum, pctNum);
      toast.success(`Meta de ${fila.nombre} guardada`);
      onGuardado();
    } catch (err: any) {
      toast.error("No se pudo guardar la meta", { description: err?.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={!!fila} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={guardar} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Meta de {fila?.nombre}</DialogTitle>
            <DialogDescription>
              {fila && `Para ${nombreMes(periodo)}. Lleva vendido ${formatMonto(fila.vendido)} sin IVA.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="meta-monto">Meta de venta del mes (sin IVA)</Label>
            <Input
              id="meta-monto"
              type="number"
              min="0"
              step="500"
              placeholder="Sin meta"
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
              aria-invalid={!metaValida}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meta-pct">% de comisión propio</Label>
            <Input
              id="meta-pct"
              type="number"
              min="0"
              max="100"
              step="0.25"
              placeholder="Vacío = usar el % general"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              aria-invalid={!pctValido}
            />
            <p className="text-xs text-muted-foreground">Déjalo vacío para usar la comisión general.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando || !metaValida || !pctValido}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
