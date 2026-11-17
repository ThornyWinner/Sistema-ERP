/**
 * cotizaciones.ts — Cotizaciones a clientes (sql/cotizaciones.sql).
 *
 *  - listarCotizaciones / guardarCotizacion / cambiarEstadoCotizacion / eliminarCotizacion.
 *  - capturaDesdeCotizacion: llena el formulario de orden/cotización con una cotización
 *    (para editarla, duplicarla o convertirla en orden).
 *  - estadoVisible: una cotización borrador/enviada con vigencia pasada se ve "vencida".
 *  - imprimirCotizacion y plantillasCotizacion: PDF y mensajes para el cliente.
 *
 * La BD calcula los importes y aplica el tope de descuento; las partidas guardan lo
 * capturado (`captura`) para reconstruir el formulario al convertir la cotización.
 */
import { supabase } from "./supabase";
import { diasRestantes, formatFecha, hoyISO } from "./fechas";
import { formatMonto } from "./pagos";
import { imprimirHtml } from "./impresion";
import { NOMBRE_EMPRESA, htmlDocumentoVenta } from "./documentoVenta";
import { FECHA_LARGA, detallePartida, type PlantillaMensaje } from "./notaOrden";
import {
  productoVacio,
  type CapturaInicial,
  type CotizacionCapturada,
  type ProductoCaptura,
} from "../components/NuevaOrdenMultiProducto";

export type EstadoCotizacion = "borrador" | "enviada" | "aceptada" | "rechazada" | "convertida";
/** Estado que se muestra: incluye "vencida" (borrador/enviada con vigencia pasada). */
export type EstadoVisible = EstadoCotizacion | "vencida";

export const ESTADO_COTIZACION_LABEL: Record<EstadoVisible, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  convertida: "Convertida en orden",
  vencida: "Vencida",
};

/** Campos de ProductoCaptura que se guardan en `captura` (el resto va en columnas). */
type CapturaGuardada = Omit<ProductoCaptura, "nombre" | "cantidad" | "precioUnitario" | "tipoProduccion" | "productoId" | "varianteId">;

export interface PartidaCotizacion {
  id: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  tipoProduccion: ProductoCaptura["tipoProduccion"];
  productoId?: string;
  varianteId?: string;
  captura: Partial<CapturaGuardada>;
}

export interface Cotizacion {
  id: string;
  folio: string;
  vendedorId: string;
  vendedor: string;
  clienteId?: string;
  cliente: string;
  clienteTelefono?: string;
  clienteEmail?: string;
  fecha: string;
  vigencia: string;
  estado: EstadoCotizacion;
  subtotal: number;
  descuento: number;
  iva: number;
  total: number;
  notas?: string;
  motivoRechazo?: string;
  ordenId?: string;
  ordenFolio?: string;
  enviadaAt?: string;
  cerradaAt?: string;
  partidas: PartidaCotizacion[];
}

const SELECT =
  "id,folio,vendedor_id,cliente_id,cliente_nombre,cliente_telefono,cliente_email,fecha,vigencia,estado," +
  "subtotal,descuento,iva,total,notas,motivo_rechazo,orden_id,enviada_at,cerrada_at," +
  "vendedor:usuarios(nombre),orden:ordenes(folio)," +
  "cotizacion_partidas(id,posicion,nombre,cantidad,precio_unitario,tipo_produccion,producto_id,variante_id,captura)";

function desdeFila(r: any, nombreVendedor?: (id: string) => string | undefined): Cotizacion {
  return {
    id: r.id,
    folio: r.folio,
    vendedorId: r.vendedor_id,
    // El vendedor no puede leer otros usuarios (RLS): si no viene el nombre, se resuelve aparte.
    vendedor: r.vendedor?.nombre ?? nombreVendedor?.(r.vendedor_id) ?? "—",
    clienteId: r.cliente_id ?? undefined,
    cliente: r.cliente_nombre,
    clienteTelefono: r.cliente_telefono ?? undefined,
    clienteEmail: r.cliente_email ?? undefined,
    fecha: r.fecha,
    vigencia: r.vigencia,
    estado: r.estado,
    subtotal: Number(r.subtotal),
    descuento: Number(r.descuento),
    iva: Number(r.iva),
    total: Number(r.total),
    notas: r.notas ?? undefined,
    motivoRechazo: r.motivo_rechazo ?? undefined,
    ordenId: r.orden_id ?? undefined,
    ordenFolio: r.orden?.folio ?? undefined,
    enviadaAt: r.enviada_at ?? undefined,
    cerradaAt: r.cerrada_at ?? undefined,
    partidas: [...(r.cotizacion_partidas ?? [])]
      .sort((a: any, b: any) => a.posicion - b.posicion)
      .map((p: any) => ({
        id: p.id,
        nombre: p.nombre,
        cantidad: p.cantidad,
        precioUnitario: Number(p.precio_unitario),
        tipoProduccion: p.tipo_produccion,
        productoId: p.producto_id ?? undefined,
        varianteId: p.variante_id ?? undefined,
        captura: p.captura ?? {},
      })),
  };
}

