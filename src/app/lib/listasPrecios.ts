/**
 * listasPrecios.ts — Precios de mayoreo y precios especiales por cliente (sql/listas_precios.sql).
 *
 * Regla (precioSugerido):
 *  1. Si el cliente tiene precio fijo vigente para el producto, ese es el precio.
 *  2. Si no, se aplica el MAYOR descuento entre:
 *     - el % del cliente para ese producto (o, si no tiene, su % general), y
 *     - la escala de mayoreo que alcance la cantidad (las del producto si tiene; si no,
 *       la general).
 *  No se acumulan. El precio base es el de la variante (con su sobreprecio por talla) o
 *  el que se capturó a mano.
 */
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { formatMonto, redondearCentavos } from "./pagos";
import { hoyISO } from "./fechas";

export interface EscalaMayoreo {
  id: string;
  productoId: string | null;
  cantidadMin: number;
  descuentoPct: number;
}

export interface PrecioCliente {
  id: string;
  clienteId: string;
  cliente: string;
  productoId: string | null;
  producto?: string;
  descuentoPct: number | null;
  precio: number | null;
  vigenteHasta: string | null;
  notas: string | null;
}

export interface ListasPrecios {
  escalas: EscalaMayoreo[];
  preciosCliente: PrecioCliente[];
}

export const LISTAS_VACIAS: ListasPrecios = { escalas: [], preciosCliente: [] };

export async function cargarListasPrecios(): Promise<ListasPrecios> {
  const [esc, pc] = await Promise.all([
    supabase.from("escalas_mayoreo").select("id,producto_id,cantidad_min,descuento_pct").order("cantidad_min"),
    supabase
      .from("precios_cliente")
      .select("id,cliente_id,producto_id,descuento_pct,precio,vigente_hasta,notas,clientes(razon_social),productos(nombre)")
      .order("updated_at", { ascending: false }),
  ]);
  if (esc.error) throw esc.error;
  if (pc.error) throw pc.error;
  return {
    escalas: (esc.data ?? []).map((r: any) => ({
      id: r.id,
      productoId: r.producto_id,
      cantidadMin: Number(r.cantidad_min),
      descuentoPct: Number(r.descuento_pct),
    })),
    preciosCliente: (pc.data ?? []).map((r: any) => ({
      id: r.id,
      clienteId: r.cliente_id,
      cliente: r.clientes?.razon_social ?? "",
      productoId: r.producto_id,
      producto: r.productos?.nombre ?? undefined,
      descuentoPct: r.descuento_pct == null ? null : Number(r.descuento_pct),
      precio: r.precio == null ? null : Number(r.precio),
      vigenteHasta: r.vigente_hasta,
      notas: r.notas,
    })),
  };
}

/** Listas de precios para los formularios; si falla (p. ej. sin migrar) quedan vacías. */
export function useListasPrecios(activo = true): ListasPrecios {
  const [listas, setListas] = useState<ListasPrecios>(LISTAS_VACIAS);
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    cargarListasPrecios()
      .then((l) => vigente && setListas(l))
      .catch(() => vigente && setListas(LISTAS_VACIAS));
    return () => {
      vigente = false;
    };
  }, [activo]);
  return listas;
}

const normalizar = (s: string) => s.trim().toUpperCase();

/** Condición vigente hoy (sin fecha o con fecha >= hoy). */
const vigente = (p: PrecioCliente, hoy = hoyISO()) => !p.vigenteHasta || p.vigenteHasta >= hoy;

/** Escalas que aplican al producto: las suyas si tiene, si no las generales (ordenadas). */
export function escalasDe(escalas: EscalaMayoreo[], productoId?: string | null): EscalaMayoreo[] {
  const propias = productoId ? escalas.filter((e) => e.productoId === productoId) : [];
  return (propias.length > 0 ? propias : escalas.filter((e) => e.productoId === null)).sort(
    (a, b) => a.cantidadMin - b.cantidadMin
  );
}

export interface PrecioCalculado {
  /** Precio unitario resultante (igual a la base si no aplica ninguna regla). */
  precio: number;
  /** Descripción de la regla aplicada, o null si no aplica ninguna. */
  regla: string | null;
  /** Siguiente escala de mayoreo que mejora el precio (para avisar "con N piezas…"). */
  siguiente?: { cantidadMin: number; descuentoPct: number };
}

/**
 * Precio sugerido para una partida.
 * @param cliente razón social tal como se captura (se compara sin mayúsculas/espacios).
 */
