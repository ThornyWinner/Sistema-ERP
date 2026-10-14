/**
 * utils.ts — Utilidades compartidas por los componentes de ui/.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases CSS de forma segura.
 * - clsx: acepta strings, arreglos y objetos condicionales ({ "clase": condicion }).
 * - twMerge: resuelve conflictos de Tailwind dejando la última clase (p. ej. "p-2 p-4" → "p-4").
 * Ejemplo: cn("px-2", activo && "bg-primary", className)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
