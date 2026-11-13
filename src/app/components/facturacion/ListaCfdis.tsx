/**
 * ListaCfdis.tsx — Tabla paginada de CFDI (Facturas o Complementos de Pago), con el
 * orden de columnas de CONTPAQi Vende para que el personal la reconozca.
 *
 * Filtro, búsqueda y paginación se resuelven en el servidor (hay miles de registros).
 * Botones: nuevo (solo admin primario, si `rutaNuevo`), importar de CONTPAQi y descargar
 * lo filtrado en CSV.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, FilePlus2, FileUp, Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { useBusquedaUrl } from "../../hooks/useBusquedaUrl";
import { Card, CardContent } from "../Card";
import { Button } from "../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import ImportarCsvDialog from "./ImportarCsvDialog";
import DetalleCfdiDialog from "./DetalleCfdiDialog";
import { FORMAS_PAGO, describirSat } from "../../lib/sat";
import {
  ESTADO_CFDI,
  descargarArchivo,
  escribirCsv,
  formatFechaHora,
  formatMoneda,
  serieFolio,
  type Cfdi,
  type TipoComprobante,
} from "../../lib/facturacion";

const POR_PAGINA = 20;
const CLASE_SELECT =
  "h-9 rounded-md border border-input bg-input-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";
const COLUMNAS =
  "id,tipo_comprobante,serie,folio,fecha,estado,estado_detalle,uuid,receptor_rfc,receptor_nombre," +
  "total,saldo,moneda,metodo_pago,forma_pago,fecha_vencimiento,fecha_pago,origen,cliente_id,orden_id";

type Filtro = "todos" | "borrador" | "vigente" | "cancelado" | "con_saldo" | "PUE" | "PPD";
const FILTROS: { valor: Filtro; label: string; soloFacturas?: boolean }[] = [
  { valor: "todos", label: "Todos" },
  { valor: "borrador", label: "Borradores" },
  { valor: "vigente", label: "Vigentes" },
  { valor: "cancelado", label: "Cancelados" },
  { valor: "con_saldo", label: "Con saldo pendiente", soloFacturas: true },
  { valor: "PUE", label: "PUE - Una sola exhibición", soloFacturas: true },
  { valor: "PPD", label: "PPD - Parcialidades o diferido", soloFacturas: true },
];

/** Quita caracteres que rompen la sintaxis de filtros de PostgREST. */
const limpiarBusqueda = (q: string) => q.replace(/[,()*%\\]/g, " ").trim();

