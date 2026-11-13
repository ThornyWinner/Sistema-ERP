/**
 * PartidaDialog.tsx — Alta o edición de una partida (concepto) de la factura.
 *
 * Pestañas como en CONTPAQi: Concepto (producto, descripción, claves SAT, cantidad,
 * valor unitario, descuento) e Impuestos (objeto de impuesto y tasa de IVA).
 * Al elegir un producto del catálogo se copian su código, claves SAT, unidad y precio.
 */
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { CLAVES_PROD_SERV, CLAVES_UNIDAD, OBJETOS_IMPUESTO, etiquetaSat } from "../../lib/sat";
import { calcularConcepto, formatMoneda, type ConceptoCfdi } from "../../lib/facturacion";

export interface ProductoFacturable {
  id: string;
  nombre: string;
  codigo: string | null;
  clave_prod_serv: string | null;
  clave_unidad: string | null;
  unidad_medida: string | null;
  objeto_imp: string | null;
  variantes_producto: { talla: string | null; color: string | null; precio: number | null; sku: string | null }[];
}

const CLASE_SELECT =
  "h-9 w-full rounded-md border border-input bg-input-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

const VACIA: ConceptoCfdi = {
  producto_id: null,
  sku: "",
  descripcion: "",
  clave_prod_serv: "",
  clave_unidad: "H87",
  unidad: "Pieza",
  cantidad: 1,
  valor_unitario: 0,
  descuento: 0,
  objeto_imp: "02",
  tasa_iva: 0.16,
};

