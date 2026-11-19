/**
 * autorizacionesVenta.ts — Pedir autorización en vez de quedar bloqueado
 * (sql/autorizaciones_venta.sql).
 *
 * Cuando el tope de descuento o el crédito del cliente impiden guardar una orden, el
 * vendedor manda la captura al administrador primario. Al aprobarla, el vendedor crea
 * la orden (desde Autorizaciones o volviendo a capturarla): la BD la deja pasar si el
 * descuento y el saldo no rebasan lo autorizado, y la liga a la autorización.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { hoyISO } from "./fechas";
import type { CapturaInicial } from "../components/NuevaOrdenMultiProducto";

export type EstadoAutorizacion = "pendiente" | "aprobada" | "rechazada" | "cancelada";

/** Estado para mostrar (una aprobada puede ya estar usada o vencida). */
export type EstadoVisible = EstadoAutorizacion | "usada" | "vencida";

export const ESTADO_AUTORIZACION: Record<EstadoVisible, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "bg-status-pending-bg text-status-pending-text" },
  aprobada: { texto: "Aprobada", clase: "bg-status-completed-bg text-status-completed-text" },
  usada: { texto: "Orden creada", clase: "bg-secondary text-foreground" },
  vencida: { texto: "Vencida", clase: "bg-secondary text-muted-foreground" },
  rechazada: { texto: "Rechazada", clase: "bg-red-500/10 text-red-700 dark:text-red-300" },
  cancelada: { texto: "Retirada", clase: "bg-secondary text-muted-foreground" },
};

export interface AutorizacionVenta {
  id: string;
  solicitanteId: string;
  solicitante?: string;
  clienteNombre: string;
  /** Descuento autorizado / pedido (pesos, antes de IVA). */
  descuento?: number;
  /** Saldo a crédito autorizado / pedido. */
  saldo?: number;
  subtotal?: number;
  total?: number;
  motivoBloqueo?: string;
  justificacion: string;
  captura: CapturaInicial;
  estado: EstadoAutorizacion;
  resueltaPor?: string;
  resueltaAt?: string;
  comentario?: string;
  vence?: string;
  ordenId?: string;
  ordenFolio?: string;
  createdAt: string;
}

export function estadoVisible(a: Pick<AutorizacionVenta, "estado" | "ordenId" | "vence">): EstadoVisible {
  if (a.estado !== "aprobada") return a.estado;
  if (a.ordenId) return "usada";
  if (a.vence && a.vence < hoyISO()) return "vencida";
  return "aprobada";
}

const num = (v: unknown) => (v == null ? undefined : Number(v));

const mapAutorizacion = (r: any): AutorizacionVenta => ({
  id: r.id,
  solicitanteId: r.solicitante_id,
  solicitante: r.solicitante?.nombre ?? undefined,
  clienteNombre: r.cliente_nombre,
  descuento: num(r.descuento),
  saldo: num(r.saldo),
  subtotal: num(r.subtotal),
  total: num(r.total),
  motivoBloqueo: r.motivo_bloqueo ?? undefined,
  justificacion: r.justificacion,
  captura: r.captura,
  estado: r.estado,
  resueltaPor: r.resolutor?.nombre ?? undefined,
  resueltaAt: r.resuelta_at ?? undefined,
  comentario: r.comentario ?? undefined,
  vence: r.vence ?? undefined,
  ordenId: r.orden_id ?? undefined,
  ordenFolio: r.ordenes?.folio ?? undefined,
  createdAt: r.created_at,
});

const COLUMNAS =
  "id,solicitante_id,cliente_nombre,descuento,saldo,subtotal,total,motivo_bloqueo,justificacion,captura,estado," +
  "resuelta_at,comentario,vence,orden_id,created_at," +
  "solicitante:usuarios!autorizaciones_venta_solicitante_id_fkey(nombre)," +
  "resolutor:usuarios!autorizaciones_venta_resuelta_por_fkey(nombre)," +
  "ordenes(folio)";

/** Admins: todas; los demás: las suyas (RLS). Las más recientes primero. */
export async function cargarAutorizaciones(): Promise<AutorizacionVenta[]> {
  const { data, error } = await supabase
    .from("autorizaciones_venta")
    .select(COLUMNAS)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []).map(mapAutorizacion);
}

export async function solicitarAutorizacion(p: {
  cliente: string;
  descuento: number | null;
  saldo: number | null;
  subtotal: number;
  total: number;
  motivo: string;
  justificacion: string;
  captura: CapturaInicial;
}): Promise<string> {
  const { data, error } = await supabase.rpc("solicitar_autorizacion_venta", {
    p_cliente: p.cliente,
    p_descuento: p.descuento,
    p_saldo: p.saldo,
    p_subtotal: p.subtotal,
    p_total: p.total,
    p_motivo: p.motivo,
    p_justificacion: p.justificacion,
    p_captura: p.captura,
  });
  if (error) throw error;
  return data as string;
}

export async function resolverAutorizacion(
  id: string,
  aprobar: boolean,
  opciones: { comentario?: string; descuento?: number; saldo?: number; diasVigencia?: number } = {}
) {
  const { error } = await supabase.rpc("resolver_autorizacion_venta", {
    p_id: id,
    p_aprobar: aprobar,
    p_comentario: opciones.comentario?.trim() || null,
    p_descuento: opciones.descuento ?? null,
    p_saldo: opciones.saldo ?? null,
    p_dias_vigencia: opciones.diasVigencia ?? 7,
  });
  if (error) throw error;
}

export async function cancelarAutorizacion(id: string) {
  const { error } = await supabase.rpc("cancelar_autorizacion_venta", { p_id: id });
  if (error) throw error;
}

const mismoCliente = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Autorizaciones aprobadas, vigentes y sin usar del usuario para el cliente capturado
 * (para no bloquear el formulario si ya lo autorizaron).
 */
export function useAutorizacionesAprobadas(usuarioId: string | undefined, cliente: string, activo: boolean) {
  const [lista, setLista] = useState<AutorizacionVenta[]>([]);
  const nombre = cliente.trim();

  const cargar = useCallback(async () => {
    if (!activo || !usuarioId || !nombre) {
      setLista([]);
      return;
    }
    const { data, error } = await supabase
      .from("autorizaciones_venta")
      .select(COLUMNAS)
      .eq("solicitante_id", usuarioId)
      .eq("estado", "aprobada")
      .is("orden_id", null)
      .gte("vence", hoyISO());
    // Sin la tabla (script sin aplicar) simplemente no hay autorizaciones.
    setLista(error ? [] : (data ?? []).map(mapAutorizacion).filter((a) => mismoCliente(a.clienteNombre, nombre)));
  }, [activo, usuarioId, nombre]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 400);
    return () => clearTimeout(t);
  }, [cargar]);

  return lista;
}

/**
 * La primera autorización que cubre lo que bloquea: el descuento (si lo bloquea el tope)
 * y el saldo (si lo bloquea el crédito). Misma regla que private.autorizacion_cubre.
 */
export function autorizacionQueCubre(
  aprobadas: AutorizacionVenta[],
  necesita: { descuento: number | null; saldo: number | null }
): AutorizacionVenta | undefined {
  if (necesita.descuento == null && necesita.saldo == null) return undefined;
  return aprobadas.find(
    (a) =>
      (necesita.descuento == null || (a.descuento != null && a.descuento >= necesita.descuento - 0.005)) &&
      (necesita.saldo == null || (a.saldo != null && a.saldo >= necesita.saldo - 0.005))
  );
}
