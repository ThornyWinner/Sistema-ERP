/**
 * Cotizaciones.tsx — Cotizaciones a clientes (ruta /cotizaciones).
 *
 *  - Indicadores: abiertas (y su monto), por vencer, convertidas del mes y tasa de
 *    conversión (convertidas / cerradas).
 *  - Listado con búsqueda y filtro por estado; al hacer clic se abre el detalle.
 *  - Acciones: editar, PDF, contactar por WhatsApp/correo (al enviar una en borrador
 *    se marca como enviada), aceptar, rechazar (con motivo), reabrir, duplicar,
 *    eliminar y convertir en orden (abre el formulario de orden ya lleno; al
 *    guardarse, la cotización queda "convertida" y ligada a la orden).
 *
 * Ven: admin primario y secundario (todas) y el vendedor (las suyas). Editan: el
 * admin primario cualquiera; admin secundario y vendedor las suyas (lo exige la BD).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  Copy,
  Eye,
  FileDown,
  FileText,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  TrendingUp,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useErpData } from "../context/ErpDataContext";
import { hasPermission } from "../utils/permissions";
import { useBusquedaUrl } from "../hooks/useBusquedaUrl";
import { Card, CardContent } from "../components/Card";
import StatCard from "../components/StatCard";
import DesgloseImportes from "../components/DesgloseImportes";
import ContactarClienteDialog from "../components/ContactarClienteDialog";
import NuevaOrdenMultiProducto, {
  type CapturaInicial,
  type CotizacionCapturada,
} from "../components/NuevaOrdenMultiProducto";
import { Button } from "../components/ui/button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  ESTADO_COTIZACION_LABEL,
  cambiarEstadoCotizacion,
  capturaDesdeCotizacion,
  eliminarCotizacion,
  estaAbierta,
  estadoVisible,
  guardarCotizacion,
  imprimirCotizacion,
  listarCotizaciones,
  plantillasCotizacion,
  type Cotizacion,
  type EstadoCotizacion,
  type EstadoVisible,
} from "../lib/cotizaciones";
import { claseDiasRestantes, diasRestantes, formatFecha, textoDiasRestantes } from "../lib/fechas";
import { formatMonto } from "../lib/pagos";
import { detallePartida } from "../lib/notaOrden";
import type { Orden } from "../data/mockData";

type Filtro = "abiertas" | "todas" | "vencidas" | "convertida" | "rechazada";

const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: "abiertas", texto: "Abiertas" },
  { valor: "vencidas", texto: "Vencidas" },
  { valor: "convertida", texto: "Convertidas" },
  { valor: "rechazada", texto: "Rechazadas" },
  { valor: "todas", texto: "Todas" },
];

const CLASE_ESTADO: Record<EstadoVisible, string> = {
  borrador: "bg-secondary text-muted-foreground",
  enviada: "bg-status-in-progress-bg text-status-in-progress-text",
  aceptada: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  convertida: "bg-status-completed-bg text-status-completed-text",
  rechazada: "bg-red-500/10 text-red-700 dark:text-red-300",
  vencida: "bg-status-pending-bg text-status-pending-text",
};

function EstadoBadge({ c }: { c: Cotizacion }) {
  const v = estadoVisible(c);
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${CLASE_ESTADO[v]}`}>
      {ESTADO_COTIZACION_LABEL[v]}
    </span>
  );
}

interface Accion {
  clave: string;
  texto: string;
  icono: LucideIcon;
  onClick: () => void;
  peligro?: boolean;
  principal?: boolean;
}

/** Formulario abierto: nueva/editar/duplicar cotización, o convertirla en orden. */
type Formulario =
  | { tipo: "cotizacion"; editando: Cotizacion | null; inicial: CapturaInicial | null; titulo: string }
  | { tipo: "orden"; desde: Cotizacion; inicial: CapturaInicial };