export function precioSugerido(
  listas: ListasPrecios,
  { cliente, productoId, precioBase, cantidad }: { cliente?: string; productoId?: string | null; precioBase: number; cantidad: number }
): PrecioCalculado {
  const base = Number(precioBase) || 0;
  const hoy = hoyISO();
  const nombre = cliente ? normalizar(cliente) : "";
  const delCliente = nombre
    ? listas.preciosCliente.filter((p) => normalizar(p.cliente) === nombre && vigente(p, hoy))
    : [];

  // 1. Precio fijo del cliente para el producto.
  const especifico = productoId ? delCliente.find((p) => p.productoId === productoId) : undefined;
  if (especifico?.precio != null) {
    return { precio: especifico.precio, regla: "Precio especial del cliente" };
  }

  // 2. Mejor descuento entre el del cliente y el de mayoreo.
  const general = delCliente.find((p) => p.productoId === null);
  const pctCliente = especifico?.descuentoPct ?? general?.descuentoPct ?? 0;
  const escalas = escalasDe(listas.escalas, productoId);
  const escala = [...escalas].reverse().find((e) => cantidad >= e.cantidadMin);
  const pctMayoreo = escala?.descuentoPct ?? 0;
  const siguienteEscala = escalas.find((e) => e.cantidadMin > cantidad && e.descuentoPct > Math.max(pctCliente, pctMayoreo));
  const siguiente = siguienteEscala
    ? { cantidadMin: siguienteEscala.cantidadMin, descuentoPct: siguienteEscala.descuentoPct }
    : undefined;

  if (base <= 0 || (pctCliente <= 0 && pctMayoreo <= 0)) return { precio: base, regla: null, siguiente };

  const usarCliente = pctCliente >= pctMayoreo;
  const pct = usarCliente ? pctCliente : pctMayoreo;
  return {
    precio: redondearCentavos(base * (1 - pct / 100)),
    regla: usarCliente
      ? `Descuento del cliente −${pct} %`
      : `Mayoreo ${escala!.cantidadMin}+ pzs −${pct} %`,
    siguiente,
  };
}

type PartidaMayoreo = { productoId?: string | null; nombre?: string; cantidad: number };

/** Mismo producto para el mayoreo: el del catálogo o, sin él, el mismo nombre. */
const claveMayoreo = (p: PartidaMayoreo) => p.productoId || (p.nombre ?? "").trim().toLowerCase();

/**
 * Piezas que cuentan para el mayoreo de una partida: todas las del mismo producto en el
 * documento (50 camisas en tallas M, L y XL son 50 piezas, no 3 partidas sueltas).
 */
export function piezasMayoreo(p: PartidaMayoreo, partidas: PartidaMayoreo[]): number {
  const clave = claveMayoreo(p);
  if (!clave) return p.cantidad || 0;
  return partidas.reduce((s, x) => (claveMayoreo(x) === clave ? s + (x.cantidad || 0) : s), 0);
}

/** "50+ pzs −5 %, 100+ pzs −8 %". */
export function textoEscalas(escalas: EscalaMayoreo[]): string {
  return escalas.map((e) => `${e.cantidadMin}+ pzs −${e.descuentoPct} %`).join(", ");
}

/** "−10 %" o "$250 por pieza". */
export function textoCondicion(p: Pick<PrecioCliente, "descuentoPct" | "precio">): string {
  return p.precio != null ? `${formatMonto(p.precio)} por pieza` : `−${p.descuentoPct} %`;
}

// ---------------------------------------------------------------- edición (admin primario)

export async function guardarEscalas(productoId: string | null, escalas: { cantidadMin: number; descuentoPct: number }[]) {
  const { error } = await supabase.rpc("guardar_escalas_mayoreo", {
    p_producto: productoId,
    p_escalas: escalas.map((e) => ({ cantidad_min: e.cantidadMin, descuento_pct: e.descuentoPct })),
  });
  if (error) throw error;
}

export interface PrecioClienteCaptura {
  clienteId: string;
  productoId: string | null;
  descuentoPct: number | null;
  precio: number | null;
  vigenteHasta: string | null;
  notas: string | null;
}

export async function guardarPrecioCliente(id: string | null, datos: PrecioClienteCaptura) {
  const fila = {
    cliente_id: datos.clienteId,
    producto_id: datos.productoId,
    descuento_pct: datos.descuentoPct,
    precio: datos.precio,
    vigente_hasta: datos.vigenteHasta || null,
    notas: datos.notas?.trim() || null,
  };
  const { error } = id
    ? await supabase.from("precios_cliente").update(fila).eq("id", id)
    : await supabase.from("precios_cliente").insert(fila);
  if (error) {
    if (error.code === "23505") throw new Error("Ese cliente ya tiene una condición para ese producto (edítala).");
    throw error;
  }
}

export async function eliminarPrecioCliente(id: string) {
  const { error } = await supabase.from("precios_cliente").delete().eq("id", id);
  if (error) throw error;
}
