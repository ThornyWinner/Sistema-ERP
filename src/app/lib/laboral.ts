/**
 * laboral.ts — Reglas de la Ley Federal del Trabajo (LFT) y del Art. 123 constitucional
 * para incidencias, terminación de la relación laboral y defensa ante demandas.
 *
 *  - Incidencias: más de 3 faltas injustificadas en 30 días son causal de rescisión
 *    sin responsabilidad para el patrón (Art. 47 fr. X); el patrón tiene un mes para
 *    ejercerla (Art. 517 fr. I). Los retardos no pueden descontarse como multa (Art. 107).
 *  - Finiquito y liquidación: salario pendiente, aguinaldo (Art. 87), vacaciones (Arts. 76
 *    y 79), prima vacacional (Art. 80), prima de antigüedad (Arts. 162 y 486),
 *    indemnización constitucional de 3 meses (Art. 123 A fr. XXII; LFT Arts. 48 y 50)
 *    y 20 días por año (Art. 50 fr. II).
 *  - Riesgos: lo que el patrón debe poder probar (Art. 784) y conservar (Art. 804);
 *    si no lo exhibe, se presumen ciertos los hechos que alegue el trabajador (Art. 805).
 *
 * Los importes son brutos: no se calcula ISR ni otras retenciones.
 * Esta herramienta orienta; los casos reales deben revisarse con un abogado laboral.
 */
import { fechaISO, formatFecha, parseFecha } from "./fechas";
import {
  aniosCumplidos,
  aniversario,
  contarDiasLaborables,
  diasPorAntiguedad,
  periodosDe,
  type Empleado,
  type Vacacion,
} from "./vacaciones";

/** Salario mínimo general diario 2026 (zona general; Saltillo). Actualizar cada enero. */
export const SALARIO_MINIMO_GENERAL = 315.04;
/** Días de aguinaldo por año (Art. 87). */
export const DIAS_AGUINALDO = 15;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type TipoIncidencia =
  | "retardo"
  | "falta_injustificada"
  | "falta_justificada"
  | "incapacidad"
  | "permiso_con_goce"
  | "permiso_sin_goce"
  | "suspension";

export interface Incidencia {
  id: string;
  empleado_id: string;
  tipo: TipoIncidencia;
  fecha_inicio: string;
  fecha_fin: string;
  minutos_retardo: number | null;
  motivo: string | null;
  acta_administrativa: boolean;
}

export type TipoDocumento =
  | "contrato" | "alta_imss" | "identificacion" | "reglamento_interior" | "recibo_nomina"
  | "control_asistencia" | "recibo_vacaciones" | "recibo_aguinaldo" | "recibo_ptu"
  | "acta_administrativa" | "justificante" | "aviso_rescision" | "renuncia"
  | "convenio_terminacion" | "finiquito_firmado" | "otro";

export interface Documento {
  id: string;
  empleado_id: string;
  tipo: TipoDocumento;
  fecha: string;
  descripcion: string | null;
  archivo_path: string | null;
  firmado: boolean;
  incidencia_id: string | null;
  vacacion_id: string | null;
  finiquito_id: string | null;
}

export type CausaTerminacion =
  | "renuncia"
  | "mutuo_acuerdo"
  | "despido_justificado"
  | "despido_injustificado"
  | "rescision_patron";

/** Renglón del desglose de un finiquito o liquidación. */
export interface Concepto {
  clave: string;
  concepto: string;
  fundamento: string;
  dias: number;
  base: number;
  importe: number;
}

