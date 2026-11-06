/**
 * BuscadorGlobal.tsx — Buscador de la barra superior (Header).
 *
 * Busca a la vez en órdenes, productos, materiales y proveedores (datos ya cargados
 * en ErpDataContext) y muestra los resultados agrupados en un desplegable.
 *
 *  - Solo busca en los módulos que el rol del usuario puede ver (mismo criterio que
 *    el menú lateral). El vendedor solo ve sus propias órdenes.
 *  - Al elegir una orden se abre su detalle; al elegir un producto, material o
 *    proveedor se abre su listado con el buscador de esa página ya filtrado (?q=).
 *  - "Ver todos" de cada grupo lleva al listado filtrado con el texto escrito.
 *  - Teclado: ↑/↓ para moverse, Enter para abrir, Esc para cerrar.
 *    Ctrl+K (⌘K en Mac) enfoca el buscador desde cualquier pantalla.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Search, ClipboardList, ShoppingBag, Package, Truck, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useErpData } from "../context/ErpDataContext";
import { getAccessibleRoutes } from "../utils/permissions";

// Máximo de resultados que se muestran por grupo.
const MAX_POR_GRUPO = 5;

type Resultado = {
  key: string;
  titulo: string;
  detalle: string;
  /** Ruta a la que lleva al elegirlo. */
  destino: string;
};

type Grupo = {
  id: string;
  etiqueta: string;
  icono: typeof Search;
  /** Listado del módulo, al que se añade ?q= en "Ver todos". */
  ruta: string;
  total: number;
  resultados: Resultado[];
};

/** Minúsculas y sin acentos, para que "pantalon" encuentre "Pantalón". */
const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const conQ = (ruta: string, q: string) => `${ruta}?q=${encodeURIComponent(q)}`;

