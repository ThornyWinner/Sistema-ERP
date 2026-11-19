/**
 * Devoluciones.tsx — Registro de devoluciones y cambios (ruta /devoluciones).
 *
 * Lista las devoluciones visibles (el vendedor, las de sus órdenes; los admins, todas)
 * con filtros por motivo y tipo, y resume piezas devueltas, reembolsos y motivos más
 * frecuentes (útil para detectar problemas de tallas o de calidad). Se registran desde
 * el detalle de la orden.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeftRight, Download, HandCoins, Search, Undo2 } from "lucide-react";
import StatCard from "../components/StatCard";
import { Button } from "../components/ui/button";
import { useBusquedaUrl } from "../hooks/useBusquedaUrl";
import { MOTIVO_DEVOLUCION, cargarDevoluciones, type Devolucion, type MotivoDevolucion } from "../lib/devoluciones";
import { formatFecha, hoyISO } from "../lib/fechas";
import { formatMonto } from "../lib/pagos";
import { descargarArchivo, escribirCsv } from "../lib/facturacion";

export default function Devoluciones() {
  const navigate = useNavigate();
  const [lista, setLista] = useState<Devolucion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useBusquedaUrl();
  const [motivo, setMotivo] = useState<"todos" | MotivoDevolucion>("todos");
  const [tipo, setTipo] = useState<"todos" | "devolucion" | "cambio">("todos");

  useEffect(() => {
    (async () => {
      try {
        setLista(await cargarDevoluciones());
      } catch (err: any) {
        setError(err?.message ?? "Error desconocido");
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const termino = busqueda.trim().toLowerCase();
  const visibles = lista.filter(
    (d) =>
      (motivo === "todos" || d.motivo === motivo) &&
      (tipo === "todos" || d.tipo === tipo) &&
      (!termino ||
        [d.folio, d.ordenFolio, d.cliente, d.descripcion, ...d.partidas.map((p) => p.descripcion)].some((v) =>
          v?.toLowerCase().includes(termino)
        ))
  );

  const piezas = (d: Devolucion) => d.partidas.filter((p) => p.sentido === "devuelve").reduce((s, p) => s + p.cantidad, 0);
  const totales = useMemo(() => {
    const porMotivo = new Map<MotivoDevolucion, number>();
    for (const d of visibles) porMotivo.set(d.motivo, (porMotivo.get(d.motivo) ?? 0) + piezas(d));
    return {
      piezas: visibles.reduce((s, d) => s + piezas(d), 0),
      cambios: visibles.filter((d) => d.tipo === "cambio").length,
      reembolsado: visibles.reduce((s, d) => s + d.reembolso, 0),
      porMotivo: [...porMotivo.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [visibles]);

  const exportar = () => {
    const csv = escribirCsv(
      ["Folio", "Fecha", "Orden", "Cliente", "Tipo", "Motivo", "Detalle", "Piezas devueltas", "Total anterior", "Total nuevo", "Reembolso"],
      visibles.map((d) => [
        d.folio,
        d.fecha,
        d.ordenFolio ?? "",
        d.cliente ?? "",
        d.tipo === "cambio" ? "Cambio" : "Devolución",
        MOTIVO_DEVOLUCION[d.motivo],
        d.descripcion ?? "",
        piezas(d),
        d.totalAnterior,
        d.totalNuevo,
        d.reembolso,
      ])
    );
    descargarArchivo(`devoluciones-${hoyISO()}.csv`, csv);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Devoluciones y cambios</h1>
          <p className="text-muted-foreground mt-1">
            Piezas que regresaron los clientes, cambios de talla y reembolsos. Se registran desde la orden.
          </p>
        </div>
        <Button variant="outline" onClick={exportar} disabled={visibles.length === 0}>
          <Download className="w-4 h-4" />
          Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Piezas devueltas" value={totales.piezas} icon={Undo2} />
        <StatCard title="Cambios de talla / producto" value={totales.cambios} icon={ArrowLeftRight} color="warning" />
        <StatCard title="Reembolsado" value={formatMonto(totales.reembolsado)} icon={HandCoins} color="danger" />
      </div>

      {totales.porMotivo.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="text-muted-foreground">Piezas por motivo:</span>
          {totales.porMotivo.map(([m, n]) => (
            <span key={m} className="rounded-full bg-secondary px-3 py-1">
              {MOTIVO_DEVOLUCION[m]} · {n}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por folio, orden, cliente o producto…"
            aria-label="Buscar devoluciones"
            className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          aria-label="Filtrar por motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value as typeof motivo)}
          className="px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none"
        >
          <option value="todos">Todos los motivos</option>
          {Object.entries(MOTIVO_DEVOLUCION).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as typeof tipo)}
          className="px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none"
        >
          <option value="todos">Devoluciones y cambios</option>
          <option value="devolucion">Solo devoluciones</option>
          <option value="cambio">Solo cambios</option>
        </select>
      </div>

      {error ? (
        <div className="rounded-lg border border-status-pending p-6 text-sm">
          No se pudieron cargar las devoluciones: {error}. ¿Ya se aplicó sql/devoluciones.sql?
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Orden / cliente</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Piezas</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Reembolso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cargando && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Cargando…
                  </td>
                </tr>
              )}
              {!cargando && visibles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No hay devoluciones registradas{lista.length > 0 ? " con estos filtros" : ""}.
                  </td>
                </tr>
              )}
              {visibles.map((d) => (
                <tr key={d.id} onClick={() => navigate(`/ordenes/${d.ordenId}`)} className="cursor-pointer hover:bg-secondary/40">
                  <td className="px-4 py-3">
                    <p className="font-medium">{d.folio}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFecha(d.fecha)} · {d.tipo === "cambio" ? "Cambio" : "Devolución"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{d.ordenFolio}</p>
                    <p className="text-xs text-muted-foreground">{d.cliente}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{MOTIVO_DEVOLUCION[d.motivo]}</p>
                    {d.descripcion && <p className="text-xs text-muted-foreground line-clamp-2">{d.descripcion}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {d.partidas.map((p) => (
                      <p key={p.id} className="text-xs">
                        {p.sentido === "devuelve" ? "↩ " : "↪ "}
                        {p.descripcion}
                      </p>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatMonto(d.totalAnterior)} → {formatMonto(d.totalNuevo)}
                  </td>
                  <td className="px-4 py-3 text-right">{d.reembolso > 0 ? formatMonto(d.reembolso) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
