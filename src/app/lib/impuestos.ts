/**
 * impuestos.ts — Importes de una orden con IVA, calculados igual que la base de datos
 * (private.recalcular_totales_orden, sql/iva_ordenes.sql) y que el CFDI 4.0.
 *
 * Los precios del catálogo y de las partidas son ANTES de IVA:
 *   importe de la partida = round(cantidad × precio, 2)
 *   descuento de la orden  = se reparte entre las partidas según su importe; la de
 *                            mayor importe absorbe el redondeo (igual que la BD)
 *   IVA de la partida      = round((importe − descuento) × tasa, 2)
 *   total                  = subtotal − descuento + Σ IVA
 *
 * Se calcula en centavos enteros para redondear exactamente como Postgres (mitad hacia
 * arriba) y no como el punto flotante del navegador. La BD es la fuente de verdad
 * (recalcula al guardar); esto sirve para mostrar en los formularios el mismo total
 * que quedará guardado, al centavo.
 */

/** Tasa general de IVA trasladado (16 %). */
export const TASA_IVA = 0.16;

export interface LineaImporte {
  cantidad: number;
  precioUnitario: number;
  /** Tasa de IVA de la partida; por omisión la general (0.16). */
  tasaIva?: number;
}

export interface Importes {
  subtotal: number;
  descuento: number;
  iva: number;
  total: number;
}

const aCentavos = (pesos: number) => Math.round((Number(pesos) || 0) * 100);
const aPesos = (centavos: number) => centavos / 100;
/** round(a / b) con enteros no negativos, mitad hacia arriba (como Postgres). */
const dividirRedondeando = (a: number, b: number) => Math.floor((2 * a + b) / (2 * b));

export function calcularImportes(lineas: LineaImporte[], descuento = 0): Importes {
  const partidas = lineas
    .map((l) => ({
      // Cantidad entera × precio en centavos = importe exacto en centavos.
      importe: Math.max(0, Math.round(Number(l.cantidad) || 0) * aCentavos(l.precioUnitario)),
      // Tasa en diezmilésimos (0.16 → 1600), como numeric(5,4) en la BD.
      tasa: Math.round((l.tasaIva ?? TASA_IVA) * 10000),
    }))
    // Mismo orden que la BD: de mayor a menor importe y tasa.
    .sort((a, b) => b.importe - a.importe || b.tasa - a.tasa);

  const subtotal = partidas.reduce((s, p) => s + p.importe, 0);
  const desc = Math.min(Math.max(aCentavos(descuento), 0), subtotal);

  let resto = desc;
  let iva = 0;
  partidas.slice(1).forEach(({ importe, tasa }) => {
    const d = subtotal > 0 ? dividirRedondeando(desc * importe, subtotal) : 0;
    resto -= d;
    iva += dividirRedondeando((importe - d) * tasa, 10000);
  });
  if (partidas.length > 0) {
    iva += dividirRedondeando((partidas[0].importe - resto) * partidas[0].tasa, 10000);
  }

  return {
    subtotal: aPesos(subtotal),
    descuento: aPesos(desc),
    iva: aPesos(iva),
    total: aPesos(subtotal - desc + iva),
  };
}
