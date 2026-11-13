/**
 * facturacion.ts — Tipos, cálculos e importación de CFDI (ver sql/facturacion.sql).
 *
 * Cálculo por concepto (igual que private.recalcular_totales_cfdi):
 *   importe = round(cantidad × valor unitario, 2)
 *   IVA     = round((importe − descuento) × tasa, 2)   solo si objeto de impuesto = 02
 *   total   = Σ importe − Σ descuento + Σ IVA
 * Se calcula en centavos enteros para redondear igual que Postgres.
 */
import { supabase } from "./supabase";

export type TipoComprobante = "I" | "E" | "T" | "P";
export type EstadoCfdi = "borrador" | "vigente" | "cancelado" | "en_proceso";

export interface ConceptoCfdi {
  producto_id?: string | null;
  orden_detalle_id?: string | null;
  sku?: string | null;
  descripcion: string;
  clave_prod_serv: string;
  clave_unidad: string;
  unidad?: string | null;
  cantidad: number;
  valor_unitario: number;
  descuento: number;
  objeto_imp: string;
  tasa_iva: number;
}

export interface Cfdi {
  id: string;
  tipo_comprobante: TipoComprobante;
  serie: string | null;
  folio: number | null;
  fecha: string;
  estado: EstadoCfdi;
  estado_detalle: string | null;
  uuid: string | null;
  cliente_id: string | null;
  receptor_rfc: string | null;
  receptor_nombre: string | null;
  receptor_nombre_comercial: string | null;
  receptor_regimen: string | null;
  receptor_cp: string | null;
  receptor_email: string | null;
  uso_cfdi: string | null;
  metodo_pago: string | null;
  forma_pago: string | null;
  moneda: string;
  condiciones_pago: string | null;
  fecha_vencimiento: string | null;
  exportacion: string;
  es_global: boolean;
  global_periodicidad: string | null;
  global_meses: string | null;
  global_anio: number | null;
  subtotal: number;
  descuento: number;
  iva: number;
  total: number;
  saldo: number;
  fecha_pago: string | null;
  orden_id: string | null;
  comentarios: string | null;
  origen: "erp" | "contpaqi";
  created_at: string;
}

export const ESTADO_CFDI: Record<EstadoCfdi, { label: string; clase: string }> = {
  borrador: { label: "Borrador", clase: "bg-secondary text-muted-foreground" },
  vigente: { label: "Vigente", clase: "bg-status-completed-bg text-status-completed-text" },
  en_proceso: { label: "Cancelación en proceso", clase: "bg-status-in-progress-bg text-status-in-progress-text" },
  cancelado: { label: "Cancelado", clase: "bg-status-pending-bg text-status-pending-text" },
};

// ----------------------------------------------------------------- cálculos
const aCentavos = (n: number) => Math.round((Number(n) || 0) * 100);
/** round(a / b) con enteros no negativos, mitad hacia arriba (como Postgres). */
const dividirRedondeando = (a: number, b: number) => Math.floor((2 * a + b) / (2 * b));

export interface ImportesConcepto {
  importe: number;
  iva: number;
}

export function calcularConcepto(c: Pick<ConceptoCfdi, "cantidad" | "valor_unitario" | "descuento" | "objeto_imp" | "tasa_iva">): ImportesConcepto {
  const importe = dividirRedondeando(Math.max(aCentavos(c.cantidad), 0) * Math.max(aCentavos(c.valor_unitario), 0), 100);
  const desc = Math.min(Math.max(aCentavos(c.descuento), 0), importe);
  const tasa = Math.round((Number(c.tasa_iva) || 0) * 10000);
  const iva = c.objeto_imp === "02" ? dividirRedondeando((importe - desc) * tasa, 10000) : 0;
  return { importe: importe / 100, iva: iva / 100 };
}

export function calcularTotalesCfdi(conceptos: ConceptoCfdi[]) {
  let subtotal = 0;
  let descuento = 0;
  let iva = 0;
  for (const c of conceptos) {
    const r = calcularConcepto(c);
    subtotal += aCentavos(r.importe);
    descuento += Math.min(aCentavos(c.descuento), aCentavos(r.importe));
    iva += aCentavos(r.iva);
  }
  return {
    subtotal: subtotal / 100,
    descuento: descuento / 100,
    iva: iva / 100,
    total: (subtotal - descuento + iva) / 100,
  };
}

