/**
 * activoFijo.ts — Tipos y depreciación del activo fijo (ver sql/activo_fijo.sql).
 *
 * Depreciación en línea recta, como la deducción de inversiones de la Ley del ISR:
 *  - Base       = costo de adquisición − valor residual (fiscalmente el residual es 0).
 *  - Mensual    = base × tasa anual ÷ 12.
 *  - Empieza el mes SIGUIENTE al inicio de uso (o a la compra si no hay fecha de uso).
 *  - Termina al depreciarse toda la base o el mes anterior a la baja.
 * Se calcula en centavos: acumulada = round(base × tasa × meses ÷ 12), sin rebasar la base.
 */

export type EstadoActivo = "activo" | "mantenimiento" | "baja";
export type MotivoBaja = "venta" | "desecho" | "robo" | "donacion" | "otro";

export interface CategoriaActivo {
  id: string;
  nombre: string;
  tasa_depreciacion: number;
  fundamento: string | null;
}

export interface Activo {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  categoria_id: string;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  sede_id: string | null;
  ubicacion: string | null;
  responsable_id: string | null;
  proveedor_id: string | null;
  factura_compra: string | null;
  fecha_adquisicion: string;
  fecha_inicio_uso: string | null;
  costo_adquisicion: number;
  valor_residual: number;
  tasa_depreciacion: number;
  estado: EstadoActivo;
  fecha_baja: string | null;
  motivo_baja: MotivoBaja | null;
  valor_baja: number | null;
  notas: string | null;
}

export interface Mantenimiento {
  id: string;
  activo_id: string;
  fecha: string;
  tipo: "preventivo" | "correctivo";
  descripcion: string;
  costo: number;
  realizado_por: string | null;
  proximo: string | null;
}

export const ESTADO_ACTIVO: Record<EstadoActivo, { label: string; clase: string }> = {
  activo: { label: "En uso", clase: "bg-status-completed-bg text-status-completed-text" },
  mantenimiento: { label: "En mantenimiento", clase: "bg-status-in-progress-bg text-status-in-progress-text" },
  baja: { label: "Dado de baja", clase: "bg-secondary text-muted-foreground" },
};

export const MOTIVO_BAJA: Record<MotivoBaja, string> = {
  venta: "Venta",
  desecho: "Desecho / obsolescencia",
  robo: "Robo o extravío",
  donacion: "Donación",
  otro: "Otro",
};

/** Número de mes absoluto (año × 12 + mes) de una fecha "AAAA-MM-DD". */
const mesAbs = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return y * 12 + (m - 1);
};
const aCentavos = (n: number) => Math.round((Number(n) || 0) * 100);

export type DatosDepreciacion = Pick<
  Activo,
  "costo_adquisicion" | "valor_residual" | "tasa_depreciacion" | "fecha_adquisicion" | "fecha_inicio_uso" | "fecha_baja"
>;

/** Meses depreciados hasta el mes de `hasta` (incluido), considerando la baja. */
export function mesesDepreciados(a: DatosDepreciacion, hasta: string): number {
  const inicio = mesAbs(a.fecha_inicio_uso || a.fecha_adquisicion) + 1;
  let fin = mesAbs(hasta);
  if (a.fecha_baja) fin = Math.min(fin, mesAbs(a.fecha_baja) - 1);
  return Math.max(fin - inicio + 1, 0);
}

export interface ResultadoDepreciacion {
  base: number;
  mensual: number;
  meses: number;
  acumulada: number;
  valorLibros: number;
  /** Porcentaje ya depreciado de la base (0–100). */
  porcentaje: number;
  totalmenteDepreciado: boolean;
  /** Meses totales que dura la depreciación (null si la tasa es 0). */
  vidaUtilMeses: number | null;
}

/** Tasa en diezmilésimos (0.11 → 1100), como numeric(5,4) en la BD. */
const tasaEntera = (t: number) => Math.round((Number(t) || 0) * 10000);
/** Meses que tarda en depreciarse toda la base: ⌈12 ÷ tasa⌉ (null si la tasa es 0). */
const vidaUtil = (t: number) => {
  const te = tasaEntera(t);
  return te > 0 ? Math.ceil(120000 / te) : null;
};

export function calcularDepreciacion(a: DatosDepreciacion, hasta: string): ResultadoDepreciacion {
  const costo = aCentavos(a.costo_adquisicion);
  const base = Math.max(costo - aCentavos(a.valor_residual), 0);
  const tasa = tasaEntera(a.tasa_depreciacion);
  const vidaUtilMeses = vidaUtil(a.tasa_depreciacion);
  // Pasada la vida útil ya no hay meses que depreciar.
  const meses = Math.min(mesesDepreciados(a, hasta), vidaUtilMeses ?? 0);
  const acumulada = Math.min(base, Math.round((base * tasa * meses) / 120000));
  return {
    base: base / 100,
    mensual: Math.round((base * tasa) / 120000) / 100,
    meses,
    acumulada: acumulada / 100,
    valorLibros: (costo - acumulada) / 100,
    porcentaje: base > 0 ? Math.round((acumulada / base) * 1000) / 10 : 0,
    totalmenteDepreciado: base > 0 && acumulada >= base,
    vidaUtilMeses,
  };
}

export interface RenglonDepreciacion {
  anio: number;
  meses: number;
  depreciacion: number;
  acumulada: number;
  valorLibros: number;
  /** true si el año aún no termina (cifra proyectada). */
  proyectado: boolean;
}

/** Tabla de depreciación por año, desde el primer año depreciado hasta agotar la base. */
export function tablaDepreciacion(a: DatosDepreciacion, hoy: string): RenglonDepreciacion[] {
  if (tasaEntera(a.tasa_depreciacion) <= 0) return [];
  const inicioAbs = mesAbs(a.fecha_inicio_uso || a.fecha_adquisicion) + 1;
  const anioInicio = Math.floor(inicioAbs / 12);
  const anioHoy = Number(hoy.slice(0, 4));
  const filas: RenglonDepreciacion[] = [];
  let previa = 0;
  let mesesPrevios = 0;
  for (let anio = anioInicio; anio < anioInicio + 60; anio++) {
    const r = calcularDepreciacion(a, `${anio}-12-01`);
    const meses = r.meses - mesesPrevios;
    mesesPrevios = r.meses;
    if (meses <= 0) break;
    filas.push({
      anio,
      meses,
      depreciacion: Math.round((r.acumulada - previa) * 100) / 100,
      acumulada: r.acumulada,
      valorLibros: r.valorLibros,
      proyectado: anio >= anioHoy,
    });
    previa = r.acumulada;
    if (r.totalmenteDepreciado) break;
  }
  return filas;
}

export const formatPesos = (n: number) =>
  `$${Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatTasa = (t: number) => `${Math.round(Number(t) * 10000) / 100} %`;
