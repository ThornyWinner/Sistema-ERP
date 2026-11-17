/**
 * cobranza.ts — Antigüedad de saldos y recordatorios de cobro (sql/cobranza.sql).
 *
 *  - Vencimiento = fecha de entrega (o de creación) + días de crédito del cliente.
 *  - Tramos: al corriente, 1–30, 31–60 y más de 60 días vencido.
 *  - La BD entrega la cartera ya calculada (admins: toda; vendedor: la suya) y un cron
 *    diario avisa al vendedor cuando un saldo entra a un tramo vencido.
 */
import { supabase } from "./supabase";
import { formatMonto } from "./pagos";
import { formatFecha, hoyISO } from "./fechas";
import { escaparHtml as esc, imprimirHtml } from "./impresion";
import { FECHA_LARGA, type PlantillaMensaje } from "./notaOrden";
import { NOMBRE_EMPRESA } from "./documentoVenta";

export type Tramo = "corriente" | "1_30" | "31_60" | "mas_60";

export const TRAMOS: Tramo[] = ["corriente", "1_30", "31_60", "mas_60"];

export const TRAMO_INFO: Record<Tramo, { titulo: string; corto: string; clase: string; barra: string }> = {
  corriente: {
    titulo: "Al corriente",
    corto: "Al corriente",
    clase: "bg-status-completed-bg text-status-completed-text",
    barra: "bg-status-completed",
  },
  "1_30": {
    titulo: "1 a 30 días vencido",
    corto: "1–30 días",
    clase: "bg-status-in-progress-bg text-status-in-progress-text",
    barra: "bg-status-in-progress",
  },
  "31_60": {
    titulo: "31 a 60 días vencido",
    corto: "31–60 días",
    clase: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    barra: "bg-orange-500",
  },
  mas_60: {
    titulo: "Más de 60 días vencido",
    corto: "+60 días",
    clase: "bg-status-pending-bg text-status-pending-text",
    barra: "bg-status-pending",
  },
};

export interface SaldoCartera {
  ordenId: string;
  folio: string;
  clienteId: string | null;
  cliente: string;
  telefono?: string;
  email?: string;
  vendedorId: string | null;
  vendedor: string;
  fechaCreacion: string;
  fechaEntrega: string | null;
  diasCredito: number | null;
  vencimiento: string | null;
  total: number;
  pagado: number;
  saldo: number;
  diasVencido: number;
  tramo: Tramo;
  ultimoPago: string | null;
  ultimoAviso: string | null;
}

export async function cargarCartera(): Promise<SaldoCartera[]> {
  const { data, error } = await supabase.rpc("cartera_por_cobrar");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ordenId: r.orden_id,
    folio: r.folio,
    clienteId: r.cliente_id,
    cliente: r.cliente,
    telefono: r.telefono ?? undefined,
    email: r.email ?? undefined,
    vendedorId: r.vendedor_id,
    vendedor: r.vendedor ?? "Sin vendedor",
    fechaCreacion: r.fecha_creacion,
    fechaEntrega: r.fecha_entrega,
    diasCredito: r.dias_credito == null ? null : Number(r.dias_credito),
    vencimiento: r.vencimiento,
    total: Number(r.total ?? 0),
    pagado: Number(r.pagado ?? 0),
    saldo: Number(r.saldo ?? 0),
    diasVencido: Number(r.dias_vencido ?? 0),
    tramo: r.tramo as Tramo,
    ultimoPago: r.ultimo_pago,
    ultimoAviso: r.ultimo_aviso,
  }));
}

/** Corre los recordatorios ahora (solo admin primario). Devuelve cuántas órdenes se avisaron. */
export async function enviarRecordatoriosAhora(): Promise<number> {
  const { data, error } = await supabase.rpc("enviar_recordatorios_cobranza");
  if (error) throw error;
  return Number(data ?? 0);
}

export type MontosPorTramo = Record<Tramo, number> & { total: number };

const ceros = (): MontosPorTramo => ({ corriente: 0, "1_30": 0, "31_60": 0, mas_60: 0, total: 0 });

/** Suma de saldos y número de órdenes por tramo. */
export function resumenTramos(filas: SaldoCartera[]) {
  const montos = ceros();
  const ordenes = ceros();
  for (const f of filas) {
    montos[f.tramo] += f.saldo;
    montos.total += f.saldo;
    ordenes[f.tramo] += 1;
    ordenes.total += 1;
  }
  return { montos, ordenes };
}

export interface SaldoCliente {
  clave: string;
  cliente: string;
  telefono?: string;
  email?: string;
  montos: MontosPorTramo;
  ordenes: SaldoCartera[];
  diasMax: number;
}

