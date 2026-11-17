/**
 * documentoVenta.ts — Plantilla HTML imprimible para documentos al cliente (nota de
 * venta de una orden, cotización). Se imprime o guarda como PDF con imprimirHtml().
 *
 * Todo el texto que se pasa en `datos`, `partidas`, `totales` y `notas` se escapa
 * aquí; `secciones` es HTML ya armado (y escapado) por quien llama.
 */
import { escaparHtml as e } from "./impresion";
import { formatMonto } from "./pagos";

export const NOMBRE_EMPRESA = "Uniformes Industriales de Saltillo";

export interface PartidaDocumento {
  cantidad: number;
  nombre: string;
  /** Línea de detalle (corte, manga, talla, color). */
  detalle?: string;
  /** Segunda línea (personalización, notas). */
  extra?: string;
  precioUnitario: number;
}

export interface DocumentoVenta {
  /** Título de la pestaña / nombre sugerido del PDF. */
  tituloArchivo: string;
  /** Encabezado grande, p. ej. "Nota de venta ORD-2026-000012". */
  titulo: string;
  /** Líneas bajo el título (fecha de emisión, vigencia…). */
  subtitulos: string[];
  /** Sello en rojo junto al título (p. ej. "CANCELADA"). */
  sello?: string;
  /** Pares etiqueta–valor del cliente y la operación; los vacíos se omiten. */
  datos: [string, string | undefined | null][];
  partidas: PartidaDocumento[];
  /** Texto a la izquierda de los totales. */
  resumen: string;
  /** Filas de totales; `clase` = "total" (negritas) o "saldo" (resaltado). */
  totales: { etiqueta: string; valor: number; negativo?: boolean; clase?: "total" | "saldo" }[];
  /** HTML adicional ya escapado (tabla de pagos, etc.). */
  secciones?: string;
  notas?: string;
  firma: string;
  pie: string;
}

export function htmlDocumentoVenta(d: DocumentoVenta): string {
  const filas = d.partidas
    .map(
      (p) => `<tr>
        <td class="n">${p.cantidad}</td>
        <td><strong>${e(p.nombre)}</strong>${p.detalle ? `<br><span class="sub">${e(p.detalle)}</span>` : ""}${
          p.extra ? `<br><span class="sub">${e(p.extra)}</span>` : ""
        }</td>
        <td class="n">${formatMonto(p.precioUnitario)}</td>
        <td class="n">${formatMonto(p.cantidad * p.precioUnitario)}</td>
      </tr>`
    )
    .join("");

  const totales = d.totales
    .map(
      (t) =>
        `<tr${t.clase ? ` class="${t.clase}"` : ""}><td>${e(t.etiqueta)}</td><td class="n">${
          t.negativo ? "−" : ""
        }${formatMonto(t.valor)}</td></tr>`
    )
    .join("");

  const datos = d.datos
    .filter(([, v]) => v)
    .map(([k, v]) => `<div><span>${e(k)}</span><strong>${e(String(v))}</strong></div>`)
    .join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${e(d.tituloArchivo)}</title>
<style>
  @page{size:letter;margin:14mm}
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:0}
  header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #111;padding-bottom:10px}
  header img{height:56px}
  .folio{text-align:right}
  .folio h1{font-size:18px;margin:0}
  .folio p{margin:2px 0;color:#444}
  .sello{display:inline-block;margin-top:4px;padding:2px 8px;border:2px solid #b91c1c;color:#b91c1c;font-weight:bold}
  .datos{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin:14px 0}
  .datos div{display:flex;gap:6px} .datos span{color:#555;min-width:110px}
  h2{font-size:13px;margin:16px 0 6px}
  table{width:100%;border-collapse:collapse}
  .lista th{background:#f1f1f1;text-align:left;font-size:11px;padding:6px;border-bottom:1px solid #999}
  .lista td{padding:6px;border-bottom:1px solid #ddd;vertical-align:top}
  .n{text-align:right;white-space:nowrap}
  .sub{color:#555;font-size:11px}
  .resumen{display:flex;justify-content:space-between;gap:24px;margin-top:12px}
  .resumen .izq{flex:1;color:#444}
  .totales{width:260px}
  .totales td{padding:4px 6px}
  .totales .total td{font-weight:bold;font-size:15px;border-top:2px solid #111}
  .totales .saldo td{font-weight:bold;color:#b45309}
  .notas{margin-top:14px;padding:8px;background:#f6f6f6;white-space:pre-line}
  .firma{margin:56px auto 0;width:280px;border-top:1px solid #111;text-align:center;padding-top:4px}
  footer{margin-top:24px;font-size:10px;color:#666;text-align:center}
</style></head><body>
<header>
  <img src="${window.location.origin}/logo-uis.png" alt="${e(NOMBRE_EMPRESA)}">
  <div class="folio">
    <h1>${e(d.titulo)}</h1>
    ${d.subtitulos.map((s) => `<p>${e(s)}</p>`).join("")}
    ${d.sello ? `<span class="sello">${e(d.sello)}</span>` : ""}
  </div>
</header>
<section class="datos">${datos}</section>
<table class="lista"><thead><tr><th class="n">Cant.</th><th>Descripción</th><th class="n">P. unitario</th><th class="n">Importe</th></tr></thead>
<tbody>${filas}</tbody></table>
<div class="resumen">
  <div class="izq">${e(d.resumen)}</div>
  <table class="totales"><tbody>${totales}</tbody></table>
</div>
${d.secciones ?? ""}
${d.notas ? `<div class="notas"><strong>Notas:</strong> ${e(d.notas)}</div>` : ""}
<div class="firma">${d.firma.split("\n").map(e).join("<br>")}</div>
<footer>${e(d.pie)}</footer>
</body></html>`;
}
