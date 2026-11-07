/**
 * fechas.ts — Utilidades para mostrar las fechas de las órdenes.
 *
 * Supabase devuelve las columnas `date` como texto "AAAA-MM-DD". `new Date("AAAA-MM-DD")`
 * las interpreta en UTC, lo que en México muestra el día anterior; y con una fecha
 * vacía o nula produce "Invalid Date" / NaN. Estas funciones evitan ambos problemas.
 */

/** Convierte la fecha a Date en hora local, o null si está vacía o no es válida. */
export function parseFecha(fecha?: string | null): Date | null {
  if (!fecha) return null;
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  const date = soloFecha
    ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    : new Date(fecha);
  return isNaN(date.getTime()) ? null : date;
}

/** Fecha "AAAA-MM-DD" en hora local (toISOString usaría UTC). */
export function fechaISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Fecha de hoy "AAAA-MM-DD" en hora local. */
export function hoyISO(): string {
  return fechaISO(new Date());
}

/** Fecha formateada en español (es-MX), o `vacio` si no hay fecha válida. */
export function formatFecha(
  fecha?: string | null,
  opciones?: Intl.DateTimeFormatOptions,
  vacio = "Sin fecha"
): string {
  const date = parseFecha(fecha);
  return date ? date.toLocaleDateString("es-MX", opciones) : vacio;
}

/**
 * Días naturales que faltan para la fecha (0 = hoy, negativo = vencida),
 * o null si no hay fecha válida.
 */
export function diasRestantes(fecha?: string | null): number | null {
  const date = parseFecha(fecha);
  if (!date) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

/** Texto corto de días restantes: "N días", "Hoy", "Vencida" o "Sin fecha". */
export function textoDiasRestantes(dias: number | null, sufijo = ""): string {
  if (dias === null) return "Sin fecha";
  if (dias > 0) return `${dias} ${dias === 1 ? "día" : "días"}${sufijo}`;
  if (dias === 0) return "Hoy";
  return "Vencida";
}

/** Clase de color: rojo y negritas si vence en 5 días o menos (o ya venció). */
export function claseDiasRestantes(dias: number | null): string {
  return dias !== null && dias <= 5 ? "text-red-600 dark:text-red-400 font-bold" : "text-muted-foreground";
}
