/**
 * BuscadorGlobal.tsx — Buscador de la barra superior (Header).
 *
 * Busca a la vez en todos los módulos que el rol puede ver (mismo criterio que el menú
 * lateral) y muestra los resultados agrupados en un desplegable:
 *
 *  - Secciones del menú ("Ir a"): escribir "devol" lleva a Devoluciones.
 *  - En memoria (ErpDataContext), al instante: órdenes, productos, materiales y
 *    proveedores. El vendedor solo ve sus propias órdenes.
 *  - En la base (lib/busquedaGlobal.ts), 250 ms después de dejar de escribir y desde 2
 *    letras: cotizaciones, clientes, devoluciones, listas de tallas, autorizaciones,
 *    facturas, complementos de pago, solicitudes de factura, listas de precios (por
 *    cliente, producto o notas), activo fijo, empleados y usuarios. El RLS de
 *    cada tabla decide qué filas ve cada quien. Devoluciones, autorizaciones y
 *    solicitudes también se encuentran por el folio o el cliente de su orden.
 *
 * Al elegir un resultado se abre su detalle cuando existe (orden, factura, lista de
 * tallas, ficha del cliente, empleado en Permisos vacacionales); si no, su listado con el buscador de esa página ya
 * filtrado (?q=). "Ver todos" de cada grupo lleva al listado filtrado con el texto.
 * Teclado: ↑/↓ para moverse, Enter para abrir, Esc para cerrar. Ctrl+K (⌘K en Mac)
 * enfoca el buscador desde cualquier pantalla.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  Building2,
  Calculator,
  ClipboardList,
  Contact,
  CornerDownRight,
  FileText,
  Loader2,
  Package,
  Receipt,
  ReceiptText,
  Ruler,
  IdCard,
  Search,
  ShieldCheck,
  ShoppingBag,
  Tags,
  Truck,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useErpData } from "../context/ErpDataContext";
import { getAccessibleRoutes } from "../utils/permissions";
import { buscarEnModulos, limpiarTermino, type GrupoRemoto } from "../lib/busquedaGlobal";

// Máximo de resultados que se muestran por grupo.
const MAX_POR_GRUPO = 5;
// Espera tras la última tecla antes de consultar la base.
const ESPERA_MS = 250;

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
  /** Listado del módulo para "Ver todos" (null si la página no tiene buscador). */
  ruta: string | null;
  total: number;
  resultados: Resultado[];
};

