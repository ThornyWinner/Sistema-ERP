/**
 * EditarOrdenDialog.tsx — Edición de una orden cuando el cliente pide cambios.
 *
 * Lo abre desde OrdenDetalle, mientras la orden no esté Entregada ni Cancelada:
 *  - el admin primario, en cualquier orden;
 *  - el admin secundario y los vendedores, solo en las órdenes que registraron ellos.
 * Permite cambiar:
 *  - Fecha de entrega, notas y contacto del cliente (teléfono y correo).
 *  - Partidas: agregar, quitar y modificar producto/variante, cantidad, precio, tipo
 *    de producción, talleres, personalización (bordado) y notas.
 *  - Descuento de la orden.
 *
 * Reglas (las vuelve a validar la función editar_orden de la BD, que aplica todo en
 * una sola transacción):
 *  - Una partida en la que algún taller ya empezó o terminó queda bloqueada: no se
 *    puede modificar ni quitar.
 *  - La cantidad no puede superar el stock disponible de la variante elegida.
 *  - El nuevo total no puede quedar por debajo de lo que el cliente ya pagó.
 *  - Es obligatorio escribir el motivo del cambio: se guarda en el historial de la
 *    orden y se envía como aviso al admin primario y a los talleres afectados.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import type { Orden, ProductoOrden, Taller } from "../data/mockData";
import { useErpData, type CambiosOrden, type PartidaEditada } from "../context/ErpDataContext";
import { formatMonto, redondearCentavos, totalPagado } from "../lib/pagos";
import { calcularImportes } from "../lib/impuestos";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

interface EditarOrdenDialogProps {
  orden: Orden;
  open: boolean;
  onClose: () => void;
}

const TALLERES: { clave: Taller; texto: string }[] = [
  { clave: "diseno", texto: "Diseño" },
  { clave: "sublimacion", texto: "Sublimación" },
  { clave: "corte", texto: "Corte" },
  { clave: "costura", texto: "Costura" },
  { clave: "bordado", texto: "Bordado" },
];

const TIPOS: { clave: ProductoOrden["tipoProduccion"]; texto: string }[] = [
  { clave: "fabricacion", texto: "Fabricación" },
  { clave: "comercializacion", texto: "Comercialización" },
  { clave: "directa", texto: "Venta directa" },
];

const LUGARES = [
  { clave: "bolsillo", texto: "Bolsillo" },
  { clave: "frente", texto: "Frente" },
  { clave: "espalda", texto: "Espalda" },
  { clave: "personalizado", texto: "Personalizado" },
];

const CLASE_SELECT =
  "h-9 w-full rounded-md border border-input bg-input-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50";

/** Partida en el formulario. `original` es la partida tal como está guardada. */
interface PartidaForm {
  clave: string;
  id: string | null;
  original?: ProductoOrden;
  /** true si algún taller ya la empezó o terminó: solo lectura. */
  bloqueada: boolean;
  productoId: string;
  varianteId: string;
  cantidad: string;
  precio: string;
  tipo: ProductoOrden["tipoProduccion"];
  talleres: Taller[];
  notas: string;
  bordado: boolean;
  lugar: string;
  hilos: string;
  logo: string;
  bordadoNotas: string;
}

let contadorClaves = 0;
const nuevaClave = () => `nueva-${++contadorClaves}`;

const estaBloqueada = (p: ProductoOrden) => Object.values(p.progreso).some((e) => e && e !== "pending");

function partidaDesdeOrden(p: ProductoOrden): PartidaForm {
  const pers = p.personalizacion;
  return {
    clave: p.id,
    id: p.id,
    original: p,
    bloqueada: estaBloqueada(p),
    productoId: p.productoId ?? "",
    varianteId: p.varianteId ?? "",
    cantidad: String(p.cantidad),
    precio: String(p.precioUnitario),
    tipo: p.tipoProduccion,
    talleres: [...p.talleres],
    notas: p.notas ?? "",
    bordado: !!(pers?.lugarBordado || pers?.logotipo || pers?.coloresHilo?.length),
    lugar: pers?.lugarBordado ?? "bolsillo",
    hilos: (pers?.coloresHilo ?? []).join(", "),
    logo: pers?.logotipo ?? "",
    bordadoNotas: pers?.notas ?? "",
  };
}

