/**
 * ListaTallasDialog.tsx — Alta y edición de una lista de tallas para el cliente.
 *
 * Cliente, título, instrucciones, fecha límite y prendas. Cada prenda puede tomarse del
 * catálogo (trae sus tallas y precio) o escribirse a mano; las tallas disponibles se
 * eligen con atajos (camisa, pantalón, dama, calzado) o escribiéndolas.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { useErpData } from "../../context/ErpDataContext";
import { supabase } from "../../lib/supabase";
import { TIPOS_PRENDA } from "../../data/mockData";
import {
  PRESETS_TALLAS,
  nuevaClave,
  validarLista,
  type ListaCaptura,
  type ProductoLista,
} from "../../lib/listasTallas";

const claseCampo =
  "w-full px-3 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm";

const prendaVacia = (): ProductoLista => ({
  clave: nuevaClave(),
  nombre: "",
  color: "",
  tallas: [...PRESETS_TALLAS[0].tallas],
  tipoPrenda: "camisa",
});

interface Props {
  open: boolean;
  onClose: () => void;
  /** Lista a editar (sin ella, alta). */
  inicial?: ListaCaptura;
  onGuardar: (l: ListaCaptura) => Promise<boolean>;
}

export default function ListaTallasDialog({ open, onClose, inicial, onGuardar }: Props) {
  const { productos: catalogo } = useErpData();
  const [lista, setLista] = useState<ListaCaptura>({ clienteNombre: "", titulo: "", productos: [prendaVacia()] });
  const [clientes, setClientes] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  // Texto que se está escribiendo en el campo "agregar talla" de cada prenda.
  const [tallaNueva, setTallaNueva] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setLista(inicial ?? { clienteNombre: "", titulo: "", instrucciones: "", cierra: "", productos: [prendaVacia()] });
    setTallaNueva({});
    supabase
      .from("clientes")
      .select("razon_social")
      .order("razon_social")
      .then(({ data }) => setClientes((data ?? []).map((c: { razon_social: string }) => c.razon_social)));
  }, [open, inicial]);

  const nombresCatalogo = useMemo(() => catalogo.map((p) => p.nombre), [catalogo]);

  const cambiarPrenda = (i: number, cambios: Partial<ProductoLista>) =>
    setLista((l) => ({ ...l, productos: l.productos.map((p, j) => (j === i ? { ...p, ...cambios } : p)) }));

  const elegirNombre = (i: number, nombre: string) => {
    const prod = catalogo.find((p) => p.nombre.trim().toLowerCase() === nombre.trim().toLowerCase());
    if (!prod) {
      cambiarPrenda(i, { nombre, productoId: undefined });
      return;
    }
    cambiarPrenda(i, {
      nombre: prod.nombre,
      productoId: prod.id,
      tipoPrenda: prod.tipo,
      tallas: prod.tallas.length ? [...prod.tallas] : lista.productos[i].tallas,
      color: lista.productos[i].color || (prod.colores.length === 1 ? prod.colores[0] : ""),
      precioUnitario: lista.productos[i].precioUnitario || prod.precio || undefined,
    });
  };

  const agregarTalla = (i: number) => {
    const p = lista.productos[i];
    const nuevas = (tallaNueva[p.clave] ?? "")
      .split(/[,\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t && !p.tallas.includes(t));
    if (nuevas.length) cambiarPrenda(i, { tallas: [...p.tallas, ...nuevas] });
    setTallaNueva({ ...tallaNueva, [p.clave]: "" });
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const problema = validarLista(lista);
    if (problema) {
      toast.error(problema);
      return;
    }
    setGuardando(true);
    try {
      if (await onGuardar(lista)) onClose();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !guardando && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{inicial ? "Editar lista de tallas" : "Nueva lista de tallas"}</DialogTitle>
          <DialogDescription>
            El cliente recibe un enlace; cada persona elige su talla desde el celular, sin cuenta.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="lt-cliente">
                Cliente *
              </label>
              <input
                id="lt-cliente"
                list="lt-clientes"
                value={lista.clienteNombre}
                onChange={(e) => setLista({ ...lista, clienteNombre: e.target.value })}
                className={claseCampo}
                placeholder="Razón social"
                required
              />
              <datalist id="lt-clientes">
                {clientes.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="lt-titulo">
                Título *
              </label>
              <input
                id="lt-titulo"
                value={lista.titulo}
                onChange={(e) => setLista({ ...lista, titulo: e.target.value })}
                className={claseCampo}
                placeholder="Ej: Uniformes 2027 — Planta Ramos"
                maxLength={150}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1" htmlFor="lt-instr">
                Instrucciones para el personal
              </label>
              <textarea
                id="lt-instr"
                value={lista.instrucciones ?? ""}
                onChange={(e) => setLista({ ...lista, instrucciones: e.target.value })}
                className={claseCampo}
                rows={2}
                maxLength={1000}
                placeholder="Ej: Elige tu talla de siempre; las camisas son corte regular."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="lt-cierra">
                Fecha límite
              </label>
              <input
                id="lt-cierra"
                type="date"
                value={lista.cierra ?? ""}
                onChange={(e) => setLista({ ...lista, cierra: e.target.value })}
                className={claseCampo}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Prendas ({lista.productos.length})</h3>
              <button
                type="button"
                onClick={() => setLista({ ...lista, productos: [...lista.productos, prendaVacia()] })}
                disabled={lista.productos.length >= 20}
                className="flex items-center gap-1 text-sm text-primary disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> Agregar prenda
              </button>
            </div>
            <datalist id="lt-catalogo">
              {nombresCatalogo.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            {lista.productos.map((p, i) => (
              <div key={p.clave} className="p-3 border border-border rounded-lg space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-5">
                    <label className="block text-xs text-muted-foreground mb-1">Prenda *</label>
                    <input
                      list="lt-catalogo"
                      value={p.nombre}
                      onChange={(e) => elegirNombre(i, e.target.value)}
                      className={claseCampo}
                      placeholder="Del catálogo o a mano"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs text-muted-foreground mb-1">Color</label>
                    <input value={p.color} onChange={(e) => cambiarPrenda(i, { color: e.target.value })} className={claseCampo} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-muted-foreground mb-1">Tipo</label>
                    <select
                      value={p.tipoPrenda ?? "camisa"}
                      onChange={(e) => cambiarPrenda(i, { tipoPrenda: e.target.value })}
                      className={claseCampo}
                    >
                      {TIPOS_PRENDA.map((t) => (
                        <option key={t.valor} value={t.valor}>
                          {t.etiqueta}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2 flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-xs text-muted-foreground mb-1">Precio</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={p.precioUnitario ?? ""}
                        onChange={(e) => cambiarPrenda(i, { precioUnitario: parseFloat(e.target.value) || undefined })}
                        className={claseCampo}
                        title="Precio unitario antes de IVA (no lo ve el cliente)"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setLista({ ...lista, productos: lista.productos.filter((_, j) => j !== i) })}
                      disabled={lista.productos.length === 1}
                      className="p-2 rounded hover:bg-secondary text-red-600 dark:text-red-400 disabled:opacity-30"
                      aria-label={`Quitar ${p.nombre || "prenda"}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground mr-1">Tallas:</span>
                    {p.tallas.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-secondary text-xs">
                        {t}
                        <button
                          type="button"
                          onClick={() => cambiarPrenda(i, { tallas: p.tallas.filter((x) => x !== t) })}
                          aria-label={`Quitar talla ${t}`}
                          className="hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      value={tallaNueva[p.clave] ?? ""}
                      onChange={(e) => setTallaNueva({ ...tallaNueva, [p.clave]: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          agregarTalla(i);
                        }
                      }}
                      onBlur={() => agregarTalla(i)}
                      className="w-24 px-2 py-0.5 text-xs bg-input-background border border-border rounded"
                      placeholder="+ talla"
                      aria-label="Agregar talla"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {PRESETS_TALLAS.map((pr) => (
                      <button
                        key={pr.nombre}
                        type="button"
                        onClick={() => cambiarPrenda(i, { tallas: [...pr.tallas] })}
                        className="text-xs px-2 py-0.5 rounded border border-border hover:bg-secondary"
                      >
                        {pr.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={guardando} className="px-4 py-2 bg-secondary rounded-lg hover:bg-secondary/80 text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm disabled:opacity-50"
            >
              {guardando ? "Guardando…" : inicial ? "Guardar cambios" : "Crear lista"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