/** Etiqueta, icono y orden de cada grupo; "ruta" solo si la página acepta ?q=. */
const META: Record<string, Omit<Grupo, "id" | "total" | "resultados">> = {
  secciones: { etiqueta: "Ir a", icono: CornerDownRight, ruta: null },
  ordenes: { etiqueta: "Órdenes", icono: ClipboardList, ruta: "/ordenes" },
  cotizaciones: { etiqueta: "Cotizaciones", icono: Calculator, ruta: "/cotizaciones" },
  clientes: { etiqueta: "Clientes", icono: Contact, ruta: "/catalogos/clientes" },
  devoluciones: { etiqueta: "Devoluciones y cambios", icono: Undo2, ruta: "/devoluciones" },
  tallas: { etiqueta: "Listas de tallas", icono: Ruler, ruta: "/tallas" },
  autorizaciones: { etiqueta: "Autorizaciones", icono: ShieldCheck, ruta: null },
  facturas: { etiqueta: "Facturas", icono: FileText, ruta: "/facturacion/facturas" },
  complementos: { etiqueta: "Complementos de pago", icono: Receipt, ruta: "/facturacion/complementos" },
  solicitudes: { etiqueta: "Solicitudes de factura", icono: ReceiptText, ruta: null },
  productos: { etiqueta: "Productos", icono: ShoppingBag, ruta: "/inventario/productos" },
  materiales: { etiqueta: "Materiales", icono: Package, ruta: "/inventario/materiales" },
  proveedores: { etiqueta: "Proveedores", icono: Truck, ruta: "/proveedores" },
  precios: { etiqueta: "Listas de precios", icono: Tags, ruta: "/catalogos/precios" },
  activos: { etiqueta: "Activo fijo", icono: Building2, ruta: "/activo-fijo" },
  empleados: { etiqueta: "Empleados", icono: IdCard, ruta: null },
  usuarios: { etiqueta: "Usuarios", icono: Users, ruta: "/usuarios" },
};
const ORDEN = Object.keys(META);

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
  // Resultados de la base, con el texto que los produjo (para no mostrar los de otro).
  const [remotos, setRemotos] = useState<{ q: string; grupos: GrupoRemoto[] }>({ q: "", grupos: [] });
  const [buscando, setBuscando] = useState(false);
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

  const rutasAccesibles = useMemo(() => (user ? getAccessibleRoutes(user.rol) : []), [user]);
  const rutas = useMemo(() => new Set(rutasAccesibles.map((r) => r.route)), [rutasAccesibles]);

  const ordenesVisibles = useMemo(
    () => (user?.rol === "vendedor" ? ordenes.filter((o) => o.vendedorId === user.id) : ordenes),
    [ordenes, user]
  );

  // Grupos que se resuelven en memoria.
  const { locales, ordenIds, productoIds } = useMemo(() => {
    const q = normalizar(termino.trim());
    if (!q || !user) return { locales: [] as Grupo[], ordenIds: [] as string[], productoIds: [] as string[] };

    const coincide = (...campos: (string | undefined | null)[]) =>
      campos.some((c) => c && normalizar(c).includes(q));
    const lista: Grupo[] = [];
    const agregar = (id: string, encontrados: Resultado[]) =>
      lista.push({ id, ...META[id], total: encontrados.length, resultados: encontrados.slice(0, MAX_POR_GRUPO) });

    agregar(
      "secciones",
      rutasAccesibles
        .filter((r) => r.route !== "/" && coincide(r.label))
        .map((r) => ({ key: `seccion-${r.route}`, titulo: r.label, detalle: r.route, destino: r.route }))
    );

    // Órdenes: también sirven para encontrar devoluciones, autorizaciones y solicitudes.
    const ordenesEncontradas = ordenesVisibles.filter((o) =>
      coincide(o.numero, o.cliente, o.vendedor, o.clienteTelefono, o.clienteEmail)
    );
    if (rutas.has("/ordenes")) {
      agregar(
        "ordenes",
        ordenesEncontradas.map((o) => ({
          key: `orden-${o.id}`,
          titulo: o.numero,
          detalle: `${o.cliente} · entrega ${o.fechaEntrega || "sin fecha"}`,
          destino: `/ordenes/${o.id}`,
        }))
      );
    }

    // Productos: también sirven para encontrar los precios especiales de ese producto.
    const productosEncontrados = productos.filter((p) =>
      coincide(p.nombre, p.categoria, p.tipo, ...p.variantes.map((v) => v.sku))
    );
    if (rutas.has("/inventario/productos")) {
      agregar(
        "productos",
        productosEncontrados
          .map((p) => ({
            key: `producto-${p.id}`,
            titulo: p.nombre,
            detalle: `${p.categoria} · ${p.stock} uds`,
            destino: conQ("/inventario/productos", p.nombre),
          }))
      );
    }

    if (rutas.has("/inventario/materiales")) {
      agregar(
        "materiales",
        materiales
          .filter((m) => coincide(m.nombre, m.tipo, m.proveedor))
          .map((m) => ({
            key: `material-${m.id}`,
            titulo: m.nombre,
            detalle: `${m.tipo} · ${m.stock} ${m.unidad}${m.stock < m.stockMinimo ? " · stock bajo" : ""}`,
            destino: conQ("/inventario/materiales", m.nombre),
          }))
      );
    }

    if (rutas.has("/proveedores")) {
      agregar(
        "proveedores",
        proveedores
          .filter((p) => coincide(p.nombre, p.contacto, p.email, p.telefono, ...p.insumos))
          .map((p) => ({
            key: `proveedor-${p.id}`,
            titulo: p.nombre,
            detalle: p.contacto || p.email || "Sin contacto",
            destino: conQ("/proveedores", p.nombre),
          }))
      );
    }

    return {
      locales: lista,
      ordenIds: ordenesEncontradas.map((o) => o.id),
      productoIds: productosEncontrados.map((p) => p.id),
    };
  }, [termino, user, rutas, rutasAccesibles, ordenesVisibles, productos, materiales, proveedores]);

  // Grupos que se consultan en la base (con espera y descartando respuestas viejas).
  const qRemota = limpiarTermino(termino);
  const ordenIdsClave = ordenIds.slice(0, 40).join(",");
  const productoIdsClave = productoIds.slice(0, 40).join(",");
  useEffect(() => {
    if (qRemota.length < 2 || !user) {
      setRemotos({ q: "", grupos: [] });
      setBuscando(false);
      return;
    }
    let vigente = true;
    setBuscando(true);
    const t = window.setTimeout(() => {
      buscarEnModulos({
        termino: qRemota,
        rutas,
        ordenIds: ordenIdsClave ? ordenIdsClave.split(",") : [],
        productoIds: productoIdsClave ? productoIdsClave.split(",") : [],
        max: MAX_POR_GRUPO,
      })
        .then((grupos) => {
          if (vigente) setRemotos({ q: qRemota, grupos });
        })
        .finally(() => {
          if (vigente) setBuscando(false);
        });
    }, ESPERA_MS);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
  }, [qRemota, rutas, ordenIdsClave, productoIdsClave, user]);

  const grupos = useMemo<Grupo[]>(() => {
    const deBase: Grupo[] =
      remotos.q === qRemota ? remotos.grupos.map((g) => ({ ...g, ...META[g.id] })) : [];
    return [...locales, ...deBase]
      .filter((g) => g.total > 0)
      .sort((a, b) => ORDEN.indexOf(a.id) - ORDEN.indexOf(b.id));
  }, [locales, remotos, qRemota]);

  // Lista plana para la navegación con teclado.
  const planos = useMemo(() => grupos.flatMap((g) => g.resultados), [grupos]);

  // Al cambiar el texto, el resaltado vuelve al primer resultado; si llegan resultados de
  // la base y el índice queda fuera de la lista, también.
  useEffect(() => setActivo(0), [termino]);
  useEffect(() => {
    setActivo((i) => (i < planos.length ? i : 0));
  }, [planos.length]);

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
      const r = planos[activo];
      if (r) ir(r.destino);
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
        placeholder="Buscar órdenes, clientes, cotizaciones, facturas..."
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
          aria-busy={buscando}
          className="absolute left-0 right-0 top-full mt-2 z-50 bg-card border border-border rounded-lg shadow-lg max-h-[70vh] overflow-y-auto"
        >
          {grupos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center text-muted-foreground">
              {buscando ? "Buscando…" : `Sin resultados para "${termino.trim()}"`}
            </p>
          ) : (
            grupos.map((grupo) => {
              const Icono = grupo.icono;
              const ruta = grupo.ruta;
              return (
                <div key={grupo.id} className="py-2 border-b border-border last:border-b-0">
                  <div className="flex items-center justify-between px-4 py-1">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {grupo.etiqueta} ({grupo.total})
                    </span>
                    {ruta && grupo.total > grupo.resultados.length && (
                      <button
                        type="button"
                        onClick={() => ir(conQ(ruta, termino.trim()))}
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
          {buscando && grupos.length > 0 && (
            <p className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground border-t border-border">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Buscando en más módulos…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
