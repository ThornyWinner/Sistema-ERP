/**
 * productos.ts — Guardado de productos, sus variantes e imagen de referencia.
 *
 * Modelo en Supabase:
 *  - productos: nombre, tipo_prenda, categoria_id, imagen_url.
 *  - variantes_producto: una fila por combinación talla × color, con stock y precio.
 *  - Imagen: bucket público `productos` (ver sql/storage_productos.sql), ruta
 *    <id del producto>/<marca de tiempo>.<ext>.
 *
 * Reglas al editar:
 *  - Las combinaciones nuevas de talla/color se crean con stock 0.
 *  - Las combinaciones quitadas se eliminan solo si no tienen stock y no están en
 *    ninguna orden ni movimiento; si no, se conservan y se informa cuántas quedaron.
 *  - Si cambió el precio, se aplica a todas las variantes.
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

type Combo = { talla: string | null; color: string | null };
const claveCombo = (c: Combo) => `${c.talla ?? ""}|${c.color ?? ""}`;

/** Combinaciones talla × color; si falta una de las listas se usa solo la otra. */
function combinaciones(tallas: string[], colores: string[]): Combo[] {
  const ts = tallas.length ? tallas : [null];
  const cs = colores.length ? colores : [null];
  return ts.flatMap((talla) => cs.map((color) => ({ talla, color })));
}

export type DatosProducto = {
  nombre: string;
  tipo: Producto["tipo"];
  categoria: string;
  precio: number;
  /** Solo en alta: stock inicial de cada variante. */
  stockInicial: number;
  tallas: string[];
  colores: string[];
};

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
  };

  let productoId: string;
  let variantesConservadas = 0;
  const deseadas = combinaciones(datos.tallas, datos.colores);

  if (!existente) {
    // --- Alta: producto y una variante por combinación, todas con el stock inicial.
    const { data, error } = await supabase.from("productos").insert(fila).select("id").single();
    if (error) throw error;
    productoId = data.id;
    const { error: errorVariantes } = await supabase.from("variantes_producto").insert(
      deseadas.map((c) => ({
        producto_id: productoId,
        talla: c.talla,
        color: c.color,
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
        nuevas.map((c) => ({ producto_id: productoId, talla: c.talla, color: c.color, stock: 0, precio: datos.precio }))
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
      const { error: errorPrecio } = await supabase
        .from("variantes_producto")
        .update({ precio: datos.precio })
        .eq("producto_id", productoId);
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
