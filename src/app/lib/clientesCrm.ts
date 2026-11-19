/**
 * clientesCrm.ts — Historial del cliente / CRM ligero (sql/historial_clientes.sql).
 *
 *  - cargarResumenClientes: compras por cliente (órdenes, piezas, monto, última compra,
 *    frecuencia) y su último / próximo contacto. El vendedor ve sus clientes.
 *  - Contactos (bitácora de seguimiento): cargar, registrar y borrar.
 *  - historialCliente: a partir de las órdenes del cliente, qué compra, qué tallas y
 *    colores pide y cuánto.
 *  - capturaDesdeOrden: llena el formulario de orden nueva con una orden anterior
 *    (para repetir el pedido del año pasado).
 *  - plantillasRecontacto: mensajes para volver a buscar al cliente.
 */
import { supabase } from "./supabase";
import { hoyISO, fechaISO, formatFecha } from "./fechas";
import { formatMonto } from "./pagos";
import { NOMBRE_EMPRESA, FECHA_LARGA, type PlantillaMensaje } from "./notaOrden";
import type { Orden, Producto } from "../data/mockData";
import { productoVacio, type CapturaInicial } from "../components/NuevaOrdenMultiProducto";

// ---------------------------------------------------------------- resumen

export interface ResumenCliente {
  clienteId: string;
  razonSocial: string;
  nombreComercial?: string;
  telefono?: string;
  email?: string;
  ordenes: number;
  piezas: number;
  comprado: number;
  ticketPromedio: number | null;
  primeraCompra?: string;
  ultimaCompra?: string;
  diasSinComprar: number | null;
  /** Días promedio entre compras (2 o más órdenes). */
  frecuenciaDias: number | null;
  vendedorId?: string;
  vendedor?: string;
  ultimoContacto?: string;
  ultimoResultado?: ResultadoContacto;
  proximoContacto?: string;
}

export async function cargarResumenClientes(): Promise<ResumenCliente[]> {
  const { data, error } = await supabase.rpc("resumen_clientes");
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    clienteId: r.cliente_id,
    razonSocial: r.razon_social,
    nombreComercial: r.nombre_comercial ?? undefined,
    telefono: r.telefono ?? undefined,
    email: r.email ?? undefined,
    ordenes: r.ordenes,
    piezas: r.piezas,
    comprado: Number(r.comprado),
    ticketPromedio: r.ticket_promedio != null ? Number(r.ticket_promedio) : null,
    primeraCompra: r.primera_compra ?? undefined,
    ultimaCompra: r.ultima_compra ?? undefined,
    diasSinComprar: r.dias_sin_comprar,
    frecuenciaDias: r.frecuencia_dias,
    vendedorId: r.vendedor_id ?? undefined,
    vendedor: r.vendedor ?? undefined,
    ultimoContacto: r.ultimo_contacto ?? undefined,
    ultimoResultado: r.ultimo_resultado ?? undefined,
    proximoContacto: r.proximo_contacto ?? undefined,
  }));
}

/** Situación comercial del cliente según sus compras. */
export type SituacionCliente = "sin_compras" | "activo" | "atrasado" | "inactivo";

export const SITUACION_INFO: Record<SituacionCliente, { texto: string; clase: string }> = {
  sin_compras: { texto: "Sin compras", clase: "bg-secondary text-muted-foreground" },
  activo: { texto: "Activo", clase: "bg-status-completed-bg text-status-completed-text" },
  atrasado: { texto: "Ya le toca", clase: "bg-status-in-progress-bg text-status-in-progress-text" },
  inactivo: { texto: "Inactivo", clase: "bg-status-pending-bg text-status-pending-text" },
};

/**
 * - inactivo: lleva `diasInactivo` días o más sin comprar.
 * - atrasado ("ya le toca"): compra con cierta frecuencia y ya pasó 1.5 veces ese
 *   tiempo desde su última compra (p. ej. compra cada 60 días y lleva 90).
 */