/** Convierte una partida del formulario al formato de editar_orden. */
function aPartidaEditada(p: PartidaForm): PartidaEditada {
  // Las bloqueadas se envían exactamente como están guardadas.
  if (p.bloqueada && p.original) {
    const o = p.original;
    return {
      id: o.id,
      producto_id: o.productoId ?? null,
      variante_id: o.varianteId ?? null,
      cantidad: o.cantidad,
      precio_unitario: o.precioUnitario,
      tipo_produccion: o.tipoProduccion,
      notas: o.notas ?? null,
      talleres: o.talleres,
      personalizacion: o.personalizacion
        ? {
            lugar_bordado: o.personalizacion.lugarBordado ?? null,
            logo_url: o.personalizacion.logotipo ?? null,
            notas: o.personalizacion.notas ?? null,
            hilos: o.personalizacion.coloresHilo ?? [],
          }
        : null,
    };
  }
  return {
    id: p.id,
    producto_id: p.productoId || null,
    variante_id: p.varianteId || null,
    cantidad: Math.trunc(Number(p.cantidad)),
    precio_unitario: redondearCentavos(Number(p.precio)),
    tipo_produccion: p.tipo,
    notas: p.notas.trim() || null,
    talleres: p.tipo === "directa" ? [] : TALLERES.map((t) => t.clave).filter((t) => p.talleres.includes(t)),
    personalizacion: p.bordado
      ? {
          lugar_bordado: p.lugar || null,
          logo_url: p.logo.trim() || null,
          notas: p.bordadoNotas.trim() || null,
          hilos: p.hilos.split(",").map((h) => h.trim()).filter(Boolean),
        }
      : null,
  };
}

