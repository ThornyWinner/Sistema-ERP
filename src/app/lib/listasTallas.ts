/**
 * listasTallas.ts — Enlace para que el cliente capture las tallas de su personal
 * (sql/listas_tallas.sql).
 *
 * El vendedor arma una lista (cliente, prendas con su color y tallas disponibles) y manda
 * el enlace /captura-tallas/:token. Cada empleado elige su talla de cada prenda; aquí se
 * concentran las respuestas (piezas por prenda y talla) y se arma la orden.
 */
import { supabase } from "./supabase";
import { NOMBRE_EMPRESA } from "./notaOrden";
import { formatFecha } from "./fechas";
import { productoVacio, type CapturaInicial } from "../components/NuevaOrdenMultiProducto";

/** Tallas sugeridas al agregar una prenda. */
export const PRESETS_TALLAS: { nombre: string; tallas: string[] }[] = [
  { nombre: "Camisa / playera", tallas: ["XS", "S", "M", "L", "XL", "2XL", "3XL"] },
  { nombre: "Pantalón", tallas: ["28", "30", "32", "34", "36", "38", "40", "42", "44"] },
  { nombre: "Dama", tallas: ["3", "5", "7", "9", "11", "13", "15"] },
  { nombre: "Calzado", tallas: ["22", "23", "24", "25", "26", "27", "28", "29", "30"] },
];

export interface ProductoLista {
  /** Identificador de la prenda dentro de la lista (no cambia al editar). */
  clave: string;
  nombre: string;
  color: string;
  tallas: string[];
  tipoPrenda?: string;
  productoId?: string;
  /** Precio unitario antes de IVA para la orden (no se muestra al cliente). */
  precioUnitario?: number;
}

export type EstadoLista = "abierta" | "cerrada";

export interface ListaTallas {
  id: string;
  token: string;
  vendedorId: string;
  vendedor?: string;
  clienteId?: string;
  clienteNombre: string;
  titulo: string;
  instrucciones?: string;
  productos: ProductoLista[];
  cierra?: string;
  estado: EstadoLista;
  ordenId?: string;
  ordenFolio?: string;
  createdAt: string;
  respuestas: number;
}

export interface RespuestaTallas {
  id: string;
  listaId: string;
  nombre: string;
  area?: string;
  /** Talla elegida por clave de prenda (sin clave = no la usa). */
  tallas: Record<string, string>;
  notas?: string;
  updatedAt: string;
}

export const enlaceTallas = (token: string) => `${window.location.origin}/captura-tallas/${token}`;

export const nuevaClave = () => Math.random().toString(36).slice(2, 10);

const mapLista = (r: any): ListaTallas => ({
  id: r.id,
  token: r.token,
  vendedorId: r.vendedor_id,
  vendedor: r.usuarios?.nombre ?? undefined,
  clienteId: r.cliente_id ?? undefined,
  clienteNombre: r.cliente_nombre,
  titulo: r.titulo,
  instrucciones: r.instrucciones ?? undefined,
  productos: (r.productos ?? []) as ProductoLista[],
  cierra: r.cierra ?? undefined,
  estado: r.estado,
  ordenId: r.orden_id ?? undefined,
  ordenFolio: r.ordenes?.folio ?? undefined,
  createdAt: r.created_at,
  respuestas: r.listas_tallas_respuestas?.[0]?.count ?? 0,
});

const COLUMNAS =
  "id,token,vendedor_id,cliente_id,cliente_nombre,titulo,instrucciones,productos,cierra,estado,orden_id,created_at," +
  "usuarios(nombre),ordenes(folio),listas_tallas_respuestas(count)";

export async function cargarListas(): Promise<ListaTallas[]> {
  const { data, error } = await supabase.from("listas_tallas").select(COLUMNAS).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapLista);
}