export function situacionCliente(r: ResumenCliente, diasInactivo: number): SituacionCliente {
  if (r.ordenes === 0 || r.diasSinComprar == null) return "sin_compras";
  if (r.diasSinComprar >= diasInactivo) return "inactivo";
  if (r.frecuenciaDias && r.frecuenciaDias > 0 && r.diasSinComprar > r.frecuenciaDias * 1.5) return "atrasado";
  return "activo";
}

/**
 * Próxima compra estimada: última compra + frecuencia promedio. Solo para clientes que
 * compran cada 21 días o más (misma regla que los avisos automáticos de
 * sql/recordatorios_recompra.sql, que avisan 14 días antes).
 */
export function proximaCompra(r: Pick<ResumenCliente, "ultimaCompra" | "frecuenciaDias">): string | null {
  if (!r.ultimaCompra || !r.frecuenciaDias || r.frecuenciaDias < 21) return null;
  const d = new Date(`${r.ultimaCompra}T12:00:00`);
  d.setDate(d.getDate() + r.frecuenciaDias);
  return fechaISO(d);
}

/** La próxima compra estimada cae en los próximos 14 días (o ya pasó). */
export const recompraCercana = (fecha: string | null) => !!fecha && fecha <= enDias(14);

/** Tiene un seguimiento programado para hoy o antes. */
export const seguimientoVencido = (r: Pick<ResumenCliente, "proximoContacto">) =>
  !!r.proximoContacto && r.proximoContacto <= hoyISO();

// ---------------------------------------------------------------- contactos

export type CanalContacto = "whatsapp" | "llamada" | "correo" | "visita" | "otro";
export type ResultadoContacto = "interesado" | "cotizacion" | "pedido" | "sin_respuesta" | "no_interesado" | "otro";

export const CANAL_CONTACTO: Record<CanalContacto, string> = {
  whatsapp: "WhatsApp",
  llamada: "Llamada",
  correo: "Correo",
  visita: "Visita",
  otro: "Otro",
};

export const RESULTADO_CONTACTO: Record<ResultadoContacto, { texto: string; clase: string }> = {
  interesado: { texto: "Interesado", clase: "bg-status-in-progress-bg text-status-in-progress-text" },
  cotizacion: { texto: "Pidió cotización", clase: "bg-status-in-progress-bg text-status-in-progress-text" },
  pedido: { texto: "Hizo pedido", clase: "bg-status-completed-bg text-status-completed-text" },
  sin_respuesta: { texto: "Sin respuesta", clase: "bg-secondary text-muted-foreground" },
  no_interesado: { texto: "No por ahora", clase: "bg-status-pending-bg text-status-pending-text" },
  otro: { texto: "Otro", clase: "bg-secondary text-muted-foreground" },
};

export interface ContactoCliente {
  id: string;
  clienteId: string;
  usuarioId?: string;
  usuario?: string;
  fecha: string;
  canal: CanalContacto;
  resultado: ResultadoContacto;
  notas?: string;
  proximoContacto?: string;
}

export async function cargarContactos(clienteId: string): Promise<ContactoCliente[]> {
  const { data, error } = await supabase
    .from("contactos_cliente")
    .select("id,cliente_id,usuario_id,fecha,canal,resultado,notas,proximo_contacto,usuarios(nombre)")
    .eq("cliente_id", clienteId)
    .order("fecha", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((c) => ({
    id: c.id,
    clienteId: c.cliente_id,
    usuarioId: c.usuario_id ?? undefined,
    usuario: c.usuarios?.nombre ?? undefined,
    fecha: c.fecha,
    canal: c.canal,
    resultado: c.resultado,
    notas: c.notas ?? undefined,
    proximoContacto: c.proximo_contacto ?? undefined,
  }));
}

export async function registrarContacto(
  clienteId: string,
  usuarioId: string,
  c: { canal: CanalContacto; resultado: ResultadoContacto; notas?: string; proximoContacto?: string }
) {
  const { error } = await supabase.from("contactos_cliente").insert({
    cliente_id: clienteId,
    usuario_id: usuarioId,
    canal: c.canal,
    resultado: c.resultado,
    notas: c.notas?.trim() || null,
    proximo_contacto: c.proximoContacto || null,
  });
  if (error) throw error;
}

export async function eliminarContacto(id: string) {
  const { error } = await supabase.from("contactos_cliente").delete().eq("id", id);
  if (error) throw error;
}

/** Fecha ISO de hoy + n días (atajos del próximo contacto). */
export function enDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return fechaISO(d);
}

