/**
 * useTransicionBreve.ts — Indica durante unos milisegundos que "algo cambió",
 * para mostrar el esqueleto entre una vista y la siguiente.
 *
 * Devuelve true durante `ms` cada vez que cambia `clave` (p. ej. la ruta o la
 * pestaña activa). En el primer render devuelve false: al abrir una pantalla o un
 * panel no se muestra la transición, solo al cambiar dentro de ellos.
 *
 * El cambio se detecta durante el render (no en un efecto), así que el mismo render
 * que muestra la vista nueva ya la muestra como esqueleto: nunca se ve un instante
 * de la vista real antes del esqueleto.
 * Ejemplo: const cambiando = useTransicionBreve(pestana, 250);
 */
import { useEffect, useState } from "react";

export function useTransicionBreve(clave: unknown, ms = 300): boolean {
  const [estado, setEstado] = useState({ clave, activa: false });
  const cambio = !Object.is(estado.clave, clave);

  // Actualización durante el render (patrón permitido por React para derivar estado):
  // React repite el render de inmediato con el estado nuevo, antes de pintar.
  if (cambio) setEstado({ clave, activa: true });

  // Termina la transición tras `ms`; si la clave vuelve a cambiar, se reinicia.
  useEffect(() => {
    if (!estado.activa) return;
    const t = window.setTimeout(() => setEstado((e) => ({ ...e, activa: false })), ms);
    return () => window.clearTimeout(t);
  }, [estado, ms]);

  return cambio || estado.activa;
}