export async function cargarLista(id: string): Promise<ListaTallas | null> {
  const { data, error } = await supabase.from("listas_tallas").select(COLUMNAS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapLista(data) : null;
}

export interface ListaCaptura {
  clienteNombre: string;
  titulo: string;
  instrucciones?: string;
  cierra?: string;
  productos: ProductoLista[];
}

/** Valida lo capturado; devuelve el primer problema o null. */
export function validarLista(l: ListaCaptura): string | null {
  if (!l.clienteNombre.trim()) return "Escribe el cliente";
  if (!l.titulo.trim()) return "Ponle un título a la lista";
  if (l.productos.length === 0) return "Agrega al menos una prenda";
  if (l.productos.length > 20) return "Máximo 20 prendas por lista";
  for (const p of l.productos) {
    if (!p.nombre.trim()) return "Todas las prendas necesitan nombre";
    if (p.tallas.length === 0) return `Indica las tallas disponibles de ${p.nombre}`;
  }
  return null;
}

const filaLista = (l: ListaCaptura) => ({
  cliente_nombre: l.clienteNombre.trim(),
  titulo: l.titulo.trim(),
  instrucciones: l.instrucciones?.trim() || null,
  cierra: l.cierra || null,
  productos: l.productos.map((p) => ({
    clave: p.clave,
    nombre: p.nombre.trim(),
    color: p.color.trim(),
    tallas: [...new Set(p.tallas.map((t) => t.trim()).filter(Boolean))],
    tipoPrenda: p.tipoPrenda || undefined,
    productoId: p.productoId || undefined,
    precioUnitario: p.precioUnitario || undefined,
  })),
});

export async function crearLista(l: ListaCaptura, vendedorId: string): Promise<string> {
  const { data, error } = await supabase
    .from("listas_tallas")
    .insert({ ...filaLista(l), vendedor_id: vendedorId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function actualizarLista(id: string, cambios: Partial<ListaCaptura> & { estado?: EstadoLista; ordenId?: string }) {
  const fila: Record<string, unknown> = {};
  if (cambios.productos) Object.assign(fila, filaLista(cambios as ListaCaptura));
  if (cambios.estado) fila.estado = cambios.estado;
  if (cambios.ordenId) fila.orden_id = cambios.ordenId;
  const { error } = await supabase.from("listas_tallas").update(fila).eq("id", id);
  if (error) throw error;
}

export async function eliminarLista(id: string) {
  const { error } = await supabase.from("listas_tallas").delete().eq("id", id);
  if (error) throw error;
}

const mapRespuesta = (r: any): RespuestaTallas => ({
  id: r.id,
  listaId: r.lista_id,
  nombre: r.nombre,
  area: r.area ?? undefined,
  tallas: (r.tallas ?? {}) as Record<string, string>,
  notas: r.notas ?? undefined,
  updatedAt: r.updated_at,
});

export async function cargarRespuestas(listaId: string): Promise<RespuestaTallas[]> {
  const { data, error } = await supabase
    .from("listas_tallas_respuestas")
    .select("id,lista_id,nombre,area,tallas,notas,updated_at")
    .eq("lista_id", listaId)
    .order("nombre");
  if (error) throw error;
  return (data ?? []).map(mapRespuesta);
}

/** Captura manual del vendedor (alguien le dictó sus tallas). */
export async function guardarRespuesta(
  listaId: string,
  r: { nombre: string; area?: string; tallas: Record<string, string>; notas?: string },
  id?: string
) {
  const fila = {
    nombre: r.nombre.trim().replace(/\s+/g, " "),
    area: r.area?.trim() || null,
    tallas: Object.fromEntries(Object.entries(r.tallas).filter(([, t]) => t)),
    notas: r.notas?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = id
    ? await supabase.from("listas_tallas_respuestas").update(fila).eq("id", id)
    : await supabase.from("listas_tallas_respuestas").insert({ lista_id: listaId, ...fila });
  if (error) {
    if (error.code === "23505") throw new Error(`Ya hay una respuesta a nombre de ${fila.nombre}`);
    throw error;
  }
}

export async function eliminarRespuesta(id: string) {
  const { error } = await supabase.from("listas_tallas_respuestas").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- concentrado

export interface ConcentradoProducto {
  producto: ProductoLista;
  /** Piezas por talla, en el orden de las tallas de la prenda. */
  porTalla: { talla: string; piezas: number }[];
  total: number;
  /** Personas que no eligieron talla de esta prenda. */
  sinTalla: number;
}

export function concentrado(lista: Pick<ListaTallas, "productos">, respuestas: RespuestaTallas[]): ConcentradoProducto[] {
  return lista.productos.map((p) => {
    const cuenta = new Map<string, number>();
    let sinTalla = 0;
    for (const r of respuestas) {
      const t = r.tallas[p.clave];
      if (t) cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
      else sinTalla += 1;
    }
    // Tallas de la prenda primero; luego las que ya no están en la lista (se editó).
    const orden = [...p.tallas, ...[...cuenta.keys()].filter((t) => !p.tallas.includes(t))];
    const porTalla = orden.map((talla) => ({ talla, piezas: cuenta.get(talla) ?? 0 }));
    return { producto: p, porTalla, total: porTalla.reduce((s, x) => s + x.piezas, 0), sinTalla };
  });
}

/** Formulario de orden con una partida por prenda y talla (solo las que tienen piezas). */
export function capturaDesdeLista(lista: ListaTallas, respuestas: RespuestaTallas[]): CapturaInicial {
  const productos = concentrado(lista, respuestas).flatMap((c) =>
    c.porTalla
      .filter((x) => x.piezas > 0)
      .map((x) => ({
        ...productoVacio(),
        nombre: c.producto.nombre,
        tipoPrenda: c.producto.tipoPrenda || "camisa",
        color: c.producto.color,
        talla: x.talla,
        cantidad: x.piezas,
        precioUnitario: c.producto.precioUnitario ?? 0,
      }))
  );
  return {
    cliente: lista.clienteNombre,
    clienteTelefono: "",
    clienteEmail: "",
    descuento: 0,
    notas: `Tallas capturadas por el cliente: «${lista.titulo}» (${respuestas.length} persona${respuestas.length === 1 ? "" : "s"}).`,
    productos,
  };
}

/** Mensaje para mandar el enlace al contacto del cliente. */
export function mensajeInvitacion(lista: Pick<ListaTallas, "titulo" | "cierra" | "token">, vendedor: string): string {
  return [
    `Hola, buen día. Le saludamos de ${NOMBRE_EMPRESA}.`,
    "",
    `Para su pedido "${lista.titulo}", le compartimos este enlace para que cada persona capture su talla desde el celular:`,
    enlaceTallas(lista.token),
    ...(lista.cierra ? ["", `Les pedimos tenerlo listo a más tardar el ${formatFecha(lista.cierra, { day: "numeric", month: "long" })}.`] : []),
    "",
    "Con eso armamos su pedido. Quedamos a sus órdenes.",
    vendedor,
    NOMBRE_EMPRESA,
  ].join("\n");
}

// ---------------------------------------------------------------- enlace público

export interface ListaPublica {
  titulo: string;
  cliente: string;
  instrucciones?: string;
  cierra?: string;
  abierta: boolean;
  empresa?: string;
  productos: Pick<ProductoLista, "clave" | "nombre" | "color" | "tallas">[];
  capturados: string[];
}

export async function cargarListaPublica(token: string): Promise<ListaPublica | null> {
  const { data, error } = await supabase.rpc("lista_tallas_publica", { p_token: token });
  if (error) throw error;
  if (!data) return null;
  const d = data as any;
  return {
    titulo: d.titulo,
    cliente: d.cliente,
    instrucciones: d.instrucciones ?? undefined,
    cierra: d.cierra ?? undefined,
    abierta: !!d.abierta,
    empresa: d.empresa ?? undefined,
    productos: d.productos ?? [],
    capturados: d.capturados ?? [],
  };
}

export async function registrarTallasPublica(
  token: string,
  r: { nombre: string; area?: string; tallas: Record<string, string>; notas?: string }
): Promise<{ actualizado: boolean; nombre: string }> {
  const { data, error } = await supabase.rpc("registrar_tallas_publica", {
    p_token: token,
    p_nombre: r.nombre,
    p_area: r.area || null,
    p_tallas: r.tallas,
    p_notas: r.notas || null,
  });
  if (error) throw error;
  return data as { actualizado: boolean; nombre: string };
}
