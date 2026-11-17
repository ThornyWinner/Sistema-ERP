/**
 * politicasVenta.ts — Límite de crédito por cliente y tope de descuento (sql/politicas_venta.sql).
 *
 * La base de datos hace cumplir las reglas (triggers en `ordenes`); aquí se replican
 * para avisar en el formulario ANTES de guardar:
 *  - Descuento: máximo `descuento_max_pct` % del subtotal (10 % por omisión).
 *  - Crédito: método "Crédito" solo con límite de crédito > 0; si el cliente tiene
 *    límite, lo que debe + el saldo de la orden no puede pasarlo, ni puede dejar saldo
 *    nuevo si tiene saldos vencidos (más días que sus días de crédito).
 * El administrador primario está exento (es quien autoriza): a él solo se le avisa.
 */
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { formatMonto } from "./pagos";
import { useAuth } from "../context/AuthContext";
import type { MetodoPago } from "../data/mockData";

export const DESCUENTO_MAX_PCT_DEFECTO = 10;

export interface CreditoCliente {
  clienteId: string;
  limite: number | null;
  dias: number | null;
  /** Lo que ya debe en todas sus órdenes (de cualquier vendedor), sin la orden actual. */
  saldo: number;
  saldoVencido: number;
  foliosVencidos: string[];
}

/** Tope de descuento vigente, en % del subtotal. */
export async function obtenerDescuentoMaximo(): Promise<number> {
  const { data } = await supabase.from("politicas_venta").select("descuento_max_pct").maybeSingle();
  return data ? Number(data.descuento_max_pct) : DESCUENTO_MAX_PCT_DEFECTO;
}

/** Cambia el tope de descuento (solo el administrador primario; la RLS lo verifica). */
export async function guardarDescuentoMaximo(pct: number, usuarioId?: string) {
  const { error } = await supabase
    .from("politicas_venta")
    .update({ descuento_max_pct: pct, updated_at: new Date().toISOString(), updated_by: usuarioId ?? null })
    .eq("id", true);
  if (error) throw error;
}

/** Resumen de crédito del cliente; null si es un cliente nuevo (aún no existe). */
export async function consultarCreditoCliente(
  razonSocial: string,
  excluirOrden?: string
): Promise<CreditoCliente | null> {
  const { data, error } = await supabase.rpc("estado_credito_cliente", {
    p_razon_social: razonSocial.trim(),
    p_excluir_orden: excluirOrden ?? null,
  });
  if (error) throw error;
  if (!data) return null;
  return {
    clienteId: data.cliente_id,
    limite: data.limite_credito == null ? null : Number(data.limite_credito),
    dias: data.dias_credito == null ? null : Number(data.dias_credito),
    saldo: Number(data.saldo ?? 0),
    saldoVencido: Number(data.saldo_vencido ?? 0),
    foliosVencidos: data.folios_vencidos ?? [],
  };
}

/** Mensaje si el descuento pasa del tope, o null si es válido. */
export function validarDescuento(descuento: number, subtotal: number, maxPct: number): string | null {
  if (descuento <= 0) return null;
  if (descuento > subtotal) return "El descuento no puede ser mayor al subtotal.";
  const pct = subtotal > 0 ? (descuento * 100) / subtotal : 100;
  if (pct > maxPct + 0.005) {
    return `El descuento (${pct.toFixed(1)} %) pasa del máximo permitido de ${maxPct} % (${formatMonto(
      Math.floor(subtotal * maxPct) / 100
    )}). Pide autorización al administrador.`;
  }
  return null;
}

/**
 * Mensaje si la orden viola la política de crédito, o null si procede.
 * `saldoNuevo` es lo que la orden deja pendiente (total − anticipo/pagos).
 */
