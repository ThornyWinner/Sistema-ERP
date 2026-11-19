/**
 * proveedoresCuentas.ts — Cuentas bancarias de los proveedores (sql/proveedores_cuentas.sql).
 *
 * A dónde se le transfiere a cada proveedor cuando surte insumos: CLABE (18 dígitos con
 * dígito verificador), tarjeta (15-16 dígitos con Luhn) o número de cuenta. La BD aplica
 * las mismas validaciones; aquí se adelantan para avisar mientras se escribe.
 *
 * Solo los administradores las ven (el primario da de alta, corrige y borra).
 */
import { supabase } from "./supabase";

export type TipoCuenta = "clabe" | "tarjeta" | "cuenta";

export const TIPO_CUENTA: Record<TipoCuenta, string> = {
  clabe: "CLABE interbancaria",
  tarjeta: "Tarjeta",
  cuenta: "Número de cuenta",
};

export interface CuentaProveedor {
  id: string;
  proveedorId: string;
  tipo: TipoCuenta;
  numero: string;
  banco?: string;
  titular?: string;
  principal: boolean;
  notas?: string;
}

export type CuentaCaptura = Omit<CuentaProveedor, "id" | "proveedorId">;

export const cuentaVacia = (): CuentaCaptura => ({
  tipo: "clabe",
  numero: "",
  banco: "",
  titular: "",
  principal: false,
  notas: "",
});

/** Bancos por los 3 primeros dígitos de la CLABE (los más comunes). */
const BANCOS_CLABE: Record<string, string> = {
  "002": "Banamex",
  "006": "Bancomext",
  "009": "Banobras",
  "012": "BBVA México",
  "014": "Santander",
  "019": "Banjército",
  "021": "HSBC",
  "030": "BanBajío",
  "036": "Inbursa",
  "042": "Mifel",
  "044": "Scotiabank",
  "058": "Banregio",
  "059": "Invex",
  "060": "Bansi",
  "062": "Afirme",
  "072": "Banorte",
  "106": "Bank of America",
  "112": "Bmonex",
  "127": "Banco Azteca",
  "130": "Compartamos",
  "137": "BanCoppel",
  "140": "Consubanco",
  "145": "Banco Base",
  "166": "Banco del Bienestar",
  "638": "Nu México",
  "646": "STP",
  "722": "Mercado Pago",
};

export const soloDigitos = (s: string) => s.replace(/\D/g, "");

/** Banco que corresponde a una CLABE (por sus 3 primeros dígitos). */
export function bancoDeClabe(clabe: string): string | undefined {
  const d = soloDigitos(clabe);
  return d.length >= 3 ? BANCOS_CLABE[d.slice(0, 3)] : undefined;
}

/** Dígito verificador de la CLABE: pesos 3-7-1 sobre los primeros 17 dígitos. */
export function clabeValida(clabe: string): boolean {
  const d = soloDigitos(clabe);
  if (d.length !== 18) return false;
  const pesos = [3, 7, 1];
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += (Number(d[i]) * pesos[i % 3]) % 10;
  return (10 - (suma % 10)) % 10 === Number(d[17]);
}

/** Algoritmo de Luhn (números de tarjeta). */
export function luhnValido(numero: string): boolean {
  const d = soloDigitos(numero);
  if (!d) return false;
  let suma = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    suma += n;
  }
  return suma % 10 === 0;
}

/** Mensaje de error del número (null si es válido). */
export function validarNumeroCuenta(tipo: TipoCuenta, numero: string): string | null {
  const d = soloDigitos(numero);
  if (!d) return "Escribe el número";
  switch (tipo) {
    case "clabe":
      if (d.length !== 18) return `La CLABE lleva 18 dígitos (llevas ${d.length})`;
      return clabeValida(d) ? null : "La CLABE no es válida: revisa los dígitos (el último es de verificación)";
    case "tarjeta":
      if (d.length < 15 || d.length > 16) return `La tarjeta lleva 16 dígitos (llevas ${d.length})`;
      return luhnValido(d) ? null : "El número de tarjeta no es válido: revisa los dígitos";
    case "cuenta":
      return d.length < 8 || d.length > 20 ? "El número de cuenta lleva de 8 a 20 dígitos" : null;
  }
}

/** «0021 8000 0118 3597 19» / «4111 1111 1111 1111». */
export function formatoNumero(numero: string): string {
  return soloDigitos(numero).replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** «•••• 5719»: para mostrar sin exponer el número completo. */
export const numeroOculto = (numero: string) => `•••• ${soloDigitos(numero).slice(-4)}`;

const mapCuenta = (r: any): CuentaProveedor => ({
  id: r.id,
  proveedorId: r.proveedor_id,
  tipo: r.tipo,
  numero: r.numero,
  banco: r.banco ?? undefined,
  titular: r.titular ?? undefined,
  principal: !!r.principal,
  notas: r.notas ?? undefined,
});

const COLUMNAS = "id,proveedor_id,tipo,numero,banco,titular,principal,notas";

/** Cuentas de todos los proveedores (o de uno), la principal primero. */
export async function cargarCuentasProveedores(proveedorId?: string): Promise<CuentaProveedor[]> {
  let q = supabase.from("proveedores_cuentas").select(COLUMNAS);
  if (proveedorId) q = q.eq("proveedor_id", proveedorId);
  const { data, error } = await q.order("principal", { ascending: false }).order("created_at");
  if (error) throw error;
  return (data ?? []).map(mapCuenta);
}

const filaCuenta = (c: CuentaCaptura) => ({
  tipo: c.tipo,
  numero: soloDigitos(c.numero),
  banco: c.banco?.trim() || null,
  titular: c.titular?.trim() || null,
  principal: c.principal,
  notas: c.notas?.trim() || null,
});

export async function guardarCuentaProveedor(proveedorId: string, c: CuentaCaptura, id?: string) {
  const { error } = id
    ? await supabase.from("proveedores_cuentas").update(filaCuenta(c)).eq("id", id)
    : await supabase.from("proveedores_cuentas").insert({ proveedor_id: proveedorId, ...filaCuenta(c) });
  if (error) {
    if (error.code === "23505") throw new Error("Ese número ya está registrado para este proveedor");
    if (error.code === "23514") throw new Error("El número no es válido para el tipo elegido");
    throw error;
  }
}

export async function eliminarCuentaProveedor(id: string) {
  const { error } = await supabase.from("proveedores_cuentas").delete().eq("id", id);
  if (error) throw error;
}

/** Texto para copiar y pegar en la banca en línea. */
export function textoCuenta(c: CuentaProveedor, proveedor: string): string {
  return [
    `${TIPO_CUENTA[c.tipo]}: ${c.numero}`,
    c.banco && `Banco: ${c.banco}`,
    `Titular: ${c.titular || proveedor}`,
  ]
    .filter(Boolean)
    .join("\n");
}