/** Matriz de antigüedad por cliente, de mayor saldo vencido a menor. */
export function agruparPorCliente(filas: SaldoCartera[]): SaldoCliente[] {
  const mapa = new Map<string, SaldoCliente>();
  for (const f of filas) {
    const clave = f.clienteId ?? `sin:${f.cliente}`;
    let c = mapa.get(clave);
    if (!c) {
      c = { clave, cliente: f.cliente, telefono: f.telefono, email: f.email, montos: ceros(), ordenes: [], diasMax: 0 };
      mapa.set(clave, c);
    }
    c.montos[f.tramo] += f.saldo;
    c.montos.total += f.saldo;
    c.ordenes.push(f);
    c.diasMax = Math.max(c.diasMax, f.diasVencido);
  }
  const vencido = (c: SaldoCliente) => c.montos.total - c.montos.corriente;
  return [...mapa.values()].sort((a, b) => vencido(b) - vencido(a) || b.montos.total - a.montos.total);
}

/** Mensajes de cobro al cliente por una o varias órdenes con saldo. */
export function plantillasCobro(cliente: string, ordenes: SaldoCartera[], vendedor: string): PlantillaMensaje[] {
  const saludo = `Hola, buen día. Le saludamos de ${NOMBRE_EMPRESA}.`;
  const firma = `Quedamos a sus órdenes.\n${vendedor}\n${NOMBRE_EMPRESA}`;
  const total = ordenes.reduce((a, o) => a + o.saldo, 0);
  const vencidas = ordenes.filter((o) => o.tramo !== "corriente");
  const linea = (o: SaldoCartera) =>
    `• Orden ${o.folio}: ${formatMonto(o.saldo)}${
      o.vencimiento ? ` (${o.tramo === "corriente" ? "vence" : "venció"} el ${formatFecha(o.vencimiento, FECHA_LARGA, "")})` : ""
    }`;

  const plantillas: PlantillaMensaje[] = [];
  if (vencidas.length > 0) {
    const totalVencido = vencidas.reduce((a, o) => a + o.saldo, 0);
    plantillas.push({
      tipo: "vencido",
      titulo: "Saldo vencido",
      texto: [
        saludo,
        "",
        `Le escribimos por ${vencidas.length === 1 ? "el saldo vencido" : "los saldos vencidos"} de ${cliente}:`,
        ...vencidas.map(linea),
        "",
        `Total vencido: ${formatMonto(totalVencido)}`,
        "",
        "¿Nos podría indicar la fecha en que realizará el pago? Si ya lo hizo, le agradeceremos nos comparta el comprobante para registrarlo.",
        "",
        firma,
      ].join("\n"),
    });
  }
  plantillas.push({
    tipo: "estado",
    titulo: "Estado de cuenta",
    texto: [
      saludo,
      "",
      `Le compartimos el estado de cuenta de ${cliente}:`,
      ...ordenes.map(linea),
      "",
      `Saldo total: ${formatMonto(total)}`,
      "",
      "Cualquier duda con gusto la aclaramos.",
      "",
      firma,
    ].join("\n"),
  });
  return plantillas;
}

/** Estado de cuenta imprimible (PDF) del cliente. */
export function htmlEstadoCuenta(cliente: string, ordenes: SaldoCartera[]): string {
  const total = ordenes.reduce((a, o) => a + o.saldo, 0);
  const filas = ordenes
    .map(
      (o) => `<tr>
        <td>${esc(o.folio)}</td>
        <td>${formatFecha(o.fechaCreacion, undefined, "—")}</td>
        <td>${formatFecha(o.vencimiento, undefined, "—")}</td>
        <td class="n">${formatMonto(o.total)}</td>
        <td class="n">${formatMonto(o.pagado)}</td>
        <td class="n"><b>${formatMonto(o.saldo)}</b></td>
        <td>${o.tramo === "corriente" ? "Al corriente" : `${o.diasVencido} días vencido`}</td>
      </tr>`
    )
    .join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Estado de cuenta — ${esc(cliente)}</title>
  <style>
    body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;margin:32px;font-size:13px}
    h1{font-size:20px;margin:0}h2{font-size:15px;margin:4px 0 20px;font-weight:500;color:#444}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}
    th{background:#f3f4f6;font-size:12px}.n{text-align:right;font-variant-numeric:tabular-nums}
    .total{margin-top:16px;text-align:right;font-size:16px}
    .pie{margin-top:32px;color:#555;font-size:12px}
  </style></head><body>
  <h1>${esc(NOMBRE_EMPRESA)}</h1>
  <h2>Estado de cuenta · ${esc(cliente)} · ${formatFecha(hoyISO(), FECHA_LARGA)}</h2>
  <table><thead><tr><th>Orden</th><th>Fecha</th><th>Vencimiento</th><th class="n">Total</th><th class="n">Pagado</th><th class="n">Saldo</th><th>Situación</th></tr></thead>
  <tbody>${filas}</tbody></table>
  <p class="total">Saldo total: <b>${formatMonto(total)}</b></p>
  <p class="pie">Si ya realizó algún pago no reflejado, por favor compártanos el comprobante.</p>
  </body></html>`;
}

export function imprimirEstadoCuenta(cliente: string, ordenes: SaldoCartera[]) {
  imprimirHtml(htmlEstadoCuenta(cliente, ordenes));
}