// ---------------------------------------------------------------- historial de compras

export interface ProductoFrecuente {
  nombre: string;
  veces: number;
  piezas: number;
  ultimaVez: string;
  ultimoPrecio: number;
  tallas: string[];
}

export interface HistorialCliente {
  ordenes: Orden[];
  piezas: number;
  comprado: number;
  productos: ProductoFrecuente[];
  /** Piezas por talla, de la más pedida a la menos. */
  tallas: { talla: string; piezas: number }[];
  colores: { color: string; piezas: number }[];
}

/** Órdenes del cliente (por id, o por nombre en órdenes antiguas sin id). */
export function ordenesDeCliente(ordenes: Orden[], clienteId: string, razonSocial?: string): Orden[] {
  const nombre = razonSocial?.trim().toLowerCase();
  return ordenes
    .filter((o) => o.clienteId === clienteId || (!o.clienteId && nombre && o.cliente.trim().toLowerCase() === nombre))
    .sort((a, b) => (b.fechaCreacion || "").localeCompare(a.fechaCreacion || ""));
}

/** Qué compra el cliente (sin órdenes canceladas ni piezas devueltas). */
export function historialCliente(ordenesCliente: Orden[]): HistorialCliente {
  const vivas = ordenesCliente.filter((o) => o.estadoNombre !== "Cancelada");
  const productos = new Map<string, ProductoFrecuente>();
  const tallas = new Map<string, number>();
  const colores = new Map<string, number>();
  let piezas = 0;
  // De la más antigua a la más reciente, para que "último precio" sea el más nuevo.
  for (const o of [...vivas].sort((a, b) => (a.fechaCreacion || "").localeCompare(b.fechaCreacion || ""))) {
    const vistos = new Set<string>();
    for (const p of o.productos) {
      if (p.cantidad <= 0) continue;
      piezas += p.cantidad;
      const clave = p.nombre.trim().toLowerCase();
      const f = productos.get(clave) ?? { nombre: p.nombre, veces: 0, piezas: 0, ultimaVez: "", ultimoPrecio: 0, tallas: [] };
      if (!vistos.has(clave)) f.veces += 1;
      vistos.add(clave);
      f.piezas += p.cantidad;
      f.ultimaVez = o.fechaCreacion;
      f.ultimoPrecio = p.precioUnitario;
      if (p.talla && !f.tallas.includes(p.talla)) f.tallas.push(p.talla);
      productos.set(clave, f);
      if (p.talla) tallas.set(p.talla, (tallas.get(p.talla) ?? 0) + p.cantidad);
      if (p.color) colores.set(p.color, (colores.get(p.color) ?? 0) + p.cantidad);
    }
  }
  const orden = <T extends { piezas: number }>(a: T, b: T) => b.piezas - a.piezas;
  return {
    ordenes: ordenesCliente,
    piezas,
    comprado: vivas.reduce((s, o) => s + o.total, 0),
    productos: [...productos.values()].sort((a, b) => b.veces - a.veces || b.piezas - a.piezas),
    tallas: [...tallas.entries()].map(([talla, n]) => ({ talla, piezas: n })).sort(orden),
    colores: [...colores.entries()].map(([color, n]) => ({ color, piezas: n })).sort(orden),
  };
}

/**
 * Formulario de orden nueva con lo mismo que una orden anterior: productos, tallas,
 * colores, talleres y bordado. En venta directa toma el precio de lista ACTUAL de la
 * variante (y se aplican mayoreo y precio del cliente); en fabricación conserva el
 * precio de la orden anterior para que el vendedor lo revise.
 */