export default function Cotizaciones() {
  const { user } = useAuth();
  const { crearOrden } = useErpData();
  const navigate = useNavigate();
  const puedeCrear = !!user && hasPermission(user.rol, "/cotizaciones", "canCreate");

  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useBusquedaUrl();
  const [filtro, setFiltro] = useState<Filtro>("abiertas");
  const [detalle, setDetalle] = useState<Cotizacion | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [contacto, setContacto] = useState<Cotizacion | null>(null);
  const [rechazo, setRechazo] = useState<{ c: Cotizacion; motivo: string } | null>(null);
  const [borrar, setBorrar] = useState<Cotizacion | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const lista = await listarCotizaciones((id) => (id === user?.id ? user?.nombre : undefined));
      setCotizaciones(lista);
      // Mantiene abierto el detalle con los datos nuevos.
      setDetalle((d) => (d ? lista.find((c) => c.id === d.id) ?? null : null));
    } catch (err: any) {
      toast.error("No se pudieron cargar las cotizaciones", {
        description: `${err?.message ?? err}. ¿Ya se aplicó sql/cotizaciones.sql?`,
      });
    } finally {
      setCargando(false);
    }
  }, [user?.id, user?.nombre]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const puedeEditar = (c: Cotizacion) =>
    user?.rol === "admin_primario" ||
    ((user?.rol === "admin_secundario" || user?.rol === "vendedor") && c.vendedorId === user?.id);

  // ---------------------------------------------------------------- indicadores
  const indicadores = useMemo(() => {
    const abiertas = cotizaciones.filter((c) => estaAbierta(c) && estadoVisible(c) !== "vencida");
    const porVencer = abiertas.filter((c) => (diasRestantes(c.vigencia) ?? 99) <= 3);
    const mes = new Date().toISOString().slice(0, 7);
    const convertidasMes = cotizaciones.filter((c) => c.estado === "convertida" && (c.cerradaAt ?? "").startsWith(mes));
    const cerradas = cotizaciones.filter((c) => ["convertida", "rechazada", "vencida"].includes(estadoVisible(c)));
    const convertidas = cerradas.filter((c) => c.estado === "convertida");
    return {
      abiertas: abiertas.length,
      montoAbiertas: abiertas.reduce((a, c) => a + c.total, 0),
      porVencer: porVencer.length,
      convertidasMes: convertidasMes.length,
      montoConvertidasMes: convertidasMes.reduce((a, c) => a + c.total, 0),
      tasa: cerradas.length ? Math.round((convertidas.length * 100) / cerradas.length) : null,
      cerradas: cerradas.length,
    };
  }, [cotizaciones]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return cotizaciones.filter((c) => {
      const v = estadoVisible(c);
      if (filtro === "abiertas" && !(estaAbierta(c) && v !== "vencida")) return false;
      if (filtro === "vencidas" && v !== "vencida") return false;
      if ((filtro === "convertida" || filtro === "rechazada") && c.estado !== filtro) return false;
      if (!q) return true;
      return [c.folio, c.cliente, c.clienteTelefono, c.clienteEmail, c.vendedor, c.ordenFolio, ...c.partidas.map((p) => p.nombre)]
        .some((x) => x?.toLowerCase().includes(q));
    });
  }, [cotizaciones, busqueda, filtro]);

  // ---------------------------------------------------------------- acciones
  const ejecutar = async (fn: () => Promise<unknown>, exito: string) => {
    setTrabajando(true);
    try {
      await fn();
      toast.success(exito);
      await cargar();
      return true;
    } catch (err: any) {
      toast.error("No se pudo completar", { description: err?.message ?? String(err) });
      return false;
    } finally {
      setTrabajando(false);
    }
  };

  const cambiarEstado = (c: Cotizacion, estado: EstadoCotizacion, texto: string, motivo?: string) =>
    ejecutar(() => cambiarEstadoCotizacion(c.id, estado, { motivo }), `${c.folio}: ${texto}`);

  /** Guarda la cotización capturada en el formulario (alta o edición). */
  const guardarDesdeFormulario = async (datos: CotizacionCapturada): Promise<boolean> => {
    if (formulario?.tipo !== "cotizacion") return false;
    try {
      const { folio } = await guardarCotizacion(formulario.editando?.id ?? null, datos);
      toast.success(formulario.editando ? `Cotización ${folio} actualizada` : `Cotización ${folio} creada`, {
        description: "Puedes enviarla al cliente desde el listado.",
      });
      await cargar();
      return true;
    } catch (err: any) {
      toast.error("No se pudo guardar la cotización", { description: err?.message ?? String(err), duration: 10000 });
      return false;
    }
  };

  /** Crea la orden desde la cotización y la marca como convertida. */
  const convertirEnOrden = async (orden: Orden): Promise<boolean> => {
    if (formulario?.tipo !== "orden") return false;
    const cot = formulario.desde;
    let creada: { id: string; folio: string };
    try {
      creada = await crearOrden(orden);
    } catch (err: any) {
      toast.error("No se pudo crear la orden", { description: err?.message ?? String(err), duration: 10000 });
      return false;
    }
    try {
      await cambiarEstadoCotizacion(cot.id, "convertida", { ordenId: creada.id });
      toast.success(`Orden ${creada.folio} creada desde ${cot.folio}`);
    } catch (err: any) {
      // La orden ya existe: se avisa, pero no se reintenta crearla.
      toast.warning(`Orden ${creada.folio} creada, pero ${cot.folio} no se pudo marcar como convertida`, {
        description: err?.message ?? String(err),
      });
    }
    setDetalle(null);
    await cargar();
    navigate(`/ordenes/${creada.id}`);
    return true;
  };

  const accionesDe = (c: Cotizacion): Accion[] => {
    const editable = puedeEditar(c);
    const v = estadoVisible(c);
    const lista: Accion[] = [];
    if (editable && estaAbierta(c)) {
      lista.push({
        clave: "convertir",
        texto: "Convertir en orden",
        icono: ShoppingCart,
        principal: true,
        onClick: () => setFormulario({ tipo: "orden", desde: c, inicial: capturaDesdeCotizacion(c, "convertir") }),
      });
    }
    if (c.estado === "convertida" && c.ordenId) {
      lista.push({ clave: "orden", texto: `Ver orden ${c.ordenFolio ?? ""}`.trim(), icono: Eye, principal: true, onClick: () => navigate(`/ordenes/${c.ordenId}`) });
    }
    lista.push({ clave: "pdf", texto: "Guardar en PDF", icono: FileDown, onClick: () => imprimirCotizacion(c) });
    lista.push({ clave: "contactar", texto: "Contactar cliente", icono: MessageCircle, onClick: () => setContacto(c) });
    if (editable && (c.estado === "borrador" || c.estado === "enviada")) {
      lista.push({
        clave: "editar",
        texto: v === "vencida" ? "Editar / renovar vigencia" : "Editar",
        icono: Pencil,
        onClick: () =>
          setFormulario({ tipo: "cotizacion", editando: c, inicial: capturaDesdeCotizacion(c, "editar"), titulo: `Editar cotización ${c.folio}` }),
      });
    }
    if (editable && c.estado === "borrador") {
      lista.push({ clave: "enviada", texto: "Marcar como enviada", icono: Send, onClick: () => cambiarEstado(c, "enviada", "marcada como enviada") });
    }
    if (editable && (c.estado === "borrador" || c.estado === "enviada")) {
      lista.push({ clave: "aceptada", texto: "Cliente aceptó", icono: CheckCircle2, onClick: () => cambiarEstado(c, "aceptada", "aceptada por el cliente") });
    }
    if (editable && ["borrador", "enviada", "aceptada"].includes(c.estado)) {
      lista.push({ clave: "rechazar", texto: "Cliente rechazó", icono: XCircle, onClick: () => setRechazo({ c, motivo: "" }) });
    }
    if (editable && c.estado === "rechazada") {
      lista.push({ clave: "reabrir", texto: "Reabrir", icono: RotateCcw, onClick: () => cambiarEstado(c, "enviada", "reabierta") });
    }
    if (puedeCrear) {
      lista.push({
        clave: "duplicar",
        texto: "Duplicar",
        icono: Copy,
        onClick: () =>
          setFormulario({ tipo: "cotizacion", editando: null, inicial: capturaDesdeCotizacion(c, "duplicar"), titulo: `Nueva cotización (copia de ${c.folio})` }),
      });
    }
    if (editable && c.estado !== "convertida") {
      lista.push({ clave: "eliminar", texto: "Eliminar", icono: Trash2, peligro: true, onClick: () => setBorrar(c) });
    }
    return lista;
  };

  // ---------------------------------------------------------------- render
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Cotizaciones</h1>
          <p className="text-muted-foreground mt-1">Propuestas a clientes y su conversión en órdenes</p>
        </div>
        {puedeCrear && (
          <Button onClick={() => setFormulario({ tipo: "cotizacion", editando: null, inicial: null, titulo: "Nueva Cotización" })}>
            <Plus /> Nueva cotización
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Abiertas"
          value={indicadores.abiertas}
          icon={FileText}
          footer={<span className="text-sm text-muted-foreground">{formatMonto(indicadores.montoAbiertas)} en propuesta</span>}
        />
        <StatCard title="Por vencer (3 días)" value={indicadores.porVencer} icon={CalendarClock} color="warning" />
        <StatCard
          title="Convertidas este mes"
          value={indicadores.convertidasMes}
          icon={ShoppingCart}
          color="success"
          footer={<span className="text-sm text-muted-foreground">{formatMonto(indicadores.montoConvertidasMes)}</span>}
        />
        <StatCard
          title="Tasa de conversión"
          value={indicadores.tasa === null ? "—" : `${indicadores.tasa} %`}
          icon={TrendingUp}
          footer={
            <span className="text-sm text-muted-foreground">
              {indicadores.cerradas ? `de ${indicadores.cerradas} cerradas` : "Aún no hay cotizaciones cerradas"}
            </span>
          }
        />
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
                placeholder="Buscar por folio, cliente, producto, vendedor…"
                aria-label="Buscar cotizaciones"
                className="w-full h-9 pl-9 pr-3 bg-secondary rounded-md border border-transparent text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Filtrar por estado">
              {FILTROS.map((f) => (
                <Button
                  key={f.valor}
                  size="sm"
                  role="radio"
                  aria-checked={filtro === f.valor}
                  variant={filtro === f.valor ? "default" : "outline"}
                  onClick={() => setFiltro(f.valor)}
                >
                  {f.texto}
                </Button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Folio</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Válida hasta</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  {user?.rol !== "vendedor" && <TableHead>Vendedor</TableHead>}
                  <TableHead className="w-10">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargando && cotizaciones.length === 0 &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}>
                        <div className="h-5 rounded bg-secondary animate-pulse" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!cargando && filtradas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                      {cotizaciones.length === 0
                        ? puedeCrear
                          ? "Aún no hay cotizaciones. Crea la primera con “Nueva cotización”."
                          : "Aún no hay cotizaciones."
                        : "Ninguna cotización coincide con el filtro."}
                    </TableCell>
                  </TableRow>
                )}
                {filtradas.map((c) => {
                  const dias = diasRestantes(c.vigencia);
                  const abierta = estaAbierta(c);
                  return (
                    <TableRow key={c.id} onClick={() => setDetalle(c)} className="cursor-pointer">
                      <TableCell className="font-medium whitespace-nowrap">{c.folio}</TableCell>
                      <TableCell className="max-w-[240px]">
                        <span className="block truncate" title={c.cliente}>{c.cliente}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.partidas.length} producto(s) · {c.partidas.reduce((a, p) => a + p.cantidad, 0)} pzas
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatFecha(c.fecha)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatFecha(c.vigencia)}
                        {abierta && dias !== null && (
                          <span className={`block text-xs ${claseDiasRestantes(dias)}`}>{textoDiasRestantes(dias)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap">{formatMonto(c.total)}</TableCell>
                      <TableCell>
                        <EstadoBadge c={c} />
                        {c.estado === "convertida" && c.ordenFolio && (
                          <span className="block text-xs text-muted-foreground mt-0.5">{c.ordenFolio}</span>
                        )}
                      </TableCell>
                      {user?.rol !== "vendedor" && <TableCell className="text-sm whitespace-nowrap">{c.vendedor}</TableCell>}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {/* modal={false}: el menú abre diálogos y no debe dejar la página bloqueada */}
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" aria-label={`Acciones de ${c.folio}`} disabled={trabajando}>
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {accionesDe(c).map((a, i, todas) => (
                              <div key={a.clave}>
                                {a.peligro && i > 0 && <DropdownMenuSeparator />}
                                <DropdownMenuItem
                                  onClick={a.onClick}
                                  className={a.peligro ? "text-red-600 dark:text-red-400" : undefined}
                                >
                                  <a.icono className="w-4 h-4 mr-2" />
                                  {a.texto}
                                </DropdownMenuItem>
                                {a.principal && i < todas.length - 1 && !todas[i + 1].principal && <DropdownMenuSeparator />}
                              </div>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detalle */}
      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  Cotización {detalle.folio} <EstadoBadge c={detalle} />
                </DialogTitle>
                <DialogDescription>
                  {detalle.cliente} · {formatFecha(detalle.fecha)} · válida hasta {formatFecha(detalle.vigencia)}
                  {detalle.vendedor !== "—" && ` · ${detalle.vendedor}`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {detalle.estado === "rechazada" && detalle.motivoRechazo && (
                  <p className="text-sm rounded-lg bg-red-500/10 text-red-700 dark:text-red-300 px-3 py-2">
                    Motivo del rechazo: {detalle.motivoRechazo}
                  </p>
                )}
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {detalle.partidas.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-4 p-3 text-sm">
                      <div>
                        <p className="font-medium">
                          {p.cantidad} × {p.nombre}
                        </p>
                        {detallePartida(p.captura) && <p className="text-muted-foreground">{detallePartida(p.captura)}</p>}
                        {p.captura.requiereBordado && (
                          <p className="text-muted-foreground">Bordado: {p.captura.bordadoUbicacion}</p>
                        )}
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <p className="font-medium">{formatMonto(p.cantidad * p.precioUnitario)}</p>
                        <p className="text-xs text-muted-foreground">{formatMonto(p.precioUnitario)} c/u</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <DesgloseImportes
                  importes={{ subtotal: detalle.subtotal, descuento: detalle.descuento, iva: detalle.iva, total: detalle.total }}
                />
                {detalle.notas && (
                  <p className="text-sm whitespace-pre-line rounded-lg bg-secondary p-3">{detalle.notas}</p>
                )}
              </div>

              <DialogFooter className="flex-wrap gap-2 sm:justify-start">
                {accionesDe(detalle).map((a) => (
                  <Button
                    key={a.clave}
                    size="sm"
                    disabled={trabajando}
                    variant={a.principal ? "default" : a.peligro ? "ghost" : "outline"}
                    className={a.peligro ? "text-red-600 dark:text-red-400" : undefined}
                    onClick={() => {
                      // El PDF se imprime sin salir del detalle; lo demás abre otra ventana.
                      if (a.clave !== "pdf") setDetalle(null);
                      a.onClick();
                    }}
                  >
                    <a.icono className="w-4 h-4" />
                    {a.texto}
                  </Button>
                ))}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Alta / edición / duplicado de cotización */}
      <NuevaOrdenMultiProducto
        isOpen={formulario?.tipo === "cotizacion"}
        modo="cotizacion"
        inicial={formulario?.tipo === "cotizacion" ? formulario.inicial : null}
        titulo={formulario?.tipo === "cotizacion" ? formulario.titulo : undefined}
        onClose={() => setFormulario(null)}
        onSubmit={guardarDesdeFormulario}
      />

      {/* Conversión en orden: el formulario de orden ya lleno con la cotización */}
      <NuevaOrdenMultiProducto
        isOpen={formulario?.tipo === "orden"}
        inicial={formulario?.tipo === "orden" ? formulario.inicial : null}
        titulo={formulario?.tipo === "orden" ? `Nueva orden desde ${formulario.desde.folio}` : undefined}
        onClose={() => setFormulario(null)}
        onSubmit={convertirEnOrden}
      />

      {contacto && (
        <ContactarClienteDialog
          open={!!contacto}
          onClose={() => setContacto(null)}
          cliente={contacto.cliente}
          telefono={contacto.clienteTelefono}
          email={contacto.clienteEmail}
          plantillas={plantillasCotizacion(contacto)}
          folio={`Cotización ${contacto.folio}`}
          onGuardarPdf={() => imprimirCotizacion(contacto)}
          textoPdf="Guardar cotización en PDF"
          onEnviado={(tipo) => {
            // Al mandar una cotización en borrador, queda como enviada.
            if (tipo === "envio" && contacto.estado === "borrador" && puedeEditar(contacto)) {
              void cambiarEstadoCotizacion(contacto.id, "enviada").then(cargar).catch(() => {});
            }
          }}
        />
      )}

      {/* Rechazo con motivo */}
      <Dialog open={!!rechazo} onOpenChange={(o) => !o && !trabajando && setRechazo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cliente rechazó {rechazo?.c.folio}</DialogTitle>
            <DialogDescription>El motivo ayuda a mejorar las siguientes cotizaciones.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cot-motivo">Motivo (opcional)</Label>
            <textarea
              id="cot-motivo"
              rows={3}
              maxLength={500}
              placeholder="Ej. Precio, tiempo de entrega, eligió a otro proveedor…"
              value={rechazo?.motivo ?? ""}
              onChange={(e) => rechazo && setRechazo({ ...rechazo, motivo: e.target.value })}
              className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRechazo(null)} disabled={trabajando}>
              Cancelar
            </Button>
            <Button
              disabled={trabajando}
              onClick={async () => {
                if (!rechazo) return;
                if (await cambiarEstado(rechazo.c, "rechazada", "marcada como rechazada", rechazo.motivo)) setRechazo(null);
              }}
            >
              Marcar como rechazada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación */}
      <Dialog open={!!borrar} onOpenChange={(o) => !o && !trabajando && setBorrar(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar la cotización {borrar?.folio}?</DialogTitle>
            <DialogDescription>
              Se borra junto con sus productos y no se puede deshacer. Si el cliente solo la rechazó, mejor márcala
              como rechazada para conservar el historial.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBorrar(null)} disabled={trabajando}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={trabajando}
              onClick={async () => {
                if (!borrar) return;
                const c = borrar;
                if (await ejecutar(() => eliminarCotizacion(c.id), `Cotización ${c.folio} eliminada`)) {
                  setBorrar(null);
                  setDetalle(null);
                }
              }}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
