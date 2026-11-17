/**
 * ActivoDialog.tsx — Alta, edición y expediente de un activo fijo.
 *
 * Pestañas (las tres últimas solo para activos ya guardados):
 *  - Datos:         identificación, compra, ubicación, responsable y depreciación.
 *  - Depreciación:  resumen al día de hoy y tabla anual (los años en curso y futuros
 *                   aparecen como proyección).
 *  - Mantenimiento: bitácora de servicios y su costo.
 *  - Baja:          venta, desecho, robo o donación (detiene la depreciación).
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { hoyISO } from "../../lib/fechas";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  ESTADO_ACTIVO,
  MOTIVO_BAJA,
  calcularDepreciacion,
  formatPesos,
  formatTasa,
  tablaDepreciacion,
  type Activo,
  type CategoriaActivo,
  type Mantenimiento,
  type MotivoBaja,
} from "../../lib/activoFijo";

export interface Opcion {
  id: string;
  nombre: string;
}

const CLASE_SELECT =
  "h-9 w-full rounded-md border border-input bg-input-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-60";

type Pestana = "datos" | "depreciacion" | "mantenimiento" | "baja";

type Form = {
  nombre: string;
  descripcion: string;
  categoria_id: string;
  marca: string;
  modelo: string;
  numero_serie: string;
  sede_id: string;
  ubicacion: string;
  responsable_id: string;
  proveedor_id: string;
  factura_compra: string;
  fecha_adquisicion: string;
  fecha_inicio_uso: string;
  costo_adquisicion: string;
  valor_residual: string;
  tasa_pct: string;
  estado: "activo" | "mantenimiento";
  notas: string;
};

const VACIO: Form = {
  nombre: "",
  descripcion: "",
  categoria_id: "",
  marca: "",
  modelo: "",
  numero_serie: "",
  sede_id: "",
  ubicacion: "",
  responsable_id: "",
  proveedor_id: "",
  factura_compra: "",
  fecha_adquisicion: hoyISO(),
  fecha_inicio_uso: "",
  costo_adquisicion: "",
  valor_residual: "0",
  tasa_pct: "",
  estado: "activo",
  notas: "",
};

function Campo({ label, requerido, children, className = "" }: { label: string; requerido?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label>
        {label}
        {requerido && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

const fechaCorta = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX") : "—");

export default function ActivoDialog({
  open,
  activo,
  categorias,
  sedes,
  empleados,
  proveedores,
  onClose,
  onGuardado,
}: {
  open: boolean;
  /** null = alta. */
  activo: Activo | null;
  categorias: CategoriaActivo[];
  sedes: Opcion[];
  empleados: Opcion[];
  proveedores: Opcion[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [pestana, setPestana] = useState<Pestana>("datos");
  const [f, setF] = useState<Form>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mantenimientos, setMantenimientos] = useState<Mantenimiento[]>([]);
  const [nuevoMant, setNuevoMant] = useState({ fecha: hoyISO(), tipo: "preventivo", descripcion: "", costo: "", realizado_por: "", proximo: "" });
  const [baja, setBaja] = useState<{ fecha: string; motivo: MotivoBaja; valor: string }>({ fecha: hoyISO(), motivo: "desecho", valor: "" });

  const cargarMantenimientos = useCallback(async (id: string) => {
    const { data, error: e } = await supabase.from("activo_mantenimientos").select("*").eq("activo_id", id).order("fecha", { ascending: false });
    if (e) toast.error(e.message);
    else setMantenimientos((data ?? []) as Mantenimiento[]);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPestana("datos");
    setError(null);
    setMantenimientos([]);
    if (activo) {
      setF({
        nombre: activo.nombre,
        descripcion: activo.descripcion ?? "",
        categoria_id: activo.categoria_id,
        marca: activo.marca ?? "",
        modelo: activo.modelo ?? "",
        numero_serie: activo.numero_serie ?? "",
        sede_id: activo.sede_id ?? "",
        ubicacion: activo.ubicacion ?? "",
        responsable_id: activo.responsable_id ?? "",
        proveedor_id: activo.proveedor_id ?? "",
        factura_compra: activo.factura_compra ?? "",
        fecha_adquisicion: activo.fecha_adquisicion,
        fecha_inicio_uso: activo.fecha_inicio_uso ?? "",
        costo_adquisicion: String(activo.costo_adquisicion),
        valor_residual: String(activo.valor_residual),
        tasa_pct: String(Math.round(Number(activo.tasa_depreciacion) * 10000) / 100),
        estado: activo.estado === "mantenimiento" ? "mantenimiento" : "activo",
        notas: activo.notas ?? "",
      });
      setBaja({ fecha: activo.fecha_baja ?? hoyISO(), motivo: activo.motivo_baja ?? "desecho", valor: activo.valor_baja != null ? String(activo.valor_baja) : "" });
      cargarMantenimientos(activo.id);
    } else {
      setF(VACIO);
    }
  }, [open, activo, cargarMantenimientos]);

  const set = (k: keyof Form) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const enBaja = activo?.estado === "baja";

  const elegirCategoria = (id: string) => {
    const c = categorias.find((x) => x.id === id);
    setF((x) => ({ ...x, categoria_id: id, tasa_pct: c ? String(Math.round(c.tasa_depreciacion * 10000) / 100) : x.tasa_pct }));
  };

  const guardar = async () => {
    const costo = Number(f.costo_adquisicion);
    const residual = Number(f.valor_residual || 0);
    const tasa = Number(f.tasa_pct) / 100;
    if (!f.nombre.trim()) return setError("Escribe el nombre del activo");
    if (!f.categoria_id) return setError("Elige la categoría");
    if (!f.fecha_adquisicion) return setError("Indica la fecha de adquisición");
    if (!(costo >= 0) || f.costo_adquisicion === "") return setError("Indica el costo de adquisición (sin IVA)");
    if (!(residual >= 0) || residual > costo) return setError("El valor residual va de 0 al costo de adquisición");
    if (!(tasa >= 0 && tasa <= 1)) return setError("La tasa de depreciación va de 0 % a 100 %");
    if (f.fecha_inicio_uso && f.fecha_inicio_uso < f.fecha_adquisicion) return setError("El inicio de uso no puede ser antes de la compra");

    const txt = (s: string) => (s.trim() === "" ? null : s.trim());
    const fila = {
      nombre: f.nombre.trim(),
      descripcion: txt(f.descripcion),
      categoria_id: f.categoria_id,
      marca: txt(f.marca),
      modelo: txt(f.modelo),
      numero_serie: txt(f.numero_serie),
      sede_id: f.sede_id || null,
      ubicacion: txt(f.ubicacion),
      responsable_id: f.responsable_id || null,
      proveedor_id: f.proveedor_id || null,
      factura_compra: txt(f.factura_compra),
      fecha_adquisicion: f.fecha_adquisicion,
      fecha_inicio_uso: f.fecha_inicio_uso || null,
      costo_adquisicion: Math.round(costo * 100) / 100,
      valor_residual: Math.round(residual * 100) / 100,
      tasa_depreciacion: Math.round(tasa * 10000) / 10000,
      notas: txt(f.notas),
      ...(enBaja ? {} : { estado: f.estado }),
      updated_at: new Date().toISOString(),
    };
    setGuardando(true);
    const { error: e } = activo
      ? await supabase.from("activos").update(fila).eq("id", activo.id)
      : await supabase.from("activos").insert(fila);
    setGuardando(false);
    if (e) return setError(e.message);
    toast.success(activo ? "Activo actualizado" : "Activo registrado");
    onGuardado();
    onClose();
  };

  const agregarMantenimiento = async () => {
    if (!activo) return;
    if (!nuevoMant.descripcion.trim()) return toast.error("Describe el mantenimiento");
    const { error: e } = await supabase.from("activo_mantenimientos").insert({
      activo_id: activo.id,
      fecha: nuevoMant.fecha,
      tipo: nuevoMant.tipo,
      descripcion: nuevoMant.descripcion.trim(),
      costo: Number(nuevoMant.costo) || 0,
      realizado_por: nuevoMant.realizado_por.trim() || null,
      proximo: nuevoMant.proximo || null,
    });
    if (e) return toast.error(e.message);
    toast.success("Mantenimiento registrado");
    setNuevoMant({ fecha: hoyISO(), tipo: "preventivo", descripcion: "", costo: "", realizado_por: "", proximo: "" });
    cargarMantenimientos(activo.id);
  };

  const eliminarMantenimiento = async (m: Mantenimiento) => {
    if (!window.confirm("¿Eliminar este registro de mantenimiento?")) return;
    const { error: e } = await supabase.from("activo_mantenimientos").delete().eq("id", m.id);
    if (e) return toast.error(e.message);
    if (activo) cargarMantenimientos(activo.id);
  };

  const darDeBaja = async () => {
    if (!activo) return;
    if (baja.fecha < activo.fecha_adquisicion) return toast.error("La baja no puede ser antes de la compra");
    if (!window.confirm(`¿Dar de baja ${activo.codigo} · ${activo.nombre}? Deja de depreciarse desde ese mes.`)) return;
    const { error: e } = await supabase
      .from("activos")
      .update({
        estado: "baja",
        fecha_baja: baja.fecha,
        motivo_baja: baja.motivo,
        valor_baja: baja.valor === "" ? null : Number(baja.valor),
        updated_at: new Date().toISOString(),
      })
      .eq("id", activo.id);
    if (e) return toast.error(e.message);
    toast.success("Activo dado de baja");
    onGuardado();
    onClose();
  };

  const reactivar = async () => {
    if (!activo || !window.confirm("¿Revertir la baja de este activo?")) return;
    const { error: e } = await supabase
      .from("activos")
      .update({ estado: "activo", fecha_baja: null, motivo_baja: null, valor_baja: null, updated_at: new Date().toISOString() })
      .eq("id", activo.id);
    if (e) return toast.error(e.message);
    toast.success("Baja revertida");
    onGuardado();
    onClose();
  };

  // Depreciación con los valores que hay en el formulario (se actualiza al editar).
  const datosDep = {
    costo_adquisicion: Number(f.costo_adquisicion) || 0,
    valor_residual: Number(f.valor_residual) || 0,
    tasa_depreciacion: (Number(f.tasa_pct) || 0) / 100,
    fecha_adquisicion: f.fecha_adquisicion || hoyISO(),
    fecha_inicio_uso: f.fecha_inicio_uso || null,
    fecha_baja: activo?.fecha_baja ?? null,
  };
  const dep = calcularDepreciacion(datosDep, hoyISO());
  const tabla = tablaDepreciacion(datosDep, hoyISO());
  const totalMant = mantenimientos.reduce((s, m) => s + Number(m.costo), 0);
  const categoria = categorias.find((c) => c.id === f.categoria_id);

  const pestanas: [Pestana, string][] = activo
    ? [
        ["datos", "Datos"],
        ["depreciacion", "Depreciación"],
        ["mantenimiento", `Mantenimiento${mantenimientos.length ? ` (${mantenimientos.length})` : ""}`],
        ["baja", "Baja"],
      ]
    : [["datos", "Datos"]];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !guardando && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {activo ? `${activo.codigo} · ${activo.nombre}` : "Nuevo activo fijo"}
            {activo && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_ACTIVO[activo.estado].clase}`}>
                {ESTADO_ACTIVO[activo.estado].label}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>Importes sin IVA. El código (AF-0001…) se asigna al guardar.</DialogDescription>
        </DialogHeader>

        {pestanas.length > 1 && (
          <div className="flex gap-1 border-b border-border overflow-x-auto" role="tablist">
            {pestanas.map(([valor, texto]) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={pestana === valor}
                onClick={() => setPestana(valor)}
                className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  pestana === valor ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {texto}
              </button>
            ))}
          </div>
        )}

        {pestana === "datos" && (
          <fieldset disabled={guardando} className="space-y-5">
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Campo label="Nombre del activo" requerido className="sm:col-span-2">
                <Input value={f.nombre} onChange={(e) => set("nombre")(e.target.value)} placeholder="Máquina de coser recta industrial" />
              </Campo>
              <Campo label="Categoría" requerido>
                <select value={f.categoria_id} onChange={(e) => elegirCategoria(e.target.value)} className={CLASE_SELECT}>
                  <option value="">Selecciona…</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({formatTasa(c.tasa_depreciacion)})
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Marca">
                <Input value={f.marca} onChange={(e) => set("marca")(e.target.value)} />
              </Campo>
              <Campo label="Modelo">
                <Input value={f.modelo} onChange={(e) => set("modelo")(e.target.value)} />
              </Campo>
              <Campo label="Número de serie">
                <Input value={f.numero_serie} onChange={(e) => set("numero_serie")(e.target.value)} />
              </Campo>
              <Campo label="Descripción" className="sm:col-span-2 lg:col-span-3">
                <Input value={f.descripcion} onChange={(e) => set("descripcion")(e.target.value)} />
              </Campo>
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-border pt-4">
              <Campo label="Sede">
                <select value={f.sede_id} onChange={(e) => set("sede_id")(e.target.value)} className={CLASE_SELECT}>
                  <option value="">Sin asignar</option>
                  {sedes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Ubicación dentro de la sede">
                <Input value={f.ubicacion} onChange={(e) => set("ubicacion")(e.target.value)} placeholder="Línea 2, oficina de ventas…" />
              </Campo>
              <Campo label="Responsable (resguardo)">
                <select value={f.responsable_id} onChange={(e) => set("responsable_id")(e.target.value)} className={CLASE_SELECT}>
                  <option value="">Sin asignar</option>
                  {empleados.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              {!enBaja && (
                <Campo label="Estado">
                  <select value={f.estado} onChange={(e) => set("estado")(e.target.value)} className={CLASE_SELECT}>
                    <option value="activo">En uso</option>
                    <option value="mantenimiento">En mantenimiento</option>
                  </select>
                </Campo>
              )}
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-border pt-4">
              <Campo label="Proveedor">
                <select value={f.proveedor_id} onChange={(e) => set("proveedor_id")(e.target.value)} className={CLASE_SELECT}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Factura de compra (folio o UUID)">
                <Input value={f.factura_compra} onChange={(e) => set("factura_compra")(e.target.value)} />
              </Campo>
              <Campo label="Fecha de adquisición" requerido>
                <Input type="date" value={f.fecha_adquisicion} onChange={(e) => set("fecha_adquisicion")(e.target.value)} />
              </Campo>
              <Campo label="Inicio de uso">
                <Input type="date" value={f.fecha_inicio_uso} onChange={(e) => set("fecha_inicio_uso")(e.target.value)} />
              </Campo>
              <Campo label="Costo de adquisición (sin IVA)" requerido>
                <Input type="number" min="0" step="0.01" value={f.costo_adquisicion} onChange={(e) => set("costo_adquisicion")(e.target.value)} />
              </Campo>
              <Campo label="Valor residual">
                <Input type="number" min="0" step="0.01" value={f.valor_residual} onChange={(e) => set("valor_residual")(e.target.value)} />
              </Campo>
              <Campo label="Tasa anual de depreciación (%)" requerido>
                <Input type="number" min="0" max="100" step="0.01" value={f.tasa_pct} onChange={(e) => set("tasa_pct")(e.target.value)} />
                {categoria?.fundamento && <p className="text-xs text-muted-foreground">{categoria.fundamento}</p>}
              </Campo>
              <Campo label="Notas" className="sm:col-span-2">
                <Input value={f.notas} onChange={(e) => set("notas")(e.target.value)} />
              </Campo>
            </section>

            {Number(f.costo_adquisicion) > 0 && (
              <p className="text-sm text-muted-foreground">
                Depreciación mensual {formatPesos(dep.mensual)}
                {dep.vidaUtilMeses ? ` · vida útil ${Math.floor(dep.vidaUtilMeses / 12)} años ${dep.vidaUtilMeses % 12} meses` : " · no se deprecia"}
                {" · "}valor en libros hoy {formatPesos(dep.valorLibros)}
              </p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </fieldset>
        )}

        {pestana === "depreciacion" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              {[
                ["Costo de adquisición", formatPesos(Number(f.costo_adquisicion))],
                ["Depreciación acumulada", `${formatPesos(dep.acumulada)} (${dep.porcentaje} %)`],
                ["Valor en libros", formatPesos(dep.valorLibros)],
                ["Depreciación mensual", `${formatPesos(dep.mensual)} · ${dep.meses} meses`],
              ].map(([t, v]) => (
                <div key={t} className="rounded-lg bg-secondary p-3">
                  <p className="text-xs text-muted-foreground">{t}</p>
                  <p className="font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Línea recta al {formatTasa(datosDep.tasa_depreciacion)} anual, a partir del mes siguiente al inicio de uso
              ({fechaCorta(f.fecha_inicio_uso || f.fecha_adquisicion)}).
              {dep.totalmenteDepreciado && " Totalmente depreciado."}
            </p>
            {tabla.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">Este activo no se deprecia.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Año</TableHead>
                      <TableHead className="text-right">Meses</TableHead>
                      <TableHead className="text-right">Depreciación del año</TableHead>
                      <TableHead className="text-right">Acumulada</TableHead>
                      <TableHead className="text-right">Valor en libros</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabla.map((r) => (
                      <TableRow key={r.anio} className={r.proyectado ? "text-muted-foreground" : ""}>
                        <TableCell>
                          {r.anio}
                          {r.proyectado && <span className="ml-2 text-xs">(proyectado)</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.meses}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPesos(r.depreciacion)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPesos(r.acumulada)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPesos(r.valorLibros)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {pestana === "mantenimiento" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
              <Campo label="Fecha">
                <Input type="date" value={nuevoMant.fecha} onChange={(e) => setNuevoMant({ ...nuevoMant, fecha: e.target.value })} />
              </Campo>
              <Campo label="Tipo">
                <select value={nuevoMant.tipo} onChange={(e) => setNuevoMant({ ...nuevoMant, tipo: e.target.value })} className={CLASE_SELECT}>
                  <option value="preventivo">Preventivo</option>
                  <option value="correctivo">Correctivo</option>
                </select>
              </Campo>
              <Campo label="Descripción" className="lg:col-span-2">
                <Input value={nuevoMant.descripcion} onChange={(e) => setNuevoMant({ ...nuevoMant, descripcion: e.target.value })} placeholder="Limpieza y lubricación" />
              </Campo>
              <Campo label="Costo">
                <Input type="number" min="0" step="0.01" value={nuevoMant.costo} onChange={(e) => setNuevoMant({ ...nuevoMant, costo: e.target.value })} />
              </Campo>
              <Campo label="Próximo">
                <Input type="date" value={nuevoMant.proximo} onChange={(e) => setNuevoMant({ ...nuevoMant, proximo: e.target.value })} />
              </Campo>
              <Campo label="Realizado por" className="sm:col-span-2 lg:col-span-5">
                <Input value={nuevoMant.realizado_por} onChange={(e) => setNuevoMant({ ...nuevoMant, realizado_por: e.target.value })} placeholder="Técnico o taller externo" />
              </Campo>
              <Button onClick={agregarMantenimiento}>
                <Plus /> Registrar
              </Button>
            </div>
            {mantenimientos.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">Sin mantenimientos registrados.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Realizado por</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead>Próximo</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mantenimientos.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">{fechaCorta(m.fecha)}</TableCell>
                        <TableCell className="capitalize">{m.tipo}</TableCell>
                        <TableCell>{m.descripcion}</TableCell>
                        <TableCell>{m.realizado_por ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPesos(Number(m.costo))}</TableCell>
                        <TableCell className="whitespace-nowrap">{fechaCorta(m.proximo)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => eliminarMantenimiento(m)} aria-label="Eliminar mantenimiento">
                            <Trash2 className="text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="text-sm text-right text-muted-foreground">
              Total invertido en mantenimiento: <strong className="text-foreground">{formatPesos(totalMant)}</strong>
            </p>
          </div>
        )}

        {pestana === "baja" && activo && (
          <div className="space-y-4">
            {enBaja ? (
              <>
                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Fecha de baja</dt>
                    <dd>{fechaCorta(activo.fecha_baja)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Motivo</dt>
                    <dd>{activo.motivo_baja ? MOTIVO_BAJA[activo.motivo_baja] : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Valor de venta / recuperado</dt>
                    <dd>{activo.valor_baja != null ? formatPesos(activo.valor_baja) : "—"}</dd>
                  </div>
                </dl>
                {activo.valor_baja != null && (
                  <p className="text-sm text-muted-foreground">
                    Resultado contra el valor en libros ({formatPesos(dep.valorLibros)}):{" "}
                    <strong className={activo.valor_baja - dep.valorLibros >= 0 ? "text-status-completed-text" : "text-destructive"}>
                      {activo.valor_baja - dep.valorLibros >= 0 ? "ganancia" : "pérdida"} de {formatPesos(Math.abs(activo.valor_baja - dep.valorLibros))}
                    </strong>
                  </p>
                )}
                <Button variant="outline" onClick={reactivar}>
                  <RotateCcw /> Revertir baja
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Al dar de baja el activo deja de depreciarse a partir del mes de la baja y sale de los totales de
                  activos en uso. Valor en libros actual: <strong className="text-foreground">{formatPesos(dep.valorLibros)}</strong>.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Campo label="Fecha de baja" requerido>
                    <Input type="date" value={baja.fecha} onChange={(e) => setBaja({ ...baja, fecha: e.target.value })} />
                  </Campo>
                  <Campo label="Motivo" requerido>
                    <select value={baja.motivo} onChange={(e) => setBaja({ ...baja, motivo: e.target.value as MotivoBaja })} className={CLASE_SELECT}>
                      {Object.entries(MOTIVO_BAJA).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo label="Valor de venta / recuperado">
                    <Input type="number" min="0" step="0.01" value={baja.valor} onChange={(e) => setBaja({ ...baja, valor: e.target.value })} />
                  </Campo>
                </div>
                <Button variant="destructive" onClick={darDeBaja}>
                  Dar de baja
                </Button>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cerrar
          </Button>
          {pestana === "datos" && (
            <Button onClick={guardar} disabled={guardando}>
              {guardando && <Loader2 className="animate-spin" />}
              {activo ? "Guardar cambios" : "Registrar activo"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
