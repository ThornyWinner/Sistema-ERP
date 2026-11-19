/**
 * DevolucionDialog.tsx — Registrar una devolución o un cambio de talla de una orden.
 *
 *  1. Motivo.
 *  2. Piezas que regresa el cliente (solo partidas terminadas) y a qué variante del
 *     inventario regresan, o si no regresan (dañadas / hechas a la medida).
 *  3. Opcional: piezas que se lleva a cambio, del inventario (con "Cambiar talla" se
 *     propone el mismo producto).
 *  4. Resultado: nuevo total estimado y, si pagó de más, reembolso (o saldo a favor).
 *
 * Todo se guarda en una sola transacción con registrar_devolucion (sql/devoluciones.sql).
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Plus, Trash2, Undo2 } from "lucide-react";
import { useErpData } from "../../context/ErpDataContext";
import { describirVariante, type Orden, type ProductoOrden } from "../../data/mockData";
import {
  METODOS_REEMBOLSO,
  MOTIVO_DEVOLUCION,
  estimarDevolucion,
  partidaDevolvible,
  registrarDevolucion,
  type MotivoDevolucion,
  type PiezaACambio,
  type PiezaDevuelta,
} from "../../lib/devoluciones";
import { formatMonto } from "../../lib/pagos";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

const CLASE_CAMPO =
  "w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

interface FilaCambio extends PiezaACambio {
  clave: number;
  productoId: string;
  /** Cambio de talla de una pieza devuelta: conserva el precio que pagó. */
  mismoPrecio: boolean;
}

let claves = 0;

