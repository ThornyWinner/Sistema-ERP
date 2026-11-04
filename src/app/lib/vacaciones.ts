/**
 * vacaciones.ts — Cálculo de vacaciones según la Ley Federal del Trabajo (LFT).
 *
 *  - Art. 76 (reforma 2023): días por años de servicio cumplidos.
 *  - Art. 74: días de descanso obligatorio (no cuentan como días de vacaciones).
 *  - Art. 80: prima vacacional de al menos 25 % del salario de los días de vacaciones.
 *  - Art. 81: deben otorgarse dentro de los 6 meses siguientes al aniversario.
 *  - Art. 516: el derecho a reclamarlas prescribe un año después de ese plazo.
 *
 * Las vacaciones se cuentan en días laborables; la jornada del negocio es de lunes a
 * sábado, así que el domingo no cuenta.
 * La base de datos repite las validaciones principales (sql/vacaciones.sql).
 */
import { fechaISO, parseFecha } from "./fechas";

export interface Empleado {
  id: string;
  nombre: string;
  puesto: string | null;
  fecha_ingreso: string;
  salario_diario: number;
  porcentaje_prima: number;
  usuario_id: string | null;
  activo: boolean;
  notas: string | null;
  rfc?: string | null;
  curp?: string | null;
  nss?: string | null;
  /** Fecha y causa de terminación de la relación laboral (null si sigue laborando). */
  fecha_baja?: string | null;
  causa_baja?: string | null;
}

export interface Vacacion {
  id: string;
  empleado_id: string;
  anio_servicio: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias: number;
  prima_vacacional: number;
  notas: string | null;
}

/** Situación de un año de servicio respecto a sus vacaciones. */
export type EstadoPeriodo = "completo" | "vigente" | "atrasado" | "prescrito";

export interface Periodo {
  anio: number;
  /** Aniversario con el que se gana (desde cuándo se pueden tomar). */
  aniversario: string;
  /** Último día para otorgarlas (6 meses después del aniversario, Art. 81). */
  limiteOtorgar: string;
  /** Fecha en que prescribe el derecho a reclamarlas (1 año después del límite, Art. 516). */
  prescribe: string;
  derecho: number;
  tomados: number;
  pendientes: number;
  estado: EstadoPeriodo;
}

/** Días de vacaciones por años de servicio cumplidos (Art. 76 LFT, reforma 2023). */
export function diasPorAntiguedad(anios: number): number {
  if (anios < 1) return 0;
  if (anios <= 5) return 10 + 2 * anios;
  return 22 + 2 * Math.floor((anios - 6) / 5);
}

/** Suma años a una fecha; un 29 de febrero pasa al 28 en años no bisiestos. */
function sumarAnios(fecha: Date, anios: number): Date {
  const d = new Date(fecha.getFullYear() + anios, fecha.getMonth(), fecha.getDate());
  if (d.getMonth() !== fecha.getMonth()) d.setDate(0);
  return d;
}

/** Suma meses a una fecha, sin pasarse al mes siguiente (31 ene + 1 mes = 28/29 feb). */
function sumarMeses(fecha: Date, meses: number): Date {
  const d = new Date(fecha.getFullYear(), fecha.getMonth() + meses, fecha.getDate());
  if (d.getDate() !== fecha.getDate()) d.setDate(0);
  return d;
}

/** Años de servicio completos a una fecha. */
export function aniosCumplidos(fechaIngreso: string, aFecha: Date = new Date()): number {
  const ingreso = parseFecha(fechaIngreso);
  if (!ingreso) return 0;
  let anios = aFecha.getFullYear() - ingreso.getFullYear();
  if (sumarAnios(ingreso, anios) > aFecha) anios--;
  return Math.max(anios, 0);
}

/** Aniversario número `anio` (fecha en que se cumple ese año de servicio). */
export function aniversario(fechaIngreso: string, anio: number): string {
  return fechaISO(sumarAnios(parseFecha(fechaIngreso)!, anio));
}

/** n-ésimo lunes de un mes (mes 0 = enero). */
function lunesDelMes(anio: number, mes: number, n: number): string {
  const d = new Date(anio, mes, 1);
  const desfase = (8 - d.getDay()) % 7; // días hasta el primer lunes
  return fechaISO(new Date(anio, mes, 1 + desfase + 7 * (n - 1)));
}

/**
 * Días de descanso obligatorio de un año (Art. 74 LFT). No incluye las jornadas
 * electorales, que dependen del calendario electoral.
 */
export function diasFestivos(anio: number): Set<string> {
  const f = new Set([
    `${anio}-01-01`,
    lunesDelMes(anio, 1, 1), // primer lunes de febrero (Constitución)
    lunesDelMes(anio, 2, 3), // tercer lunes de marzo (Benito Juárez)
    `${anio}-05-01`,
    `${anio}-09-16`,
    lunesDelMes(anio, 10, 3), // tercer lunes de noviembre (Revolución)
    `${anio}-12-25`,
  ]);
  // 1 de octubre, cada seis años (transmisión del Poder Ejecutivo Federal: 2024, 2030…).
  if (anio >= 2024 && (anio - 2024) % 6 === 0) f.add(`${anio}-10-01`);
  return f;
}

