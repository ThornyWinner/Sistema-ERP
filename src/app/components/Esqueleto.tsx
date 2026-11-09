/**
 * Esqueleto.tsx — Convierte el contenido real que envuelve en su propio esqueleto de carga.
 *
 * En lugar de un esqueleto genérico igual para todas las pantallas, se monta la
 * pantalla de destino tal cual y, mientras `activo` es true:
 *  - Se conservan sus contenedores: tarjetas, rejillas, tablas, bordes y fondos.
 *  - El texto se vuelve transparente y en su lugar se dibuja una barra por cada
 *    línea, del mismo ancho y en la misma posición que el texto real.
 *  - Botones, campos, selects, badges, íconos, imágenes y gráficas se dibujan
 *    como bloques del mismo tamaño.
 * Así cada página tiene un esqueleto con su propia estructura y, si la página
 * cambia de diseño, su esqueleto cambia con ella sin mantener nada a mano.
 *
 * Los bloques se calculan midiendo el DOM real (antes de pintar, sin parpadeo) y
 * se vuelven a medir si el contenido cambia o cambia de tamaño mientras dura.
 * Al terminar no se vuelve a montar la página: solo se quita la capa.
 * Mientras está activo, el contenido no recibe clics ni foco (atributo inert).
 *
 * Ejemplo: <Esqueleto activo={cargando}><MiPagina /></Esqueleto>
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./ui/utils";

/** Elementos que se dibujan como un bloque completo (su texto interno no se mide aparte). */
const BLOQUES = [
  "button",
  "input",
  "select",
  "textarea",
  "img",
  "video",
  "canvas",
  "svg",
  '[role="combobox"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[data-slot="badge"]',
  '[data-slot="select-trigger"]',
].join(",");

/** Máximo de bloques a dibujar (páginas con tablas muy largas). */
const MAX_BLOQUES = 800;

interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Radio de esquinas en px. */
  r: number;
}

function medir(raiz: HTMLElement): Caja[] {
  const base = raiz.getBoundingClientRect();
  const cajas: Caja[] = [];
  const visible = (r: DOMRect) =>
    r.width > 1 && r.height > 1 && r.bottom > base.top && r.top < base.bottom && r.right > base.left && r.left < base.right;
  const agregar = (r: DOMRect, radio: number) => {
    if (cajas.length < MAX_BLOQUES && visible(r)) {
      cajas.push({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height, r: radio });
    }
  };

  // 1) Bloques: se respeta su propio radio de esquinas (botón, badge redondo, avatar...).
  raiz.querySelectorAll<HTMLElement | SVGElement>(BLOQUES).forEach((el) => {
    // Un bloque dentro de otro (ícono dentro de un botón) ya queda cubierto.
    const contenedor = el.parentElement?.closest(BLOQUES);
    if (contenedor && raiz.contains(contenedor)) return;
    const r = el.getBoundingClientRect();
    const radio = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 6;
    agregar(r, Math.min(radio, r.height / 2));
  });

  // 2) Texto: una barra por línea, con el ancho real del texto y ~70 % de su alto.
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (!n.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      const padre = n.parentElement;
      if (!padre || padre.closest(BLOQUES) || padre.closest(".sr-only")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const rango = document.createRange();
  for (let n = walker.nextNode(); n && cajas.length < MAX_BLOQUES; n = walker.nextNode()) {
    rango.selectNodeContents(n);
    for (const linea of Array.from(rango.getClientRects())) {
      const alto = Math.max(6, linea.height * 0.7);
      const r = new DOMRect(linea.left, linea.top + (linea.height - alto) / 2, linea.width, alto);
      agregar(r, 4);
    }
  }
  rango.detach();
  return cajas;
}

interface EsqueletoProps {
  activo: boolean;
  children: ReactNode;
  className?: string;
}

export default function Esqueleto({ activo, children, className }: EsqueletoProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [cajas, setCajas] = useState<Caja[]>([]);

  const remedir = useCallback(() => {
    if (ref.current) setCajas(medir(ref.current));
  }, []);

  // Primera medición antes de pintar: la pantalla nunca se ve "a medias".
  useLayoutEffect(() => {
    if (activo) remedir();
    else setCajas([]);
  }, [activo, remedir]);

  // Mientras dura, se vuelve a medir si llegan datos o cambia el tamaño (una vez por frame).
  useEffect(() => {
    const el = ref.current;
    if (!activo || !el) return;
    let frame = 0;
    const programar = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(remedir);
    };
    // Se ignoran los cambios de la propia capa de bloques (si no, se mediría en bucle).
    const mo = new MutationObserver((cambios) => {
      if (cambios.some((c) => !(c.target as Element).closest?.(".esqueleto-capa") && !c.target.parentElement?.closest(".esqueleto-capa"))) {
        programar();
      }
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    const ro = new ResizeObserver(programar);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      ro.disconnect();
    };
  }, [activo, remedir]);

  // inert: sin clics ni foco de teclado sobre la página mientras es esqueleto.
  // (React 18 no reconoce la prop `inert`, por eso se pone directo en el DOM.)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (activo) el.setAttribute("inert", "");
    else el.removeAttribute("inert");
  }, [activo]);

  return (
    <div ref={ref} className={cn("relative", activo && "modo-esqueleto", className)} aria-busy={activo || undefined}>
      {children}
      {activo && (
        <div
          aria-hidden="true"
          className="esqueleto-capa absolute inset-0 pointer-events-none overflow-hidden animate-pulse motion-reduce:animate-none"
        >
          {cajas.map((c, i) => (
            <span
              key={i}
              className="absolute bg-foreground/10"
              style={{ left: c.x, top: c.y, width: c.w, height: c.h, borderRadius: c.r }}
            />
          ))}
        </div>
      )}
      {activo && (
        <span role="status" className="sr-only">
          Cargando…
        </span>
      )}
    </div>
  );
}