/** Cotizaciones visibles para el usuario (la RLS filtra: el vendedor ve las suyas). */
export async function listarCotizaciones(nombreVendedor?: (id: string) => string | undefined): Promise<Cotizacion[]> {
  const { data, error } = await supabase.from("cotizaciones").select(SELECT).order("fecha", { ascending: false }).order("folio", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => desdeFila(r, nombreVendedor));
}

/** Alta (id null) o edición de una cotización. Devuelve id y folio. */
export async function guardarCotizacion(id: string | null, c: CotizacionCapturada): Promise<{ id: string; folio: string }> {
  const partidas = c.productos.map((p) => {
    const { nombre, cantidad, precioUnitario, tipoProduccion, productoId, varianteId, ...captura } = p;
    return {
      nombre: nombre.trim(),
      cantidad,
      precio_unitario: precioUnitario,
      tipo_produccion: tipoProduccion,
      producto_id: productoId ?? null,
      variante_id: varianteId ?? null,
      captura,
    };
  });
  const { data, error } = await supabase.rpc("guardar_cotizacion", {
    p_id: id,
    p_datos: {
      cliente: c.cliente,
      telefono: c.telefono,
      email: c.email,
      vigencia: c.vigencia,
      descuento: c.descuento,
      notas: c.notas,
    },
    p_partidas: partidas,
  });
  if (error) throw error;
  return data as { id: string; folio: string };
}

export async function cambiarEstadoCotizacion(
  id: string,
  estado: EstadoCotizacion,
  opciones: { motivo?: string; ordenId?: string } = {}
) {
  const { error } = await supabase.rpc("cambiar_estado_cotizacion", {
    p_id: id,
    p_estado: estado,
    p_motivo: opciones.motivo ?? null,
    p_orden: opciones.ordenId ?? null,
  });
  if (error) throw error;
}

export async function eliminarCotizacion(id: string) {
  const { error } = await supabase.from("cotizaciones").delete().eq("id", id);
  if (error) throw error;
}

/** Estado a mostrar: borrador/enviada con vigencia pasada → "vencida". */
export function estadoVisible(c: Pick<Cotizacion, "estado" | "vigencia">): EstadoVisible {
  if ((c.estado === "borrador" || c.estado === "enviada") && c.vigencia < hoyISO()) return "vencida";
  return c.estado;
}

/** ¿Sigue abierta (se puede editar, enviar o convertir)? */
export const estaAbierta = (c: Pick<Cotizacion, "estado">) =>
  c.estado === "borrador" || c.estado === "enviada" || c.estado === "aceptada";

/**
 * Datos para el formulario a partir de una cotización.
 *  - "editar": conserva su vigencia.
 *  - "duplicar": misma captura con vigencia nueva (la que ponga el formulario).
 *  - "convertir": para la orden; las notas de la cotización pasan a la orden.
 */
export function capturaDesdeCotizacion(c: Cotizacion, uso: "editar" | "duplicar" | "convertir"): CapturaInicial {
  return {
    cliente: c.cliente,
    clienteTelefono: c.clienteTelefono ?? "",
    clienteEmail: c.clienteEmail ?? "",
    vigencia: uso === "editar" ? c.vigencia : undefined,
    descuento: c.descuento,
    notas:
      uso === "convertir"
        ? [`Cotización ${c.folio}.`, c.notas].filter(Boolean).join(" ")
        : c.notas ?? "",
    productos: c.partidas.map((p) => ({
      ...productoVacio(),
      ...p.captura,
      nombre: p.nombre,
      cantidad: p.cantidad,
      precioUnitario: p.precioUnitario,
      tipoProduccion: p.tipoProduccion,
      productoId: p.productoId,
      varianteId: p.varianteId,
    })),
  };
}

// ---------------------------------------------------------------- PDF