/** Días laborables (lunes a sábado, sin descansos obligatorios) entre dos fechas, inclusive. */
export function contarDiasLaborables(inicio: string, fin: string): number {
  const d = parseFecha(inicio);
  const hasta = parseFecha(fin);
  if (!d || !hasta || hasta < d) return 0;
  const festivos = new Map<number, Set<string>>();
  let dias = 0;
  while (d <= hasta) {
    const anio = d.getFullYear();
    if (!festivos.has(anio)) festivos.set(anio, diasFestivos(anio));
    if (d.getDay() !== 0 && !festivos.get(anio)!.has(fechaISO(d))) dias++;
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

/** Prima vacacional: salario diario × días × porcentaje (Art. 80). */
export function calcularPrima(salarioDiario: number, dias: number, porcentaje: number): number {
  return Math.round(salarioDiario * dias * (porcentaje / 100) * 100) / 100;
}

/** Años de servicio cumplidos con sus días: derecho, tomados, pendientes y situación. */
export function periodosDe(empleado: Empleado, vacaciones: Vacacion[], hoy: Date = new Date()): Periodo[] {
  const ingreso = parseFecha(empleado.fecha_ingreso);
  if (!ingreso) return [];
  const hoyISOValor = fechaISO(hoy);
  const propias = vacaciones.filter((v) => v.empleado_id === empleado.id);
  return Array.from({ length: aniosCumplidos(empleado.fecha_ingreso, hoy) }, (_, i) => {
    const anio = i + 1;
    const cumple = sumarAnios(ingreso, anio);
    const limiteOtorgar = fechaISO(sumarMeses(cumple, 6));
    const prescribe = fechaISO(sumarAnios(sumarMeses(cumple, 6), 1));
    const derecho = diasPorAntiguedad(anio);
    const tomados = propias.filter((v) => v.anio_servicio === anio).reduce((acc, v) => acc + v.dias, 0);
    const pendientes = Math.max(derecho - tomados, 0);
    const estado: EstadoPeriodo =
      pendientes === 0 ? "completo"
      : hoyISOValor <= limiteOtorgar ? "vigente"
      : hoyISOValor <= prescribe ? "atrasado"
      : "prescrito";
    return { anio, aniversario: fechaISO(cumple), limiteOtorgar, prescribe, derecho, tomados, pendientes, estado };
  });
}

/**
 * Resumen de un empleado para la tabla principal. Si el empleado ya causó baja, la
 * antigüedad y los periodos se calculan a la fecha de baja.
 */
export function resumenEmpleado(empleado: Empleado, vacaciones: Vacacion[], hoy: Date = new Date()) {
  const baja = parseFecha(empleado.fecha_baja);
  if (baja && baja < hoy) hoy = baja;
  const periodos = periodosDe(empleado, vacaciones, hoy);
  const anios = periodos.length;
  const hoyISOValor = fechaISO(hoy);
  // Días que aún se pueden disfrutar (sin contar los prescritos).
  const pendientes = periodos
    .filter((p) => p.estado === "vigente" || p.estado === "atrasado")
    .reduce((acc, p) => acc + p.pendientes, 0);
  const atrasados = periodos.filter((p) => p.estado === "atrasado");
  const enVacaciones = vacaciones.some(
    (v) => v.empleado_id === empleado.id && v.fecha_inicio <= hoyISOValor && hoyISOValor <= v.fecha_fin
  );
  return {
    periodos,
    anios,
    pendientes,
    atrasados,
    enVacaciones,
    proximoAniversario: aniversario(empleado.fecha_ingreso, anios + 1),
    diasProximoAnio: diasPorAntiguedad(anios + 1),
  };
}

/** Etiqueta y colores de cada situación del periodo. */
export const estadoPeriodoInfo: Record<EstadoPeriodo, { texto: string; clase: string; ayuda: string }> = {
  completo: { texto: "Disfrutadas", clase: "bg-status-completed-bg text-status-completed-text", ayuda: "Ya se otorgaron todos los días" },
  vigente: { texto: "Por otorgar", clase: "bg-status-in-progress-bg text-status-in-progress-text", ayuda: "Dentro de los 6 meses del Art. 81" },
  atrasado: { texto: "Atrasadas", clase: "bg-status-pending-bg text-status-pending-text", ayuda: "Pasaron los 6 meses del Art. 81 sin otorgarse completas" },
  prescrito: { texto: "Prescritas", clase: "bg-secondary text-muted-foreground", ayuda: "Pasó más de un año desde el plazo del Art. 81 (Art. 516)" },
};
