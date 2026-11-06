/**
 * notificaciones.ts — Acceso a las notificaciones entre usuarios (sql/notificaciones.sql).
 *
 *  - La tabla `notificaciones` guarda una fila por destinatario; un envío a varias
 *    personas comparte `envio_id`.
 *  - El envío se hace con la RPC `enviar_notificacion` (el remitente lo pone la BD).
 *  - `directorio_usuarios` lista a quién se puede notificar (id, nombre y rol).
 */
import { supabase } from "./supabase";
import type { UserRole } from "../types/auth";

export type Notificacion = {
  id: string;
  envioId: string;
  destinatarioId: string;
  destinatarioNombre: string;
  remitenteId: string | null;
  remitenteNombre: string;
  titulo: string;
  mensaje: string | null;
  enlace: string | null;
  leidaAt: string | null;
  createdAt: string;
};

export type UsuarioDirectorio = { id: string; nombre: string; rol: UserRole };

export const LIMITE_TITULO = 120;
export const LIMITE_MENSAJE = 2000;

const COLUMNAS =
  "id,envio_id,destinatario_id,destinatario_nombre,remitente_id,remitente_nombre,titulo,mensaje,enlace,leida_at,created_at";

export function mapNotificacion(r: any): Notificacion {
  return {
    id: r.id,
    envioId: r.envio_id,
    destinatarioId: r.destinatario_id,
    destinatarioNombre: r.destinatario_nombre,
    remitenteId: r.remitente_id,
    remitenteNombre: r.remitente_nombre,
    titulo: r.titulo,
    mensaje: r.mensaje,
    enlace: r.enlace,
    leidaAt: r.leida_at,
    createdAt: r.created_at,
  };
}

/** Últimas notificaciones recibidas por el usuario. */
export async function cargarRecibidas(usuarioId: string, limite = 50) {
  const { data, error } = await supabase
    .from("notificaciones")
    .select(COLUMNAS)
    .eq("destinatario_id", usuarioId)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []).map(mapNotificacion);
}

/** Últimas filas enviadas por el usuario (varias por envío si tuvo varios destinatarios). */
export async function cargarEnviadas(usuarioId: string, limite = 200) {
  const { data, error } = await supabase
    .from("notificaciones")
    .select(COLUMNAS)
    .eq("remitente_id", usuarioId)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []).map(mapNotificacion);
}

/** Marca como leídas (o no leídas) las notificaciones indicadas. */
export async function marcarLeidas(ids: string[], leida = true) {
  if (!ids.length) return;
  const { error } = await supabase
    .from("notificaciones")
    .update({ leida_at: leida ? new Date().toISOString() : null })
    .in("id", ids);
  if (error) throw error;
}

export async function eliminarNotificacion(id: string) {
  const { error } = await supabase.from("notificaciones").delete().eq("id", id);
  if (error) throw error;
}

export async function cargarDirectorio(): Promise<UsuarioDirectorio[]> {
  const { data, error } = await supabase.rpc("directorio_usuarios");
  if (error) throw error;
  return (data ?? []) as UsuarioDirectorio[];
}

/** Envía la notificación y devuelve cuántas personas la recibieron. */
export async function enviarNotificacion(params: {
  titulo: string;
  mensaje?: string;
  destinatarios: string[];
  roles: UserRole[];
  enlace?: string;
}) {
  const { data, error } = await supabase.rpc("enviar_notificacion", {
    p_titulo: params.titulo,
    p_mensaje: params.mensaje || null,
    p_destinatarios: params.destinatarios,
    p_roles: params.roles,
    p_enlace: params.enlace || null,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/** "hace 5 min", "hace 2 h", "ayer", o la fecha corta. */
export function tiempoRelativo(iso: string) {
  const segundos = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (segundos < 60) return "ahora";
  if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) return `hace ${Math.floor(segundos / 3600)} h`;
  if (segundos < 172800) return "ayer";
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}
