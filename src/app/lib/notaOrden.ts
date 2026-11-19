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
import type { Orden } from "../data/mockData";
import { formatFecha, hoyISO } from "./fechas";
import { METODO_PAGO_LABEL, formatMonto, redondearCentavos, saldoPendiente, totalPagado } from "./pagos";
import { escaparHtml, imprimirHtml } from "./impresion";
import { NOMBRE_EMPRESA, htmlDocumentoVenta } from "./documentoVenta";
import { avanceOrden, lineasAvanceCliente, NOMBRE_TALLER } from "./avanceProduccion";

export { NOMBRE_EMPRESA };

export const FECHA_LARGA: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };

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
export function detallePartida(p: { corte?: string; manga?: string; talla?: string; color?: string }): string {
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
  const piezas = productos.reduce((a, p) => a + p.cantidad, 0);

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

  return htmlDocumentoVenta({
    tituloArchivo: `Nota ${orden.numero} - ${orden.cliente}`,
    titulo: `Nota de venta ${orden.numero}`,
    subtitulos: [`Emitida el ${formatFecha(hoyISO(), FECHA_LARGA)}`],
    sello: ordenCancelada(orden) ? "CANCELADA" : undefined,
    datos: [
      ["Cliente", orden.cliente],
      ["Teléfono", orden.clienteTelefono],
      ["Correo", orden.clienteEmail],
      ["Vendedor", orden.vendedor],
      ["Fecha de la orden", formatFecha(orden.fechaCreacion, FECHA_LARGA)],
      ["Fecha de entrega", formatFecha(orden.fechaEntrega, FECHA_LARGA, "Por confirmar")],
      ["Forma de pago", METODO_PAGO_LABEL[orden.metodoPago]],
    ],
    partidas: productos.map((p) => {
      const pers = p.personalizacion;
      const extra = [
        pers?.lugarBordado && `Bordado: ${pers.lugarBordado}`,
        pers?.logotipo && `Logo: ${pers.logotipo}`,
        pers?.coloresHilo?.length && `Hilos: ${pers.coloresHilo.join(", ")}`,
        p.notas,
      ].filter(Boolean) as string[];
      return {
        cantidad: p.cantidad,
        nombre: p.nombre,
        detalle: detallePartida(p),
        extra: extra.join(" · "),
        precioUnitario: p.precioUnitario || 0,
      };
    }),
    resumen: `${piezas} pieza(s) en ${productos.length} partida(s).${iva > 0 ? " Precios unitarios antes de IVA." : ""}`,
    totales: [
      { etiqueta: "Subtotal", valor: subtotal },
      ...(descuento > 0 ? [{ etiqueta: "Descuento", valor: descuento, negativo: true }] : []),
      ...(iva > 0 ? [{ etiqueta: "IVA 16 %", valor: iva }] : []),
      { etiqueta: "Total", valor: orden.total, clase: "total" as const },
      { etiqueta: "Pagado", valor: totalPagado(orden) },
      { etiqueta: "Saldo pendiente", valor: saldoPendiente(orden), clase: "saldo" as const },
    ],
    secciones: pagos,
    notas: orden.notas,
    firma: "Recibí de conformidad\nNombre y firma del cliente",
    pie: `${NOMBRE_EMPRESA} · Este documento no es un comprobante fiscal.`,
  });
}

/** Abre el diálogo de impresión con la nota (ahí se puede elegir "Guardar como PDF"). */
export function imprimirNotaOrden(orden: Orden) {
  imprimirHtml(htmlNotaOrden(orden));
}

// ---------------------------------------------------------------- Mensajes al cliente

export type TipoMensaje = "resumen" | "avance" | "lista" | "saldo";

export interface PlantillaMensaje {
  /** Identificador de la plantilla (TipoMensaje en órdenes; otros en cotizaciones). */
  tipo: string;
  titulo: string;
  texto: string;
}

/**
 * Plantillas de mensaje que aplican al estado actual de la orden, en orden de
 * relevancia (la primera es la sugerida). Con `enlaceSeguimiento` (página pública de
 * avance, sql/seguimiento_publico.sql) el resumen y el avance incluyen el enlace.
 */
export function plantillasMensaje(
  orden: Orden,
  opciones: { enlaceSeguimiento?: string } = {}
): PlantillaMensaje[] {
  const saldo = saldoPendiente(orden);
  const pagado = totalPagado(orden);
  const cancelada = ordenCancelada(orden);
  const entregada = orden.estadoNombre === "Entregada";
  const productos = orden.productos ?? [];
  const tieneTalleres = productos.some((p) => p.talleres.length > 0);
  const entrega = orden.fechaEntrega ? formatFecha(orden.fechaEntrega, FECHA_LARGA, "") : "";
  // En qué taller va (sql/avance_produccion.sql); "lista" = ya no tiene producción pendiente.
  const avance = avanceOrden(orden);
  const lista = avance.etapa === "lista" && !avance.sinTalleres;

  const saludo = `Hola, buen día. Le saludamos de ${NOMBRE_EMPRESA}.`;
  const firma = `Quedamos a sus órdenes.\n${orden.vendedor}\n${NOMBRE_EMPRESA}`;
  const lineaSaldo = saldo > 0 ? `Saldo pendiente: ${formatMonto(saldo)}` : "La orden está pagada en su totalidad.";
  const lineasEnlace =
    opciones.enlaceSeguimiento && !cancelada && !entregada
      ? ["", `Puede consultar el avance de su pedido en cualquier momento aquí: ${opciones.enlaceSeguimiento}`]
      : [];

  const plantillas: PlantillaMensaje[] = [];

  if (!cancelada && !entregada && lista) {
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
      ...lineasEnlace,
      "",
      "Le enviamos también la nota en PDF.",
      "",
      firma,
    ].join("\n"),
  });

  if (!cancelada && !entregada && !lista && tieneTalleres) {
    const etapa =
      avance.etapa === "sin_iniciar"
        ? "ya está en la fila de producción"
        : avance.etapa !== "lista" && avance.etapa !== "entregada" && avance.etapa !== "cancelada"
        ? `va en el área de ${NOMBRE_TALLER[avance.etapa].toLowerCase()}`
        : "está en producción";
    plantillas.push({
      tipo: "avance",
      titulo: "Avance de producción",
      texto: [
        saludo,
        "",
        `Le compartimos el avance de su orden ${orden.numero}: ${etapa} y lleva un ${progresoOrden(orden)} % de producción.`,
        ...(productos.length > 1 ? lineasAvanceCliente(avance) : []),
        ...(entrega
          ? [avance.atrasada
              ? `La fecha estimada era el ${entrega}; le confirmaremos la nueva fecha a la brevedad.`
              : `Seguimos en tiempo para la entrega estimada del ${entrega}.`]
          : []),
        ...lineasEnlace,
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
