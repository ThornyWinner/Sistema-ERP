/**
 * notaOrden.ts — Documentos y mensajes para el cliente a partir de una orden.
 *
 *  - imprimirNotaOrden: nota de venta imprimible (o "Guardar como PDF") con folio,
 *    partidas, desglose de importes, pagos, saldo y espacio para firma de recibido.
 *  - plantillasMensaje: textos listos para WhatsApp/correo (resumen de la orden,
 *    avance de producción, orden lista para entrega y recordatorio de saldo).
 *
 * Los datos de la empresa van fijos (logo y nombre): el vendedor no tiene acceso a
 * la configuración fiscal (`empresa_fiscal` solo la leen los administradores).
 */
import type { Orden, ProductoOrden } from "../data/mockData";
import { formatFecha, hoyISO } from "./fechas";
import { METODO_PAGO_LABEL, formatMonto, redondearCentavos, saldoPendiente, totalPagado } from "./pagos";
import { escaparHtml, imprimirHtml } from "./impresion";

export const NOMBRE_EMPRESA = "Uniformes Industriales de Saltillo";

const FECHA_LARGA: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };

/**
 * Porcentaje de avance de la orden = pasos de taller completados / pasos totales.
 * Las órdenes del formato antiguo (sin productos) usan sus campos talleres/progreso.
 */
export function progresoOrden(orden: Orden): number {
  if (!orden.productos || orden.productos.length === 0) {
    const antigua = orden as any;
    const talleres: string[] = antigua.talleres || [];
    if (talleres.length === 0) return 100;
    const hechos = talleres.filter((t) => antigua.progreso?.[t] === "completed").length;
    return Math.round((hechos / talleres.length) * 100);
  }
  const total = orden.productos.reduce((acc, p) => acc + p.talleres.length, 0);
  if (total === 0) return 100;
  const hechos = orden.productos.reduce(
    (acc, p) => acc + p.talleres.filter((t) => p.progreso[t] === "completed").length,
    0
  );
  return Math.round((hechos / total) * 100);
}

/** Descripción corta de una partida: corte, manga, talla y color. */
function detallePartida(p: ProductoOrden): string {
  return [p.corte, p.manga && `Manga ${p.manga.toLowerCase()}`, p.talla && `Talla ${p.talla}`, p.color]
    .filter(Boolean)
    .join(" · ");
}

const ordenCancelada = (o: Orden) => o.estadoNombre === "Cancelada" || o.estadoPago === "cancelado";

// ---------------------------------------------------------------- Nota imprimible

