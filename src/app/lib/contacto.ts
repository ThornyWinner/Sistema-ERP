/**
 * contacto.ts — Utilidades para contactar a clientes y proveedores (WhatsApp, copiar).
 */
import { toast } from "sonner";

/**
 * Convierte un teléfono a formato internacional para wa.me (solo dígitos).
 * Un número mexicano de 10 dígitos se completa con la lada de país 52.
 */
export function telefonoWhatsApp(telefono: string): string {
  const digitos = telefono.replace(/\D/g, "");
  return digitos.length === 10 ? `52${digitos}` : digitos;
}

/** Enlace de WhatsApp al teléfono, con el mensaje ya escrito si se indica. */
export function enlaceWhatsApp(telefono: string, mensaje?: string): string {
  const base = `https://wa.me/${telefonoWhatsApp(telefono)}`;
  return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base;
}

/** Copia texto al portapapeles y avisa con un toast. */
export async function copiarTexto(texto: string, etiqueta: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(`${etiqueta} copiado`);
  } catch {
    toast.error(`No se pudo copiar el ${etiqueta.toLowerCase()}`);
  }
}