export default function ListaCfdis({
  tipo,
  titulo,
  rutaNuevo,
  textoNuevo,
}: {
  tipo: TipoComprobante;
  titulo: string;
  rutaNuevo?: string;
  textoNuevo?: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const esAdminPrimario = user?.rol === "admin_primario";
  const esFactura = tipo === "I";

  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useBusquedaUrl();
  const [pagina, setPagina] = useState(0);
  const [filas, setFilas] = useState<Cfdi[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [importando, setImportando] = useState(false);
  const [detalle, setDetalle] = useState<Cfdi | null>(null);

  const consulta = useCallback(
    (columnas: string) => {
      let q = supabase.from("cfdis").select(columnas, { count: "exact" }).eq("tipo_comprobante", tipo);
      if (filtro === "borrador" || filtro === "vigente" || filtro === "cancelado") q = q.eq("estado", filtro);
      if (filtro === "con_saldo") q = q.gt("saldo", 0).neq("estado", "cancelado");
      if (filtro === "PUE" || filtro === "PPD") q = q.eq("metodo_pago", filtro);
      const texto = limpiarBusqueda(busqueda);
      if (texto) {
        const condiciones = [
          `receptor_rfc.ilike.*${texto}*`,
          `receptor_nombre.ilike.*${texto}*`,
          `receptor_nombre_comercial.ilike.*${texto}*`,
        ];
        const numero = texto.replace(/^[A-Za-z]+\s*-?\s*/, "");
        if (/^\d{1,9}$/.test(numero)) condiciones.push(`folio.eq.${numero}`);
        if (/^[0-9a-fA-F-]{8,36}$/.test(texto) && texto.length === 36) condiciones.push(`uuid.eq.${texto}`);
        q = q.or(condiciones.join(","));
      }
      // Más recientes primero, como en CONTPAQi.
      return q.order("fecha", { ascending: false }).order("folio", { ascending: false });
    },
    [tipo, filtro, busqueda]
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, count, error } = await consulta(COLUMNAS).range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
    setCargando(false);
    if (error) {
      toast.error(`No se pudieron cargar los CFDI: ${error.message}`);
      return;
    }
    setFilas((data ?? []) as unknown as Cfdi[]);
    setTotal(count ?? 0);
  }, [consulta, pagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Al cambiar filtro o búsqueda se vuelve a la primera página.
  useEffect(() => setPagina(0), [filtro, busqueda]);

  const paginas = Math.max(Math.ceil(total / POR_PAGINA), 1);

  const descargar = async () => {
    const { data, error } = await consulta(COLUMNAS).range(0, 9999);
    if (error) {
      toast.error(error.message);
      return;
    }
    const lista = (data ?? []) as unknown as Cfdi[];
    const csv = escribirCsv(
      esFactura
        ? ["Serie", "Folio", "Fecha", "RFC Receptor", "Razón social", "Total", "Moneda", "Método de pago",
           "Forma de pago", "Estado", "Saldo", "Fecha de vencimiento", "Folio fiscal", "Origen"]
        : ["Serie", "Folio", "Fecha del pago", "Fecha", "RFC Receptor", "Razón social", "Total",
           "Forma de pago", "Folio fiscal", "Estado", "Origen"],
      lista.map((c) =>
        esFactura
          ? [c.serie, c.folio, c.fecha, c.receptor_rfc, c.receptor_nombre, c.total, c.moneda, c.metodo_pago,
             c.forma_pago, ESTADO_CFDI[c.estado].label, c.saldo, c.fecha_vencimiento, c.uuid, c.origen]
          : [c.serie, c.folio, c.fecha_pago, c.fecha, c.receptor_rfc, c.receptor_nombre, c.total,
             c.forma_pago, c.uuid, ESTADO_CFDI[c.estado].label, c.origen]
      )
    );
    descargarArchivo(`${titulo.replace(/\s+/g, "_")}.csv`, csv);
  };

  const abrir = (c: Cfdi) => {
    if (esFactura && c.origen === "erp") navigate(`/facturacion/facturas/${c.id}`);
    else setDetalle(c);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>{titulo}</h1>
          <p className="text-muted-foreground mt-1">
            CFDI 4.0 emitidos por la empresa{esFactura ? "" : " (recibos electrónicos de pago)"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {rutaNuevo && esAdminPrimario && (
            <Button onClick={() => navigate(rutaNuevo)}>
              <FilePlus2 /> {textoNuevo}
            </Button>
          )}
          {esAdminPrimario && (
            <Button variant="outline" onClick={() => setImportando(true)}>
              <FileUp /> Importar de CONTPAQi
            </Button>
          )}
          <Button variant="outline" onClick={descargar} disabled={total === 0}>
            <Download /> Descarga
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              Filtrar por:
              <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} className={CLASE_SELECT}>
                {FILTROS.filter((f) => esFactura || !f.soloFacturas).map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por folio, RFC, cliente o folio fiscal…"
                className="w-full h-9 pl-9 pr-3 bg-secondary rounded-md border border-transparent text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total === 0
                ? "Sin registros"
                : `Mostrando ${pagina * POR_PAGINA + 1} - ${Math.min((pagina + 1) * POR_PAGINA, total)} de ${total.toLocaleString("es-MX")} registros`}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)} aria-label="Página anterior">
                <ChevronLeft />
              </Button>
              <span className="px-2 tabular-nums">
                {pagina + 1} / {paginas}
              </span>
              <Button variant="outline" size="icon" disabled={pagina + 1 >= paginas} onClick={() => setPagina(pagina + 1)} aria-label="Página siguiente">
                <ChevronRight />
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serie - Folio</TableHead>
                  {!esFactura && <TableHead>Fecha del pago</TableHead>}
                  <TableHead>Fecha de expedición</TableHead>
                  <TableHead>Datos del receptor</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  {esFactura && <TableHead>Método de pago</TableHead>}
                  <TableHead>Forma de pago</TableHead>
                  <TableHead className="pl-4">Estado CFDI</TableHead>
                  {esFactura && <TableHead className="text-right">Saldo</TableHead>}
                  {esFactura && <TableHead>Vencimiento</TableHead>}
                  <TableHead>Folio fiscal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargando && filas.length === 0 &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={11}>
                        <div className="h-5 rounded bg-secondary animate-pulse" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!cargando && filas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="py-12 text-center text-muted-foreground">
                      {busqueda || filtro !== "todos"
                        ? "Ningún CFDI coincide con la búsqueda o el filtro."
                        : "Aún no hay CFDI. Importa el historial de CONTPAQi o crea uno nuevo."}
                    </TableCell>
                  </TableRow>
                )}
                {filas.map((c) => (
                  <TableRow key={c.id} onClick={() => abrir(c)} className={`cursor-pointer ${cargando ? "opacity-60" : ""}`}>
                    <TableCell className="font-medium text-primary whitespace-nowrap">{serieFolio(c)}</TableCell>
                    {!esFactura && <TableCell className="whitespace-nowrap">{formatFechaHora(c.fecha_pago)}</TableCell>}
                    <TableCell className="whitespace-nowrap">{formatFechaHora(c.fecha)}</TableCell>
                    <TableCell className="max-w-[240px]">
                      <span className="block text-primary">{c.receptor_rfc ?? "Sin RFC"}</span>
                      <span className="block truncate text-muted-foreground" title={c.receptor_nombre ?? ""}>
                        {c.receptor_nombre ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoneda(c.total, c.moneda)}</TableCell>
                    {esFactura && (
                      <TableCell>
                        {c.metodo_pago && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              c.metodo_pago === "PUE"
                                ? "bg-status-completed-bg text-status-completed-text"
                                : "bg-status-in-progress-bg text-status-in-progress-text"
                            }`}
                          >
                            {c.metodo_pago}
                          </span>
                        )}
                      </TableCell>
                    )}
                    {/* TableCell trae whitespace-nowrap por defecto: se habilita el salto de línea
                        dentro de un ancho fijo para que el texto no invada la columna vecina. */}
                    <TableCell className="whitespace-normal text-sm">
                      <div className="w-[180px] leading-snug">{describirSat(FORMAS_PAGO, c.forma_pago) || "—"}</div>
                    </TableCell>
                    <TableCell className="pl-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${ESTADO_CFDI[c.estado].clase}`}>
                        {c.estado_detalle && c.estado !== "borrador" ? c.estado_detalle : ESTADO_CFDI[c.estado].label}
                      </span>
                      {c.origen === "contpaqi" && <span className="block text-xs text-muted-foreground mt-1">CONTPAQi</span>}
                    </TableCell>
                    {esFactura && (
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {c.estado === "borrador" ? "—" : formatMoneda(c.saldo, c.moneda)}
                      </TableCell>
                    )}
                    {esFactura && (
                      <TableCell className="whitespace-nowrap">
                        {c.metodo_pago === "PPD" && c.fecha_vencimiento
                          ? new Date(`${c.fecha_vencimiento}T12:00:00`).toLocaleDateString("es-MX")
                          : ""}
                      </TableCell>
                    )}
                    <TableCell className="whitespace-normal">
                      <div className="w-[160px] font-mono text-xs leading-snug break-all">{c.uuid ?? "—"}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ImportarCsvDialog open={importando} tipoEsperado={tipo} onClose={() => setImportando(false)} onImportado={cargar} />
      <DetalleCfdiDialog cfdi={detalle} onClose={() => setDetalle(null)} />
    </div>
  );
}
