/**
 * solicitudesFactura.ts — El vendedor pide la factura desde la orden
 * (sql/solicitudes_factura.sql); el admin primario la emite con los datos ya cargados.
 *
 * Estados: pendiente → en_proceso (hay un borrador de factura ligado a la orden) →
 * emitida (factura vigente o marcada como emitida fuera del sistema); también
 * rechazada (falta o está mal un dato) o cancelada (ya no se necesita).
 */
import { supabase } from "./supabase";
import type { Orden } from "../data/mockData";
import { saldoPendiente } from "./pagos";

export type EstadoSolicitud = "pendiente" | "en_proceso" | "emitida" | "rechazada" | "cancelada";

export const ESTADO_SOLICITUD: Record<EstadoSolicitud, { texto: string; clase: string }> = {
  pendiente: { texto: "Factura solicitada", clase: "bg-status-pending-bg text-status-pending-text" },
  en_proceso: { texto: "En preparación", clase: "bg-status-in-progress-bg text-status-in-progress-text" },
  emitida: { texto: "Facturada", clase: "bg-status-completed-bg text-status-completed-text" },
  rechazada: { texto: "Rechazada", clase: "bg-status-pending-bg text-status-pending-text" },
  cancelada: { texto: "Cancelada", clase: "bg-secondary text-muted-foreground" },
};

export const solicitudAbierta = (s: Pick<SolicitudFactura, "estado">) => s.estado === "pendiente" || s.estado === "en_proceso";

export interface SolicitudFactura {
  id: string;
  ordenId: string;
  ordenFolio?: string;
  ordenTotal?: number;
  clienteId?: string;
  estado: EstadoSolicitud;
  rfc: string;
  razonSocial: string;
  regimen: string;
  cp: string;
  email?: string;
  usoCfdi: string;
  metodoPago: "PUE" | "PPD";
  formaPago: string;
  notas?: string;
  solicitadaPor?: string;
  solicitadaPorId?: string;
  solicitadaAt: string;
  atendidaPor?: string;
  atendidaAt?: string;
  respuesta?: string;
  cfdiId?: string;
  cfdiFolio?: string;
  cfdiUuid?: string;
}

const SELECT =
  "id,orden_id,cliente_id,estado,receptor_rfc,receptor_nombre,receptor_regimen,receptor_cp,receptor_email," +
  "uso_cfdi,metodo_pago,forma_pago,notas,solicitada_por,solicitada_at,atendida_at,respuesta,cfdi_id,cfdi_folio,cfdi_uuid," +
  "ordenes(folio,total)," +
  "solicitante:usuarios!solicitudes_factura_solicitada_por_fkey(nombre)," +
  "atiende:usuarios!solicitudes_factura_atendida_por_fkey(nombre)";

function desdeFila(r: any): SolicitudFactura {
  return {
    id: r.id,
    ordenId: r.orden_id,
    ordenFolio: r.ordenes?.folio ?? undefined,
    ordenTotal: r.ordenes?.total != null ? Number(r.ordenes.total) : undefined,
    clienteId: r.cliente_id ?? undefined,
    estado: r.estado,
    rfc: r.receptor_rfc,
    razonSocial: r.receptor_nombre,
    regimen: r.receptor_regimen,
    cp: r.receptor_cp,
    email: r.receptor_email ?? undefined,
    usoCfdi: r.uso_cfdi,
    metodoPago: r.metodo_pago,
    formaPago: r.forma_pago,
    notas: r.notas ?? undefined,
    solicitadaPor: r.solicitante?.nombre ?? undefined,
    solicitadaPorId: r.solicitada_por ?? undefined,
    solicitadaAt: r.solicitada_at,
    atendidaPor: r.atiende?.nombre ?? undefined,
    atendidaAt: r.atendida_at ?? undefined,
    respuesta: r.respuesta ?? undefined,
    cfdiId: r.cfdi_id ?? undefined,
    cfdiFolio: r.cfdi_folio ?? undefined,
    cfdiUuid: r.cfdi_uuid ?? undefined,
  };
}

