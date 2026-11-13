/**
 * FacturaForm.tsx — Nueva factura / borrador / consulta de una factura del ERP.
 * Rutas: /facturacion/facturas/nueva (opcional ?orden=<id> para facturar una orden)
 *        /facturacion/facturas/:id
 *
 * Diseño como CONTPAQi Vende: a la izquierda los datos del receptor; a la derecha las
 * pestañas Conceptos, Detalles de factura y CFDI relacionados.
 *
 * Mientras no esté conectado el PAC la factura se guarda como BORRADOR (sin folio ni
 * UUID): se puede preparar, revisar y corregir. "Guardar y timbrar" queda deshabilitado
 * y una lista indica lo que falta para poder timbrarla.
 * Solo el administrador principal crea y edita; el secundario consulta.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  Loader2,
  Pencil,
  Plus,
  Save,
  Stamp,
  Trash2,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { Card, CardContent } from "../../components/Card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import DesgloseImportes from "../../components/DesgloseImportes";
import PartidaDialog, { type ProductoFacturable } from "../../components/facturacion/PartidaDialog";
import { hoyISO } from "../../lib/fechas";
import {
  EXPORTACIONES,
  FORMAS_PAGO,
  MESES_GLOBAL,
  METODOS_PAGO,
  MONEDAS,
  PERIODICIDADES,
  REGIMENES_FISCALES,
  RFC_PUBLICO_GENERAL,
  TIPOS_RELACION,
  USOS_CFDI,
  describirSat,
  etiquetaSat,
  type OpcionSat,
} from "../../lib/sat";
import {
  ESTADO_CFDI,
  calcularConcepto,
  calcularTotalesCfdi,
  formatMoneda,
  pendientesParaTimbrar,
  repartirDescuento,
  serieFolio,
  type Cfdi,
  type ConceptoCfdi,
} from "../../lib/facturacion";

const CLASE_SELECT =
  "h-9 w-full rounded-md border border-input bg-input-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-60";

interface ClienteFiscal {
  id: string;
  razon_social: string;
  nombre_comercial: string | null;
  rfc: string | null;
  regimen_fiscal: string | null;
  codigo_postal: string | null;
  uso_cfdi: string | null;
  email: string | null;
  metodo_pago_cfdi: string | null;
  forma_pago_cfdi: string | null;
  dias_credito: number | null;
}
interface Emisor {
  rfc: string;
  razon_social: string;
  regimen_fiscal: string;
  codigo_postal: string;
}
interface Serie {
  serie: string;
  ultimo_folio: number;
  predeterminada: boolean;
}
interface Relacionado {
  tipo_relacion: string;
  uuid: string;
}

type Pestana = "conceptos" | "detalles" | "relacionados";

const sumarDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function SelectSat({ value, onChange, opciones, disabled, vacio = "Selecciona…" }: {
  value: string;
  onChange: (v: string) => void;
  opciones: OpcionSat[];
  disabled?: boolean;
  vacio?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={CLASE_SELECT}>
      <option value="">{vacio}</option>
      {opciones.map((o) => (
        <option key={o.clave} value={o.clave}>
          {etiquetaSat(o)}
        </option>
      ))}
    </select>
  );
}

export default function FacturaForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const ordenParam = searchParams.get("orden");
  const navigate = useNavigate();
  const { user } = useAuth();
  const esAdminPrimario = user?.rol === "admin_primario";

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("conceptos");
  const [cfdi, setCfdi] = useState<Cfdi | null>(null);
  const [emisor, setEmisor] = useState<Emisor | null>(null);
  const [series, setSeries] = useState<Serie[]>([]);
  const [clientes, setClientes] = useState<ClienteFiscal[]>([]);
  const [productos, setProductos] = useState<ProductoFacturable[]>([]);
  const [ordenFolio, setOrdenFolio] = useState<string | null>(null);
  const [avisoOrden, setAvisoOrden] = useState<string | null>(null);

  // ----- formulario
  const [serie, setSerie] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [rfc, setRfc] = useState("");
  const [nombre, setNombre] = useState("");
  const [nombreComercial, setNombreComercial] = useState("");
  const [regimen, setRegimen] = useState("");
  const [cp, setCp] = useState("");
  const [email, setEmail] = useState("");
  const [usoCfdi, setUsoCfdi] = useState("G03");
  const [metodoPago, setMetodoPago] = useState("PUE");
  const [formaPago, setFormaPago] = useState("");
  const [moneda, setMoneda] = useState("MXN");
  const [condiciones, setCondiciones] = useState("");
  const [vencimiento, setVencimiento] = useState("");
  const [exportacion, setExportacion] = useState("01");
  const [esGlobal, setEsGlobal] = useState(false);
  const [periodicidad, setPeriodicidad] = useState("04");
  const [meses, setMeses] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [comentarios, setComentarios] = useState("");
  const [ordenId, setOrdenId] = useState<string | null>(null);
  const [conceptos, setConceptos] = useState<ConceptoCfdi[]>([]);
  const [relacionados, setRelacionados] = useState<Relacionado[]>([]);

  // Partida en edición: índice (-1 = nueva) o null si el diálogo está cerrado.
  const [editando, setEditando] = useState<number | null>(null);
  const [nuevoRel, setNuevoRel] = useState<Relacionado>({ tipo_relacion: "04", uuid: "" });

  const editable = esAdminPrimario && (!cfdi || (cfdi.estado === "borrador" && cfdi.origen === "erp"));

  // ----- carga inicial
  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      const [emi, ser, cli, prod] = await Promise.all([
        supabase.from("empresa_fiscal").select("rfc,razon_social,regimen_fiscal,codigo_postal").maybeSingle(),
        supabase.from("series_folios").select("serie,ultimo_folio,predeterminada").eq("tipo", "factura").eq("activa", true).order("serie"),
        supabase
          .from("clientes")
          .select("id,razon_social,nombre_comercial,rfc,regimen_fiscal,codigo_postal,uso_cfdi,email,metodo_pago_cfdi,forma_pago_cfdi,dias_credito")
          .order("razon_social"),
        supabase
          .from("productos")
          .select("id,nombre,codigo,clave_prod_serv,clave_unidad,unidad_medida,objeto_imp,variantes_producto(talla,color,precio,sku)")
          .order("nombre"),
      ]);
      const error = emi.error || ser.error || cli.error || prod.error;
      if (error) {
        toast.error(`No se pudo cargar la facturación: ${error.message}. ¿Ya se aplicó sql/facturacion.sql?`);
        setCargando(false);
        return;
      }
      if (!vivo) return;
      setEmisor(emi.data as Emisor | null);
      const listaSeries = (ser.data ?? []) as Serie[];
      setSeries(listaSeries);
      setClientes((cli.data ?? []) as ClienteFiscal[]);
      setProductos((prod.data ?? []) as unknown as ProductoFacturable[]);

      if (id) {
        const { data, error: e2 } = await supabase
          .from("cfdis")
          .select("*, cfdi_conceptos(*), cfdi_relacionados(tipo_relacion,uuid_relacionado), ordenes(folio)")
          .eq("id", id)
          .maybeSingle();
        if (!vivo) return;
        if (e2 || !data) {
          toast.error(e2?.message ?? "No se encontró la factura");
          navigate("/facturacion/facturas");
          return;
        }
        cargarCfdi(data);
      } else {
        setSerie(listaSeries.find((s) => s.predeterminada)?.serie ?? listaSeries[0]?.serie ?? "");
        if (ordenParam) await cargarOrden(ordenParam, (cli.data ?? []) as ClienteFiscal[]);
      }
      if (vivo) setCargando(false);
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ordenParam]);

  const cargarCfdi = (d: any) => {
    setCfdi(d as Cfdi);
    setSerie(d.serie ?? "");
    setFecha((d.fecha ?? "").slice(0, 10) || hoyISO());
    setClienteId(d.cliente_id);
    setBusquedaCliente("");
    setRfc(d.receptor_rfc ?? "");
    setNombre(d.receptor_nombre ?? "");
    setNombreComercial(d.receptor_nombre_comercial ?? "");
    setRegimen(d.receptor_regimen ?? "");
    setCp(d.receptor_cp ?? "");
    setEmail(d.receptor_email ?? "");
    setUsoCfdi(d.uso_cfdi ?? "");
    setMetodoPago(d.metodo_pago ?? "");
    setFormaPago(d.forma_pago ?? "");
    setMoneda(d.moneda ?? "MXN");
    setCondiciones(d.condiciones_pago ?? "");
    setVencimiento(d.fecha_vencimiento ?? "");
    setExportacion(d.exportacion ?? "01");
    setEsGlobal(!!d.es_global);
    setPeriodicidad(d.global_periodicidad ?? "04");
    setMeses(d.global_meses ?? "01");
    setAnio(String(d.global_anio ?? new Date().getFullYear()));
    setComentarios(d.comentarios ?? "");
    setOrdenId(d.orden_id);
    setOrdenFolio(d.ordenes?.folio ?? null);
    setConceptos(
      [...(d.cfdi_conceptos ?? [])]
        .sort((a: any, b: any) => a.numero - b.numero)
        .map((c: any) => ({
          producto_id: c.producto_id,
          orden_detalle_id: c.orden_detalle_id,
          sku: c.sku,
          descripcion: c.descripcion,
          clave_prod_serv: c.clave_prod_serv,
          clave_unidad: c.clave_unidad,
          unidad: c.unidad,
          cantidad: Number(c.cantidad),
          valor_unitario: Number(c.valor_unitario),
          descuento: Number(c.descuento),
          objeto_imp: c.objeto_imp,
          tasa_iva: Number(c.tasa_iva),
        }))
    );
    setRelacionados((d.cfdi_relacionados ?? []).map((r: any) => ({ tipo_relacion: r.tipo_relacion, uuid: r.uuid_relacionado })));
  };

  /** Prellenado desde una orden: cliente y partidas (con su parte del descuento). */
  const cargarOrden = async (idOrden: string, listaClientes: ClienteFiscal[]) => {
    const [{ data: o, error }, { data: previas }] = await Promise.all([
      supabase
        .from("ordenes")
        .select(
          "id,folio,cliente_id,descuento," +
            "orden_detalles(id,cantidad,precio_unitario,tasa_iva,producto_id,created_at," +
            "productos(nombre,codigo,clave_prod_serv,clave_unidad,unidad_medida,objeto_imp),variantes_producto(talla,color,sku))"
        )
        .eq("id", idOrden)
        .maybeSingle(),
      supabase.from("cfdis").select("serie,folio,estado").eq("orden_id", idOrden).neq("estado", "cancelado"),
    ]);
    if (error || !o) {
      toast.error(error?.message ?? "No se encontró la orden");
      return;
    }
    const orden = o as any;
    setOrdenId(orden.id);
    setOrdenFolio(orden.folio);
    if (previas && previas.length > 0) {
      setAvisoOrden(
        `Esta orden ya tiene ${previas.length === 1 ? "una factura" : `${previas.length} facturas`}: ` +
          previas.map((p: any) => (p.folio ? `${p.serie ?? ""}-${p.folio}` : "borrador")).join(", ")
      );
    }
    const cli = listaClientes.find((c) => c.id === orden.cliente_id);
    if (cli) aplicarCliente(cli);

    const detalles = [...(orden.orden_detalles ?? [])].sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
    const importes = detalles.map((d: any) => calcularConcepto({ cantidad: d.cantidad, valor_unitario: Number(d.precio_unitario), descuento: 0, objeto_imp: "02", tasa_iva: 0 }).importe);
    const descuentos = repartirDescuento(importes, Number(orden.descuento ?? 0));
    setConceptos(
      detalles.map((d: any, i: number): ConceptoCfdi => {
        const v = d.variantes_producto;
        const variante = [v?.talla, v?.color].filter(Boolean).join(" ");
        return {
          producto_id: d.producto_id,
          orden_detalle_id: d.id,
          sku: d.productos?.codigo ?? v?.sku ?? null,
          descripcion: `${(d.productos?.nombre ?? "Producto").toUpperCase()}${variante ? ` ${variante.toUpperCase()}` : ""}`,
          clave_prod_serv: d.productos?.clave_prod_serv ?? "",
          clave_unidad: d.productos?.clave_unidad ?? "H87",
          unidad: d.productos?.unidad_medida ?? "Pieza",
          cantidad: Number(d.cantidad),
          valor_unitario: Number(d.precio_unitario),
          descuento: descuentos[i],
          objeto_imp: d.productos?.objeto_imp ?? "02",
          tasa_iva: Number(d.tasa_iva ?? 0.16),
        };
      })
    );
    setComentarios(`Orden ${orden.folio}`);
  };

  const aplicarCliente = (c: ClienteFiscal) => {
    setClienteId(c.id);
    setBusquedaCliente("");
    setEsGlobal(false);
    setRfc(c.rfc ?? "");
    setNombre(c.razon_social ?? "");
    setNombreComercial(c.nombre_comercial ?? "");
    setRegimen(c.regimen_fiscal ?? "");
    setCp(c.codigo_postal ?? "");
    setEmail(c.email ?? "");
    setUsoCfdi(c.uso_cfdi ?? "G03");
    const metodo = c.metodo_pago_cfdi ?? "PUE";
    setMetodoPago(metodo);
    setFormaPago(metodo === "PPD" ? "99" : c.forma_pago_cfdi ?? "");
    if (metodo === "PPD") setVencimiento(sumarDias(fecha, c.dias_credito ?? 0));
  };

  const elegirCliente = (texto: string) => {
    setBusquedaCliente(texto);
    const c = clientes.find((x) => `${x.rfc ?? "SIN RFC"} — ${x.razon_social}` === texto);
    if (c) aplicarCliente(c);
  };

  const cambiarGlobal = (activo: boolean) => {
    setEsGlobal(activo);
    if (activo) {
      setClienteId(null);
      setRfc(RFC_PUBLICO_GENERAL);
      setNombre("PUBLICO EN GENERAL");
      setNombreComercial("");
      setRegimen("616");
      setCp(emisor?.codigo_postal ?? "");
      setUsoCfdi("S01");
      setMetodoPago("PUE");
      if (formaPago === "99") setFormaPago("");
    }
  };

  const cambiarMetodo = (m: string) => {
    setMetodoPago(m);
    if (m === "PPD") {
      setFormaPago("99");
      if (!vencimiento) {
        const dias = clientes.find((c) => c.id === clienteId)?.dias_credito ?? 0;
        setVencimiento(sumarDias(fecha, dias));
      }
    } else if (formaPago === "99") setFormaPago("");
  };

  // ----- totales y validación
  const totales = useMemo(() => calcularTotalesCfdi(conceptos), [conceptos]);
  const pendientes = pendientesParaTimbrar({
    receptor_rfc: rfc,
    receptor_nombre: nombre,
    receptor_regimen: regimen,
    receptor_cp: cp,
    uso_cfdi: usoCfdi,
    metodo_pago: metodoPago,
    forma_pago: formaPago,
    es_global: esGlobal,
    global_periodicidad: periodicidad,
    global_meses: meses,
    conceptos,
  });
  const serieActual = series.find((s) => s.serie === serie);

  // ----- acciones
  const guardar = async () => {
    if (conceptos.length === 0) {
      toast.error("Agrega al menos una partida");
      setPestana("conceptos");
      return;
    }
    const invalida = relacionados.find((r) => !UUID_REGEX.test(r.uuid));
    if (invalida) {
      toast.error(`Folio fiscal relacionado no válido: ${invalida.uuid}`);
      return;
    }
    setGuardando(true);
    const ahora = new Date().toLocaleTimeString("en-GB", { timeZone: "America/Monterrey", hour12: false });
    const { data, error } = await supabase.rpc("guardar_cfdi", {
      p_id: cfdi?.id ?? null,
      p_datos: {
        tipo_comprobante: "I",
        serie,
        fecha: `${fecha}T${ahora}-06:00`,
        cliente_id: clienteId,
        receptor_rfc: rfc,
        receptor_nombre: nombre,
        receptor_nombre_comercial: nombreComercial,
        receptor_regimen: regimen,
        receptor_cp: cp,
        receptor_email: email,
        uso_cfdi: usoCfdi,
        metodo_pago: metodoPago,
        forma_pago: formaPago,
        moneda,
        condiciones_pago: condiciones,
        fecha_vencimiento: metodoPago === "PPD" ? vencimiento : "",
        exportacion,
        es_global: esGlobal,
        global_periodicidad: esGlobal ? periodicidad : "",
        global_meses: esGlobal ? meses : "",
        global_anio: esGlobal ? anio : "",
        orden_id: ordenId,
        comentarios,
        conceptos,
        relacionados: relacionados.map((r) => ({ tipo_relacion: r.tipo_relacion, uuid: r.uuid.toLowerCase() })),
      },
    });
    setGuardando(false);
    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    toast.success("Borrador guardado");
    if (!cfdi) navigate(`/facturacion/facturas/${data}`, { replace: true });
    else {
      const { data: d } = await supabase
        .from("cfdis")
        .select("*, cfdi_conceptos(*), cfdi_relacionados(tipo_relacion,uuid_relacionado), ordenes(folio)")
        .eq("id", cfdi.id)
        .maybeSingle();
      if (d) cargarCfdi(d);
    }
  };

  const eliminar = async () => {
    if (!cfdi || !window.confirm("¿Eliminar este borrador? No se puede deshacer.")) return;
    const { error } = await supabase.rpc("eliminar_borrador_cfdi", { p_id: cfdi.id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Borrador eliminado");
    navigate("/facturacion/facturas");
  };

  const guardarPartida = (c: ConceptoCfdi, otra: boolean) => {
    setConceptos((lista) => (editando === null || editando < 0 ? [...lista, c] : lista.map((x, i) => (i === editando ? c : x))));
    if (!otra) setEditando(null);
  };

  if (cargando) {
    return (
      <div className="p-6 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" /> Cargando factura…
      </div>
    );
  }

  const titulo = cfdi ? (cfdi.folio ? `Factura ${serieFolio(cfdi)}` : "Borrador de factura") : "Nueva factura";

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/facturacion/facturas" className="p-2 hover:bg-secondary rounded-lg transition-colors" aria-label="Volver a facturas">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1>{titulo}</h1>
            <p className="text-muted-foreground mt-1">
              CFDI 4.0 de ingreso
              {ordenFolio && (
                <>
                  {" · "}
                  <Link to={`/ordenes/${ordenId}`} className="text-primary hover:underline">
                    Orden {ordenFolio}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        {cfdi && (
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${ESTADO_CFDI[cfdi.estado].clase}`}>
            {ESTADO_CFDI[cfdi.estado].label}
          </span>
        )}
      </div>

      {avisoOrden && (
        <div className="flex items-start gap-3 rounded-lg border border-status-in-progress/40 bg-status-in-progress-bg p-4 text-sm text-status-in-progress-text">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p>{avisoOrden}. Revisa que no la factures dos veces.</p>
        </div>
      )}

      <fieldset disabled={!editable || guardando} className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6 min-w-0">
        {/* ------------------------------------------------ Datos del receptor */}
        <Card className="h-fit">
          <div className="px-5 py-3 border-b border-border bg-secondary/60 rounded-t-xl">
            <h2 className="text-base font-semibold">Datos del receptor</h2>
          </div>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Serie">
                <select value={serie} onChange={(e) => setSerie(e.target.value)} className={CLASE_SELECT}>
                  {series.map((s) => (
                    <option key={s.serie} value={s.serie}>
                      {s.serie}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Folio">
                <Input
                  readOnly
                  value={cfdi?.folio ?? (serieActual ? `${serieActual.ultimo_folio + 1}*` : "")}
                  title="El folio definitivo se asigna al timbrar"
                />
              </Campo>
              <Campo label="Fecha documento" requerido>
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </Campo>
              <Campo label="Estado de la factura">
                <Input readOnly value={cfdi ? ESTADO_CFDI[cfdi.estado].label : "No timbrado"} />
              </Campo>
            </div>
            {!cfdi?.folio && <p className="text-xs text-muted-foreground -mt-2">* El folio se asigna al timbrar.</p>}

            {editable && !esGlobal && (
              <Campo label="Buscar cliente">
                <Input
                  list="clientes-fiscales"
                  value={busquedaCliente}
                  onChange={(e) => elegirCliente(e.target.value)}
                  placeholder="RFC o razón social…"
                />
                <datalist id="clientes-fiscales">
                  {clientes.map((c) => (
                    <option key={c.id} value={`${c.rfc ?? "SIN RFC"} — ${c.razon_social}`} />
                  ))}
                </datalist>
              </Campo>
            )}

            <Campo label="RFC" requerido>
              <Input value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase().trim())} maxLength={13} disabled={esGlobal} />
            </Campo>
            <Campo label="Nombre o razón social" requerido>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value.toUpperCase())} disabled={esGlobal} />
            </Campo>
            <Campo label="Nombre comercial">
              <Input value={nombreComercial} onChange={(e) => setNombreComercial(e.target.value)} disabled={esGlobal} />
            </Campo>
            <Campo label="Régimen fiscal" requerido>
              <SelectSat value={regimen} onChange={setRegimen} opciones={REGIMENES_FISCALES} disabled={esGlobal} />
            </Campo>
            <Campo label="Código postal fiscal" requerido>
              <Input value={cp} onChange={(e) => setCp(e.target.value.replace(/\D/g, ""))} maxLength={5} inputMode="numeric" />
            </Campo>
            <Campo label="Email del cliente">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Campo>
            {clienteId && !esGlobal && (
              <p className="text-xs text-muted-foreground">
                Los cambios aquí solo afectan a esta factura; para corregir el cliente, edítalo en Catálogos ▸ Clientes.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------------ Pestañas */}
        <Card className="min-w-0">
          <div className="flex gap-1 border-b border-border px-4 overflow-x-auto" role="tablist">
            {(
              [
                ["conceptos", `Conceptos (${conceptos.length})`],
                ["detalles", "Detalles de factura"],
                ["relacionados", `CFDI relacionados${relacionados.length ? ` (${relacionados.length})` : ""}`],
              ] as [Pestana, string][]
            ).map(([valor, texto]) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={pestana === valor}
                onClick={() => setPestana(valor)}
                className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  pestana === valor ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {texto}
              </button>
            ))}
          </div>

          <CardContent className="p-5">
            {pestana === "conceptos" && (
              <div className="space-y-4">
                {editable && (
                  <div className="flex justify-end">
                    <Button type="button" onClick={() => setEditando(-1)}>
                      <Plus /> Agregar partida
                    </Button>
                  </div>
                )}
                {conceptos.length === 0 ? (
                  <p className="py-12 text-center text-muted-foreground">Aún no hay partidas.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cant.</TableHead>
                          <TableHead>Clave / Unidad</TableHead>
                          <TableHead>Descripción</TableHead>
                          <TableHead className="text-right">Valor unitario</TableHead>
                          <TableHead className="text-right">Descuento</TableHead>
                          <TableHead className="text-right">Importe</TableHead>
                          <TableHead className="text-right">IVA</TableHead>
                          {editable && <TableHead />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {conceptos.map((c, i) => {
                          const r = calcularConcepto(c);
                          return (
                            <TableRow key={i}>
                              <TableCell className="tabular-nums">{c.cantidad}</TableCell>
                              <TableCell className="whitespace-nowrap text-xs">
                                <span className={`block ${c.clave_prod_serv ? "" : "text-destructive"}`}>{c.clave_prod_serv || "Sin clave SAT"}</span>
                                <span className="block text-muted-foreground">
                                  {c.clave_unidad} {c.unidad}
                                </span>
                              </TableCell>
                              <TableCell className="min-w-[200px]">
                                {c.sku && <span className="block text-xs text-muted-foreground">{c.sku}</span>}
                                {c.descripcion}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{formatMoneda(c.valor_unitario, moneda)}</TableCell>
                              <TableCell className="text-right tabular-nums">{c.descuento ? formatMoneda(c.descuento, moneda) : "—"}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatMoneda(r.importe, moneda)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatMoneda(r.iva, moneda)}</TableCell>
                              {editable && (
                                <TableCell className="whitespace-nowrap">
                                  <Button type="button" variant="ghost" size="icon" onClick={() => setEditando(i)} aria-label="Editar partida">
                                    <Pencil />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setConceptos(conceptos.filter((_, j) => j !== i))}
                                    aria-label="Quitar partida"
                                  >
                                    <Trash2 className="text-destructive" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <div className="flex justify-end">
                  <DesgloseImportes importes={totales} className="w-full max-w-xs" />
                </div>
              </div>
            )}

            {pestana === "detalles" && (
              <div className="space-y-4">
                <label className="flex items-center justify-end gap-2 text-sm">
                  <input type="checkbox" checked={esGlobal} onChange={(e) => cambiarGlobal(e.target.checked)} className="w-4 h-4 accent-primary" />
                  Crear CFDI global (público en general)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Campo label="Método de pago" requerido>
                    <SelectSat value={metodoPago} onChange={cambiarMetodo} opciones={METODOS_PAGO} disabled={esGlobal} />
                  </Campo>
                  <Campo label="Forma de pago" requerido>
                    <SelectSat value={formaPago} onChange={setFormaPago} opciones={FORMAS_PAGO} disabled={metodoPago === "PPD"} />
                  </Campo>
                  <Campo label="Uso CFDI" requerido>
                    <SelectSat value={usoCfdi} onChange={setUsoCfdi} opciones={USOS_CFDI} disabled={esGlobal} />
                  </Campo>
                  <Campo label="Condiciones de pago">
                    <Input value={condiciones} onChange={(e) => setCondiciones(e.target.value)} placeholder="Crédito 30 días" />
                  </Campo>
                  <Campo label="Moneda" requerido>
                    <SelectSat value={moneda} onChange={setMoneda} opciones={MONEDAS} />
                  </Campo>
                  <Campo label="Fecha de vencimiento" requerido={metodoPago === "PPD"}>
                    <Input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} disabled={metodoPago !== "PPD"} />
                  </Campo>
                  <Campo label="Tipo de comprobante">
                    <Input readOnly value="I - Ingreso" />
                  </Campo>
                  <Campo label="Régimen fiscal emisor">
                    <Input readOnly value={describirSat(REGIMENES_FISCALES, emisor?.regimen_fiscal)} title={describirSat(REGIMENES_FISCALES, emisor?.regimen_fiscal)} />
                  </Campo>
                  <Campo label="Exportación" requerido>
                    <SelectSat value={exportacion} onChange={setExportacion} opciones={EXPORTACIONES} />
                  </Campo>
                  {esGlobal && (
                    <>
                      <Campo label="Periodicidad" requerido>
                        <SelectSat value={periodicidad} onChange={setPeriodicidad} opciones={PERIODICIDADES} />
                      </Campo>
                      <Campo label="Meses" requerido>
                        <SelectSat value={meses} onChange={setMeses} opciones={MESES_GLOBAL} />
                      </Campo>
                      <Campo label="Año" requerido>
                        <Input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} min={2022} />
                      </Campo>
                    </>
                  )}
                </div>
                <Campo label="Comentarios">
                  <textarea
                    value={comentarios}
                    onChange={(e) => setComentarios(e.target.value)}
                    maxLength={1500}
                    rows={4}
                    className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  />
                  <p className="text-xs text-muted-foreground text-right">{comentarios.length} / 1500</p>
                </Campo>
                {emisor && (
                  <p className="text-xs text-muted-foreground">
                    Emisor: {emisor.razon_social} · {emisor.rfc} · Lugar de expedición {emisor.codigo_postal}
                  </p>
                )}
              </div>
            )}

            {pestana === "relacionados" && (
              <div className="space-y-4">
                {editable && (
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr_auto] gap-3 items-end">
                    <Campo label="Tipo de relación">
                      <SelectSat value={nuevoRel.tipo_relacion} onChange={(v) => setNuevoRel({ ...nuevoRel, tipo_relacion: v })} opciones={TIPOS_RELACION} />
                    </Campo>
                    <Campo label="Folio fiscal (UUID)">
                      <Input
                        value={nuevoRel.uuid}
                        onChange={(e) => setNuevoRel({ ...nuevoRel, uuid: e.target.value.trim() })}
                        placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                        className="font-mono"
                      />
                    </Campo>
                    <Button
                      type="button"
                      onClick={() => {
                        if (!UUID_REGEX.test(nuevoRel.uuid)) {
                          toast.error("El folio fiscal debe tener el formato de un UUID");
                          return;
                        }
                        setRelacionados([...relacionados, nuevoRel]);
                        setNuevoRel({ ...nuevoRel, uuid: "" });
                      }}
                      disabled={!nuevoRel.tipo_relacion || !nuevoRel.uuid}
                    >
                      <Plus /> Agregar UUID
                    </Button>
                  </div>
                )}
                {relacionados.length === 0 ? (
                  <p className="py-12 text-center text-muted-foreground">
                    Sin CFDI relacionados. Se usan, por ejemplo, para sustituir una factura cancelada (04).
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {relacionados.map((r, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                        <div className="min-w-0">
                          <span className="block text-muted-foreground">{describirSat(TIPOS_RELACION, r.tipo_relacion)}</span>
                          <span className="block font-mono break-all">{r.uuid.toUpperCase()}</span>
                        </div>
                        {editable && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => setRelacionados(relacionados.filter((_, j) => j !== i))} aria-label="Quitar">
                            <Trash2 className="text-destructive" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </fieldset>

      {/* ------------------------------------------------ Lista para timbrar + acciones */}
      {editable && (
        <Card>
          <CardContent className="p-5 flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="text-sm min-w-0">
              {pendientes.length === 0 ? (
                <p className="flex items-center gap-2 text-status-completed-text">
                  <CheckCircle2 className="w-5 h-5" /> Lista para timbrar en cuanto se conecte el PAC.
                </p>
              ) : (
                <>
                  <p className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-5 h-5 text-status-in-progress" /> Falta para poder timbrar:
                  </p>
                  <ul className="mt-2 ml-7 list-disc text-muted-foreground space-y-0.5">
                    {pendientes.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {cfdi && (
                <Button variant="outline" onClick={eliminar} disabled={guardando}>
                  <Trash2 /> Eliminar borrador
                </Button>
              )}
              <Button variant="secondary" onClick={guardar} disabled={guardando}>
                {guardando ? <Loader2 className="animate-spin" /> : <Save />} Guardar borrador
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Button disabled>
                        <Stamp /> Guardar y timbrar
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Disponible cuando se conecte el PAC (Timbra de CONTPAQi)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardContent>
        </Card>
      )}

      {!editable && cfdi && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileCheck2 className="w-4 h-4" />
          {cfdi.estado === "borrador" ? "Solo el administrador principal puede modificar borradores." : "Factura timbrada: solo consulta."}
        </p>
      )}

      <PartidaDialog
        open={editando !== null}
        inicial={editando !== null && editando >= 0 ? conceptos[editando] : null}
        productos={productos}
        onClose={() => setEditando(null)}
        onGuardar={guardarPartida}
      />
    </div>
  );
}
