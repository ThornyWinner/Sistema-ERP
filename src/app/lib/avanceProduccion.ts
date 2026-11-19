/**
 * avanceProduccion.ts — En qué taller va cada orden (para el vendedor).
 *
 * A partir del avance por taller de cada producto (produccion_taller) calcula:
 *  - por producto: el taller en el que está (el primero de su flujo sin terminar), si
 *    ya lo están trabajando o espera turno, y desde cuándo;
 *  - por orden: la etapa del producto MÁS ATRASADO (es lo que detiene la entrega),
 *    el porcentaje de pasos terminados, el último movimiento y si va atrasada.
 *
 * Es la misma regla con la que la BD actualiza el estado de la orden
 * (sql/avance_produccion.sql), así que pantalla y estado coinciden.
 */
import type { Orden, ProductoOrden, Taller, TallerEstado } from "../data/mockData";
import { diasRestantes } from "./fechas";

export const FLUJO_TALLERES: Taller[] = ["diseno", "sublimacion", "corte", "costura", "bordado"];

export const NOMBRE_TALLER: Record<Taller, string> = {
  diseno: "Diseño",
  sublimacion: "Sublimación",
  corte: "Corte",
  costura: "Costura",
  bordado: "Bordado",
};

/** Etapa de una orden: sin iniciar, en un taller, lista, o ya cerrada. */
export type EtapaOrden = "sin_iniciar" | Taller | "lista" | "entregada" | "cancelada";

export const ETAPAS_TABLERO: { clave: Exclude<EtapaOrden, "entregada" | "cancelada">; titulo: string }[] = [
  { clave: "sin_iniciar", titulo: "Sin iniciar" },
  ...FLUJO_TALLERES.map((t) => ({ clave: t, titulo: NOMBRE_TALLER[t] })),
  { clave: "lista", titulo: "Lista para entregar" },
];

export interface AvanceProducto {
  producto: ProductoOrden;
  /** Taller en el que está; null = terminó todos (o no pasa por talleres). */
  taller: Taller | null;
  /** Estado en ese taller (pendiente = espera turno). */
  estado: TallerEstado | null;
  /** Desde cuándo está ahí: inicio del taller, o fin del anterior si espera turno. */
  desde?: string;
  hechos: number;
  total: number;
}

export interface AvanceOrden {
  orden: Orden;
  etapa: EtapaOrden;
  /** En la etapa (taller) actual alguien ya está trabajando. */
  trabajando: boolean;
  productos: AvanceProducto[];
  hechos: number;
  total: number;
  porcentaje: number;
  /** La orden no pasa por talleres (venta directa, comercialización). */
  sinTalleres: boolean;
  /** Fecha y hora del último movimiento de producción. */
  ultimoMovimiento?: string;
  /** Desde cuándo está en la etapa actual. */
  desde?: string;
  /** Días para la fecha de entrega (negativo = vencida; null = sin fecha). */
  diasEntrega: number | null;
  /** Fecha de entrega pasada y todavía no se entrega. */
  atrasada: boolean;
}

const max = (a?: string, b?: string) => (!a ? b : !b ? a : a > b ? a : b);
const min = (a?: string, b?: string) => (!a ? b : !b ? a : a < b ? a : b);

export function avanceProducto(p: ProductoOrden): AvanceProducto {
  const flujo = FLUJO_TALLERES.filter((t) => p.talleres.includes(t));
  const hechos = flujo.filter((t) => p.progreso[t] === "completed").length;
  const i = flujo.findIndex((t) => p.progreso[t] !== "completed");
  if (i < 0) return { producto: p, taller: null, estado: null, hechos, total: flujo.length };
  const taller = flujo[i];
  const estado = (p.progreso[taller] ?? "pending") as TallerEstado;
  const desde =
    estado === "in-progress"
      ? p.fechasTaller?.[taller]?.inicio
      : i > 0
      ? p.fechasTaller?.[flujo[i - 1]]?.fin
      : undefined;
  return { producto: p, taller, estado, desde, hechos, total: flujo.length };
}

