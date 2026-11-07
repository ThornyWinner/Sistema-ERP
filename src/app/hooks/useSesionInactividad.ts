/**
 * useSesionInactividad.ts — Cierre automático de sesión por inactividad.
 *
 * Mientras hay sesión, registra la última actividad del usuario (mouse, teclado,
 * scroll, toques) en localStorage. Como localStorage es compartido entre pestañas,
 * la actividad en cualquier pestaña mantiene viva la sesión en todas.
 *
 * Cada pocos segundos, y al volver a la pestaña, compara el tiempo transcurrido:
 *  - Faltando AVISO_MS para el límite, muestra un aviso con "Seguir conectado".
 *  - Al llegar a INACTIVIDAD_MS llama a onExpirar (AuthContext cierra la sesión y
 *    ProtectedRoute redirige a /login, donde se muestra el motivo).
 *
 * AuthContext usa también sesionInactivaExpirada() al restaurar la sesión, para
 * cerrar una sesión que quedó abierta con el navegador cerrado más tiempo del límite.
 */
import { useEffect, useRef } from "react";
import { toast } from "sonner";

/** Tiempo sin actividad tras el cual expira la sesión. */
export const INACTIVIDAD_MS = 30 * 60 * 1000; // 30 minutos
/** Anticipación con la que se avisa antes de cerrar la sesión. */
const AVISO_MS = 60 * 1000; // 1 minuto
/** Cada cuánto se revisa el tiempo inactivo. */
const INTERVALO_REVISION_MS = 15 * 1000;
/** Mínimo entre escrituras a localStorage (mousemove se dispara muchas veces por segundo). */
const INTERVALO_ESCRITURA_MS = 5 * 1000;

const CLAVE_ACTIVIDAD = "erp:ultimaActividad";
const CLAVE_MOTIVO = "erp:motivoCierre";
const ID_AVISO = "aviso-inactividad";

const EVENTOS_ACTIVIDAD = ["mousemove", "mousedown", "keydown", "scroll", "wheel", "touchstart"] as const;

// localStorage puede no estar disponible (modo privado, almacenamiento bloqueado).
function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}
function escribir(clave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: el control funciona solo dentro de esta pestaña */
  }
}

/** Marca de tiempo (ms) de la última actividad registrada, o null si no hay. */
export function leerUltimaActividad(): number | null {
  const valor = Number(leer(CLAVE_ACTIVIDAD));
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

/** Registra "ahora" como última actividad (al iniciar sesión, p. ej.). */
export function registrarActividadAhora() {
  escribir(CLAVE_ACTIVIDAD, String(Date.now()));
}

/** true si la última actividad registrada es más antigua que el límite. */
export function sesionInactivaExpirada(): boolean {
  const ultima = leerUltimaActividad();
  return ultima !== null && Date.now() - ultima >= INACTIVIDAD_MS;
}

/** Motivo del último cierre automático, compartido entre pestañas ("inactividad"). */
export const leerMotivoCierre = () => leer(CLAVE_MOTIVO);
export const guardarMotivoCierre = (motivo: string | null) => escribir(CLAVE_MOTIVO, motivo);

/**
 * Vigila la inactividad mientras `activo` sea true y llama a `onExpirar` una sola
 * vez cuando se supera el límite.
 */
export function useSesionInactividad(activo: boolean, onExpirar: () => void) {
  // Ref para usar siempre la versión más reciente del callback sin reiniciar el efecto.
  const onExpirarRef = useRef(onExpirar);
  onExpirarRef.current = onExpirar;

  useEffect(() => {
    if (!activo) return;

    let ultimaEscritura = 0;
    let avisoVisible = false;
    let expirada = false;

    const ocultarAviso = () => {
      if (avisoVisible) {
        toast.dismiss(ID_AVISO);
        avisoVisible = false;
      }
    };

    const registrar = (forzar = false) => {
      if (expirada) return;
      const ahora = Date.now();
      if (!forzar && ahora - ultimaEscritura < INTERVALO_ESCRITURA_MS) return;
      // Si el usuario regresa cuando el límite ya pasó, su primer movimiento no
      // debe renovar la sesión: primero se revisa y, si venció, se cierra.
      const ultima = leerUltimaActividad();
      if (ultima !== null && ahora - ultima >= INACTIVIDAD_MS) {
        revisar();
        return;
      }
      ultimaEscritura = ahora;
      escribir(CLAVE_ACTIVIDAD, String(ahora));
      ocultarAviso();
    };

    const revisar = () => {
      if (expirada) return;
      const ultima = leerUltimaActividad() ?? Date.now();
      const inactivo = Date.now() - ultima;

      if (inactivo >= INACTIVIDAD_MS) {
        expirada = true;
        ocultarAviso();
        onExpirarRef.current();
      } else if (inactivo >= INACTIVIDAD_MS - AVISO_MS) {
        if (!avisoVisible) {
          avisoVisible = true;
          toast.warning("Tu sesión está por expirar", {
            id: ID_AVISO,
            description: "Por inactividad se cerrará en menos de un minuto.",
            duration: Infinity,
            action: { label: "Seguir conectado", onClick: () => registrar(true) },
          });
        }
      } else {
        // Hubo actividad en otra pestaña: el aviso ya no aplica.
        ocultarAviso();
      }
    };

    const alActivar = () => registrar();
    // Los temporizadores se ralentizan en pestañas ocultas: al volver se revisa de inmediato.
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible") revisar();
    };

    // La sesión acaba de iniciarse o restaurarse (ya validada): cuenta como actividad.
    registrar(true);
    const intervalo = window.setInterval(revisar, INTERVALO_REVISION_MS);
    EVENTOS_ACTIVIDAD.forEach((e) => window.addEventListener(e, alActivar, { passive: true }));
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    window.addEventListener("focus", revisar);

    return () => {
      window.clearInterval(intervalo);
      EVENTOS_ACTIVIDAD.forEach((e) => window.removeEventListener(e, alActivar));
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      window.removeEventListener("focus", revisar);
      ocultarAviso();
    };
  }, [activo]);
}
