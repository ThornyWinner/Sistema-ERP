/**
 * impresion.ts — Utilidades para imprimir documentos HTML (o guardarlos como PDF).
 *
 * El documento se escribe en un iframe oculto y se abre el diálogo de impresión del
 * navegador, donde el usuario puede elegir la impresora o "Guardar como PDF". Así no
 * se depende de ventanas emergentes ni de librerías para generar PDF.
 */

/** Escapa texto para insertarlo de forma segura dentro de HTML. */
export const escaparHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Imprime un documento HTML completo desde un iframe oculto. Espera a que carguen
 * sus imágenes (p. ej. el logo) antes de abrir el diálogo, con un tope de 3 s.
 */
export function imprimirHtml(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();

  const imagenes = Array.from(doc.images).filter((img) => !img.complete);
  const cargadas = Promise.all(
    imagenes.map(
      (img) => new Promise<void>((listo) => {
        img.addEventListener("load", () => listo(), { once: true });
        img.addEventListener("error", () => listo(), { once: true });
      })
    )
  );
  const tope = new Promise<void>((listo) => setTimeout(listo, 3000));

  Promise.race([cargadas, tope]).then(() => {
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
    // El diálogo de impresión bloquea hasta cerrarse; después se quita el iframe.
    setTimeout(() => iframe.remove(), 1000);
  });
}