export function capturaDesdeOrden(o: Orden, catalogo: Producto[]): CapturaInicial {
  const variantes = new Map(catalogo.flatMap((p) => p.variantes.map((v) => [v.id, v] as const)));
  return {
    cliente: o.cliente,
    clienteTelefono: o.clienteTelefono ?? "",
    clienteEmail: o.clienteEmail ?? "",
    descuento: 0,
    notas: `Repite la orden ${o.numero} del ${formatFecha(o.fechaCreacion, FECHA_LARGA)}.`,
    productos: o.productos
      .filter((p) => p.cantidad > 0)
      .map((p) => {
        const directa = p.tipoProduccion === "directa";
        const variante = directa && p.varianteId ? variantes.get(p.varianteId) : undefined;
        const pers = p.personalizacion;
        return {
          ...productoVacio(),
          nombre: p.nombre,
          tipoPrenda: p.tipoPrenda || "camisa",
          marca: p.marca ?? "",
          corte: p.corte,
          manga: p.manga,
          talla: p.talla,
          color: p.color,
          cantidad: p.cantidad,
          precioUnitario: variante?.precio || p.precioUnitario,
          precioLista: variante ? variante.precio || p.precioUnitario : undefined,
          tipoProduccion: p.tipoProduccion,
          talleres: directa ? [] : [...p.talleres],
          productoId: directa ? p.productoId : undefined,
          varianteId: variante ? p.varianteId : undefined,
          requiereBordado: !!(pers?.lugarBordado || pers?.coloresHilo?.length),
          bordadoUbicacion: pers?.lugarBordado ?? "bolsillo",
          bordadoColores: (pers?.coloresHilo ?? []).join(", "),
          bordadoNotas: pers?.notas ?? "",
        };
      }),
  };
}

// ---------------------------------------------------------------- mensajes

export function plantillasRecontacto(
  r: Pick<ResumenCliente, "razonSocial" | "ultimaCompra">,
  vendedor: string,
  frecuente?: ProductoFrecuente
): PlantillaMensaje[] {
  const saludo = `Hola, buen día. Le saludamos de ${NOMBRE_EMPRESA}.`;
  const firma = `Quedamos a sus órdenes.\n${vendedor}\n${NOMBRE_EMPRESA}`;
  const ultima = r.ultimaCompra ? formatFecha(r.ultimaCompra, FECHA_LARGA) : "";
  return [
    {
      tipo: "recontacto",
      titulo: "Volver a contactar",
      texto: [
        saludo,
        "",
        ultima
          ? `Hace tiempo que no sabemos de ustedes (su último pedido fue el ${ultima}) y queríamos saludarles.`
          : "Queríamos saludarles y ponernos a sus órdenes.",
        "¿Tienen algún requerimiento de uniformes o prendas próximamente? Con gusto les preparamos una cotización.",
        "",
        firma,
      ].join("\n"),
    },
    {
      tipo: "repetir",
      titulo: "Repetir pedido",
      texto: [
        saludo,
        "",
        frecuente
          ? `¿Les gustaría repetir su pedido de ${frecuente.nombre}${frecuente.tallas.length ? ` (tallas ${frecuente.tallas.join(", ")})` : ""}? La última vez fueron ${frecuente.piezas} pieza(s) en total.`
          : "¿Les gustaría repetir su último pedido?",
        "Le preparamos la orden con los mismos datos; solo confírmenos cantidades y tallas.",
        "",
        firma,
      ].join("\n"),
    },
    {
      tipo: "temporada",
      titulo: "Temporada / promoción",
      texto: [
        saludo,
        "",
        "Se acerca la temporada de renovación de uniformes y queremos apartarles tiempo de producción.",
        "Si nos confirman este mes, les respetamos los precios actuales.",
        "",
        firma,
      ].join("\n"),
    },
  ];
}

/** «$12,500 en 4 órdenes» */
export const textoCompras = (r: Pick<ResumenCliente, "comprado" | "ordenes">) =>
  r.ordenes === 0 ? "Sin compras" : `${formatMonto(r.comprado)} en ${r.ordenes} orden${r.ordenes === 1 ? "" : "es"}`;