/** Solicitudes de una orden (la más reciente primero) o todas las visibles. */
export async function cargarSolicitudes(ordenId?: string): Promise<SolicitudFactura[]> {
  let q = supabase.from("solicitudes_factura").select(SELECT).order("solicitada_at", { ascending: false });
  if (ordenId) q = q.eq("orden_id", ordenId);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as any[]).map(desdeFila);
}

/** Solicitud abierta de una orden, si la hay (para prellenar la factura). */
export async function solicitudAbiertaDeOrden(ordenId: string): Promise<SolicitudFactura | null> {
  const { data, error } = await supabase
    .from("solicitudes_factura")
    .select(SELECT)
    .eq("orden_id", ordenId)
    .in("estado", ["pendiente", "en_proceso"])
    .maybeSingle();
  if (error) return null;
  return data ? desdeFila(data) : null;
}

export interface DatosSolicitud {
  rfc: string;
  razonSocial: string;
  regimen: string;
  cp: string;
  email: string;
  usoCfdi: string;
  metodoPago: "PUE" | "PPD";
  formaPago: string;
  notas: string;
}

export async function solicitarFactura(ordenId: string, d: DatosSolicitud): Promise<string> {
  const { data, error } = await supabase.rpc("solicitar_factura", {
    p_orden: ordenId,
    p_datos: {
      rfc: d.rfc,
      razon_social: d.razonSocial,
      regimen_fiscal: d.regimen,
      codigo_postal: d.cp,
      email: d.email,
      uso_cfdi: d.usoCfdi,
      metodo_pago: d.metodoPago,
      forma_pago: d.formaPago,
      notas: d.notas,
    },
  });
  if (error) throw error;
  return data as string;
}

export async function cancelarSolicitud(id: string) {
  const { error } = await supabase.rpc("cancelar_solicitud_factura", { p_id: id });
  if (error) throw error;
}

export async function atenderSolicitud(id: string, accion: "emitida" | "rechazada", respuesta: string) {
  const { error } = await supabase.rpc("atender_solicitud_factura", { p_id: id, p_accion: accion, p_respuesta: respuesta });
  if (error) throw error;
}

/** Datos fiscales guardados del cliente para prellenar la solicitud. */
export async function datosFiscalesCliente(clienteId: string): Promise<Partial<DatosSolicitud>> {
  const { data } = await supabase
    .from("clientes")
    .select("razon_social,rfc,regimen_fiscal,codigo_postal,email,uso_cfdi,metodo_pago_cfdi,forma_pago_cfdi")
    .eq("id", clienteId)
    .maybeSingle();
  if (!data) return {};
  const c = data as any;
  return {
    rfc: c.rfc ?? "",
    razonSocial: c.razon_social ?? "",
    regimen: c.regimen_fiscal ?? "",
    cp: c.codigo_postal ?? "",
    email: c.email ?? "",
    usoCfdi: c.uso_cfdi ?? "",
    metodoPago: c.metodo_pago_cfdi ?? undefined,
    formaPago: c.forma_pago_cfdi ?? "",
  };
}

/** Forma de pago SAT según cómo pagó la orden (si ya está liquidada). */
const FORMA_POR_METODO: Record<Orden["metodoPago"], string> = {
  efectivo: "01",
  cheque: "02",
  transferencia: "03",
  tarjeta: "04",
  credito: "99",
};

/**
 * Método y forma sugeridos: pagada → PUE con la forma en que pagó; con saldo → PPD y
 * forma 99 (se emiten complementos de pago con cada abono).
 */
export function pagoSugerido(orden: Orden): { metodoPago: "PUE" | "PPD"; formaPago: string } {
  if (saldoPendiente(orden) > 0) return { metodoPago: "PPD", formaPago: "99" };
  const ultimo = [...orden.pagos].reverse().find((p) => p.monto > 0)?.metodo ?? orden.metodoPago;
  return { metodoPago: "PUE", formaPago: FORMA_POR_METODO[ultimo] ?? "03" };
}