export default function PartidaDialog({
  open,
  inicial,
  productos,
  onClose,
  onGuardar,
}: {
  open: boolean;
  inicial: ConceptoCfdi | null;
  productos: ProductoFacturable[];
  onClose: () => void;
  /** `otra` = "Guardar y nueva partida". */
  onGuardar: (c: ConceptoCfdi, otra: boolean) => void;
}) {
  const [pestana, setPestana] = useState<"concepto" | "impuestos">("concepto");
  const [p, setP] = useState<ConceptoCfdi>(VACIA);
  const [descPct, setDescPct] = useState("0");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const base = inicial ?? VACIA;
    setP(base);
    const { importe } = calcularConcepto({ ...base, descuento: 0 });
    setDescPct(importe > 0 ? String(Math.round((base.descuento / importe) * 10000) / 100) : "0");
    setPestana("concepto");
    setError(null);
  }, [open, inicial]);

  const { importe, iva } = calcularConcepto(p);
  const cambiar = (c: Partial<ConceptoCfdi>) => setP((x) => ({ ...x, ...c }));

  // Cambiar cantidad o precio recalcula el descuento con el mismo porcentaje.
  const cambiarBase = (c: Partial<ConceptoCfdi>) => {
    const nuevo = { ...p, ...c };
    const imp = calcularConcepto({ ...nuevo, descuento: 0 }).importe;
    nuevo.descuento = Math.round(imp * (Number(descPct) || 0)) / 100;
    setP(nuevo);
  };

  const elegirProducto = (id: string) => {
    const prod = productos.find((x) => x.id === id);
    if (!prod) {
      cambiar({ producto_id: null });
      return;
    }
    const precio = Number(prod.variantes_producto[0]?.precio ?? 0);
    cambiarBase({
      producto_id: prod.id,
      sku: prod.codigo ?? prod.variantes_producto[0]?.sku ?? "",
      descripcion: prod.nombre.toUpperCase(),
      clave_prod_serv: prod.clave_prod_serv ?? "",
      clave_unidad: prod.clave_unidad ?? "H87",
      unidad: prod.unidad_medida ?? "Pieza",
      objeto_imp: prod.objeto_imp ?? "02",
      valor_unitario: precio,
    });
  };

  const guardar = (otra: boolean) => {
    if (!p.descripcion.trim()) return setError("Escribe la descripción del concepto");
    if (!/^[0-9]{8}$/.test(p.clave_prod_serv)) return setError("La clave de producto o servicio lleva 8 dígitos");
    if (!p.clave_unidad.trim()) return setError("Indica la clave de unidad");
    if (!(p.cantidad > 0)) return setError("La cantidad debe ser mayor que cero");
    if (p.valor_unitario < 0) return setError("El valor unitario no puede ser negativo");
    if (p.descuento > importe) return setError("El descuento no puede ser mayor que el importe");
    onGuardar(
      {
        ...p,
        descripcion: p.descripcion.trim(),
        clave_unidad: p.clave_unidad.trim().toUpperCase(),
        cantidad: Math.round(p.cantidad * 100) / 100,
        valor_unitario: Math.round(p.valor_unitario * 100) / 100,
        descuento: Math.round(p.descuento * 100) / 100,
      },
      otra
    );
    if (otra) {
      setP(VACIA);
      setDescPct("0");
      setPestana("concepto");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{inicial ? "Editar partida" : "Agregar partida"}</DialogTitle>
          <DialogDescription>Precios antes de IVA, como en el catálogo.</DialogDescription>
        </DialogHeader>

        <div className="flex border-b border-border" role="tablist">
          {(["concepto", "impuestos"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={pestana === t}
              onClick={() => setPestana(t)}
              className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
                pestana === t ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "concepto" ? "Concepto" : "Impuestos"}
            </button>
          ))}
        </div>

        {pestana === "concepto" ? (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-4 space-y-1.5">
              <Label>Producto del catálogo (opcional)</Label>
              <select value={p.producto_id ?? ""} onChange={(e) => elegirProducto(e.target.value)} className={CLASE_SELECT}>
                <option value="">— Concepto libre —</option>
                {productos.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.codigo ? `${x.codigo} · ` : ""}
                    {x.nombre}
                    {x.clave_prod_serv ? "" : " (sin clave SAT)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>SKU / código</Label>
              <Input value={p.sku ?? ""} onChange={(e) => cambiar({ sku: e.target.value })} />
            </div>
            <div className="sm:col-span-3 space-y-1.5">
              <Label>Descripción *</Label>
              <Input value={p.descripcion} onChange={(e) => cambiar({ descripcion: e.target.value })} placeholder="PLAYERA TIPO POLO CON BORDADO" />
            </div>
            <div className="space-y-1.5">
              <Label>Unidad de medida</Label>
              <Input value={p.unidad ?? ""} onChange={(e) => cambiar({ unidad: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Clave de unidad *</Label>
              <Input list="sat-unidades" value={p.clave_unidad} onChange={(e) => cambiar({ clave_unidad: e.target.value.toUpperCase() })} />
              <datalist id="sat-unidades">
                {CLAVES_UNIDAD.map((u) => (
                  <option key={u.clave} value={u.clave}>
                    {u.descripcion}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Clave de producto o servicio *</Label>
              <Input
                list="sat-prodserv"
                inputMode="numeric"
                maxLength={8}
                value={p.clave_prod_serv}
                onChange={(e) => cambiar({ clave_prod_serv: e.target.value.replace(/\D/g, "") })}
                placeholder="53102700"
              />
              <datalist id="sat-prodserv">
                {CLAVES_PROD_SERV.map((c) => (
                  <option key={c.clave} value={c.clave}>
                    {c.descripcion}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Cantidad *</Label>
              <Input type="number" min="0.01" step="0.01" value={p.cantidad} onChange={(e) => cambiarBase({ cantidad: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor unitario *</Label>
              <Input type="number" min="0" step="0.01" value={p.valor_unitario} onChange={(e) => cambiarBase({ valor_unitario: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Descuento %</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={descPct}
                onChange={(e) => {
                  setDescPct(e.target.value);
                  const imp = calcularConcepto({ ...p, descuento: 0 }).importe;
                  cambiar({ descuento: Math.round(imp * (Number(e.target.value) || 0)) / 100 });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Importe descuento</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={p.descuento}
                onChange={(e) => {
                  const d = Number(e.target.value) || 0;
                  cambiar({ descuento: d });
                  setDescPct(importe > 0 ? String(Math.round((d / importe) * 10000) / 100) : "0");
                }}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Objeto de impuesto</Label>
              <select value={p.objeto_imp} onChange={(e) => cambiar({ objeto_imp: e.target.value })} className={CLASE_SELECT}>
                {OBJETOS_IMPUESTO.map((o) => (
                  <option key={o.clave} value={o.clave}>
                    {etiquetaSat(o)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>IVA trasladado (tasa)</Label>
              <select
                value={String(p.tasa_iva)}
                onChange={(e) => cambiar({ tasa_iva: Number(e.target.value) })}
                disabled={p.objeto_imp !== "02"}
                className={CLASE_SELECT}
              >
                <option value="0.16">16 %</option>
                <option value="0.08">8 % (región fronteriza)</option>
                <option value="0">0 %</option>
              </select>
            </div>
            <div className="sm:col-span-2 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Base</th>
                    <th className="px-3 py-2 text-left font-medium">Impuesto</th>
                    <th className="px-3 py-2 text-left font-medium">Tipo factor</th>
                    <th className="px-3 py-2 text-left font-medium">Tasa</th>
                    <th className="px-3 py-2 text-right font-medium">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {p.objeto_imp === "02" ? (
                    <tr>
                      <td className="px-3 py-2 tabular-nums">{formatMoneda(importe - p.descuento)}</td>
                      <td className="px-3 py-2">002 - IVA</td>
                      <td className="px-3 py-2">Tasa</td>
                      <td className="px-3 py-2 tabular-nums">{p.tasa_iva.toFixed(6)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoneda(iva)}</td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-3 py-3 text-center text-muted-foreground">
                        Sin impuestos trasladados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm border-t border-border pt-3">
          <span className="text-muted-foreground">
            Importe <strong className="text-foreground tabular-nums">{formatMoneda(importe)}</strong>
          </span>
          {p.descuento > 0 && (
            <span className="text-muted-foreground">
              Descuento <strong className="text-foreground tabular-nums">−{formatMoneda(p.descuento)}</strong>
            </span>
          )}
          <span className="text-muted-foreground">
            IVA <strong className="text-foreground tabular-nums">{formatMoneda(iva)}</strong>
          </span>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          {!inicial && (
            <Button variant="secondary" onClick={() => guardar(true)}>
              Guardar y nueva partida
            </Button>
          )}
          <Button onClick={() => guardar(false)}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
