/**
 * seguimientoPublico.ts — Enlace para que el cliente vea el avance de su orden sin
 * llamar (sql/seguimiento_publico.sql).
 *
 *  - enlaceSeguimiento / obtenerTokenSeguimiento / regenerarTokenSeguimiento: del lado
 *    del vendedor (copiar o cambiar el enlace de una orden).
 *  - cargarSeguimiento: lo que ve el cliente en /pedido/:token (sin sesión).
 *  - ordenDeSeguimiento: arma una Orden mínima para calcular la etapa con las mismas
 *    reglas que el resto del sistema (lib/avanceProduccion.ts).
 */
import { supabase } from "./supabase";
import type { Orden, ProductoOrden, Taller, TallerEstado } from "../data/mockData";

/** URL pública de seguimiento de la orden. */
export const enlaceSeguimiento = (token: string) => `${window.location.origin}/pedido/${token}`;

export async function obtenerTokenSeguimiento(ordenId: string): Promise<string | null> {
  const { data, error } = await supabase.from("ordenes").select("token_seguimiento").eq("id", ordenId).maybeSingle();
  if (error) throw error;
  return (data as { token_seguimiento?: string } | null)?.token_seguimiento ?? null;
}

/** Cambia el enlace (el anterior deja de funcionar). */
export async function regenerarTokenSeguimiento(ordenId: string): Promise<string> {
  const { data, error } = await supabase.rpc("regenerar_token_seguimiento", { p_orden: ordenId });
  if (error) throw error;
  return data as string;
}

export interface TallerSeguimiento {
  taller: Taller;
  estado: TallerEstado;
  inicio?: string;
  fin?: string;
}

export interface ProductoSeguimiento {
  descripcion: string;
  talla?: string;
  color?: string;
  cantidad: number;
  talleres: TallerSeguimiento[];
}

export interface Seguimiento {
  folio: string;
  cliente?: string;
  vendedor?: string;
  estado?: string;
  fechaCreacion: string;
  fechaEntrega?: string;
  total: number;
  pagado: number;
  saldo: number;
  empresa?: string;
  productos: ProductoSeguimiento[];
  consultado: string;
}

/** null = el enlace no existe (o se cambió). */
export async function cargarSeguimiento(token: string): Promise<Seguimiento | null> {
  const { data, error } = await supabase.rpc("seguimiento_orden", { p_token: token });
  if (error) throw error;
  if (!data) return null;
  const d = data as any;
  return {
    folio: d.folio,
    cliente: d.cliente ?? undefined,
    vendedor: d.vendedor ?? undefined,
    estado: d.estado ?? undefined,
    fechaCreacion: d.fecha_creacion,
    fechaEntrega: d.fecha_entrega ?? undefined,
    total: Number(d.total ?? 0),
    pagado: Number(d.pagado ?? 0),
    saldo: Number(d.saldo ?? 0),
    empresa: d.empresa ?? undefined,
    consultado: d.consultado,
    productos: ((d.productos ?? []) as any[]).map((p) => ({
      descripcion: p.descripcion,
      talla: p.talla ?? undefined,
      color: p.color ?? undefined,
      cantidad: Number(p.cantidad ?? 0),
      talleres: ((p.talleres ?? []) as any[]).map((t) => ({
        taller: t.taller,
        estado: t.estado,
        inicio: t.inicio ?? undefined,
        fin: t.fin ?? undefined,
      })),
    })),
  };
}

/** Orden mínima para avanceOrden() (solo los campos que usa). */
export function ordenDeSeguimiento(s: Seguimiento): Orden {
  const productos = s.productos.map(
    (p, i) =>
      ({
        id: String(i),
        nombre: p.descripcion,
        cantidad: p.cantidad,
        talla: p.talla ?? "",
        color: p.color ?? "",
        talleres: p.talleres.map((t) => t.taller),
        progreso: Object.fromEntries(p.talleres.map((t) => [t.taller, t.estado])),
        fechasTaller: Object.fromEntries(p.talleres.map((t) => [t.taller, { inicio: t.inicio, fin: t.fin }])),
      }) as unknown as ProductoOrden
  );
  return {
    numero: s.folio,
    estadoNombre: s.estado,
    fechaCreacion: s.fechaCreacion,
    fechaEntrega: s.fechaEntrega ?? "",
    productos,
  } as unknown as Orden;
}
