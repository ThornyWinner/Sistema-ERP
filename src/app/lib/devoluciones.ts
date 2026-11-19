/**
 * devoluciones.ts — Devoluciones y cambios de talla (sql/devoluciones.sql).
 *
 *  - cargarDevoluciones: las de una orden o todas las visibles (admin secundario y
 *    quien puede editar la orden).
 *  - registrarDevolucion: llama a registrar_devolucion (reingreso al inventario, piezas a
 *    cambio, nuevo total, reembolso, historial y avisos en una sola transacción).
 *  - partidaDevolvible / estimarDevolucion: qué piezas se pueden devolver y cómo queda
 *    el total antes de guardar (la BD hace el cálculo definitivo).
 */
import { supabase } from "./supabase";
import { calcularImportes } from "./impuestos";
import { redondearCentavos, totalPagado } from "./pagos";
import type { Orden, ProductoOrden } from "../data/mockData";

export type MotivoDevolucion = "talla" | "defecto" | "error_pedido" | "no_le_gusto" | "otro";

export const MOTIVO_DEVOLUCION: Record<MotivoDevolucion, string> = {
  talla: "Talla / medida",
  defecto: "Defecto de fabricación",
  error_pedido: "Error en el pedido",
  no_le_gusto: "No le gustó",
  otro: "Otro",
};

/** Métodos de reembolso (nombres de la tabla metodos_pago). */
export const METODOS_REEMBOLSO = ["Efectivo", "Transferencia", "Tarjeta Crédito", "Cheque"] as const;

export interface PartidaDevolucion {
  id: string;
  ordenDetalleId: string;
  sentido: "devuelve" | "entrega";
  cantidad: number;
  precioUnitario: number;
  /** devuelve: variante a la que reingresó (null = no regresó); entrega: la que salió. */
  varianteId?: string;
  descripcion?: string;
}

export interface Devolucion {
  id: string;
  folio: string;
  ordenId: string;
  ordenFolio?: string;
  cliente?: string;
  tipo: "devolucion" | "cambio";
  motivo: MotivoDevolucion;
  descripcion?: string;
  fecha: string;
  totalAnterior: number;
  totalNuevo: number;
  reembolso: number;
  metodoReembolso?: string;
  registradaPor?: string;
  partidas: PartidaDevolucion[];
}

const SELECT =
  "id,folio,orden_id,tipo,motivo,descripcion,fecha,total_anterior,total_nuevo,reembolso,metodo_reembolso," +
  "usuarios(nombre),ordenes(folio,clientes(razon_social))," +
  "devolucion_partidas(id,orden_detalle_id,sentido,cantidad,precio_unitario,variante_id,descripcion)";

export async function cargarDevoluciones(ordenId?: string): Promise<Devolucion[]> {
  let q = supabase.from("devoluciones").select(SELECT).order("created_at", { ascending: false });
  if (ordenId) q = q.eq("orden_id", ordenId);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as any[]).map((d) => ({
    id: d.id,
    folio: d.folio,
    ordenId: d.orden_id,
    ordenFolio: d.ordenes?.folio ?? undefined,
    cliente: d.ordenes?.clientes?.razon_social ?? undefined,
    tipo: d.tipo,
    motivo: d.motivo,
    descripcion: d.descripcion ?? undefined,
    fecha: d.fecha,
    totalAnterior: Number(d.total_anterior),
    totalNuevo: Number(d.total_nuevo),
    reembolso: Number(d.reembolso),
    metodoReembolso: d.metodo_reembolso ?? undefined,
    registradaPor: d.usuarios?.nombre ?? undefined,
    partidas: (d.devolucion_partidas ?? []).map((p: any) => ({
      id: p.id,
      ordenDetalleId: p.orden_detalle_id,
      sentido: p.sentido,
      cantidad: p.cantidad,
      precioUnitario: Number(p.precio_unitario),
      varianteId: p.variante_id ?? undefined,
      descripcion: p.descripcion ?? undefined,
    })),
  }));
}

export interface PiezaDevuelta {
  detalleId: string;
  cantidad: number;
  /** Variante a la que regresa al inventario; null = no regresa (merma / a la medida). */
  reingresarVarianteId: string | null;
}

export interface PiezaACambio {
  varianteId: string;
  cantidad: number;
  precioUnitario: number;
}

export interface DatosDevolucion {
  motivo: MotivoDevolucion;
  descripcion: string;
  devueltas: PiezaDevuelta[];
  nuevas: PiezaACambio[];
  reembolsar: boolean;
  metodoReembolso: string;
}

export interface ResultadoDevolucion {
  id: string;
  folio: string;
  total_anterior: number;
  total_nuevo: number;
  reembolso: number;
  saldo_a_favor: number;
  por_cobrar: number;
  factura: string | null;
}

export async function registrarDevolucion(ordenId: string, d: DatosDevolucion): Promise<ResultadoDevolucion> {
  const { data, error } = await supabase.rpc("registrar_devolucion", {
    p_orden: ordenId,
    p_datos: {
      motivo: d.motivo,
      descripcion: d.descripcion.trim() || null,
      devueltas: d.devueltas
        .filter((x) => x.cantidad > 0)
        .map((x) => ({ detalle_id: x.detalleId, cantidad: x.cantidad, reingresar_variante_id: x.reingresarVarianteId })),
      nuevas: d.nuevas
        .filter((x) => x.cantidad > 0)
        .map((x) => ({ variante_id: x.varianteId, cantidad: x.cantidad, precio_unitario: x.precioUnitario })),
      reembolsar: d.reembolsar,
      metodo_reembolso: d.metodoReembolso,
    },
  });
  if (error) throw error;
  return data as ResultadoDevolucion;
}

/** Piezas terminadas (sin producción pendiente) que todavía se pueden devolver. */
export function partidaDevolvible(p: ProductoOrden): boolean {
  return p.cantidad > 0 && p.talleres.every((t) => p.progreso[t] === "completed");
}

/** Cómo quedaría la orden (estimado; la BD hace el cálculo definitivo). */
export function estimarDevolucion(orden: Orden, devueltas: PiezaDevuelta[], nuevas: PiezaACambio[]) {
  const menos = new Map(devueltas.map((d) => [d.detalleId, d.cantidad]));
  const lineas = [
    ...orden.productos.map((p) => ({
      cantidad: Math.max(p.cantidad - (menos.get(p.id) ?? 0), 0),
      precioUnitario: p.precioUnitario,
    })),
    ...nuevas.map((n) => ({ cantidad: n.cantidad, precioUnitario: n.precioUnitario })),
  ];
  const nuevo = calcularImportes(lineas, orden.descuento ?? 0).total;
  const pagado = totalPagado(orden);
  return {
    totalActual: orden.total,
    totalNuevo: nuevo,
    pagado,
    aFavor: redondearCentavos(Math.max(pagado - nuevo, 0)),
    porCobrar: redondearCentavos(Math.max(nuevo - pagado, 0)),
  };
}