export interface Finiquito {
  id: string;
  empleado_id: string;
  fecha_terminacion: string;
  causa: CausaTerminacion;
  salario_diario: number;
  salario_diario_integrado: number;
  conceptos: Concepto[];
  total: number;
  notas: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Catálogos con texto y fundamento
// ---------------------------------------------------------------------------

export const tipoIncidenciaInfo: Record<TipoIncidencia, { texto: string; clase: string; ayuda: string }> = {
  retardo: { texto: "Retardo", clase: "bg-status-in-progress-bg text-status-in-progress-text", ayuda: "No puede descontarse como multa (Art. 107); las medidas deben estar en el Reglamento Interior (Art. 423)." },
  falta_injustificada: { texto: "Falta injustificada", clase: "bg-status-pending-bg text-status-pending-text", ayuda: "No se paga el día. Más de 3 en 30 días es causal de rescisión (Art. 47 fr. X)." },
  falta_justificada: { texto: "Falta justificada", clase: "bg-secondary text-muted-foreground", ayuda: "Con permiso o causa justificada; conserve el justificante." },
  incapacidad: { texto: "Incapacidad", clase: "bg-blue-500/10 text-blue-700 dark:text-blue-300", ayuda: "Suspende la relación sin responsabilidad (Art. 42 fr. II); el IMSS cubre el subsidio." },
  permiso_con_goce: { texto: "Permiso con goce", clase: "bg-secondary text-muted-foreground", ayuda: "Ausencia autorizada pagada." },
  permiso_sin_goce: { texto: "Permiso sin goce", clase: "bg-secondary text-muted-foreground", ayuda: "Ausencia autorizada sin pago; conserve la solicitud firmada." },
  suspension: { texto: "Suspensión", clase: "bg-status-pending-bg text-status-pending-text", ayuda: "Medida disciplinaria de máximo 8 días, oyendo antes al trabajador (Art. 423 fr. X)." },
};

export const tipoDocumentoInfo: Record<TipoDocumento, { texto: string; fundamento: string }> = {
  contrato: { texto: "Contrato individual de trabajo", fundamento: "Arts. 24, 25, 26, 784 fr. VII y 804 fr. I" },
  alta_imss: { texto: "Alta ante el IMSS", fundamento: "Art. 784 fr. XIV" },
  identificacion: { texto: "Identificación oficial", fundamento: "Expediente" },
  reglamento_interior: { texto: "Reglamento Interior firmado de recibido", fundamento: "Arts. 422–425" },
  recibo_nomina: { texto: "Recibo de nómina firmado / CFDI", fundamento: "Arts. 784 fr. XII y 804 fr. II" },
  control_asistencia: { texto: "Control de asistencia", fundamento: "Arts. 784 fr. III y 804 fr. III" },
  recibo_vacaciones: { texto: "Recibo de vacaciones y prima", fundamento: "Arts. 784 fr. X–XI y 804 fr. IV" },
  recibo_aguinaldo: { texto: "Recibo de aguinaldo", fundamento: "Arts. 87 y 784 fr. IX" },
  recibo_ptu: { texto: "Recibo de PTU", fundamento: "Arts. 784 fr. XIII y 804 fr. IV" },
  acta_administrativa: { texto: "Acta administrativa", fundamento: "Art. 784 fr. III–IV" },
  justificante: { texto: "Justificante / incapacidad", fundamento: "Expediente" },
  aviso_rescision: { texto: "Aviso de rescisión", fundamento: "Arts. 47 y 784 fr. VI" },
  renuncia: { texto: "Renuncia firmada", fundamento: "Art. 784 fr. V" },
  convenio_terminacion: { texto: "Convenio ratificado (Centro de Conciliación)", fundamento: "Art. 33" },
  finiquito_firmado: { texto: "Recibo de finiquito firmado", fundamento: "Arts. 33 y 784" },
  otro: { texto: "Otro", fundamento: "" },
};

export const causaInfo: Record<CausaTerminacion, { texto: string; descripcion: string }> = {
  renuncia: { texto: "Renuncia voluntaria", descripcion: "Finiquito. Prima de antigüedad solo con 15 años o más (Art. 162 fr. III)." },
  mutuo_acuerdo: { texto: "Mutuo consentimiento", descripcion: "Finiquito (Art. 53 fr. I). Se trata como separación voluntaria para la prima de antigüedad." },
  despido_justificado: { texto: "Despido justificado (Art. 47)", descripcion: "Finiquito más prima de antigüedad. Requiere aviso de rescisión por escrito." },
  despido_injustificado: { texto: "Despido injustificado", descripcion: "Liquidación: finiquito, prima de antigüedad e indemnización de 3 meses (Art. 123 A fr. XXII)." },
  rescision_patron: { texto: "Rescisión por causa del patrón (Arts. 51–52)", descripcion: "Liquidación con 3 meses y 20 días por año (Arts. 50 y 52)." },
};

// ---------------------------------------------------------------------------
// Utilidades de fechas
// ---------------------------------------------------------------------------

const DIA_MS = 86_400_000;
const diasEntre = (desde: string, hasta: string) =>
  Math.round((parseFecha(hasta)!.getTime() - parseFecha(desde)!.getTime()) / DIA_MS);
const redondear = (n: number) => Math.round(n * 100) / 100;

function sumarMes(fecha: string): string {
  const d = parseFecha(fecha)!;
  const r = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
  if (r.getDate() !== d.getDate()) r.setDate(0);
  return fechaISO(r);
}

/** Días laborables (lun–sáb, sin descansos obligatorios) de una incidencia, como fechas. */
function diasDeIncidencia(i: Incidencia): string[] {
  const dias: string[] = [];
  const d = parseFecha(i.fecha_inicio)!;
  const fin = parseFecha(i.fecha_fin)!;
  while (d <= fin) {
    const iso = fechaISO(d);
    if (contarDiasLaborables(iso, iso) === 1) dias.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

// ---------------------------------------------------------------------------
// Incidencias
// ---------------------------------------------------------------------------

/** Causal de rescisión por faltas: la 4.ª falta dentro de 30 días y el plazo para ejercerla. */
export interface CausalFaltas {
  desde: string;
  hasta: string;
  faltas: number;
  /** Último día para rescindir por esta causa (un mes, Art. 517 fr. I). */
  limite: string;
  vigente: boolean;
}

export function analizarIncidencias(incidencias: Incidencia[], hoy: Date = new Date()) {
  const hoyISO = fechaISO(hoy);
  const hace30 = fechaISO(new Date(hoy.getTime() - 29 * DIA_MS));
  const faltas = [
    ...new Set(incidencias.filter((i) => i.tipo === "falta_injustificada").flatMap(diasDeIncidencia)),
  ].sort();

  // Ventanas de 30 días con más de 3 faltas (Art. 47 fr. X). Se toma la más reciente.
  let causal: CausalFaltas | null = null;
  for (let i = 0; i + 3 < faltas.length; i++) {
    if (diasEntre(faltas[i], faltas[i + 3]) <= 29) {
      let j = i + 3;
      while (j + 1 < faltas.length && diasEntre(faltas[i], faltas[j + 1]) <= 29) j++;
      const limite = sumarMes(faltas[i + 3]);
      causal = { desde: faltas[i], hasta: faltas[j], faltas: j - i + 1, limite, vigente: hoyISO <= limite };
    }
  }

  return {
    faltasUltimos30: faltas.filter((f) => f >= hace30 && f <= hoyISO).length,
    retardosUltimos30: incidencias.filter((i) => i.tipo === "retardo" && i.fecha_inicio >= hace30 && i.fecha_inicio <= hoyISO).length,
    faltasTotales: faltas.length,
    causal,
  };
}

// ---------------------------------------------------------------------------
// Finiquito y liquidación
// ---------------------------------------------------------------------------

export interface ParametrosFiniquito {
  fechaTerminacion: string;
  causa: CausaTerminacion;
  /** Días trabajados que aún no se han pagado (ya sin las faltas injustificadas). */
  diasSalarioPendiente: number;
  /** Si el aguinaldo del año de la terminación ya se pagó. */
  aguinaldoPagado: boolean;
  /** 20 días por año en despido injustificado (si el patrón no reinstala, Arts. 49 y 50 fr. II). */
  incluir20DiasPorAnio: boolean;
}

export function calcularFiniquito(empleado: Empleado, vacaciones: Vacacion[], p: ParametrosFiniquito) {
  const sd = Number(empleado.salario_diario);
  const prima = Number(empleado.porcentaje_prima) / 100;
  const termino = parseFecha(p.fechaTerminacion)!;
  const anios = aniosCumplidos(empleado.fecha_ingreso, termino);
  // Antigüedad con fracción de año (para prima de antigüedad y 20 días por año).
  const antiguedad = redondear((diasEntre(empleado.fecha_ingreso, p.fechaTerminacion) + 1) / 365);

  // Salario diario integrado (Art. 84): salario + parte diaria de aguinaldo y prima vacacional.
  const diasVacAnioEnCurso = diasPorAntiguedad(anios + 1);
  const sdi = redondear(sd * (1 + (DIAS_AGUINALDO + diasVacAnioEnCurso * prima) / 365));

  const conceptos: Concepto[] = [];
  const agregar = (clave: string, concepto: string, fundamento: string, dias: number, base: number) => {
    const d = redondear(dias);
    if (d > 0) conceptos.push({ clave, concepto, fundamento, dias: d, base, importe: redondear(d * base) });
  };

  // 1. Salario devengado pendiente.
  agregar("salario", "Salario devengado pendiente", "Arts. 82–84", p.diasSalarioPendiente, sd);

  // 2. Aguinaldo proporcional al año calendario trabajado.
  if (!p.aguinaldoPagado) {
    const enero = `${termino.getFullYear()}-01-01`;
    const inicio = empleado.fecha_ingreso > enero ? empleado.fecha_ingreso : enero;
    const diasAnio = diasEntre(inicio, p.fechaTerminacion) + 1;
    agregar("aguinaldo", `Aguinaldo proporcional (${diasAnio} días del año)`, "Art. 87", (DIAS_AGUINALDO * diasAnio) / 365, sd);
  }

  // 3. Vacaciones de años cumplidos que no se disfrutaron y no han prescrito.
  const periodos = periodosDe(empleado, vacaciones, termino);
  const vacPendientes = periodos
    .filter((x) => x.estado === "vigente" || x.estado === "atrasado")
    .reduce((acc, x) => acc + x.pendientes, 0);
  const prescritas = periodos.filter((x) => x.estado === "prescrito").reduce((acc, x) => acc + x.pendientes, 0);
  agregar("vacaciones_pendientes", "Vacaciones no disfrutadas", "Arts. 76 y 79", vacPendientes, sd);

  // 4. Vacaciones proporcionales del año de servicio en curso (Art. 79).
  const ultimoAniversario = anios > 0 ? aniversario(empleado.fecha_ingreso, anios) : empleado.fecha_ingreso;
  const diasAnioServicio = Math.min(diasEntre(ultimoAniversario, p.fechaTerminacion) + 1, 365);
  const vacProporcionales = (diasVacAnioEnCurso * diasAnioServicio) / 365;
  agregar("vacaciones_proporcionales", `Vacaciones proporcionales (${diasAnioServicio} días del año de servicio)`, "Art. 79", vacProporcionales, sd);

  // 5. Prima vacacional sobre las vacaciones pagadas.
  const diasVacPagadas = redondear(vacPendientes) + redondear(vacProporcionales);
  agregar("prima_vacacional", `Prima vacacional (${empleado.porcentaje_prima} %)`, "Art. 80", diasVacPagadas * prima, sd);

  // 6. Prima de antigüedad: 12 días por año, con salario topado a 2 salarios mínimos.
  const separacionVoluntaria = p.causa === "renuncia" || p.causa === "mutuo_acuerdo";
  const aplicaPrimaAntiguedad = !separacionVoluntaria || anios >= 15;
  if (aplicaPrimaAntiguedad) {
    const base = Math.min(sd, redondear(2 * SALARIO_MINIMO_GENERAL));
    agregar("prima_antiguedad", "Prima de antigüedad (12 días por año)", "Arts. 162 y 486", 12 * antiguedad, base);
  }

  // 7. Indemnización constitucional: 3 meses de salario integrado.
  const esLiquidacion = p.causa === "despido_injustificado" || p.causa === "rescision_patron";
  if (esLiquidacion) {
    agregar("indemnizacion", "Indemnización constitucional (3 meses)", "Art. 123 A fr. XXII CPEUM; Arts. 48 y 50 fr. III", 90, sdi);
  }

  // 8. 20 días por año de servicio.
  if (p.causa === "rescision_patron" || (p.causa === "despido_injustificado" && p.incluir20DiasPorAnio)) {
    agregar("veinte_dias", "20 días de salario por año de servicio", "Arts. 50 fr. II y 52", 20 * antiguedad, sdi);
  }

  const avisos: string[] = [
    "Importes brutos: no incluyen la retención de ISR.",
    "El convenio o recibo debe ser por escrito, desglosar los conceptos y ratificarse ante el Centro de Conciliación para tener plena validez; no puede implicar renuncia de derechos (Art. 33 LFT; Art. 123 A fr. XXVII CPEUM).",
  ];
  if (prescritas > 0) avisos.push(`${prescritas} días de vacaciones prescritos no se incluyen (Art. 516).`);
  if (separacionVoluntaria && !aplicaPrimaAntiguedad) avisos.push("Sin prima de antigüedad: en separación voluntaria se requieren 15 años de servicio (Art. 162 fr. III).");
  if (p.causa === "despido_justificado") avisos.push("Entregue al trabajador el aviso de rescisión por escrito con la causa y fecha, o notifíquelo por medio del Tribunal dentro de los 5 días hábiles siguientes; sin aviso, el despido se presume injustificado (Art. 47).");
  if (esLiquidacion) avisos.push("Si hay juicio, pueden sumarse salarios vencidos de hasta 12 meses más intereses (Art. 48); no se incluyen aquí.");

  return {
    conceptos,
    total: redondear(conceptos.reduce((acc, c) => acc + c.importe, 0)),
    salarioDiario: sd,
    salarioDiarioIntegrado: sdi,
    anios,
    antiguedad,
    avisos,
  };
}

// ---------------------------------------------------------------------------
// Riesgos ante una demanda (Arts. 784, 804 y 805)
// ---------------------------------------------------------------------------

export interface Riesgo {
  nivel: "alto" | "medio" | "info";
  titulo: string;
  detalle: string;
  fundamento: string;
}

const PRESUNCION = "Si no se exhibe, se presumen ciertos los hechos que alegue el trabajador (Art. 805).";

export function evaluarRiesgos(
  empleado: Empleado,
  datos: { vacaciones: Vacacion[]; incidencias: Incidencia[]; documentos: Documento[]; finiquitos: Finiquito[] },
  hoy: Date = new Date()
): Riesgo[] {
  const docs = datos.documentos.filter((d) => d.empleado_id === empleado.id);
  const tiene = (tipo: TipoDocumento, firmado = false) => docs.some((d) => d.tipo === tipo && (!firmado || d.firmado));
  const incid = datos.incidencias.filter((i) => i.empleado_id === empleado.id);
  const vacs = datos.vacaciones.filter((v) => v.empleado_id === empleado.id);
  const riesgos: Riesgo[] = [];

  if (!tiene("contrato", true)) {
    riesgos.push({ nivel: "alto", titulo: "Sin contrato firmado", fundamento: "Arts. 24, 26, 784 fr. VII y 804 fr. I",
      detalle: "La falta del contrato escrito es imputable al patrón: se presumen ciertas las condiciones de trabajo (salario, jornada, puesto) que alegue el trabajador." });
  }
  if (!tiene("alta_imss")) {
    riesgos.push({ nivel: "alto", titulo: "Sin comprobante de alta en el IMSS", fundamento: "Art. 784 fr. XIV", detalle: PRESUNCION });
  }
  if (!tiene("recibo_nomina")) {
    riesgos.push({ nivel: "medio", titulo: "Sin recibos de nómina en el expediente", fundamento: "Arts. 784 fr. XII y 804 fr. II",
      detalle: `El patrón debe probar el monto y pago del salario. ${PRESUNCION}` });
  }
  const vacSinRecibo = vacs.filter((v) => !docs.some((d) => d.vacacion_id === v.id && d.tipo === "recibo_vacaciones" && d.firmado));
  if (vacSinRecibo.length) {
    riesgos.push({ nivel: "medio", titulo: `${vacSinRecibo.length} periodo(s) de vacaciones sin recibo firmado`, fundamento: "Arts. 784 fr. X–XI y 804 fr. IV",
      detalle: `El patrón debe probar el disfrute y pago de vacaciones y prima vacacional. ${PRESUNCION}` });
  }
  const faltasSinActa = incid.filter((i) => i.tipo === "falta_injustificada" && !i.acta_administrativa && !docs.some((d) => d.incidencia_id === i.id));
  if (faltasSinActa.length) {
    riesgos.push({ nivel: "medio", titulo: `${faltasSinActa.length} falta(s) injustificada(s) sin acta ni documento`, fundamento: "Art. 784 fr. III",
      detalle: "Las faltas de asistencia las prueba el patrón; sin acta administrativa o control de asistencia es difícil sostener un descuento o una rescisión." });
  }
  if (incid.length && !tiene("control_asistencia")) {
    riesgos.push({ nivel: "medio", titulo: "Sin control de asistencia en el expediente", fundamento: "Arts. 784 fr. III y 804 fr. III",
      detalle: "Hay incidencias registradas; conserve las listas o registros de asistencia que las respaldan." });
  }
  // Aguinaldo del año anterior (si trabajó en él).
  const anioAnterior = hoy.getFullYear() - 1;
  if (empleado.fecha_ingreso <= `${anioAnterior}-12-20` && !docs.some((d) => d.tipo === "recibo_aguinaldo" && d.fecha >= `${anioAnterior}-12-01`)) {
    riesgos.push({ nivel: "medio", titulo: `Sin recibo de aguinaldo ${anioAnterior}`, fundamento: "Arts. 87 y 784 fr. IX", detalle: PRESUNCION });
  }

  // Terminación de la relación laboral.
  if (empleado.fecha_baja) {
    if (empleado.causa_baja === "despido_justificado" && !tiene("aviso_rescision")) {
      riesgos.push({ nivel: "alto", titulo: "Despido sin aviso de rescisión", fundamento: "Arts. 47 y 784 fr. VI",
        detalle: "La falta de aviso por escrito al trabajador o por medio del Tribunal presume que el despido fue injustificado." });
    }
    if (empleado.causa_baja === "renuncia" && !tiene("renuncia", true)) {
      riesgos.push({ nivel: "alto", titulo: "Renuncia sin documento firmado", fundamento: "Art. 784 fr. V",
        detalle: "Sin la renuncia firmada, el trabajador puede alegar que fue despedido." });
    }
    if (!tiene("finiquito_firmado", true) && !tiene("convenio_terminacion", true)) {
      riesgos.push({ nivel: "alto", titulo: "Sin finiquito o convenio firmado", fundamento: "Arts. 33 y 784",
        detalle: "Sin constancia firmada del pago, la empresa no puede acreditar que liquidó lo que debía." });
    }
    if (!datos.finiquitos.some((f) => f.empleado_id === empleado.id)) {
      riesgos.push({ nivel: "medio", titulo: "Baja sin cálculo de finiquito registrado", fundamento: "Arts. 79, 87 y 162", detalle: "Registre el cálculo en la pestaña Terminación." });
    }
    const conservar = parseFecha(empleado.fecha_baja)!;
    conservar.setFullYear(conservar.getFullYear() + 1);
    riesgos.push({ nivel: "info", titulo: `Conservar el expediente al menos hasta el ${formatFecha(fechaISO(conservar))}`, fundamento: "Art. 804",
      detalle: "Contrato, nóminas, controles de asistencia y comprobantes de pago se conservan durante la relación y un año después." });
  }
  return riesgos;
}
