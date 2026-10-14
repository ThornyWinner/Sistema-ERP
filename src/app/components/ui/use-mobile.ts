/**
 * use-mobile.ts — Hook para saber si la pantalla es de tamaño móvil (< 768 px).
 * Lo usa el componente sidebar.tsx de ui/ para cambiar a un panel deslizable en móviles.
 */
import * as React from "react";

/** Ancho (px) a partir del cual se considera escritorio (breakpoint "md" de Tailwind). */
const MOBILE_BREAKPOINT = 768;

/**
 * Devuelve true si el ancho de la ventana es menor que MOBILE_BREAKPOINT.
 * Se suscribe a un media query y se actualiza al redimensionar la ventana.
 * El valor inicial es `undefined` (antes de montar) y se convierte a false con `!!`.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