/**
 * Reparte el descuento de una orden entre sus partidas igual que la BD
 * (private.recalcular_totales_orden): proporcional al importe y la partida de mayor
 * importe absorbe el redondeo. Así la factura de una orden suma exactamente su total.
 * Devuelve el descuento de cada partida, en el orden recibido.
 */
export function repartirDescuento(importes: number[], descuento: number): number[] {
  const cents = importes.map(aCentavos);
  const subtotal = cents.reduce((s, x) => s + x, 0);
  const desc = Math.min(Math.max(aCentavos(descuento), 0), subtotal);
  const orden = cents.map((importe, i) => ({ importe, i })).sort((a, b) => b.importe - a.importe || a.i - b.i);
  const res = new Array(cents.length).fill(0);
  let resto = desc;
  orden.slice(1).forEach(({ importe, i }) => {
    const d = subtotal > 0 ? dividirRedondeando(desc * importe, subtotal) : 0;
    res[i] = d;
    resto -= d;
  });
  if (orden.length) res[orden[0].i] = resto;
  return res.map((c) => c / 100);
}

/** Lo que falta para poder timbrar un CFDI de ingreso (vacío = listo). */
export function pendientesParaTimbrar(c: {
  receptor_rfc: string;
  receptor_nombre: string;
  receptor_regimen: string;
  receptor_cp: string;
  uso_cfdi: string;
  metodo_pago: string;
  forma_pago: string;
  es_global: boolean;
  global_periodicidad: string;
  global_meses: string;
  conceptos: ConceptoCfdi[];
}): string[] {
  const p: string[] = [];
  const rfc = c.receptor_rfc.trim().toUpperCase();
  if (!/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(rfc)) p.push("RFC del receptor válido");
  if (!c.receptor_nombre.trim()) p.push("Nombre o razón social del receptor (tal como aparece en su constancia)");
  if (!c.receptor_regimen) p.push("Régimen fiscal del receptor");
  if (!/^[0-9]{5}$/.test(c.receptor_cp)) p.push("Código postal fiscal del receptor");
  if (!c.uso_cfdi) p.push("Uso de CFDI");
  if (!c.metodo_pago) p.push("Método de pago");
  if (!c.forma_pago) p.push("Forma de pago");
  if (c.metodo_pago === "PPD" && c.forma_pago && c.forma_pago !== "99") p.push("Con PPD la forma de pago debe ser 99 - Por definir");
  if (c.metodo_pago === "PUE" && c.forma_pago === "99") p.push("Con PUE la forma de pago no puede ser 99 - Por definir");
  if (c.es_global) {
    if (rfc !== "XAXX010101000") p.push("La factura global va a RFC XAXX010101000");
    if (!c.global_periodicidad || !c.global_meses) p.push("Periodicidad y meses de la factura global");
  } else if (rfc === "XAXX010101000" && c.receptor_regimen !== "616") {
    p.push("Público en general lleva régimen 616 - Sin obligaciones fiscales");
  }
  if (c.conceptos.length === 0) p.push("Al menos una partida");
  c.conceptos.forEach((x, i) => {
    if (!/^[0-9]{8}$/.test(x.clave_prod_serv)) p.push(`Partida ${i + 1}: clave de producto o servicio`);
    if (!x.clave_unidad) p.push(`Partida ${i + 1}: clave de unidad`);
  });
  return p;
}

// ----------------------------------------------------------------- formato
export const serieFolio = (c: Pick<Cfdi, "serie" | "folio">) =>
  c.folio != null ? `${c.serie ?? ""}${c.serie ? " - " : ""}${c.folio}` : "Sin folio";

