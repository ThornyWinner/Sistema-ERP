/**
 * disenos.ts — Bocetos y aprobación del diseño por el cliente (sql/aprobacion_disenos.sql).
 *
 *  - El diseñador sube una versión del boceto (imagen o PDF) por producto de la orden.
 *  - El vendedor se lo manda al cliente (enlace temporal de 7 días o la hoja de
 *    aprobación impresa) y registra la respuesta: aprobado (quién, cuándo, por qué
 *    medio) o con cambios.
 *  - Diseño no puede terminar un producto sin una versión aprobada (lo exige la BD;
 *    el admin primario puede saltarlo).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { escaparHtml as esc, imprimirHtml } from "./impresion";
import { formatFecha } from "./fechas";
import { FECHA_LARGA } from "./notaOrden";
import { NOMBRE_EMPRESA } from "./documentoVenta";

export type EstadoPropuesta = "por_enviar" | "enviada" | "aprobada" | "rechazada" | "reemplazada";
export type CanalRespuesta = "whatsapp" | "correo" | "telefono" | "presencial" | "otro";

export const ESTADO_PROPUESTA: Record<EstadoPropuesta, { texto: string; clase: string }> = {
  por_enviar: { texto: "Por enviar al cliente", clase: "bg-secondary text-foreground" },
  enviada: { texto: "Esperando al cliente", clase: "bg-status-in-progress-bg text-status-in-progress-text" },
  aprobada: { texto: "Aprobado por el cliente", clase: "bg-status-completed-bg text-status-completed-text" },
  rechazada: { texto: "Cambios solicitados", clase: "bg-status-pending-bg text-status-pending-text" },
  reemplazada: { texto: "Versión anterior", clase: "bg-secondary text-muted-foreground" },
};

export const CANALES: { valor: CanalRespuesta; texto: string }[] = [
  { valor: "whatsapp", texto: "WhatsApp" },
  { valor: "correo", texto: "Correo" },
  { valor: "telefono", texto: "Teléfono" },
  { valor: "presencial", texto: "En persona (hoja firmada)" },
  { valor: "otro", texto: "Otro" },
];

export const TIPOS_ARCHIVO = "image/png,image/jpeg,image/webp,application/pdf";
export const TAMANO_MAX = 10 * 1024 * 1024;

export interface PropuestaDiseno {
  id: string;
  ordenId: string;
  detalleId: string;
  version: number;
  archivoPath: string;
  notas: string | null;
  estado: EstadoPropuesta;
  subidaAt: string;
  enviadaAt: string | null;
  respuestaFecha: string | null;
  respuestaQuien: string | null;
  respuestaCanal: CanalRespuesta | null;
  respuestaComentarios: string | null;
}

export const esPdf = (p: Pick<PropuestaDiseno, "archivoPath">) => p.archivoPath.toLowerCase().endsWith(".pdf");

const desdeFila = (r: any): PropuestaDiseno => ({
  id: r.id,
  ordenId: r.orden_id,
  detalleId: r.orden_detalle_id,
  version: r.version,
  archivoPath: r.archivo_path,
  notas: r.notas,
  estado: r.estado,
  subidaAt: r.subida_at,
  enviadaAt: r.enviada_at,
  respuestaFecha: r.respuesta_fecha,
  respuestaQuien: r.respuesta_quien,
  respuestaCanal: r.respuesta_canal,
  respuestaComentarios: r.respuesta_comentarios,
});

/** Propuestas visibles (de una orden, o todas las que el usuario puede ver), versión más nueva primero. */
export async function cargarPropuestas(ordenId?: string): Promise<PropuestaDiseno[]> {
  let q = supabase
    .from("propuestas_diseno")
    .select(
      "id,orden_id,orden_detalle_id,version,archivo_path,notas,estado,subida_at,enviada_at," +
        "respuesta_fecha,respuesta_quien,respuesta_canal,respuesta_comentarios"
    )
    .order("version", { ascending: false });
  if (ordenId) q = q.eq("orden_id", ordenId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(desdeFila);
}

/** Propuestas agrupadas por producto (orden_detalle), más nueva primero; recargables. */
export function usePropuestasDiseno(ordenId?: string, activo = true) {
  const [porDetalle, setPorDetalle] = useState<Map<string, PropuestaDiseno[]>>(new Map());
  const [disponible, setDisponible] = useState(true);

  const recargar = useCallback(async () => {
    try {
      const lista = await cargarPropuestas(ordenId);
      const mapa = new Map<string, PropuestaDiseno[]>();
      for (const p of lista) mapa.set(p.detalleId, [...(mapa.get(p.detalleId) ?? []), p]);
      setPorDetalle(mapa);
      setDisponible(true);
    } catch {
      // Sin la migración aplicada la sección simplemente no se muestra.
      setDisponible(false);
    }
  }, [ordenId]);

  useEffect(() => {
    if (activo) recargar();
  }, [activo, recargar]);

  return { porDetalle, disponible, recargar };
}

/** Sube el archivo y registra la nueva versión. */
export async function subirPropuesta(ordenId: string, detalleId: string, archivo: File, notas: string) {
  if (archivo.size > TAMANO_MAX) throw new Error("El archivo pasa de 10 MB.");
  const ext = (archivo.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ruta = `${ordenId}/${detalleId}/${Date.now()}.${ext}`;
  const { error: errorSubida } = await supabase.storage
    .from("disenos")
    .upload(ruta, archivo, { contentType: archivo.type, upsert: false });
  if (errorSubida) throw errorSubida;
  const { data, error } = await supabase.rpc("subir_propuesta_diseno", {
    p_detalle: detalleId,
    p_archivo: ruta,
    p_notas: notas.trim() || null,
  });
  if (error) {
    // Si no se pudo registrar, el archivo suelto no sirve: se intenta borrar.
    await supabase.storage.from("disenos").remove([ruta]);
    throw error;
  }
  return data as { id: string; version: number };
}

/** Enlace temporal al archivo (por omisión 7 días, para mandarlo al cliente). */
export async function enlaceArchivo(path: string, segundos = 7 * 24 * 3600): Promise<string> {
  const { data, error } = await supabase.storage.from("disenos").createSignedUrl(path, segundos);
  if (error || !data) throw error ?? new Error("No se pudo generar el enlace");
  return data.signedUrl;
}

export async function marcarEnviada(id: string, canal: string) {
  const { error } = await supabase.rpc("marcar_propuesta_enviada", { p_id: id, p_canal: canal });
  if (error) throw error;
}

export async function responderPropuesta(
  id: string,
  r: { aprobada: boolean; quien: string; canal: CanalRespuesta; fecha: string; comentarios: string }
) {
  const { error } = await supabase.rpc("responder_propuesta_diseno", {
    p_id: id,
    p_aprobada: r.aprobada,
    p_quien: r.quien.trim() || null,
    p_canal: r.canal,
    p_fecha: r.fecha || null,
    p_comentarios: r.comentarios.trim() || null,
  });
  if (error) throw error;
}

/** Texto de la respuesta: "Aprobó Juan Pérez el 3 de noviembre de 2026 por WhatsApp". */
export function textoRespuesta(p: PropuestaDiseno): string | null {
  if (p.estado !== "aprobada" && p.estado !== "rechazada" && !p.respuestaFecha) return null;
  const canal = CANALES.find((c) => c.valor === p.respuestaCanal)?.texto.toLowerCase();
  const cuando = p.respuestaFecha ? ` el ${formatFecha(p.respuestaFecha, FECHA_LARGA, "")}` : "";
  if (p.respuestaQuien || p.estado === "aprobada") {
    return `${p.estado === "rechazada" ? "Pidió cambios" : "Aprobó"} ${p.respuestaQuien ?? ""}${cuando}${canal ? ` (${canal})` : ""}`.replace(/\s+/g, " ");
  }
  return `Cambios solicitados${cuando}${canal ? ` (${canal})` : ""}`;
}

/**
 * Hoja de aprobación imprimible: boceto, datos de la orden y líneas de firma, para
 * aprobación en persona (después se registra como "En persona (hoja firmada)").
 */
export function imprimirHojaAprobacion(d: {
  folio: string;
  cliente: string;
  producto: string;
  cantidad: number;
  detalle: string;
  version: number;
  urlArchivo: string;
  pdf: boolean;
  notas: string | null;
  vendedor: string;
}) {
  const visual = d.pdf
    ? `<p class="pdf">Boceto en PDF: se anexa impreso. <br><small>${esc(d.urlArchivo)}</small></p>`
    : `<img src="${esc(d.urlArchivo)}" alt="Boceto">`;
  imprimirHtml(`<!doctype html><html lang="es"><head><meta charset="utf-8">
  <title>Aprobación de diseño — ${esc(d.folio)}</title>
  <style>
    body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;margin:28px;font-size:13px}
    h1{font-size:19px;margin:0}h2{font-size:14px;font-weight:500;color:#444;margin:4px 0 16px}
    table{border-collapse:collapse;margin-bottom:14px}td{padding:3px 12px 3px 0;vertical-align:top}td:first-child{color:#555}
    img{display:block;max-width:100%;max-height:520px;margin:0 auto 14px;border:1px solid #ddd;border-radius:6px}
    .pdf{border:1px dashed #999;padding:40px;text-align:center;margin-bottom:14px}
    .texto{margin:18px 0;line-height:1.5}
    .firmas{display:flex;gap:40px;margin-top:48px}.firma{flex:1;border-top:1px solid #111;padding-top:6px;text-align:center;color:#444}
  </style></head><body>
  <h1>${esc(NOMBRE_EMPRESA)}</h1>
  <h2>Aprobación de diseño · Orden ${esc(d.folio)} · Versión ${d.version}</h2>
  <table>
    <tr><td>Cliente</td><td><b>${esc(d.cliente)}</b></td></tr>
    <tr><td>Producto</td><td>${esc(d.producto)} · ${d.cantidad} pzs${d.detalle ? ` · ${esc(d.detalle)}` : ""}</td></tr>
    ${d.notas ? `<tr><td>Notas del diseño</td><td>${esc(d.notas)}</td></tr>` : ""}
  </table>
  ${visual}
  <p class="texto">Revisé el diseño mostrado (colores, logotipo, textos, ubicación y tallas) y lo apruebo para su
  producción. Entiendo que cambios posteriores a esta aprobación pueden modificar el precio y la fecha de entrega.</p>
  <div class="firmas">
    <div class="firma">Nombre y firma del cliente</div>
    <div class="firma">Fecha</div>
    <div class="firma">Vendedor: ${esc(d.vendedor)}</div>
  </div>
  </body></html>`);
}
