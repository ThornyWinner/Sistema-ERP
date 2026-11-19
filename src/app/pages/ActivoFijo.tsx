/**
 * ActivoFijo.tsx — Control de activo fijo (ruta /activo-fijo, solo administrador primario).
 *
 * Pestañas:
 *  - Activos: indicadores (valor de adquisición, depreciación acumulada, valor en libros),
 *    filtros por categoría, sede y estado, y la lista; cada activo abre su expediente
 *    (datos, tabla de depreciación, mantenimientos y baja).
 *  - Categorías y tasas: tasa anual de depreciación de cada tipo de bien (LISR).
 *
 * Ver sql/activo_fijo.sql y lib/activoFijo.ts.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Download, Landmark, Plus, Search, TrendingDown, Wallet } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useBusquedaUrl } from "../hooks/useBusquedaUrl";
import { hoyISO } from "../lib/fechas";
import StatCard from "../components/StatCard";
import { Card, CardContent } from "../components/Card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import ActivoDialog, { type Opcion } from "../components/activos/ActivoDialog";
import { descargarArchivo, escribirCsv } from "../lib/facturacion";
import {
  ESTADO_ACTIVO,
  MOTIVO_BAJA,
  calcularDepreciacion,
  formatPesos,
  formatTasa,
  type Activo,
  type CategoriaActivo,
} from "../lib/activoFijo";

const CLASE_SELECT =
  "h-9 rounded-md border border-input bg-input-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

type Pestana = "activos" | "categorias";

export default function ActivoFijo() {
  const [pestana, setPestana] = useState<Pestana>("activos");
  const [cargando, setCargando] = useState(true);
  const [activos, setActivos] = useState<Activo[]>([]);
  const [categorias, setCategorias] = useState<CategoriaActivo[]>([]);
  const [sedes, setSedes] = useState<Opcion[]>([]);
  const [empleados, setEmpleados] = useState<Opcion[]>([]);
  const [proveedores, setProveedores] = useState<Opcion[]>([]);
  const [busqueda, setBusqueda] = useBusquedaUrl();
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroSede, setFiltroSede] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("vigentes");
  const [abierto, setAbierto] = useState<{ activo: Activo | null } | null>(null);
  const [tasas, setTasas] = useState<Record<string, string>>({});
  const hoy = hoyISO();

  const cargar = useCallback(async () => {
    setCargando(true);
    const [a, c, s, e, p] = await Promise.all([
      supabase.from("activos").select("*").order("codigo"),
      supabase.from("activo_categorias").select("id,nombre,tasa_depreciacion,fundamento").order("nombre"),
      supabase.from("sedes").select("id,nombre").order("nombre"),
      // Todos los empleados (también los de baja) para mostrar el resguardo histórico.
      supabase.from("empleados").select("id,nombre").order("nombre"),
      supabase.from("proveedores").select("id,nombre").order("nombre"),
    ]);
    setCargando(false);
    const error = a.error || c.error || s.error || e.error || p.error;
    if (error) {
      toast.error(`No se pudo cargar el activo fijo: ${error.message}. ¿Ya se aplicó sql/activo_fijo.sql?`);
      return;
    }
    setActivos(((a.data ?? []) as any[]).map((x) => ({
      ...x,
      costo_adquisicion: Number(x.costo_adquisicion),
      valor_residual: Number(x.valor_residual),
      tasa_depreciacion: Number(x.tasa_depreciacion),
      valor_baja: x.valor_baja == null ? null : Number(x.valor_baja),
    })));
    const cats = ((c.data ?? []) as any[]).map((x) => ({ ...x, tasa_depreciacion: Number(x.tasa_depreciacion) }));
    setCategorias(cats);
    setTasas(Object.fromEntries(cats.map((x) => [x.id, String(Math.round(x.tasa_depreciacion * 10000) / 100)])));
    setSedes((s.data ?? []) as Opcion[]);
    setEmpleados((e.data ?? []) as Opcion[]);
    setProveedores((p.data ?? []) as Opcion[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const nombreDe = (lista: Opcion[], id: string | null) => lista.find((x) => x.id === id)?.nombre ?? "";

  // Depreciación al día de hoy de cada activo.
  const conDep = useMemo(
    () => activos.map((a) => ({ a, dep: calcularDepreciacion(a, hoy) })),
    [activos, hoy]
  );

  const filtrados = conDep.filter(({ a }) => {
    if (filtroEstado === "vigentes" && a.estado === "baja") return false;
    if (filtroEstado !== "vigentes" && filtroEstado !== "todos" && a.estado !== filtroEstado) return false;
    if (filtroCategoria && a.categoria_id !== filtroCategoria) return false;
    if (filtroSede && a.sede_id !== filtroSede) return false;
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return [a.codigo, a.nombre, a.marca, a.modelo, a.numero_serie, a.ubicacion, nombreDe(empleados, a.responsable_id)]
      .some((v) => v?.toLowerCase().includes(q));
  });

  // Indicadores: solo activos que no están dados de baja.
  const vigentes = conDep.filter(({ a }) => a.estado !== "baja");
  const totalCosto = vigentes.reduce((s, x) => s + x.a.costo_adquisicion, 0);
  const totalDep = vigentes.reduce((s, x) => s + x.dep.acumulada, 0);
  const totalLibros = vigentes.reduce((s, x) => s + x.dep.valorLibros, 0);
  const depMensual = vigentes.filter((x) => !x.dep.totalmenteDepreciado).reduce((s, x) => s + x.dep.mensual, 0);

  const descargar = () =>
    descargarArchivo(
      "Activo_fijo.csv",
      escribirCsv(
        ["Código", "Nombre", "Categoría", "Marca", "Modelo", "Serie", "Sede", "Ubicación", "Responsable", "Proveedor",
         "Factura", "Fecha adquisición", "Inicio de uso", "Costo", "Tasa", "Dep. acumulada", "Valor en libros", "Estado",
         "Fecha baja", "Motivo baja"],
        filtrados.map(({ a, dep }) => [
          a.codigo, a.nombre, nombreDe(categorias, a.categoria_id), a.marca, a.modelo, a.numero_serie,
          nombreDe(sedes, a.sede_id), a.ubicacion, nombreDe(empleados, a.responsable_id), nombreDe(proveedores, a.proveedor_id),
          a.factura_compra, a.fecha_adquisicion, a.fecha_inicio_uso, a.costo_adquisicion, a.tasa_depreciacion,
          dep.acumulada, dep.valorLibros, ESTADO_ACTIVO[a.estado].label, a.fecha_baja, a.motivo_baja ? MOTIVO_BAJA[a.motivo_baja] : "",
        ])
      )
    );

  const guardarTasa = async (c: CategoriaActivo) => {
    const t = Number(tasas[c.id]) / 100;
    if (!(t >= 0 && t <= 1)) return toast.error("La tasa va de 0 % a 100 %");
    const { error } = await supabase.from("activo_categorias").update({ tasa_depreciacion: Math.round(t * 10000) / 10000 }).eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(`Tasa de «${c.nombre}» actualizada. Aplica a los activos nuevos; los existentes conservan la suya.`);
    cargar();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Activo Fijo</h1>
          <p className="text-muted-foreground mt-1">Maquinaria, mobiliario, equipo y vehículos de la empresa, con su depreciación</p>
        </div>
        {pestana === "activos" && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setAbierto({ activo: null })} disabled={categorias.length === 0}>
              <Plus /> Nuevo activo
            </Button>
            <Button variant="outline" onClick={descargar} disabled={filtrados.length === 0}>
              <Download /> Descarga
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-border" role="tablist">
        {([
          ["activos", "Activos"],
          ["categorias", "Categorías y tasas"],
        ] as [Pestana, string][]).map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={pestana === valor}
            onClick={() => setPestana(valor)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
              pestana === valor ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

      {pestana === "activos" ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard title="Activos en uso" value={vigentes.length} icon={Building2} />
            <StatCard title="Valor de adquisición" value={formatPesos(totalCosto)} icon={Wallet} />
            <StatCard
              title="Depreciación acumulada"
              value={formatPesos(totalDep)}
              icon={TrendingDown}
              color="warning"
              footer={<span className="text-xs text-muted-foreground">{formatPesos(depMensual)} por mes</span>}
            />
            <StatCard title="Valor en libros" value={formatPesos(totalLibros)} icon={Landmark} color="success" />
          </div>

          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="search"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por código, nombre, marca, serie, responsable…"
                    className="w-full h-9 pl-9 pr-3 bg-secondary rounded-md border border-transparent text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} className={CLASE_SELECT} aria-label="Categoría">
                  <option value="">Todas las categorías</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                <select value={filtroSede} onChange={(e) => setFiltroSede(e.target.value)} className={CLASE_SELECT} aria-label="Sede">
                  <option value="">Todas las sedes</option>
                  {sedes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
                <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className={CLASE_SELECT} aria-label="Estado">
                  <option value="vigentes">En uso y en mantenimiento</option>
                  <option value="activo">En uso</option>
                  <option value="mantenimiento">En mantenimiento</option>
                  <option value="baja">Dados de baja</option>
                  <option value="todos">Todos</option>
                </select>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Activo</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Sede / ubicación</TableHead>
                      <TableHead>Responsable</TableHead>
                      <TableHead>Adquisición</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="text-right">Dep. acumulada</TableHead>
                      <TableHead className="text-right">Valor en libros</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cargando && activos.length === 0 &&
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={10}>
                            <div className="h-5 rounded bg-secondary animate-pulse" />
                          </TableCell>
                        </TableRow>
                      ))}
                    {!cargando && filtrados.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                          {activos.length === 0 ? "Aún no hay activos registrados." : "Ningún activo coincide con los filtros."}
                        </TableCell>
                      </TableRow>
                    )}
                    {filtrados.map(({ a, dep }) => (
                      <TableRow key={a.id} onClick={() => setAbierto({ activo: a })} className="cursor-pointer">
                        <TableCell className="font-medium text-primary whitespace-nowrap">{a.codigo}</TableCell>
                        <TableCell className="min-w-[200px]">
                          <span className="block font-medium">{a.nombre}</span>
                          <span className="block text-xs text-muted-foreground">
                            {[a.marca, a.modelo, a.numero_serie && `S/N ${a.numero_serie}`].filter(Boolean).join(" · ")}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {nombreDe(categorias, a.categoria_id)}
                          <span className="block text-xs text-muted-foreground">{formatTasa(a.tasa_depreciacion)} anual</span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {nombreDe(sedes, a.sede_id) || "—"}
                          {a.ubicacion && <span className="block text-xs text-muted-foreground">{a.ubicacion}</span>}
                        </TableCell>
                        <TableCell className="text-sm">{nombreDe(empleados, a.responsable_id) || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {new Date(`${a.fecha_adquisicion}T12:00:00`).toLocaleDateString("es-MX")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatPesos(a.costo_adquisicion)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPesos(dep.acumulada)}
                          <span className="block text-xs text-muted-foreground">{dep.porcentaje} %</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{formatPesos(dep.valorLibros)}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${ESTADO_ACTIVO[a.estado].clase}`}>
                            {ESTADO_ACTIVO[a.estado].label}
                          </span>
                          {dep.totalmenteDepreciado && a.estado !== "baja" && (
                            <span className="block text-xs text-muted-foreground mt-1">Depreciado al 100 %</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Tasas máximas anuales de la Ley del ISR (arts. 34 y 35). Confírmalas con el contador. Al cambiar una tasa
              se usa en los activos que registres después; cada activo guarda la suya y se puede ajustar en su expediente.
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Fundamento</TableHead>
                    <TableHead>Tasa anual (%)</TableHead>
                    <TableHead className="text-right">Activos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categorias.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.nombre}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.fundamento ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            className="w-24"
                            value={tasas[c.id] ?? ""}
                            onChange={(e) => setTasas({ ...tasas, [c.id]: e.target.value })}
                          />
                          {Math.round(Number(tasas[c.id]) * 100) !== Math.round(c.tasa_depreciacion * 10000) && (
                            <Button size="sm" onClick={() => guardarTasa(c)}>
                              Guardar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {activos.filter((a) => a.categoria_id === c.id && a.estado !== "baja").length}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <ActivoDialog
        open={!!abierto}
        activo={abierto?.activo ?? null}
        categorias={categorias}
        sedes={sedes}
        empleados={empleados}
        proveedores={proveedores}
        onClose={() => setAbierto(null)}
        onGuardado={cargar}
      />
    </div>
  );
}
