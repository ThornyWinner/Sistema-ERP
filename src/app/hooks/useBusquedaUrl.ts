/**
 * useBusquedaUrl.ts — Estado del buscador de una página, inicializado desde `?q=` en la URL.
 *
 * Permite que el buscador global del Header lleve a una página (p. ej.
 * /inventario/materiales?q=gabardina) con su filtro de texto ya aplicado. Si la página
 * ya estaba abierta y cambia `q`, el campo se actualiza con el nuevo término.
 *
 * Uso: const [searchTerm, setSearchTerm] = useBusquedaUrl();
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

export function useBusquedaUrl() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const [termino, setTermino] = useState(q);

  useEffect(() => {
    setTermino(q);
  }, [q]);

  return [termino, setTermino] as const;
}
