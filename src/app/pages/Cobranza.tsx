/**
 * Cobranza.tsx — Antigüedad de saldos (ruta /cobranza).
 *
 *  - Tarjetas por tramo (al corriente, 1–30, 31–60, +60 días vencido) que sirven de filtro,
 *    con barra de distribución de la cartera.
 *  - Vista "Por cliente" (matriz de antigüedad, con el detalle de órdenes al expandir) y
 *    vista "Por orden" (vencimiento, días vencido, último pago y último recordatorio).
 *  - Acciones: registrar abono, contactar al cliente (WhatsApp/correo con plantillas de
 *    cobro), estado de cuenta en PDF y ver la orden.
 *  - El admin primario puede correr los recordatorios automáticos en ese momento (el cron
 *    los envía cada día a las 08:00).
 *
 * Ven: admins (toda la cartera) y vendedor (la suya). Abonan: el admin primario a
 * cualquier orden; admin secundario y vendedor a las suyas (lo exige la BD).
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  BellRing,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FileDown,
  HandCoins,
  MessageCircle,
  Search,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useErpData } from "../context/ErpDataContext";
import { useBusquedaUrl } from "../hooks/useBusquedaUrl";
import { Card, CardContent } from "../components/Card";
import ContactarClienteDialog from "../components/ContactarClienteDialog";
import RegistrarAbonoDialog from "../components/RegistrarAbonoDialog";
import { Button } from "../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { formatMonto } from "../lib/pagos";
import { formatFecha } from "../lib/fechas";
import { tiempoRelativo } from "../lib/notificaciones";
import {
  TRAMOS,
  TRAMO_INFO,
  agruparPorCliente,
  cargarCartera,
  enviarRecordatoriosAhora,
  imprimirEstadoCuenta,
  plantillasCobro,
  resumenTramos,
  type SaldoCartera,
  type Tramo,
} from "../lib/cobranza";

const ICONO_TRAMO: Record<Tramo, LucideIcon> = {
  corriente: ShieldCheck,
  "1_30": Clock,
  "31_60": AlertTriangle,
  mas_60: AlertTriangle,
};

type Vista = "cliente" | "orden";

interface Contacto {
  cliente: string;
  telefono?: string;
  email?: string;
  ordenes: SaldoCartera[];
}

function BadgeTramo({ fila }: { fila: SaldoCartera }) {
  const info = TRAMO_INFO[fila.tramo];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${info.clase}`}>
      {fila.tramo === "corriente" ? "Al corriente" : `${fila.diasVencido} ${fila.diasVencido === 1 ? "día" : "días"}`}
    </span>
  );
}

export default function Cobranza() {
  const { user } = useAuth();
  const { ordenes } = useErpData();
  const navigate = useNavigate();
  const esAdmin = user?.rol === "admin_primario" || user?.rol === "admin_secundario";

  const [filas, setFilas] = useState<SaldoCartera[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useBusquedaUrl();
  const [tramo, setTramo] = useState<Tramo | "todos">("todos");
  const [vendedor, setVendedor] = useState("todos");
  const [vista, setVista] = useState<Vista>("cliente");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [contacto, setContacto] = useState<Contacto | null>(null);
  const [abonoOrdenId, setAbonoOrdenId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setErrorCarga(null);
      setFilas(await cargarCartera());
    } catch (err: any) {
      setFilas([]);
      setErrorCarga(err?.message ?? "Error desconocido");
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Cuando cambian los pagos en el contexto (p. ej. tras un abono), se recarga la cartera.
  const firmaPagos = useMemo(
    () => ordenes.reduce((a, o) => a + (o.pagos?.length ?? 0), 0),
    [ordenes]
  );
  useEffect(() => {
    if (filas) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaPagos]);

  const vendedores = useMemo(
    () => [...new Set((filas ?? []).map((f) => f.vendedor))].sort((a, b) => a.localeCompare(b, "es")),
    [filas]
  );

  // Filtro por vendedor y texto (las tarjetas muestran el total con esos filtros).
  const base = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (filas ?? []).filter(
      (f) =>
        (vendedor === "todos" || f.vendedor === vendedor) &&
        (!q || f.folio.toLowerCase().includes(q) || f.cliente.toLowerCase().includes(q))
    );
  }, [filas, vendedor, busqueda]);

  const { montos, ordenes: conteo } = useMemo(() => resumenTramos(base), [base]);
  const visibles = useMemo(() => (tramo === "todos" ? base : base.filter((f) => f.tramo === tramo)), [base, tramo]);
  const clientes = useMemo(() => agruparPorCliente(visibles), [visibles]);
  const vencido = montos.total - montos.corriente;

  const puedeAbonar = (f: SaldoCartera) =>
    user?.rol === "admin_primario" ||
    ((user?.rol === "admin_secundario" || user?.rol === "vendedor") && f.vendedorId === user?.id);

  const ordenAbono = abonoOrdenId ? ordenes.find((o) => o.id === abonoOrdenId) : undefined;

  const alternar = (clave: string) =>
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(clave)) s.delete(clave);
      else s.add(clave);
      return s;
    });

  const enviarRecordatorios = async () => {
    setEnviando(true);
    try {
      const n = await enviarRecordatoriosAhora();
      toast.success(n === 0 ? "No había recordatorios pendientes" : `Se avisó de ${n} saldo(s) vencido(s)`);
      await cargar();
    } catch (err: any) {
      toast.error("No se pudieron enviar los recordatorios", { description: err?.message });
    } finally {
      setEnviando(false);
    }
  };

  const abrirAbono = (f: SaldoCartera) => {
    if (!ordenes.some((o) => o.id === f.ordenId)) {
      navigate(`/ordenes/${f.ordenId}`);
      return;
    }
    setAbonoOrdenId(f.ordenId);
  };

  const accionesOrden = (f: SaldoCartera) => (
    <div className="flex justify-end gap-1">
      {puedeAbonar(f) && (
        <Button variant="ghost" size="icon" aria-label={`Registrar abono a ${f.folio}`} title="Registrar abono" onClick={() => abrirAbono(f)}>
          <HandCoins className="w-4 h-4" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Contactar por ${f.folio}`}
        title="Contactar al cliente"
        onClick={() => setContacto({ cliente: f.cliente, telefono: f.telefono, email: f.email, ordenes: [f] })}
      >
        <MessageCircle className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Ver orden ${f.folio}`} title="Ver orden" onClick={() => navigate(`/ordenes/${f.ordenId}`)}>
        <Eye className="w-4 h-4" />
      </Button>
    </div>
  );

  const celdaMonto = (n: number, t: Tramo) => (
    <TableCell className={`text-right whitespace-nowrap tabular-nums ${n > 0 && t !== "corriente" ? "font-medium" : ""}`}>
      {n > 0 ? formatMonto(n) : <span className="text-muted-foreground">—</span>}
    </TableCell>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>Cobranza</h1>
          <p className="text-muted-foreground mt-1">
            Antigüedad de saldos: vencen en la fecha de entrega más los días de crédito del cliente.
          </p>
        </div>
        {user?.rol === "admin_primario" && (
          <Button variant="outline" onClick={enviarRecordatorios} disabled={enviando} className="gap-2">
            <BellRing className="w-4 h-4" />
            {enviando ? "Enviando…" : "Enviar recordatorios ahora"}
          </Button>
        )}
      </div>

      {errorCarga && (
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="font-medium text-status-pending">No se pudo cargar la cartera.</p>
            <p className="text-muted-foreground mt-1">
              Verifica que sql/cobranza.sql esté aplicado en la base de datos. Detalle: {errorCarga}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tarjetas por tramo: también filtran la tabla */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {TRAMOS.map((t) => {
          const Icono = ICONO_TRAMO[t];
          const activo = tramo === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTramo(activo ? "todos" : t)}
              aria-pressed={activo}
              className={`text-left bg-card rounded-lg border p-5 transition-shadow hover:shadow-md ${
                activo ? "border-primary ring-2 ring-primary/20" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{TRAMO_INFO[t].titulo}</p>
                  <p className="text-2xl font-semibold mt-1">{formatMonto(montos[t])}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {conteo[t]} {conteo[t] === 1 ? "orden" : "órdenes"}
                  </p>
                </div>
                <span className={`p-2.5 rounded-lg ${TRAMO_INFO[t].clase}`}>
                  <Icono className="w-5 h-5" />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Distribución de la cartera */}
      {montos.total > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                Por cobrar: {formatMonto(montos.total)}
                <span className="text-muted-foreground font-normal">
                  {" "}
                  · vencido {formatMonto(vencido)} ({Math.round((vencido / montos.total) * 100)}%)
                </span>
              </p>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {TRAMOS.map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-sm ${TRAMO_INFO[t].barra}`} />
                    {TRAMO_INFO[t].corto}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
              {TRAMOS.map((t) =>
                montos[t] > 0 ? (
                  <div
                    key={t}
                    className={TRAMO_INFO[t].barra}
                    style={{ width: `${(montos[t] / montos.total) * 100}%` }}
                    title={`${TRAMO_INFO[t].titulo}: ${formatMonto(montos[t])}`}
                  />
                ) : null
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por cliente o folio…"
                aria-label="Buscar en la cartera"
                className="w-full h-9 pl-9 pr-3 bg-secondary rounded-md border border-transparent text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            {esAdmin && vendedores.length > 1 && (
              <select
                value={vendedor}
                onChange={(e) => setVendedor(e.target.value)}
                aria-label="Filtrar por vendedor"
                className="h-9 rounded-md border border-border bg-card px-3 text-sm"
              >
                <option value="todos">Todos los vendedores</option>
                {vendedores.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-1" role="radiogroup" aria-label="Vista">
              {(["cliente", "orden"] as Vista[]).map((v) => (
                <Button
                  key={v}
                  size="sm"
                  role="radio"
                  aria-checked={vista === v}
                  variant={vista === v ? "default" : "outline"}
                  onClick={() => setVista(v)}
                >
                  {v === "cliente" ? "Por cliente" : "Por orden"}
                </Button>
              ))}
            </div>
            {tramo !== "todos" && (
              <Button size="sm" variant="ghost" onClick={() => setTramo("todos")}>
                Quitar filtro «{TRAMO_INFO[tramo].corto}»
              </Button>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            {vista === "cliente" ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    {TRAMOS.map((t) => (
                      <TableHead key={t} className="text-right whitespace-nowrap">
                        {TRAMO_INFO[t].corto}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas === null ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                        Cargando…
                      </TableCell>
                    </TableRow>
                  ) : clientes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                        {filas.length === 0 ? "No hay saldos pendientes. ¡Todo cobrado!" : "Ningún saldo coincide con el filtro"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    clientes.map((c) => {
                      const abierto = abiertos.has(c.clave);
                      return (
                        <Fragment key={c.clave}>
                          <TableRow className="cursor-pointer" onClick={() => alternar(c.clave)} aria-expanded={abierto}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {abierto ? (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{c.cliente}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {c.ordenes.length} {c.ordenes.length === 1 ? "orden" : "órdenes"}
                                    {c.diasMax > 0 && ` · hasta ${c.diasMax} días vencido`}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            {TRAMOS.map((t) => (
                              <Fragment key={t}>{celdaMonto(c.montos[t], t)}</Fragment>
                            ))}
                            <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums">
                              {formatMonto(c.montos.total)}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Contactar a ${c.cliente}`}
                                  title="Contactar al cliente"
                                  onClick={() =>
                                    setContacto({ cliente: c.cliente, telefono: c.telefono, email: c.email, ordenes: c.ordenes })
                                  }
                                >
                                  <MessageCircle className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Estado de cuenta de ${c.cliente}`}
                                  title="Estado de cuenta (PDF)"
                                  onClick={() => imprimirEstadoCuenta(c.cliente, c.ordenes)}
                                >
                                  <FileDown className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {abierto &&
                            c.ordenes.map((f) => (
                              <TableRow key={f.ordenId} className="bg-secondary/40">
                                <TableCell className="pl-10">
                                  <p className="font-medium">{f.folio}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Vence {formatFecha(f.vencimiento, undefined, "—")}
                                    {esAdmin && ` · ${f.vendedor}`}
                                  </p>
                                </TableCell>
                                <TableCell colSpan={3}>
                                  <div className="flex flex-wrap items-center gap-2 text-sm">
                                    <BadgeTramo fila={f} />
                                    <span className="text-muted-foreground">
                                      Pagado {formatMonto(f.pagado)} de {formatMonto(f.total)}
                                      {f.ultimoPago ? ` · último pago ${formatFecha(f.ultimoPago)}` : " · sin pagos"}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell />
                                <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                                  {formatMonto(f.saldo)}
                                </TableCell>
                                <TableCell>{accionesOrden(f)}</TableCell>
                              </TableRow>
                            ))}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Orden</TableHead>
                    <TableHead>Cliente</TableHead>
                    {esAdmin && <TableHead>Vendedor</TableHead>}
                    <TableHead>Vence</TableHead>
                    <TableHead>Antigüedad</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Último pago</TableHead>
                    <TableHead>Recordatorio</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas === null ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                        Cargando…
                      </TableCell>
                    </TableRow>
                  ) : visibles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                        {filas.length === 0 ? "No hay saldos pendientes. ¡Todo cobrado!" : "Ningún saldo coincide con el filtro"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibles.map((f) => (
                      <TableRow key={f.ordenId}>
                        <TableCell className="font-medium whitespace-nowrap">{f.folio}</TableCell>
                        <TableCell className="max-w-[220px] truncate">{f.cliente}</TableCell>
                        {esAdmin && <TableCell className="whitespace-nowrap">{f.vendedor}</TableCell>}
                        <TableCell className="whitespace-nowrap">
                          {formatFecha(f.vencimiento, undefined, "—")}
                          {f.diasCredito ? (
                            <p className="text-xs text-muted-foreground">crédito {f.diasCredito} días</p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <BadgeTramo fila={f} />
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">{formatMonto(f.total)}</TableCell>
                        <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums">
                          {formatMonto(f.saldo)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {f.ultimoPago ? formatFecha(f.ultimoPago) : <span className="text-muted-foreground">Sin pagos</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {f.ultimoAviso ? tiempoRelativo(f.ultimoAviso) : "—"}
                        </TableCell>
                        <TableCell>{accionesOrden(f)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Cada día a las 8:00 se avisa al vendedor (campana de notificaciones) cuando un saldo entra a 1, 31 y 61 días
            vencido; a partir de 61 días también al administrador primario.
          </p>
        </CardContent>
      </Card>

      {contacto && (
        <ContactarClienteDialog
          open={!!contacto}
          onClose={() => setContacto(null)}
          cliente={contacto.cliente}
          telefono={contacto.telefono}
          email={contacto.email}
          plantillas={plantillasCobro(
            contacto.cliente,
            contacto.ordenes,
            contacto.ordenes.length === 1 ? contacto.ordenes[0].vendedor : user?.nombre ?? ""
          )}
          folio={
            contacto.ordenes.length === 1 ? `Orden ${contacto.ordenes[0].folio}` : `Estado de cuenta ${contacto.cliente}`
          }
          onGuardarPdf={() => imprimirEstadoCuenta(contacto.cliente, contacto.ordenes)}
          textoPdf="Estado de cuenta en PDF"
        />
      )}

      {ordenAbono && (
        <RegistrarAbonoDialog
          orden={ordenAbono}
          open={!!ordenAbono}
          onClose={() => {
            setAbonoOrdenId(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}
