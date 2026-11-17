/**
 * productos.ts — Guardado de productos, sus variantes e imagen de referencia.
 *
 * Modelo en Supabase:
 *  - productos: nombre, tipo_prenda, categoria_id, imagen_url.
 *  - productos.composicion / incluye / notas: ficha técnica del catálogo.
 *  - variantes_producto: una fila por combinación corte × manga × talla × color, con stock,
 *    precio y la clave del modelo del proveedor (ver sql/variantes_corte_manga.sql).
 *  - Imagen: bucket público `productos` (ver sql/storage_productos.sql), ruta
 *    <id del producto>/<marca de tiempo>.<ext>.
 *
 * Reglas al editar:
 *  - Un valor nuevo (corte, manga, talla o color) se cruza con las combinaciones que ya
 *    existen en las demás dimensiones; las variantes nuevas se crean con stock 0.
 *  - Las combinaciones quitadas se eliminan solo si no tienen stock y no están en
 *    ninguna orden ni movimiento; si no, se conservan y se informa cuántas quedaron.
 *  - Si cambió el precio, se aplica a las variantes con el precio anterior o sin precio.
 */
import { supabase } from "./supabase";
import type { Producto, VarianteProducto } from "../data/mockData";

export const BUCKET_PRODUCTOS = "productos";
export const TIPOS_IMAGEN = ["image/png", "image/jpeg", "image/webp"];
export const MAX_IMAGEN_BYTES = 5 * 1024 * 1024;

/** Mensaje de error si el archivo no es una imagen válida, o null si es correcto. */
export function validarImagen(archivo: File): string | null {
  if (!TIPOS_IMAGEN.includes(archivo.type)) return "Solo se permiten imágenes PNG, JPG o WEBP";
  if (archivo.size > MAX_IMAGEN_BYTES) return "La imagen no puede pesar más de 5 MB";
  return null;
}

/** Ruta dentro del bucket a partir de la URL pública (null si no es de este bucket). */
function rutaDesdeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marca = `/storage/v1/object/public/${BUCKET_PRODUCTOS}/`;
  const i = url.indexOf(marca);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marca.length).split("?")[0]);
}