export const formatMoneda = (n: number, moneda = "MXN") =>
  `${moneda} ${Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "10 de nov. de 2026 16:47" en hora de Saltillo. */
export const formatFechaHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Monterrey",
      })
    : "—";

// ----------------------------------------------------------------- CSV
/** Lector CSV (RFC 4180): comillas, comas y saltos de línea dentro de campos. */
export function leerCsv(texto: string): Record<string, string>[] {
  const t = texto.replace(/^\uFEFF/, "");
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else comillas = false;
      } else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === ",") {
      fila.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else campo += ch;
  }
  if (campo !== "" || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  const [cabecera, ...resto] = filas.filter((f) => f.some((c) => c.trim() !== ""));
  if (!cabecera) return [];
  return resto.map((f) => Object.fromEntries(cabecera.map((h, i) => [h.trim(), (f[i] ?? "").trim()])));
}

/** Escribe un CSV con BOM (Excel lo abre con acentos correctos). */
export function escribirCsv(columnas: string[], filas: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + [columnas, ...filas].map((f) => f.map(esc).join(",")).join("\r\n");
}

export function descargarArchivo(nombre: string, contenido: string, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/** Las fechas de CONTPAQi vienen sin zona horaria: son hora de Saltillo (UTC-6). */
const fechaLocal = (s: string) => (s ? (/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}-06:00`) : "");

export interface FilaImportacion {
  serie: string;
  folio: string;
  fecha: string;
  rfc: string;
  nombre: string;
  total: string;
  saldo: string;
  moneda: string;
  metodo_pago: string;
  forma_pago: string;
  estado: string;
  fecha_vencimiento: string;
  uuid: string;
  fecha_pago: string;
}

export interface ArchivoContpaqi {
  tipo: TipoComprobante;
  filas: FilaImportacion[];
}

/**
 * Reconoce el CSV exportado de CONTPAQi Vende por sus columnas:
 *  - Facturas.csv:            Serie, Folio, RFC Receptor, …, Estado CFDI, Saldo, Folio fiscal
 *  - Complementos de Pago.csv: Serie, Folio, Fecha del pago, Fecha, …, Folio fiscal, Estado
 */
export function interpretarCsvContpaqi(texto: string): ArchivoContpaqi {
  const filas = leerCsv(texto);
  if (filas.length === 0) throw new Error("El archivo está vacío");
  const cols = Object.keys(filas[0]);
  const tiene = (c: string) => cols.includes(c);
  if (!tiene("Folio fiscal") || !tiene("RFC Receptor")) {
    throw new Error("No parece un CSV exportado de CONTPAQi Vende (faltan Folio fiscal / RFC Receptor)");
  }
  const tipo: TipoComprobante = tiene("Fecha del pago") ? "P" : "I";
  return {
    tipo,
    filas: filas.map((f) => ({
      serie: f["Serie"] ?? "",
      folio: f["Folio"] ?? "",
      fecha: fechaLocal(f["Fecha"] ?? ""),
      rfc: (f["RFC Receptor"] ?? "").toUpperCase(),
      nombre: f["Razón social cliente"] ?? "",
      total: f["Total"] ?? "",
      saldo: f["Saldo"] ?? "",
      moneda: f["Moneda"] || "MXN",
      metodo_pago: f["Método de pago"] ?? "",
      forma_pago: f["Forma de pago"] ?? "",
      estado: f["Estado CFDI"] ?? f["Estado"] ?? "",
      fecha_vencimiento: f["Fecha de vencimiento"] ?? "",
      uuid: (f["Folio fiscal"] ?? "").toLowerCase(),
      fecha_pago: fechaLocal(f["Fecha del pago"] ?? ""),
    })),
  };
}

/** Envía el historial a la BD en bloques (upsert por UUID). */
export async function importarCfdis(archivo: ArchivoContpaqi, alAvanzar?: (hechas: number) => void) {
  const total = { insertados: 0, actualizados: 0, omitidos: 0 };
  const BLOQUE = 300;
  for (let i = 0; i < archivo.filas.length; i += BLOQUE) {
    const { data, error } = await supabase.rpc("importar_cfdis_contpaqi", {
      p_tipo: archivo.tipo,
      p_filas: archivo.filas.slice(i, i + BLOQUE),
    });
    if (error) throw error;
    total.insertados += data.insertados;
    total.actualizados += data.actualizados;
    total.omitidos += data.omitidos;
    alAvanzar?.(Math.min(i + BLOQUE, archivo.filas.length));
  }
  return total;
}