export default function BuscadorGlobal() {
  const { user } = useAuth();
  const { ordenes, productos, materiales, proveedores } = useErpData();
  const navigate = useNavigate();

  const [termino, setTermino] = useState("");
  const [abierto, setAbierto] = useState(false);
  // Índice del resultado resaltado con el teclado (sobre la lista plana).
  const [activo, setActivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  // Ctrl+K / ⌘K enfoca el buscador.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Cierra el desplegable al hacer clic fuera.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!contenedorRef.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const grupos = useMemo<Grupo[]>(() => {
    const q = normalizar(termino.trim());
    if (!q || !user) return [];

    const rutas = new Set(getAccessibleRoutes(user.rol).map((r) => r.route));
    const coincide = (...campos: (string | undefined)[]) =>
      campos.some((c) => c && normalizar(c).includes(q));
    const lista: Grupo[] = [];

    if (rutas.has("/ordenes")) {
      const visibles =
        user.rol === "vendedor" ? ordenes.filter((o) => o.vendedorId === user.id) : ordenes;
      const encontrados = visibles.filter((o) =>
        coincide(o.numero, o.cliente, o.vendedor, o.clienteTelefono, o.clienteEmail)
      );
      lista.push({
        id: "ordenes",
        etiqueta: "Órdenes",
        icono: ClipboardList,
        ruta: "/ordenes",
        total: encontrados.length,
        resultados: encontrados.slice(0, MAX_POR_GRUPO).map((o) => ({
          key: `orden-${o.id}`,
          titulo: o.numero,
          detalle: `${o.cliente} · entrega ${o.fechaEntrega || "sin fecha"}`,
          destino: `/ordenes/${o.id}`,
        })),
      });
    }

    if (rutas.has("/inventario/productos")) {
      const encontrados = productos.filter((p) =>
        coincide(p.nombre, p.categoria, p.tipo, ...p.variantes.map((v) => v.sku ?? undefined))
      );
      lista.push({
        id: "productos",
        etiqueta: "Productos",
        icono: ShoppingBag,
        ruta: "/inventario/productos",
        total: encontrados.length,
        resultados: encontrados.slice(0, MAX_POR_GRUPO).map((p) => ({
          key: `producto-${p.id}`,
          titulo: p.nombre,
          detalle: `${p.categoria} · ${p.stock} uds`,
          destino: conQ("/inventario/productos", p.nombre),
        })),
      });
    }

    if (rutas.has("/inventario/materiales")) {
      const encontrados = materiales.filter((m) => coincide(m.nombre, m.tipo, m.proveedor));
      lista.push({
        id: "materiales",
        etiqueta: "Materiales",
        icono: Package,
        ruta: "/inventario/materiales",
        total: encontrados.length,
        resultados: encontrados.slice(0, MAX_POR_GRUPO).map((m) => ({
          key: `material-${m.id}`,
          titulo: m.nombre,
          detalle: `${m.tipo} · ${m.stock} ${m.unidad}${m.stock < m.stockMinimo ? " · stock bajo" : ""}`,
          destino: conQ("/inventario/materiales", m.nombre),
        })),
      });
    }

    if (rutas.has("/proveedores")) {
      const encontrados = proveedores.filter((p) =>
        coincide(p.nombre, p.contacto, p.email, p.telefono, ...p.insumos)
      );
      lista.push({
        id: "proveedores",
        etiqueta: "Proveedores",
        icono: Truck,
        ruta: "/proveedores",
        total: encontrados.length,
        resultados: encontrados.slice(0, MAX_POR_GRUPO).map((p) => ({
          key: `proveedor-${p.id}`,
          titulo: p.nombre,
          detalle: p.contacto || p.email || "Sin contacto",
          destino: conQ("/proveedores", p.nombre),
        })),
      });
    }

    return lista.filter((g) => g.total > 0);
  }, [termino, user, ordenes, productos, materiales, proveedores]);

  // Lista plana para la navegación con teclado.
  const planos = useMemo(() => grupos.flatMap((g) => g.resultados), [grupos]);

  // Al cambiar el texto, el resaltado vuelve al primer resultado.
  useEffect(() => setActivo(0), [termino]);

  const ir = (destino: string) => {
    navigate(destino);
    setAbierto(false);
    setTermino("");
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setAbierto(false);
      inputRef.current?.blur();
      return;
    }
    if (!planos.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setActivo((i) => (i + 1) % planos.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAbierto(true);
      setActivo((i) => (i - 1 + planos.length) % planos.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      ir(planos[activo].destino);
    }
  };

  const mostrarPanel = abierto && termino.trim().length > 0;
  let indice = -1;

  return (
    <div ref={contenedorRef} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={mostrarPanel}
        aria-controls="buscador-global-resultados"
        aria-autocomplete="list"
        value={termino}
        onChange={(e) => {
          setTermino(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={onKeyDown}
        placeholder="Buscar órdenes, productos, materiales..."
        className="w-full pl-10 pr-16 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
      />
      {termino ? (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => {
            setTermino("");
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      ) : (
        <kbd className="hidden md:block absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5 pointer-events-none">
          Ctrl K
        </kbd>
      )}

      {mostrarPanel && (
        <div
          id="buscador-global-resultados"
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 z-50 bg-card border border-border rounded-lg shadow-lg max-h-[70vh] overflow-y-auto"
        >
          {grupos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center text-muted-foreground">
              Sin resultados para "{termino.trim()}"
            </p>
          ) : (
            grupos.map((grupo) => {
              const Icono = grupo.icono;
              return (
                <div key={grupo.id} className="py-2 border-b border-border last:border-b-0">
                  <div className="flex items-center justify-between px-4 py-1">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {grupo.etiqueta} ({grupo.total})
                    </span>
                    {grupo.total > grupo.resultados.length && (
                      <button
                        type="button"
                        onClick={() => ir(conQ(grupo.ruta, termino.trim()))}
                        className="text-xs text-primary hover:underline"
                      >
                        Ver todos
                      </button>
                    )}
                  </div>
                  {grupo.resultados.map((r) => {
                    indice += 1;
                    const esActivo = indice === activo;
                    const miIndice = indice;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        role="option"
                        aria-selected={esActivo}
                        onMouseEnter={() => setActivo(miIndice)}
                        onClick={() => ir(r.destino)}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                          esActivo ? "bg-secondary" : "hover:bg-secondary/60"
                        }`}
                      >
                        <Icono className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground truncate">
                            {r.titulo}
                          </span>
                          <span className="block text-xs text-muted-foreground truncate">
                            {r.detalle}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