export function validarCredito(
  credito: CreditoCliente | null,
  metodoPago: MetodoPago,
  saldoNuevo: number
): string | null {
  const limite = credito?.limite ?? 0;
  if (metodoPago === "credito" && limite <= 0) {
    return credito
      ? "Este cliente no tiene crédito autorizado. Cobra con otro método o pide al administrador que le asigne un límite de crédito."
      : "Un cliente nuevo no tiene crédito autorizado. Cobra con otro método o pide al administrador que le asigne un límite.";
  }
  if (!credito || limite <= 0 || saldoNuevo <= 0) return null;
  if (credito.dias != null && credito.foliosVencidos.length > 0) {
    return `El cliente tiene saldos vencidos de ${formatMonto(credito.saldoVencido)} (${credito.foliosVencidos.join(
      ", "
    )}). Deben pagarse antes de dejarle un saldo nuevo.`;
  }
  if (credito.saldo + saldoNuevo > limite + 0.005) {
    return `Se excede el límite de crédito: disponible ${formatMonto(
      Math.max(limite - credito.saldo, 0)
    )} y esta orden deja ${formatMonto(saldoNuevo)} pendientes. Pide un anticipo mayor o autorización al administrador.`;
  }
  return null;
}

interface ParamsPoliticas {
  cliente: string;
  metodoPago: MetodoPago;
  /** Lo que la orden deja pendiente de pago. */
  saldoNuevo: number;
  descuento: number;
  subtotal: number;
  /** Al editar: la orden que se edita no cuenta en lo que ya debe el cliente. */
  excluirOrden?: string;
  /** Si es false (diálogo cerrado) no se consulta nada. */
  activo?: boolean;
  /**
   * Al editar, la BD solo revisa el crédito si el saldo de la orden crece; con false
   * no se avisa (igual que la BD). Por omisión true.
   */
  revisarCredito?: boolean;
}

/**
 * Estado de las políticas para un formulario de orden: consulta (con pausa de 400 ms
 * mientras se escribe el cliente) el crédito del cliente y el tope de descuento.
 *
 * `bloqueo` es el primer motivo que impide guardar (null para el admin primario, que
 * está exento); `avisoCredito` y `avisoDescuento` son los mensajes a mostrar.
 */
export function usePoliticasVenta({
  cliente,
  metodoPago,
  saldoNuevo,
  descuento,
  subtotal,
  excluirOrden,
  activo = true,
  revisarCredito = true,
}: ParamsPoliticas) {
  const { user } = useAuth();
  const exento = user?.rol === "admin_primario";
  const [descuentoMax, setDescuentoMax] = useState(DESCUENTO_MAX_PCT_DEFECTO);
  const [credito, setCredito] = useState<CreditoCliente | null>(null);
  const [consultando, setConsultando] = useState(false);
  const nombre = cliente.trim();

  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    obtenerDescuentoMaximo().then((pct) => vigente && setDescuentoMax(pct)).catch(() => {});
    return () => {
      vigente = false;
    };
  }, [activo]);

  useEffect(() => {
    if (!activo || !nombre) {
      setCredito(null);
      return;
    }
    let vigente = true;
    setConsultando(true);
    const t = setTimeout(() => {
      consultarCreditoCliente(nombre, excluirOrden)
        .then((c) => vigente && setCredito(c))
        .catch(() => vigente && setCredito(null))
        .finally(() => vigente && setConsultando(false));
    }, 400);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [activo, nombre, excluirOrden]);

  const avisoDescuento = validarDescuento(descuento, subtotal, descuentoMax);
  // Mientras se consulta el cliente no se juzga el crédito (evita avisos falsos).
  const avisoCredito =
    !revisarCredito || !nombre || consultando ? null : validarCredito(credito, metodoPago, saldoNuevo);
  // Que el descuento no supere el subtotal aplica a todos, incluido el admin.
  const descuentoInvalido = descuento > subtotal;

  return {
    descuentoMax,
    credito,
    consultando,
    exento,
    avisoDescuento,
    avisoCredito,
    bloqueo: descuentoInvalido ? avisoDescuento : exento ? null : avisoDescuento ?? avisoCredito,
  };
}