export function avanceOrden(orden: Orden): AvanceOrden {
  const productos = (orden.productos ?? []).map(avanceProducto);
  const hechos = productos.reduce((s, p) => s + p.hechos, 0);
  const total = productos.reduce((s, p) => s + p.total, 0);
  const sinTalleres = total === 0;
  const diasEntrega = diasRestantes(orden.fechaEntrega);

  let ultimoMovimiento: string | undefined;
  for (const p of orden.productos ?? []) {
    for (const f of Object.values(p.fechasTaller ?? {})) ultimoMovimiento = max(ultimoMovimiento, max(f?.inicio, f?.fin));
  }

  const base = { orden, productos, hechos, total, sinTalleres, ultimoMovimiento, diasEntrega };
  const porcentaje = total === 0 ? 100 : Math.round((hechos / total) * 100);

  if (orden.estadoNombre === "Cancelada") {
    return { ...base, etapa: "cancelada", trabajando: false, porcentaje, atrasada: false };
  }
  if (orden.estadoNombre === "Entregada") {
    return { ...base, etapa: "entregada", trabajando: false, porcentaje, atrasada: false };
  }

  const atrasada = diasEntrega !== null && diasEntrega < 0;
  const pendientes = productos.filter((p) => p.taller);
  if (pendientes.length === 0) {
    // Ya no hay nada en taller: desde que terminó el último paso.
    return { ...base, etapa: "lista", trabajando: false, porcentaje, atrasada, desde: ultimoMovimiento };
  }

  const empezo = productos.some((p) =>
    Object.values(p.producto.progreso).some((e) => e && e !== "pending")
  );
  if (!empezo) {
    return { ...base, etapa: "sin_iniciar", trabajando: false, porcentaje, atrasada, desde: orden.fechaCreacion };
  }

  // El producto más atrasado manda.
  const indice = Math.min(...pendientes.map((p) => FLUJO_TALLERES.indexOf(p.taller!)));
  const taller = FLUJO_TALLERES[indice];
  const enTaller = pendientes.filter((p) => p.taller === taller);
  const trabajando = enTaller.some((p) => p.estado === "in-progress");
  let desde: string | undefined;
  for (const p of enTaller) desde = min(desde, p.desde);
  return { ...base, etapa: taller, trabajando, porcentaje, atrasada, desde };
}

/** «En Costura», «Esperando Corte», «Lista para entregar»… */
export function textoEtapa(a: Pick<AvanceOrden, "etapa" | "trabajando" | "sinTalleres">): string {
  switch (a.etapa) {
    case "sin_iniciar":
      return "Aún no inicia producción";
    case "lista":
      return a.sinTalleres ? "No pasa por talleres" : "Lista para entregar";
    case "entregada":
      return "Entregada";
    case "cancelada":
      return "Cancelada";
    default:
      return a.trabajando ? `En ${NOMBRE_TALLER[a.etapa]}` : `Esperando ${NOMBRE_TALLER[a.etapa]}`;
  }
}

/** «En Costura (trabajando)», «Esperando Corte», «Terminado» para un producto. */
export function textoEtapaProducto(p: AvanceProducto): string {
  if (p.total === 0) return "Sin talleres";
  if (!p.taller) return "Terminado";
  return p.estado === "in-progress" ? `En ${NOMBRE_TALLER[p.taller]}` : `Esperando ${NOMBRE_TALLER[p.taller]}`;
}

/** Clases de color de la etiqueta de la etapa. */
export function claseEtapa(a: Pick<AvanceOrden, "etapa" | "trabajando">): string {
  if (a.etapa === "lista" || a.etapa === "entregada") return "bg-status-completed-bg text-status-completed-text";
  if (a.etapa === "cancelada") return "bg-secondary text-muted-foreground";
  if (a.etapa === "sin_iniciar") return "bg-status-pending-bg text-status-pending-text";
  return a.trabajando
    ? "bg-status-in-progress-bg text-status-in-progress-text"
    : "bg-secondary text-foreground";
}

/** «hace 3 h», «hace 2 días», «hoy»… */
export function haceCuanto(iso?: string): string {
  if (!iso) return "";
  const t = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).getTime();
  if (Number.isNaN(t)) return "";
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 60) return min <= 1 ? "hace un momento" : `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "hace 1 día" : `hace ${d} días`;
}

/** Líneas de avance por producto para el mensaje al cliente. */
export function lineasAvanceCliente(a: AvanceOrden): string[] {
  return a.productos.map((p) => {
    const etapa = p.total === 0 ? "listo" : !p.taller ? "terminado" : p.estado === "in-progress"
      ? `en ${NOMBRE_TALLER[p.taller].toLowerCase()}`
      : `por pasar a ${NOMBRE_TALLER[p.taller].toLowerCase()}`;
    return `• ${p.producto.cantidad} × ${p.producto.nombre}: ${etapa}`;
  });
}