export default function DevolucionDialog({
  orden,
  open,
  onClose,
  onRegistrada,
}: {
  orden: Orden;
  open: boolean;
  onClose: () => void;
  onRegistrada: () => void;
}) {
  const { productos: catalogo, refresh } = useErpData();
  const [motivo, setMotivo] = useState<MotivoDevolucion>("talla");
  const [descripcion, setDescripcion] = useState("");
  const [devueltas, setDevueltas] = useState<PiezaDevuelta[]>([]);
  const [cambios, setCambios] = useState<FilaCambio[]>([]);
  const [reembolsar, setReembolsar] = useState(true);
  const [metodo, setMetodo] = useState<string>("Efectivo");
  const [guardando, setGuardando] = useState(false);

  const devolvibles = orden.productos.filter(partidaDevolvible);
  const variantes = useMemo(
    () => new Map(catalogo.flatMap((p) => p.variantes.map((v) => [v.id, { ...v, productoId: p.id, producto: p.nombre }] as const))),
    [catalogo]
  );

  useEffect(() => {
    if (!open) return;
    setMotivo("talla");
    setDescripcion("");
    setDevueltas(
      devolvibles.map((p) => ({ detalleId: p.id, cantidad: 0, reingresarVarianteId: p.varianteId ?? null }))
    );
    setCambios([]);
    setReembolsar(true);
    setMetodo("Efectivo");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orden.id]);

  const actualizarDevuelta = (detalleId: string, cambiosFila: Partial<PiezaDevuelta>) =>
    setDevueltas((prev) => prev.map((d) => (d.detalleId === detalleId ? { ...d, ...cambiosFila } : d)));

  const agregarCambio = (p?: ProductoOrden, cantidad = 1) =>
    setCambios((prev) => [
      ...prev,
      {
        clave: ++claves,
        productoId: p?.productoId ?? "",
        varianteId: "",
        cantidad,
        precioUnitario: p?.precioUnitario ?? 0,
        mismoPrecio: !!p,
      },
    ]);

  const actualizarCambio = (clave: number, c: Partial<FilaCambio>) =>
    setCambios((prev) => prev.map((f) => (f.clave === clave ? { ...f, ...c } : f)));

  const piezasDevueltas = devueltas.reduce((s, d) => s + d.cantidad, 0);
  const cambiosValidos = cambios.filter((c) => c.varianteId && c.cantidad > 0);
  const estimado = estimarDevolucion(orden, devueltas, cambiosValidos);
  const esCambio = cambiosValidos.length > 0;

  // Piezas apartadas por fila de cambio para no pedir más de lo que hay en stock.
  const disponible = (varianteId: string, clave: number) => {
    const v = variantes.get(varianteId);
    if (!v) return 0;
    const apartado = cambios.reduce((s, c) => (c.clave !== clave && c.varianteId === varianteId ? s + c.cantidad : s), 0);
    const regresa = devueltas.reduce((s, d) => (d.reingresarVarianteId === varianteId ? s + d.cantidad : s), 0);
    return Math.max(v.stock + regresa - apartado, 0);
  };

  const guardar = async () => {
    if (piezasDevueltas === 0) {
      toast.error("Indica cuántas piezas regresa el cliente");
      return;
    }
    if (motivo === "otro" && !descripcion.trim()) {
      toast.error("Describe el motivo");
      return;
    }
    const incompleta = cambios.find((c) => !c.varianteId || c.cantidad <= 0);
    if (incompleta) {
      toast.error("Completa o quita las piezas a cambio sin talla elegida");
      return;
    }
    const sinStock = cambios.find((c) => c.cantidad > disponible(c.varianteId, c.clave));
    if (sinStock) {
      toast.error(`No hay stock suficiente de ${variantes.get(sinStock.varianteId)?.producto ?? "la prenda elegida"}`);
      return;
    }
    setGuardando(true);
    try {
      const r = await registrarDevolucion(orden.id, {
        motivo,
        descripcion,
        devueltas,
        nuevas: cambios,
        reembolsar: reembolsar && estimado.aFavor > 0,
        metodoReembolso: metodo,
      });
      const partes = [
        `Total: ${formatMonto(r.total_anterior)} → ${formatMonto(r.total_nuevo)}`,
        r.reembolso > 0 ? `Reembolso: ${formatMonto(r.reembolso)}` : null,
        r.saldo_a_favor > 0 ? `Saldo a favor: ${formatMonto(r.saldo_a_favor)}` : null,
        r.por_cobrar > 0 ? `Por cobrar: ${formatMonto(r.por_cobrar)}` : null,
        r.factura ? `Tiene factura ${r.factura}: se avisó al administrador para la nota de crédito.` : null,
      ].filter(Boolean);
      toast.success(`${esCambio ? "Cambio" : "Devolución"} ${r.folio} registrado`, { description: partes.join(" · "), duration: 10000 });
      await refresh();
      onRegistrada();
    } catch (err: any) {
      toast.error("No se pudo registrar", { description: err?.message, duration: 10000 });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !guardando && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Devolución o cambio · {orden.numero}</DialogTitle>
          <DialogDescription>{orden.cliente}</DialogDescription>
        </DialogHeader>

        {devolvibles.length === 0 ? (
          <p className="rounded-md bg-secondary p-4 text-sm">
            No hay piezas terminadas para devolver. Si la orden sigue en producción, usa “Editar orden”.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dev-motivo">Motivo</Label>
                <select id="dev-motivo" className={CLASE_CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoDevolucion)}>
                  {Object.entries(MOTIVO_DEVOLUCION).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="dev-desc">Detalle {motivo === "otro" ? "*" : "(opcional)"}</Label>
                <input
                  id="dev-desc"
                  className={CLASE_CAMPO}
                  maxLength={2000}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Le quedó chica la M, costura abierta en la manga…"
                />
              </div>
            </div>

            {/* Piezas que regresa */}
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 font-medium">
                <Undo2 className="w-4 h-4 text-primary" />
                Piezas que regresa el cliente
              </h3>
              <div className="space-y-2">
                {devolvibles.map((p) => {
                  const d = devueltas.find((x) => x.detalleId === p.id);
                  if (!d) return null;
                  const opciones = p.productoId
                    ? catalogo.find((c) => c.id === p.productoId)?.variantes ?? []
                    : [];
                  return (
                    <div key={p.id} className="rounded-md border border-border p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      <div className="md:col-span-5 min-w-0">
                        <p className="font-medium truncate">{p.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {[p.talla && `Talla ${p.talla}`, p.color].filter(Boolean).join(" · ") || "—"} · {p.cantidad} pza(s) ·{" "}
                          {formatMonto(p.precioUnitario)} c/u
                          {p.cantidadDevuelta ? ` · ya devolvió ${p.cantidadDevuelta}` : ""}
                        </p>
                      </div>
                      <div className="md:col-span-2 space-y-1">
                        <Label htmlFor={`dev-cant-${p.id}`} className="text-xs">
                          Regresa
                        </Label>
                        <input
                          id={`dev-cant-${p.id}`}
                          type="number"
                          min={0}
                          max={p.cantidad}
                          value={d.cantidad}
                          onChange={(e) =>
                            actualizarDevuelta(p.id, { cantidad: Math.min(Math.max(Math.trunc(Number(e.target.value) || 0), 0), p.cantidad) })
                          }
                          className={CLASE_CAMPO}
                        />
                      </div>
                      <div className="md:col-span-3 space-y-1">
                        <Label htmlFor={`dev-reing-${p.id}`} className="text-xs">
                          ¿Vuelve al inventario?
                        </Label>
                        <select
                          id={`dev-reing-${p.id}`}
                          className={CLASE_CAMPO}
                          value={d.reingresarVarianteId ?? ""}
                          onChange={(e) => actualizarDevuelta(p.id, { reingresarVarianteId: e.target.value || null })}
                        >
                          <option value="">No (dañada / a la medida)</option>
                          {opciones.map((v) => (
                            <option key={v.id} value={v.id}>
                              Sí: {describirVariante(v)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={!p.productoId}
                          title={p.productoId ? "Agregar la misma prenda en otra talla" : "Producto fuera de catálogo: elige la prenda abajo"}
                          onClick={() => {
                            if (d.cantidad === 0) actualizarDevuelta(p.id, { cantidad: p.cantidad });
                            agregarCambio(p, d.cantidad || p.cantidad);
                          }}
                        >
                          <ArrowLeftRight className="w-4 h-4" />
                          Cambiar talla
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Piezas a cambio */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-medium">
                  <ArrowLeftRight className="w-4 h-4 text-primary" />
                  Se lleva a cambio <span className="text-sm font-normal text-muted-foreground">(del inventario, opcional)</span>
                </h3>
                <Button type="button" size="sm" variant="ghost" onClick={() => agregarCambio()}>
                  <Plus className="w-4 h-4" />
                  Agregar prenda
                </Button>
              </div>
              {cambios.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Si solo regresa piezas, déjalo vacío. Si la prenda nueva hay que fabricarla, registra la devolución y crea una
                  orden nueva.
                </p>
              )}
              {cambios.map((c) => {
                const producto = catalogo.find((p) => p.id === c.productoId);
                return (
                  <div key={c.clave} className="rounded-md border border-border p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-4 space-y-1">
                      <Label className="text-xs" htmlFor={`cam-prod-${c.clave}`}>
                        Producto
                      </Label>
                      <select
                        id={`cam-prod-${c.clave}`}
                        className={CLASE_CAMPO}
                        value={c.productoId}
                        onChange={(e) => actualizarCambio(c.clave, { productoId: e.target.value, varianteId: "", mismoPrecio: false })}
                      >
                        <option value="">Elige…</option>
                        {catalogo
                          .filter((p) => p.stock > 0 || p.id === c.productoId)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="md:col-span-4 space-y-1">
                      <Label className="text-xs" htmlFor={`cam-var-${c.clave}`}>
                        Talla / color
                      </Label>
                      <select
                        id={`cam-var-${c.clave}`}
                        className={CLASE_CAMPO}
                        value={c.varianteId}
                        disabled={!producto}
                        onChange={(e) => {
                          const v = variantes.get(e.target.value);
                          actualizarCambio(c.clave, {
                            varianteId: e.target.value,
                            precioUnitario: c.mismoPrecio ? c.precioUnitario : v?.precio ?? c.precioUnitario,
                          });
                        }}
                      >
                        <option value="">Elige…</option>
                        {(producto?.variantes ?? []).map((v) => (
                          <option key={v.id} value={v.id} disabled={disponible(v.id, c.clave) <= 0 && v.id !== c.varianteId}>
                            {describirVariante(v)} — {disponible(v.id, c.clave)} en stock
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-1 space-y-1">
                      <Label className="text-xs" htmlFor={`cam-cant-${c.clave}`}>
                        Piezas
                      </Label>
                      <input
                        id={`cam-cant-${c.clave}`}
                        type="number"
                        min={1}
                        value={c.cantidad}
                        onChange={(e) => actualizarCambio(c.clave, { cantidad: Math.max(Math.trunc(Number(e.target.value) || 0), 0) })}
                        className={CLASE_CAMPO}
                      />
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <Label className="text-xs" htmlFor={`cam-precio-${c.clave}`}>
                        Precio c/u (sin IVA)
                      </Label>
                      <input
                        id={`cam-precio-${c.clave}`}
                        type="number"
                        min={0}
                        step="0.01"
                        value={c.precioUnitario}
                        onChange={(e) => actualizarCambio(c.clave, { precioUnitario: Math.max(Number(e.target.value) || 0, 0) })}
                        className={CLASE_CAMPO}
                      />
                    </div>
                    <div className="md:col-span-1 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Quitar prenda a cambio"
                        onClick={() => setCambios((prev) => prev.filter((x) => x.clave !== c.clave))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </section>

            {/* Resultado */}
            <section className="rounded-md bg-secondary p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span>Total actual (con IVA)</span>
                <span>{formatMonto(estimado.totalActual)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Total nuevo (estimado)</span>
                <span>{formatMonto(estimado.totalNuevo)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Pagado por el cliente</span>
                <span>{formatMonto(estimado.pagado)}</span>
              </div>
              {estimado.aFavor > 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={reembolsar} onChange={(e) => setReembolsar(e.target.checked)} />
                    Reembolsar <strong>{formatMonto(estimado.aFavor)}</strong> al cliente
                  </label>
                  {reembolsar ? (
                    <select
                      aria-label="Método del reembolso"
                      className={CLASE_CAMPO}
                      value={metodo}
                      onChange={(e) => setMetodo(e.target.value)}
                    >
                      {METODOS_REEMBOLSO.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-muted-foreground">Quedará como saldo a favor del cliente en esta orden.</p>
                  )}
                </div>
              )}
              {estimado.porCobrar > 0 && estimado.totalNuevo > estimado.totalActual && (
                <p className="pt-2 border-t border-border text-status-pending-text">
                  La prenda a cambio cuesta más: quedan {formatMonto(estimado.porCobrar)} por cobrar (registra el abono en la orden).
                </p>
              )}
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          {devolvibles.length > 0 && (
            <Button onClick={guardar} disabled={guardando || piezasDevueltas === 0}>
              {guardando ? "Guardando…" : esCambio ? "Registrar cambio" : "Registrar devolución"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