async function subirImagen(productoId: string, archivo: File): Promise<string> {
  const ext = archivo.type === "image/png" ? "png" : archivo.type === "image/webp" ? "webp" : "jpg";
  const ruta = `${productoId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET_PRODUCTOS)
    .upload(ruta, archivo, { contentType: archivo.type, upsert: false });
  if (error) throw error;
  return supabase.storage.from(BUCKET_PRODUCTOS).getPublicUrl(ruta).data.publicUrl;
}

/** Borra el archivo anterior; un fallo aquí no debe afectar al guardado. */
async function borrarImagen(url: string | null | undefined) {
  const ruta = rutaDesdeUrl(url);
  if (ruta) await supabase.storage.from(BUCKET_PRODUCTOS).remove([ruta]);
}

/** Id de la categoría por nombre (sin distinguir mayúsculas); la crea si no existe. */
async function categoriaId(nombre: string): Promise<string | null> {
  const limpio = nombre.trim();
  if (!limpio) return null;
  const { data, error } = await supabase
    .from("categorias_producto")
    .select("id")
    .ilike("nombre", limpio.replace(/[%_]/g, "\\$&"))
    .maybeSingle();
  if (error) throw error;
  if (data) return data.id;
  const { data: nueva, error: errorAlta } = await supabase
    .from("categorias_producto")
    .insert({ nombre: limpio })
    .select("id")
    .single();
  if (errorAlta) throw errorAlta;
  return nueva.id;
}

export async function cargarCategorias(): Promise<string[]> {
  const { data, error } = await supabase.from("categorias_producto").select("nombre").order("nombre");
  if (error) throw error;
  return (data ?? []).map((c) => c.nombre);
}

type Combo = { corte: string | null; manga: string | null; talla: string | null; color: string | null };
const DIMENSIONES = ["corte", "manga", "talla", "color"] as const;
type Dimension = (typeof DIMENSIONES)[number];
const claveCombo = (c: { [K in Dimension]?: string | null }) =>
  DIMENSIONES.map((d) => c[d] || "").join("|");

/** Lista de valores de una dimensión; vacía = «no aplica» (un único valor null). */
const valoresDe = (lista: string[]): (string | null)[] => (lista.length ? lista : [null]);

/** Producto cartesiano corte × manga × talla × color. */
function combinaciones(listas: Record<Dimension, string[]>): Combo[] {
  let res: Combo[] = [{ corte: null, manga: null, talla: null, color: null }];
  for (const d of DIMENSIONES) {
    res = res.flatMap((c) => valoresDe(listas[d]).map((v) => ({ ...c, [d]: v })));
  }
  return res;
}

/**
 * Combinaciones deseadas al editar. Los productos del catálogo no son un producto
 * cartesiano completo (p. ej. Dama y Caballero con distinto rango de tallas), así que:
 *  - se conservan las variantes cuyos valores siguen en las listas;
 *  - cada valor nuevo se cruza solo con las combinaciones que ya existen en las demás
 *    dimensiones (agregar «Gris» crea Gris en cada corte/manga/talla que ya había);
 *  - si no queda ninguna variante que conservar, se usa el producto cartesiano.
 */
function combinacionesEdicion(actuales: VarianteProducto[], listas: Record<Dimension, string[]>): Combo[] {
  const permitido = (d: Dimension, v: string | null) => valoresDe(listas[d]).includes(v || null);
  let base: Combo[] = actuales
    .map((v) => ({ corte: v.corte || null, manga: v.manga || null, talla: v.talla || null, color: v.color || null }))
    .filter((c) => DIMENSIONES.every((d) => permitido(d, c[d])));
  if (!base.length) return combinaciones(listas);
  for (const d of DIMENSIONES) {
    const existentes = new Set(base.map((c) => c[d]));
    const nuevos = valoresDe(listas[d]).filter((v) => !existentes.has(v));
    if (!nuevos.length) continue;
    const plantillas = new Map(base.map((c) => [claveCombo({ ...c, [d]: null }), c]));
    base = base.concat([...plantillas.values()].flatMap((c) => nuevos.map((v) => ({ ...c, [d]: v }))));
  }
  const unicas = new Map(base.map((c) => [claveCombo(c), c]));
  return [...unicas.values()];
}

/** Combinaciones que quedarán al guardar (alta: cartesiano; edición: ver combinacionesEdicion). */
export function combinacionesDeseadas(
  listas: { cortes: string[]; mangas: string[]; tallas: string[]; colores: string[] },
  existentes?: VarianteProducto[]
): Combo[] {
  const l = { corte: listas.cortes, manga: listas.mangas, talla: listas.tallas, color: listas.colores };
  return existentes?.length ? combinacionesEdicion(existentes, l) : combinaciones(l);
}

export type DatosProducto = {
  nombre: string;
  tipo: Producto["tipo"];
  categoria: string;
  precio: number;
  /** Solo en alta: stock inicial de cada variante. */
  stockInicial: number;
  cortes: string[];
  mangas: string[];
  tallas: string[];
  colores: string[];
  /** Ficha técnica (texto libre; vacío = sin dato). */
  composicion: string;
  incluye: string;
  notas: string;
  /** Datos para facturar (CFDI 4.0); si se omiten, no se modifican. */
  fiscal?: DatosFiscalesProducto;
};

/** Columnas fiscales de `productos` (ver sql/facturacion.sql). */
export type DatosFiscalesProducto = {
  codigo: string | null;
  clave_prod_serv: string | null;
  clave_unidad: string;
  unidad_medida: string;
  objeto_imp: string;
};

/** Lee los datos fiscales de un producto (no vienen en la carga general del ERP). */
export async function cargarFiscalProducto(id: string): Promise<DatosFiscalesProducto | null> {
  const { data, error } = await supabase
    .from("productos")
    .select("codigo,clave_prod_serv,clave_unidad,unidad_medida,objeto_imp")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as DatosFiscalesProducto | null;
}

export type CambioImagen =
  | { tipo: "sin_cambio" }
  | { tipo: "nueva"; archivo: File }
  | { tipo: "quitar" };

export type ResultadoGuardado = {
  productoId: string;
  /** Variantes que se pidió quitar pero se conservaron (con stock o usadas en órdenes). */
  variantesConservadas: number;
  /** Mensaje si el producto se guardó pero la imagen no. */
  errorImagen: string | null;
};

export async function guardarProducto(
  datos: DatosProducto,
  imagen: CambioImagen,
  existente?: Producto
): Promise<ResultadoGuardado> {
  const fila = {
    nombre: datos.nombre.trim(),
    tipo_prenda: datos.tipo,
    categoria_id: await categoriaId(datos.categoria),
    composicion: datos.composicion.trim() || null,
    incluye: datos.incluye.trim() || null,
    notas: datos.notas.trim() || null,
    ...(datos.fiscal ?? {}),
  };

  let productoId: string;
  let variantesConservadas = 0;
  const deseadas = combinacionesDeseadas(datos, existente?.variantes);

  if (!existente) {
    // --- Alta: producto y una variante por combinación, todas con el stock inicial.
    const { data, error } = await supabase.from("productos").insert(fila).select("id").single();
    if (error) throw error;
    productoId = data.id;
    const { error: errorVariantes } = await supabase.from("variantes_producto").insert(
      deseadas.map((c) => ({
        producto_id: productoId,
        ...c,
        stock: datos.stockInicial,
        precio: datos.precio,
      }))
    );
    if (errorVariantes) {
      // Sin variantes el producto no se puede vender: se deshace el alta.
      await supabase.from("productos").delete().eq("id", productoId);
      throw errorVariantes;
    }
  } else {
    // --- Edición
    productoId = existente.id;
    const { error } = await supabase.from("productos").update(fila).eq("id", productoId);
    if (error) throw error;

    const actuales: VarianteProducto[] = existente.variantes ?? [];
    const clavesActuales = new Set(actuales.map((v) => claveCombo(v)));
    const clavesDeseadas = new Set(deseadas.map(claveCombo));

    const nuevas = deseadas.filter((c) => !clavesActuales.has(claveCombo(c)));
    if (nuevas.length) {
      const { error: errorNuevas } = await supabase.from("variantes_producto").insert(
        nuevas.map((c) => ({ producto_id: productoId, ...c, stock: 0, precio: datos.precio }))
      );
      if (errorNuevas) throw errorNuevas;
    }

    const quitadas = actuales.filter((v) => !clavesDeseadas.has(claveCombo(v)));
    for (const v of quitadas) {
      if (v.stock > 0) {
        variantesConservadas++;
        continue;
      }
      // Si la variante aparece en una orden o movimiento, la BD rechaza el borrado (FK).
      const { error: errorBaja } = await supabase.from("variantes_producto").delete().eq("id", v.id);
      if (errorBaja) variantesConservadas++;
    }

    if (datos.precio !== existente.precio) {
      // Solo las variantes con el precio de referencia anterior (o sin precio): las tallas
      // con sobreprecio (2XG +10 %…) conservan el suyo.
      let consulta = supabase.from("variantes_producto").update({ precio: datos.precio }).eq("producto_id", productoId);
      consulta = existente.precio
        ? consulta.or(`precio.eq.${existente.precio},precio.is.null`)
        : consulta.or("precio.is.null,precio.eq.0");
      const { error: errorPrecio } = await consulta;
      if (errorPrecio) throw errorPrecio;
    }
  }

  // --- Imagen (el producto ya está guardado; un fallo aquí solo se informa).
  let errorImagen: string | null = null;
  const urlAnterior = existente?.imagen ?? null;
  try {
    if (imagen.tipo === "nueva") {
      const url = await subirImagen(productoId, imagen.archivo);
      const { error } = await supabase.from("productos").update({ imagen_url: url }).eq("id", productoId);
      if (error) {
        await borrarImagen(url);
        throw error;
      }
      if (urlAnterior) await borrarImagen(urlAnterior);
    } else if (imagen.tipo === "quitar" && urlAnterior) {
      const { error } = await supabase.from("productos").update({ imagen_url: null }).eq("id", productoId);
      if (error) throw error;
      await borrarImagen(urlAnterior);
    }
  } catch (err: any) {
    errorImagen = err?.message ?? "Error desconocido";
  }

  return { productoId, variantesConservadas, errorImagen };
}
