/**
 * sat.ts — Catálogos del SAT para CFDI 4.0 que usa la facturación.
 *
 * Son los catálogos cortos completos (régimen, uso de CFDI, forma de pago…). Los
 * catálogos enormes (c_ClaveProdServ, ~50 000 claves; c_ClaveUnidad, ~2 000) no se
 * incluyen enteros: se sugieren las claves que la empresa ya usaba en CONTPAQi Vende y
 * se puede escribir cualquier otra clave válida.
 */

export interface OpcionSat {
  clave: string;
  descripcion: string;
}

/** "612 - Personas Físicas con…" */
export const etiquetaSat = (o: OpcionSat) => `${o.clave} - ${o.descripcion}`;

/** Descripción de una clave dentro de un catálogo (o la clave sola si no está). */
export function describirSat(catalogo: OpcionSat[], clave?: string | null): string {
  if (!clave) return "";
  const o = catalogo.find((x) => x.clave === clave);
  return o ? etiquetaSat(o) : clave;
}

export const REGIMENES_FISCALES: OpcionSat[] = [
  { clave: "601", descripcion: "General de Ley Personas Morales" },
  { clave: "603", descripcion: "Personas Morales con Fines no Lucrativos" },
  { clave: "605", descripcion: "Sueldos y Salarios e Ingresos Asimilados a Salarios" },
  { clave: "606", descripcion: "Arrendamiento" },
  { clave: "607", descripcion: "Régimen de Enajenación o Adquisición de Bienes" },
  { clave: "608", descripcion: "Demás ingresos" },
  { clave: "610", descripcion: "Residentes en el Extranjero sin Establecimiento Permanente en México" },
  { clave: "611", descripcion: "Ingresos por Dividendos (socios y accionistas)" },
  { clave: "612", descripcion: "Personas Físicas con Actividades Empresariales y Profesionales" },
  { clave: "614", descripcion: "Ingresos por intereses" },
  { clave: "615", descripcion: "Régimen de los ingresos por obtención de premios" },
  { clave: "616", descripcion: "Sin obligaciones fiscales" },
  { clave: "620", descripcion: "Sociedades Cooperativas de Producción que optan por diferir sus ingresos" },
  { clave: "621", descripcion: "Incorporación Fiscal" },
  { clave: "622", descripcion: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras" },
  { clave: "623", descripcion: "Opcional para Grupos de Sociedades" },
  { clave: "624", descripcion: "Coordinados" },
  { clave: "625", descripcion: "Actividades Empresariales con ingresos a través de Plataformas Tecnológicas" },
  { clave: "626", descripcion: "Régimen Simplificado de Confianza" },
];

export const USOS_CFDI: OpcionSat[] = [
  { clave: "G01", descripcion: "Adquisición de mercancías" },
  { clave: "G02", descripcion: "Devoluciones, descuentos o bonificaciones" },
  { clave: "G03", descripcion: "Gastos en general" },
  { clave: "I01", descripcion: "Construcciones" },
  { clave: "I02", descripcion: "Mobiliario y equipo de oficina por inversiones" },
  { clave: "I03", descripcion: "Equipo de transporte" },
  { clave: "I04", descripcion: "Equipo de cómputo y accesorios" },
  { clave: "I05", descripcion: "Dados, troqueles, moldes, matrices y herramental" },
  { clave: "I06", descripcion: "Comunicaciones telefónicas" },
  { clave: "I07", descripcion: "Comunicaciones satelitales" },
  { clave: "I08", descripcion: "Otra maquinaria y equipo" },
  { clave: "D01", descripcion: "Honorarios médicos, dentales y gastos hospitalarios" },
  { clave: "D02", descripcion: "Gastos médicos por incapacidad o discapacidad" },
  { clave: "D03", descripcion: "Gastos funerales" },
  { clave: "D04", descripcion: "Donativos" },
  { clave: "D05", descripcion: "Intereses reales pagados por créditos hipotecarios (casa habitación)" },
  { clave: "D06", descripcion: "Aportaciones voluntarias al SAR" },
  { clave: "D07", descripcion: "Primas por seguros de gastos médicos" },
  { clave: "D08", descripcion: "Gastos de transportación escolar obligatoria" },
  { clave: "D09", descripcion: "Depósitos en cuentas para el ahorro, primas de pensiones" },
  { clave: "D10", descripcion: "Pagos por servicios educativos (colegiaturas)" },
  { clave: "S01", descripcion: "Sin efectos fiscales" },
  { clave: "CP01", descripcion: "Pagos" },
  { clave: "CN01", descripcion: "Nómina" },
];

export const FORMAS_PAGO: OpcionSat[] = [
  { clave: "01", descripcion: "Efectivo" },
  { clave: "02", descripcion: "Cheque nominativo" },
  { clave: "03", descripcion: "Transferencia electrónica de fondos" },
  { clave: "04", descripcion: "Tarjeta de crédito" },
  { clave: "05", descripcion: "Monedero electrónico" },
  { clave: "06", descripcion: "Dinero electrónico" },
  { clave: "08", descripcion: "Vales de despensa" },
  { clave: "12", descripcion: "Dación en pago" },
  { clave: "13", descripcion: "Pago por subrogación" },
  { clave: "14", descripcion: "Pago por consignación" },
  { clave: "15", descripcion: "Condonación" },
  { clave: "17", descripcion: "Compensación" },
  { clave: "23", descripcion: "Novación" },
  { clave: "24", descripcion: "Confusión" },
  { clave: "25", descripcion: "Remisión de deuda" },
  { clave: "26", descripcion: "Prescripción o caducidad" },
  { clave: "27", descripcion: "A satisfacción del acreedor" },
  { clave: "28", descripcion: "Tarjeta de débito" },
  { clave: "29", descripcion: "Tarjeta de servicios" },
  { clave: "30", descripcion: "Aplicación de anticipos" },
  { clave: "31", descripcion: "Intermediario pagos" },
  { clave: "99", descripcion: "Por definir" },
];

export const METODOS_PAGO: OpcionSat[] = [
  { clave: "PUE", descripcion: "Pago en una sola exhibición" },
  { clave: "PPD", descripcion: "Pago en parcialidades o diferido" },
];

export const OBJETOS_IMPUESTO: OpcionSat[] = [
  { clave: "01", descripcion: "No objeto de impuesto" },
  { clave: "02", descripcion: "Sí objeto de impuesto" },
  { clave: "03", descripcion: "Sí objeto del impuesto y no obligado al desglose" },
  { clave: "04", descripcion: "Sí objeto del impuesto y no causa impuesto" },
  { clave: "05", descripcion: "Sí objeto del impuesto, IVA crédito PODEBI" },
];

export const EXPORTACIONES: OpcionSat[] = [
  { clave: "01", descripcion: "No aplica" },
  { clave: "02", descripcion: "Definitiva con clave A1" },
  { clave: "03", descripcion: "Temporal" },
  { clave: "04", descripcion: "Definitiva con clave distinta a A1" },
];

export const TIPOS_RELACION: OpcionSat[] = [
  { clave: "01", descripcion: "Nota de crédito de los documentos relacionados" },
  { clave: "02", descripcion: "Nota de débito de los documentos relacionados" },
  { clave: "03", descripcion: "Devolución de mercancía sobre facturas o traslados previos" },
  { clave: "04", descripcion: "Sustitución de los CFDI previos" },
  { clave: "05", descripcion: "Traslados de mercancías facturados previamente" },
  { clave: "06", descripcion: "Factura generada por los traslados previos" },
  { clave: "07", descripcion: "CFDI por aplicación de anticipo" },
];

export const PERIODICIDADES: OpcionSat[] = [
  { clave: "01", descripcion: "Diario" },
  { clave: "02", descripcion: "Semanal" },
  { clave: "03", descripcion: "Quincenal" },
  { clave: "04", descripcion: "Mensual" },
  { clave: "05", descripcion: "Bimestral" },
];

export const MESES_GLOBAL: OpcionSat[] = [
  { clave: "01", descripcion: "Enero" },
  { clave: "02", descripcion: "Febrero" },
  { clave: "03", descripcion: "Marzo" },
  { clave: "04", descripcion: "Abril" },
  { clave: "05", descripcion: "Mayo" },
  { clave: "06", descripcion: "Junio" },
  { clave: "07", descripcion: "Julio" },
  { clave: "08", descripcion: "Agosto" },
  { clave: "09", descripcion: "Septiembre" },
  { clave: "10", descripcion: "Octubre" },
  { clave: "11", descripcion: "Noviembre" },
  { clave: "12", descripcion: "Diciembre" },
  { clave: "13", descripcion: "Enero-Febrero" },
  { clave: "14", descripcion: "Marzo-Abril" },
  { clave: "15", descripcion: "Mayo-Junio" },
  { clave: "16", descripcion: "Julio-Agosto" },
  { clave: "17", descripcion: "Septiembre-Octubre" },
  { clave: "18", descripcion: "Noviembre-Diciembre" },
];

export const MONEDAS: OpcionSat[] = [
  { clave: "MXN", descripcion: "Peso Mexicano" },
  { clave: "USD", descripcion: "Dólar americano" },
];

/** Unidades de medida más comunes (c_ClaveUnidad). */
export const CLAVES_UNIDAD: OpcionSat[] = [
  { clave: "H87", descripcion: "Pieza" },
  { clave: "E48", descripcion: "Unidad de servicio" },
  { clave: "ACT", descripcion: "Actividad" },
  { clave: "PR", descripcion: "Par" },
  { clave: "SET", descripcion: "Conjunto" },
  { clave: "XBX", descripcion: "Caja" },
  { clave: "XPK", descripcion: "Paquete" },
  { clave: "KGM", descripcion: "Kilogramo" },
  { clave: "MTR", descripcion: "Metro" },
  { clave: "LTR", descripcion: "Litro" },
];

/**
 * Claves de producto o servicio (c_ClaveProdServ) que la empresa usaba en su catálogo de
 * CONTPAQi Vende, con los productos a los que se aplicaban (no es la descripción oficial
 * del SAT: confírmala en el catálogo del SAT si dudas).
 */
export const CLAVES_PROD_SERV: OpcionSat[] = [
  { clave: "53102700", descripcion: "Uniformes: playeras polo, camisolas, camisas" },
  { clave: "53102710", descripcion: "Camisa ejecutiva con bordado" },
  { clave: "53101502", descripcion: "Pantalón de mezclilla" },
  { clave: "53101604", descripcion: "Playera tipo polo dama" },
  { clave: "53101800", descripcion: "Chamarra de neopreno" },
  { clave: "53101802", descripcion: "Playera polo / chamarra de neopreno" },
  { clave: "53101804", descripcion: "Gorras con bordado / chamarra de alta visibilidad" },
  { clave: "53102502", descripcion: "Corbatas con bordado" },
  { clave: "53102503", descripcion: "Sombrero con protección para el sol" },
  { clave: "53102512", descripcion: "Paliacate estampado" },
  { clave: "53102516", descripcion: "Gorras con bordado" },
  { clave: "46181501", descripcion: "Mandil" },
  { clave: "46181503", descripcion: "Overoles de gabardina" },
  { clave: "46181507", descripcion: "Chalecos de seguridad" },
  { clave: "46181533", descripcion: "Batas de gabardina" },
  { clave: "46181546", descripcion: "Impermeable" },
  { clave: "46181605", descripcion: "Zapatos de seguridad" },
  { clave: "46181802", descripcion: "Lentes de seguridad" },
  { clave: "42211509", descripcion: "Cascos de seguridad" },
  { clave: "26142310", descripcion: "Guante anticorte" },
  { clave: "76122406", descripcion: "Equipo de protección personal" },
  { clave: "73141715", descripcion: "Bordados (servicio)" },
  { clave: "53141600", descripcion: "Servicios de corte y costura" },
  { clave: "82121503", descripcion: "Servicio de digitalización" },
  { clave: "82121505", descripcion: "Termos con grabado" },
  { clave: "82121701", descripcion: "Copias" },
  { clave: "82101500", descripcion: "Banderas de publicidad" },
  { clave: "80141605", descripcion: "Artículos promocionales" },
  { clave: "49101602", descripcion: "Souvenirs" },
  { clave: "52121505", descripcion: "Almohada individual" },
  { clave: "52121509", descripcion: "Sábana individual" },
  { clave: "52121512", descripcion: "Fundas para almohada" },
  { clave: "52121513", descripcion: "Cobertor individual" },
  { clave: "56101508", descripcion: "Colchones" },
];

/** RFC genérico para ventas al público en general (factura global). */
export const RFC_PUBLICO_GENERAL = "XAXX010101000";

export const RFC_REGEX = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
export const CP_REGEX = /^[0-9]{5}$/;