function extraPartida(p: PartidaCotizacion): string {
  const c = p.captura;
  return [
    c.marca && `Marca: ${c.marca}`,
    c.requiereBordado && `Bordado: ${c.bordadoUbicacion}${c.bordadoColores ? ` (hilos ${c.bordadoColores})` : ""}`,
    c.requiereBordado && c.bordadoNotas,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function htmlCotizacion(c: Cotizacion): string {
  const piezas = c.partidas.reduce((a, p) => a + p.cantidad, 0);
  const visible = estadoVisible(c);
  return htmlDocumentoVenta({
    tituloArchivo: `Cotización ${c.folio} - ${c.cliente}`,
    titulo: `Cotización ${c.folio}`,
    subtitulos: [`Fecha: ${formatFecha(c.fecha, FECHA_LARGA)}`, `Válida hasta: ${formatFecha(c.vigencia, FECHA_LARGA)}`],
    sello: visible === "vencida" ? "VENCIDA" : visible === "rechazada" ? "RECHAZADA" : undefined,
    datos: [
      ["Cliente", c.cliente],
      ["Teléfono", c.clienteTelefono],
      ["Correo", c.clienteEmail],
      ["Atiende", c.vendedor !== "—" ? c.vendedor : undefined],
    ],
    partidas: c.partidas.map((p) => ({
      cantidad: p.cantidad,
      nombre: p.nombre,
      detalle: detallePartida(p.captura),
      extra: extraPartida(p),
      precioUnitario: p.precioUnitario,
    })),
    resumen: `${piezas} pieza(s) en ${c.partidas.length} partida(s). Precios en pesos mexicanos; precios unitarios antes de IVA.`,
    totales: [
      { etiqueta: "Subtotal", valor: c.subtotal },
      ...(c.descuento > 0 ? [{ etiqueta: "Descuento", valor: c.descuento, negativo: true }] : []),
      { etiqueta: "IVA 16 %", valor: c.iva },
      { etiqueta: "Total", valor: c.total, clase: "total" as const },
    ],
    notas: c.notas,
    firma: "Acepto la cotización\nNombre y firma del cliente",
    pie: `${NOMBRE_EMPRESA} · Precios válidos hasta el ${formatFecha(c.vigencia, FECHA_LARGA)}; después están sujetos a cambio. Este documento no es un comprobante fiscal.`,
  });
}

export function imprimirCotizacion(c: Cotizacion) {
  imprimirHtml(htmlCotizacion(c));
}

// ---------------------------------------------------------------- Mensajes

/** Plantillas de mensaje según el estado de la cotización (la primera es la sugerida). */
export function plantillasCotizacion(c: Cotizacion): PlantillaMensaje[] {
  const saludo = `Hola, buen día. Le saludamos de ${NOMBRE_EMPRESA}.`;
  const firma = `Quedamos a sus órdenes.\n${c.vendedor !== "—" ? `${c.vendedor}\n` : ""}${NOMBRE_EMPRESA}`;
  const vence = formatFecha(c.vigencia, FECHA_LARGA);
  const dias = diasRestantes(c.vigencia);
  const visible = estadoVisible(c);

  const envio: PlantillaMensaje = {
    tipo: "envio",
    titulo: "Enviar cotización",
    texto: [
      saludo,
      "",
      `Le compartimos la cotización ${c.folio}:`,
      ...c.partidas.map((p) => {
        const det = detallePartida(p.captura);
        return `• ${p.cantidad} × ${p.nombre}${det ? ` (${det})` : ""} — ${formatMonto(p.precioUnitario)} c/u`;
      }),
      "",
      ...(c.descuento > 0 ? [`Descuento: ${formatMonto(c.descuento)}`] : []),
      `Total con IVA: ${formatMonto(c.total)}`,
      `Precios válidos hasta el ${vence}.`,
      "",
      "Le enviamos también la cotización en PDF. Cualquier ajuste con gusto lo revisamos.",
      "",
      firma,
    ].join("\n"),
  };

  const seguimiento: PlantillaMensaje = {
    tipo: "seguimiento",
    titulo: "Seguimiento",
    texto: [
      saludo,
      "",
      `¿Pudo revisar la cotización ${c.folio} por ${formatMonto(c.total)}?`,
      "Si gusta podemos ajustar cantidades, tallas o el bordado, o resolver cualquier duda.",
      "",
      firma,
    ].join("\n"),
  };

  const porVencer: PlantillaMensaje = {
    tipo: "vencimiento",
    titulo: visible === "vencida" ? "Renovar cotización" : "Por vencer",
    texto: [
      saludo,
      "",
      visible === "vencida"
        ? `La cotización ${c.folio} venció el ${vence}. Si sigue interesado, con gusto se la actualizamos.`
        : `Le recordamos que la cotización ${c.folio} es válida hasta el ${vence}${
            dias !== null && dias <= 3 ? ` (${dias === 0 ? "hoy" : `en ${dias} día(s)`})` : ""
          }. Para respetar los precios, confírmenos antes de esa fecha.`,
      "",
      firma,
    ].join("\n"),
  };

  if (c.estado === "borrador") return [envio, seguimiento, porVencer];
  if (visible === "vencida") return [porVencer, envio];
  if (c.estado === "enviada") return [seguimiento, porVencer, envio];
  return [envio];
}