export default function EditarOrdenDialog({ orden, open, onClose }: EditarOrdenDialogProps) {
  const { productos, editarOrden } = useErpData();
  const pagado = totalPagado(orden);

  const [fechaEntrega, setFechaEntrega] = useState("");
  const [notas, setNotas] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [descuento, setDescuento] = useState("0");
  const [partidas, setPartidas] = useState<PartidaForm[]>([]);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [estadoInicial, setEstadoInicial] = useState("");

  // Cada vez que se abre, el formulario parte de la orden tal como está guardada.
  useEffect(() => {
    if (!open) return;
    const iniciales = orden.productos.map(partidaDesdeOrden);
    setFechaEntrega(orden.fechaEntrega || "");
    setNotas(orden.notas ?? "");
    setTelefono(orden.clienteTelefono ?? "");
    setEmail(orden.clienteEmail ?? "");
    setDescuento(String(orden.descuento ?? 0));
    setPartidas(iniciales);
    setMotivo("");
    setEstadoInicial(
      JSON.stringify(
        construirCambios(orden.fechaEntrega || "", orden.notas ?? "", orden.clienteTelefono ?? "", orden.clienteEmail ?? "", String(orden.descuento ?? 0), iniciales)
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orden.id]);

  const actualizar = (clave: string, cambios: Partial<PartidaForm>) =>
    setPartidas((ps) => ps.map((p) => (p.clave === clave ? { ...p, ...cambios } : p)));

  const agregarPartida = () =>
    setPartidas((ps) => [
      ...ps,
      {
        clave: nuevaClave(),
        id: null,
        bloqueada: false,
        productoId: "",
        varianteId: "",
        cantidad: "1",
        precio: "0",
        tipo: "fabricacion",
        talleres: ["corte", "costura"],
        notas: "",
        bordado: false,
        lugar: "bolsillo",
        hilos: "",
        logo: "",
        bordadoNotas: "",
      },
    ]);

  const quitarPartida = (clave: string) => setPartidas((ps) => ps.filter((p) => p.clave !== clave));

  // --- Validación por partida y totales ---
  const revisarPartida = (p: PartidaForm): string | null => {
    if (p.bloqueada) return null;
    const cantidad = Number(p.cantidad);
    if (!p.id && !p.productoId) return "Elige un producto.";
    if (!Number.isInteger(cantidad) || cantidad <= 0) return "La cantidad debe ser un número entero mayor a cero.";
    if (!(Number(p.precio) >= 0)) return "El precio no puede ser negativo.";
    // Lo que se fabrica tiene que pasar por al menos un taller.
    if (p.tipo === "fabricacion" && p.talleres.length === 0) return "Elige al menos un taller.";
    if (p.varianteId) {
      const disponible = stockDisponible(p);
      if (disponible !== null && cantidad > disponible) return `Solo hay ${disponible} pieza(s) disponibles de esta variante.`;
    }
    return null;
  };

  /** Stock que puede usar la partida: el actual de la variante + lo que ella ya tiene apartado. */
  const stockDisponible = (p: PartidaForm): number | null => {
    const variante = productos.flatMap((pr) => pr.variantes).find((v) => v.id === p.varianteId);
    if (!variante) return null;
    const apartado = p.original && p.original.varianteId === p.varianteId ? p.original.cantidad : 0;
    return variante.stock + apartado;
  };

  // Precios antes de IVA: total = subtotal − descuento + IVA 16 % (mismo cálculo que la BD).
  const descuentoNum = redondearCentavos(Number(descuento) || 0);
  const importes = calcularImportes(
    partidas.map((p) => ({ cantidad: Number(p.cantidad) || 0, precioUnitario: Number(p.precio) || 0 })),
    descuentoNum
  );
  const subtotal = importes.subtotal;
  const total = importes.total;
  const errorDescuento = descuentoNum < 0 || descuentoNum > subtotal ? "El descuento debe estar entre $0 y el subtotal." : null;
  const errorTotal = total < pagado ? `El total no puede quedar por debajo de lo ya pagado (${formatMonto(pagado)}).` : null;
  const erroresPartidas = partidas.map(revisarPartida);

  const cambios = useMemo(
    () => construirCambios(fechaEntrega, notas, telefono, email, descuento, partidas),
    [fechaEntrega, notas, telefono, email, descuento, partidas]
  );
  const hayCambios = JSON.stringify(cambios) !== estadoInicial;
  const valido =
    partidas.length > 0 && !erroresPartidas.some(Boolean) && !errorDescuento && !errorTotal && motivo.trim().length >= 3;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valido || !hayCambios) return;
    setGuardando(true);
    try {
      await editarOrden(orden.id, cambios, motivo.trim());
      toast.success(`Orden ${orden.numero} actualizada`, {
        description: "Se registró el cambio y se avisó a los involucrados.",
      });
      onClose();
    } catch (err: any) {
      toast.error("No se pudo actualizar la orden", { description: err?.message ?? String(err) });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(abierto) => !abierto && !guardando && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar orden {orden.numero}</DialogTitle>
          <DialogDescription>
            {orden.cliente} · Los cambios quedan registrados en el historial de la orden.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={guardar} className="space-y-6">
          {/* Datos generales */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Datos generales</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="eo-entrega">Fecha de entrega</Label>
                <Input id="eo-entrega" type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eo-tel">Teléfono del cliente</Label>
                <Input id="eo-tel" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={30} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eo-email">Correo del cliente</Label>
                <Input id="eo-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eo-notas">Notas de la orden</Label>
              <textarea
                id="eo-notas"
                rows={2}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              />
            </div>
          </section>

          {/* Partidas */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Productos</h3>
              <Button type="button" size="sm" variant="outline" onClick={agregarPartida}>
                <Plus className="w-4 h-4" />
                Agregar producto
              </Button>
            </div>

            {partidas.map((p, i) => (
              <PartidaEditor
                key={p.clave}
                numero={i + 1}
                partida={p}
                error={erroresPartidas[i]}
                disponible={p.varianteId ? stockDisponible(p) : null}
                productos={productos}
                puedeQuitar={!p.bloqueada && partidas.length > 1}
                onCambio={(c) => actualizar(p.clave, c)}
                onQuitar={() => quitarPartida(p.clave)}
              />
            ))}
          </section>

          {/* Importes */}
          <section className="rounded-lg bg-secondary p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-4 items-end">
              <div>
                <p className="text-xs text-muted-foreground">Subtotal</p>
                <p className="font-semibold">{formatMonto(subtotal)}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eo-descuento">Descuento</Label>
                <Input
                  id="eo-descuento"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={descuento}
                  onChange={(e) => setDescuento(e.target.value)}
                  aria-invalid={!!errorDescuento}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Nuevo total (con IVA {formatMonto(importes.iva)})</p>
                <p className="font-semibold">
                  {formatMonto(total)}
                  {total !== orden.total && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">(antes {formatMonto(orden.total)})</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ya pagado</p>
                <p className="font-semibold text-status-completed-text">{formatMonto(pagado)}</p>
              </div>
            </div>
            {(errorDescuento || errorTotal) && (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                {errorDescuento ?? errorTotal}
              </p>
            )}
          </section>

          {/* Motivo */}
          <section className="space-y-1.5">
            <Label htmlFor="eo-motivo">Motivo del cambio *</Label>
            <textarea
              id="eo-motivo"
              rows={2}
              required
              placeholder="Ej. El cliente pidió 10 piezas más y cambiar el bordado a la espalda."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
              className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            />
            <p className="text-xs text-muted-foreground">
              Se guarda en el historial y se envía como aviso al administrador y a los talleres afectados.
            </p>
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valido || !hayCambios || guardando}>
              <Pencil className="w-4 h-4" />
              {guardando ? "Guardando…" : hayCambios ? "Guardar cambios" : "Sin cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Arma el objeto que recibe editar_orden a partir del formulario. */
function construirCambios(
  fechaEntrega: string,
  notas: string,
  telefono: string,
  email: string,
  descuento: string,
  partidas: PartidaForm[]
): CambiosOrden {
  return {
    fecha_entrega: fechaEntrega || null,
    notas: notas.trim() || null,
    descuento: redondearCentavos(Number(descuento) || 0),
    cliente_telefono: telefono.trim() || null,
    cliente_email: email.trim() || null,
    partidas: partidas.map(aPartidaEditada),
  };
}

// ---------------------------------------------------------------------------------

interface PartidaEditorProps {
  numero: number;
  partida: PartidaForm;
  error: string | null;
  disponible: number | null;
  productos: ReturnType<typeof useErpData>["productos"];
  puedeQuitar: boolean;
  onCambio: (cambios: Partial<PartidaForm>) => void;
  onQuitar: () => void;
}

function PartidaEditor({ numero, partida: p, error, disponible, productos, puedeQuitar, onCambio, onQuitar }: PartidaEditorProps) {
  const producto = productos.find((pr) => pr.id === p.productoId);
  const id = (campo: string) => `eo-${p.clave}-${campo}`;

  // Partida bloqueada: resumen de solo lectura.
  if (p.bloqueada && p.original) {
    const o = p.original;
    return (
      <div className="rounded-lg border border-border p-4 bg-muted/40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">
              {numero}. {o.nombre}
              {(o.talla || o.color) && <span className="text-muted-foreground"> ({[o.talla, o.color].filter(Boolean).join(" / ")})</span>}
            </p>
            <p className="text-sm text-muted-foreground">
              {o.cantidad} × {formatMonto(o.precioUnitario)} = {formatMonto(o.cantidad * o.precioUnitario)}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-status-in-progress-bg px-2.5 py-0.5 text-xs font-medium text-status-in-progress-text whitespace-nowrap">
            <Lock className="w-3 h-3" />
            En producción
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Un taller ya trabaja en esta partida; no se puede modificar ni quitar. Si el cliente necesita cambiarla,
          agrega una partida nueva o pide apoyo al administrador.
        </p>
      </div>
    );
  }

  const elegirProducto = (productoId: string) => {
    const pr = productos.find((x) => x.id === productoId);
    const unica = pr?.variantes.length === 1 ? pr.variantes[0] : undefined;
    onCambio({
      productoId,
      varianteId: unica?.id ?? "",
      ...(unica ? { precio: String(unica.precio) } : {}),
    });
  };

  const elegirVariante = (varianteId: string) => {
    const v = producto?.variantes.find((x) => x.id === varianteId);
    onCambio({ varianteId, ...(v ? { precio: String(v.precio) } : {}) });
  };

  const alternarTaller = (t: Taller) =>
    onCambio({ talleres: p.talleres.includes(t) ? p.talleres.filter((x) => x !== t) : [...p.talleres, t] });

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">
          {numero}. {p.id ? "Producto" : "Producto nuevo"}
        </p>
        {puedeQuitar && (
          <Button type="button" size="sm" variant="ghost" onClick={onQuitar} className="text-red-600 dark:text-red-400">
            <Trash2 className="w-4 h-4" />
            Quitar
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={id("producto")}>Producto</Label>
          <select id={id("producto")} className={CLASE_SELECT} value={p.productoId} onChange={(e) => elegirProducto(e.target.value)}>
            {p.id && !p.original?.productoId ? (
              <option value="">{p.original?.nombre ?? "Producto"} (a la medida)</option>
            ) : (
              <option value="" disabled>
                Elige un producto…
              </option>
            )}
            {productos.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id("variante")}>Talla / color</Label>
          <select
            id={id("variante")}
            className={CLASE_SELECT}
            value={p.varianteId}
            onChange={(e) => elegirVariante(e.target.value)}
            disabled={!producto || producto.variantes.length === 0}
          >
            <option value="">Sin variante (a la medida)</option>
            {producto?.variantes.map((v) => (
              <option key={v.id} value={v.id}>
                {v.talla} / {v.color} — {v.stock} en stock — {formatMonto(v.precio)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor={id("cantidad")}>Cantidad</Label>
          <Input
            id={id("cantidad")}
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={p.cantidad}
            onChange={(e) => onCambio({ cantidad: e.target.value })}
          />
          {disponible !== null && <p className="text-xs text-muted-foreground">Disponible: {disponible}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id("precio")}>Precio unitario</Label>
          <Input
            id={id("precio")}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={p.precio}
            onChange={(e) => onCambio({ precio: e.target.value })}
          />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label htmlFor={id("tipo")}>Tipo de producción</Label>
          <select
            id={id("tipo")}
            className={CLASE_SELECT}
            value={p.tipo}
            onChange={(e) => onCambio({ tipo: e.target.value as PartidaForm["tipo"] })}
          >
            {TIPOS.map((t) => (
              <option key={t.clave} value={t.clave}>
                {t.texto}
              </option>
            ))}
          </select>
        </div>
      </div>

      {p.tipo !== "directa" && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Talleres</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {TALLERES.map((t) => (
              <label key={t.clave} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={p.talleres.includes(t.clave)}
                  onChange={() => alternarTaller(t.clave)}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                {t.texto}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={p.bordado}
          onChange={(e) => onCambio({ bordado: e.target.checked })}
          className="h-4 w-4 accent-[var(--primary)]"
        />
        Lleva personalización (bordado)
      </label>
      {p.bordado && (
        <div className="grid gap-3 sm:grid-cols-3 pl-6">
          <div className="space-y-1.5">
            <Label htmlFor={id("lugar")}>Ubicación</Label>
            <select id={id("lugar")} className={CLASE_SELECT} value={p.lugar} onChange={(e) => onCambio({ lugar: e.target.value })}>
              {LUGARES.map((l) => (
                <option key={l.clave} value={l.clave}>
                  {l.texto}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("hilos")}>Colores de hilo</Label>
            <Input
              id={id("hilos")}
              placeholder="Azul, Blanco"
              value={p.hilos}
              onChange={(e) => onCambio({ hilos: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("bnotas")}>Notas del bordado</Label>
            <Input id={id("bnotas")} value={p.bordadoNotas} onChange={(e) => onCambio({ bordadoNotas: e.target.value })} />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={id("notas")}>Notas del producto</Label>
        <Input id={id("notas")} value={p.notas} onChange={(e) => onCambio({ notas: e.target.value })} />
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
