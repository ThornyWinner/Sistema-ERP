/**
 * metas.ts — Metas mensuales y comisiones de vendedores (sql/metas_comisiones.sql).
 *
 *  - La meta es de VENTA: órdenes registradas en el mes, sin IVA (no cuentan canceladas).
 *  - La comisión es un % de lo COBRADO en el mes (pagos con fecha del mes), sin IVA.
 *  - El % es el global (politicas_venta.comision_pct) o uno propio del vendedor en ese mes.
 * La BD calcula todo en public.desempeno_vendedores; los admins ven a todos y el
 * vendedor solo su fila. Solo el administrador primario fija metas y porcentajes.
 */
import { supabase } from "./supabase";
import { fechaISO } from "./fechas";

export const COMISION_PCT_DEFECTO = 3;

export interface DesempenoVendedor {
  vendedorId: string;
  nombre: string;
  rol: string;
  /** null = sin meta asignada en el mes. */
  meta: number | null;
  comisionPct: number;
  /** true si el % es propio del vendedor (no el global). */
  comisionPropia: boolean;
  ordenes: number;
  /** Venta del mes sin IVA. */
  vendido: number;
  /** Cobrado en el mes sin IVA (base de la comisión). */
  cobrado: number;
  comision: number;
}

/** Día 1 del mes de la fecha, "AAAA-MM-01". */
export function inicioMes(d: Date = new Date()): string {
  return fechaISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Suma (o resta) meses a un periodo "AAAA-MM-01". */
export function moverMes(periodo: string, meses: number): string {
  const [a, m] = periodo.split("-").map(Number);
  return inicioMes(new Date(a, m - 1 + meses, 1));
}

/** "noviembre de 2026". */
export function nombreMes(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
}

/** Avance de la meta en % (null sin meta). */
export function avanceMeta(d: Pick<DesempenoVendedor, "meta" | "vendido">): number | null {
  if (!d.meta || d.meta <= 0) return null;
  return Math.round((d.vendido / d.meta) * 1000) / 10;
}

/**
 * Lo que debería llevar vendido hoy para ir al ritmo de la meta (proporcional a los
 * días transcurridos del mes). Solo tiene sentido en el mes actual.
 */
export function ritmoEsperado(periodo: string, meta: number, hoy: Date = new Date()): number | null {
  if (periodo !== inicioMes(hoy)) return null;
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  return Math.round((meta * hoy.getDate()) / diasMes);
}

/** Días que faltan para terminar el mes (incluye hoy). */
export function diasRestantesMes(hoy: Date = new Date()): number {
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  return diasMes - hoy.getDate() + 1;
}

/** Desempeño del mes: todos los vendedores (admins) o solo el usuario (vendedor). */
export async function obtenerDesempeno(periodo: string): Promise<DesempenoVendedor[]> {
  const { data, error } = await supabase.rpc("desempeno_vendedores", { p_periodo: periodo });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    vendedorId: r.vendedor_id,
    nombre: r.nombre,
    rol: r.rol,
    meta: r.meta == null ? null : Number(r.meta),
    comisionPct: Number(r.comision_pct ?? 0),
    comisionPropia: !!r.comision_propia,
    ordenes: Number(r.ordenes ?? 0),
    vendido: Number(r.vendido ?? 0),
    cobrado: Number(r.cobrado ?? 0),
    comision: Number(r.comision ?? 0),
  }));
}

/**
 * Fija la meta y el % propio de un vendedor en el mes (comisionPct null = usar el global).
 * Si meta y % quedan vacíos se borra el registro del mes.
 */
export async function guardarMeta(vendedorId: string, periodo: string, meta: number | null, comisionPct: number | null) {
  if (meta == null && comisionPct == null) {
    const { error } = await supabase.from("metas_vendedor").delete().eq("vendedor_id", vendedorId).eq("periodo", periodo);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("metas_vendedor")
    .upsert({ vendedor_id: vendedorId, periodo, meta: meta ?? 0, comision_pct: comisionPct }, { onConflict: "vendedor_id,periodo" });
  if (error) throw error;
}

/**
 * Copia las metas y % del mes anterior a los vendedores que aún no tienen meta en el mes.
 * Devuelve cuántas se copiaron.
 */
export async function copiarMetasMesAnterior(periodo: string): Promise<number> {
  const anterior = moverMes(periodo, -1);
  const [{ data: previas, error: e1 }, { data: actuales, error: e2 }] = await Promise.all([
    supabase.from("metas_vendedor").select("vendedor_id,meta,comision_pct").eq("periodo", anterior),
    supabase.from("metas_vendedor").select("vendedor_id").eq("periodo", periodo),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const yaTienen = new Set((actuales ?? []).map((r) => r.vendedor_id));
  const nuevas = (previas ?? [])
    .filter((r) => !yaTienen.has(r.vendedor_id))
    .map((r) => ({ vendedor_id: r.vendedor_id, periodo, meta: r.meta, comision_pct: r.comision_pct }));
  if (nuevas.length === 0) return 0;
  const { error } = await supabase.from("metas_vendedor").insert(nuevas);
  if (error) throw error;
  return nuevas.length;
}

/** % de comisión global. */
export async function obtenerComisionGlobal(): Promise<number> {
  const { data } = await supabase.from("politicas_venta").select("comision_pct").maybeSingle();
  return data?.comision_pct != null ? Number(data.comision_pct) : COMISION_PCT_DEFECTO;
}

/** Cambia el % de comisión global (solo el administrador primario; la RLS lo verifica). */
export async function guardarComisionGlobal(pct: number, usuarioId?: string) {
  const { error } = await supabase
    .from("politicas_venta")
    .update({ comision_pct: pct, updated_at: new Date().toISOString(), updated_by: usuarioId ?? null })
    .eq("id", true);
  if (error) throw error;
}