/** Arma el HTML de la nota de venta de la orden. */
export function htmlNotaOrden(orden: Orden): string {
  const e = escaparHtml;
  const productos = orden.productos ?? [];
  const subtotal = orden.subtotal ?? redondearCentavos(productos.reduce((a, p) => a + p.cantidad * (p.precioUnitario || 0), 0));
  const descuento = orden.descuento ?? 0;
  const iva = orden.iva ?? 0;
  const pagado = totalPagado(orden);
  const saldo = saldoPendiente(orden);
  const piezas = productos.reduce((a, p) => a + p.cantidad, 0);

  const filas = productos
    .map((p) => {
      const pers = p.personalizacion;
      const extra = [
        pers?.lugarBordado && `Bordado: ${pers.lugarBordado}`,
        pers?.logotipo && `Logo: ${pers.logotipo}`,
        pers?.coloresHilo?.length && `Hilos: ${pers.coloresHilo.join(", ")}`,
        p.notas,
      ].filter(Boolean) as string[];
      return `<tr>
        <td class="n">${p.cantidad}</td>
        <td><strong>${e(p.nombre)}</strong>${detallePartida(p) ? `<br><span class="sub">${e(detallePartida(p))}</span>` : ""}${
          extra.length ? `<br><span class="sub">${e(extra.join(" · "))}</span>` : ""
        }</td>
        <td class="n">${formatMonto(p.precioUnitario || 0)}</td>
        <td class="n">${formatMonto(p.cantidad * (p.precioUnitario || 0))}</td>
      </tr>`;
    })
    .join("");

  const totales = [
    ["Subtotal", formatMonto(subtotal)],
    ...(descuento > 0 ? [["Descuento", `−${formatMonto(descuento)}`]] : []),
    ...(iva > 0 ? [["IVA 16 %", formatMonto(iva)]] : []),
  ]
    .map(([k, v]) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`)
    .join("");

  const pagos = orden.pagos?.length
    ? `<h2>Pagos recibidos</h2>
      <table class="lista"><thead><tr><th>Fecha</th><th>Método</th><th>Referencia</th><th class="n">Monto</th></tr></thead><tbody>
      ${orden.pagos
        .map(
          (p) => `<tr><td>${e(formatFecha(p.fecha, FECHA_LARGA))}</td><td>${e(METODO_PAGO_LABEL[p.metodo] ?? "Otro")}</td><td>${e(
            p.referencia ?? ""
          )}</td><td class="n">${formatMonto(p.monto)}</td></tr>`
        )
        .join("")}
      </tbody></table>`
    : "";

  const datos = [
    ["Cliente", orden.cliente],
    ["Teléfono", orden.clienteTelefono ?? ""],
    ["Correo", orden.clienteEmail ?? ""],
    ["Vendedor", orden.vendedor],
    ["Fecha de la orden", formatFecha(orden.fechaCreacion, FECHA_LARGA)],
    ["Fecha de entrega", formatFecha(orden.fechaEntrega, FECHA_LARGA, "Por confirmar")],
    ["Forma de pago", METODO_PAGO_LABEL[orden.metodoPago] ?? ""],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div><span>${k}</span><strong>${e(v)}</strong></div>`)
    .join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Nota ${e(orden.numero)} - ${e(orden.cliente)}</title>
<style>
  @page{size:letter;margin:14mm}
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:0}
  header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #111;padding-bottom:10px}
  header img{height:56px}
  .folio{text-align:right}
  .folio h1{font-size:18px;margin:0}
  .folio p{margin:2px 0;color:#444}
  .cancelada{display:inline-block;margin-top:4px;padding:2px 8px;border:2px solid #b91c1c;color:#b91c1c;font-weight:bold}
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
  .notas{margin-top:14px;padding:8px;background:#f6f6f6}
  .firma{margin:56px auto 0;width:280px;border-top:1px solid #111;text-align:center;padding-top:4px}
  footer{margin-top:24px;font-size:10px;color:#666;text-align:center}
</style></head><body>
<header>
  <img src="${window.location.origin}/logo-uis.png" alt="${e(NOMBRE_EMPRESA)}">
  <div class="folio">
    <h1>Nota de venta ${e(orden.numero)}</h1>
    <p>Emitida el ${e(formatFecha(hoyISO(), FECHA_LARGA))}</p>
    ${ordenCancelada(orden) ? `<span class="cancelada">CANCELADA</span>` : ""}
  </div>
</header>
<section class="datos">${datos}</section>
<table class="lista"><thead><tr><th class="n">Cant.</th><th>Descripción</th><th class="n">P. unitario</th><th class="n">Importe</th></tr></thead>
<tbody>${filas}</tbody></table>
<div class="resumen">
  <div class="izq">${piezas} pieza(s) en ${productos.length} partida(s).${iva > 0 ? " Precios unitarios antes de IVA." : ""}</div>
  <table class="totales"><tbody>
    ${totales}
    <tr class="total"><td>Total</td><td class="n">${formatMonto(orden.total)}</td></tr>
    <tr><td>Pagado</td><td class="n">${formatMonto(pagado)}</td></tr>
    <tr class="saldo"><td>Saldo pendiente</td><td class="n">${formatMonto(saldo)}</td></tr>
  </tbody></table>
</div>
${pagos}
${orden.notas ? `<div class="notas"><strong>Notas:</strong> ${e(orden.notas)}</div>` : ""}
<div class="firma">Recibí de conformidad<br>Nombre y firma del cliente</div>
<footer>${e(NOMBRE_EMPRESA)} · Este documento no es un comprobante fiscal.</footer>
</body></html>`;
}

/** Abre el diálogo de impresión con la nota (ahí se puede elegir "Guardar como PDF"). */
export function imprimirNotaOrden(orden: Orden) {
  imprimirHtml(htmlNotaOrden(orden));
}

// ---------------------------------------------------------------- Mensajes al cliente

export type TipoMensaje = "resumen" | "avance" | "lista" | "saldo";

export interface PlantillaMensaje {
  tipo: TipoMensaje;
  titulo: string;
  texto: string;
}

/**
 * Plantillas de mensaje que aplican al estado actual de la orden, en orden de
 * relevancia (la primera es la sugerida).
 */
export function plantillasMensaje(orden: Orden): PlantillaMensaje[] {
  const saldo = saldoPendiente(orden);
  const pagado = totalPagado(orden);
  const cancelada = ordenCancelada(orden);
  const entregada = orden.estadoNombre === "Entregada";
  const productos = orden.productos ?? [];
  const tieneTalleres = productos.some((p) => p.talleres.length > 0);
  const entrega = orden.fechaEntrega ? formatFecha(orden.fechaEntrega, FECHA_LARGA, "") : "";

  const saludo = `Hola, buen día. Le saludamos de ${NOMBRE_EMPRESA}.`;
  const firma = `Quedamos a sus órdenes.\n${orden.vendedor}\n${NOMBRE_EMPRESA}`;
  const lineaSaldo = saldo > 0 ? `Saldo pendiente: ${formatMonto(saldo)}` : "La orden está pagada en su totalidad.";

  const plantillas: PlantillaMensaje[] = [];

  if (!cancelada && !entregada && orden.estado === "completed") {
    plantillas.push({
      tipo: "lista",
      titulo: "Orden lista para entrega",
      texto: [
        saludo,
        "",
        `Le informamos que su orden ${orden.numero} ya está lista para entrega.`,
        saldo > 0 ? `Para recogerla, queda un saldo pendiente de ${formatMonto(saldo)}.` : "Su orden ya está liquidada.",
        "",
        "¿Nos confirma qué día pasa por ella o si prefiere que coordinemos el envío?",
        "",
        firma,
      ].join("\n"),
    });
  }

  plantillas.push({
    tipo: "resumen",
    titulo: "Resumen de la orden",
    texto: [
      saludo,
      "",
      `Le compartimos el resumen de su orden ${orden.numero}:`,
      ...productos.map((p) => {
        const det = detallePartida(p);
        return `• ${p.cantidad} × ${p.nombre}${det ? ` (${det})` : ""}`;
      }),
      "",
      `Total: ${formatMonto(orden.total)}`,
      ...(pagado > 0 ? [`Pagado: ${formatMonto(pagado)}`] : []),
      lineaSaldo,
      ...(entrega && !entregada && !cancelada ? [`Fecha estimada de entrega: ${entrega}`] : []),
      "",
      "Le enviamos también la nota en PDF.",
      "",
      firma,
    ].join("\n"),
  });

  if (!cancelada && !entregada && orden.estado !== "completed" && tieneTalleres) {
    plantillas.push({
      tipo: "avance",
      titulo: "Avance de producción",
      texto: [
        saludo,
        "",
        `Le compartimos el avance de su orden ${orden.numero}: lleva un ${progresoOrden(orden)} % de producción.`,
        ...(entrega ? [`Seguimos en tiempo para la entrega estimada del ${entrega}.`] : []),
        "",
        "Le avisaremos en cuanto esté lista.",
        "",
        firma,
      ].join("\n"),
    });
  }

  if (!cancelada && saldo > 0) {
    plantillas.push({
      tipo: "saldo",
      titulo: "Recordatorio de saldo",
      texto: [
        saludo,
        "",
        `Le recordamos que su orden ${orden.numero} tiene un saldo pendiente de ${formatMonto(saldo)} (total ${formatMonto(
          orden.total
        )}, pagado ${formatMonto(pagado)}).`,
        "",
        "Si ya realizó el pago, le agradeceremos nos comparta el comprobante para registrarlo.",
        "",
        firma,
      ].join("\n"),
    });
  }

  return plantillas;
}
